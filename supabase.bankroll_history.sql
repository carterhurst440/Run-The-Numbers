-- ============================================================================
-- BANKROLL HISTORY — long-running time-series of a user's real credit balance.
--
-- Design: an append-only ledger recording ONE point per SETTLED event.
--
-- Game play writes profiles.credits twice per hand — once to escrow the wager at
-- hand start, once at settlement — so a naive profiles.credits trigger recorded
-- the mid-hand escrow as a spurious dip. Instead we record at settlement:
--   * Game points come from triggers on each game's hand/round/trade table,
--     firing when new_account_value is set (the resolved post-hand balance).
--     NORMAL mode only (contest_id null) — contest play stays isolated.
--   * Non-game points (rank_up_bonus, affiliate_signup) come from a trigger on
--     account_events (new_balance).
-- One clean point per hand, at the value the player actually ended on.
--
-- Cross-user viewing (global leaderboard) goes through the SECURITY DEFINER
-- get_bankroll_series() RPC, matching the get_contest_journey_events pattern.
-- ============================================================================

create table if not exists public.bankroll_history (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  balance     numeric(12,2) not null,   -- credits AFTER the change
  delta       numeric(12,2) not null default 0,
  source      text not null default 'credit_change'
);

create index if not exists idx_bankroll_history_user_time
  on public.bankroll_history (user_id, occurred_at);

alter table public.bankroll_history enable row level security;

drop policy if exists "bankroll_history_select_own" on public.bankroll_history;
create policy "bankroll_history_select_own"
on public.bankroll_history
for select
to authenticated
using (user_id = auth.uid() or public.is_rtn_admin());

-- The old profiles.credits trigger recorded the mid-hand wager escrow; retired.
drop trigger if exists record_bankroll_point_trigger on public.profiles;

-- Game points: one clean point per settled hand/round/trade, at the resolved
-- new_account_value. NORMAL mode only (contest_id null).
create or replace function public.record_settled_bankroll_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ts   timestamptz;
  v_game text;
begin
  if new.new_account_value is null then return new; end if;
  if coalesce(new.contest_id::text, '') <> '' then return new; end if;

  if TG_TABLE_NAME = 'rtn_live_hands' then
    if new.status = 'active' then return new; end if;
    v_ts := coalesce(new.last_draw_at, new.started_at);
    v_game := 'game_001';
  elsif TG_TABLE_NAME = 'guess10_live_hands' then
    if new.status = 'active' then return new; end if;
    v_ts := coalesce(new.last_draw_at, new.started_at);
    v_game := 'game_002';
  elsif TG_TABLE_NAME = 'shape_trader_trades' then
    v_ts := new.executed_at;
    v_game := 'game_003';
  elsif TG_TABLE_NAME = 'color_scheme_rounds' then
    if new.status <> 'completed' then return new; end if;
    v_ts := new.created_at;
    v_game := 'game_004';
  elsif TG_TABLE_NAME = 'fate_or_fortune_rounds' then
    if new.status <> 'resolved' then return new; end if;
    v_ts := coalesce(new.locked_at, new.created_at);
    v_game := 'game_005';
  else
    return new;
  end if;

  insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
  values (new.user_id, coalesce(v_ts, timezone('utc', now())), round(new.new_account_value, 2), 0, v_game);
  return new;
end;
$$;

drop trigger if exists rtn_bankroll_point_ins on public.rtn_live_hands;
create trigger rtn_bankroll_point_ins after insert on public.rtn_live_hands
for each row when (new.new_account_value is not null)
execute function public.record_settled_bankroll_point();
drop trigger if exists rtn_bankroll_point_upd on public.rtn_live_hands;
create trigger rtn_bankroll_point_upd after update on public.rtn_live_hands
for each row when (new.new_account_value is not null and new.new_account_value is distinct from old.new_account_value)
execute function public.record_settled_bankroll_point();

drop trigger if exists g10_bankroll_point_ins on public.guess10_live_hands;
create trigger g10_bankroll_point_ins after insert on public.guess10_live_hands
for each row when (new.new_account_value is not null)
execute function public.record_settled_bankroll_point();
drop trigger if exists g10_bankroll_point_upd on public.guess10_live_hands;
create trigger g10_bankroll_point_upd after update on public.guess10_live_hands
for each row when (new.new_account_value is not null and new.new_account_value is distinct from old.new_account_value)
execute function public.record_settled_bankroll_point();

drop trigger if exists st_bankroll_point_ins on public.shape_trader_trades;
create trigger st_bankroll_point_ins after insert on public.shape_trader_trades
for each row when (new.new_account_value is not null)
execute function public.record_settled_bankroll_point();

drop trigger if exists cs_bankroll_point_ins on public.color_scheme_rounds;
create trigger cs_bankroll_point_ins after insert on public.color_scheme_rounds
for each row when (new.new_account_value is not null)
execute function public.record_settled_bankroll_point();
drop trigger if exists cs_bankroll_point_upd on public.color_scheme_rounds;
create trigger cs_bankroll_point_upd after update on public.color_scheme_rounds
for each row when (new.new_account_value is not null and new.new_account_value is distinct from old.new_account_value)
execute function public.record_settled_bankroll_point();

drop trigger if exists fof_bankroll_point_ins on public.fate_or_fortune_rounds;
create trigger fof_bankroll_point_ins after insert on public.fate_or_fortune_rounds
for each row when (new.new_account_value is not null)
execute function public.record_settled_bankroll_point();
drop trigger if exists fof_bankroll_point_upd on public.fate_or_fortune_rounds;
create trigger fof_bankroll_point_upd after update on public.fate_or_fortune_rounds
for each row when (new.new_account_value is not null and new.new_account_value is distinct from old.new_account_value)
execute function public.record_settled_bankroll_point();

-- Non-game credit events (rank-up bonus, affiliate signup) from account_events.
create or replace function public.record_event_bankroll_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type in ('rank_up_bonus', 'affiliate_signup') and new.new_balance is not null then
    insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
    values (new.user_id, coalesce(new.created_at, timezone('utc', now())),
            round(new.new_balance, 2), round(coalesce(new.amount, 0), 2), new.event_type);
  end if;
  return new;
end;
$$;

drop trigger if exists record_event_bankroll_point_trigger on public.account_events;
create trigger record_event_bankroll_point_trigger after insert on public.account_events
for each row execute function public.record_event_bankroll_point();

-- ----------------------------------------------------------------------------
-- Cross-user read path for the global leaderboard / account chart.
-- ----------------------------------------------------------------------------
create or replace function public.get_bankroll_series(
  p_user_id uuid,
  p_from    timestamptz default null,
  p_to      timestamptz default null
)
returns table(
  occurred_at timestamptz,
  balance     numeric,
  delta       numeric,
  source      text
)
language sql
security definer
set search_path = public
stable
as $$
  select occurred_at, balance, delta, source
  from public.bankroll_history
  where user_id = p_user_id
    and occurred_at >= timestamptz '2026-06-30 00:00:00+00'  -- bankroll era start; never chart earlier
    and (p_from is null or occurred_at >= p_from)
    and (p_to   is null or occurred_at <= p_to)
  order by occurred_at asc;
$$;

grant execute on function public.get_bankroll_series(uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- BANKROLL ERA START — 2026-06-30.
--
-- On 2026-06-30 all accounts were reset to 1000 credits and bankroll charting
-- was rebased to begin that day; nothing is ever charted before it (the RPC
-- above enforces the floor). We seed a 1000 baseline per user at the era start,
-- then rebuild one point per settled event since — exactly what the settlement
-- triggers above produce going forward.
-- ----------------------------------------------------------------------------
delete from public.bankroll_history;

insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
select p.id, timestamptz '2026-06-30 00:00:00+00', 1000, 0, 'era_start'
from public.profiles p;

with g as (
  select user_id, coalesce(last_draw_at, started_at) as ts, new_account_value as bal, 'game_001'::text as src
  from public.rtn_live_hands
  where status <> 'active' and new_account_value is not null and coalesce(contest_id::text,'')=''
  union all
  select user_id, coalesce(last_draw_at, started_at), new_account_value, 'game_002'
  from public.guess10_live_hands
  where status <> 'active' and new_account_value is not null and coalesce(contest_id::text,'')=''
  union all
  select user_id, executed_at, new_account_value, 'game_003'
  from public.shape_trader_trades
  where new_account_value is not null and coalesce(contest_id::text,'')=''
  union all
  select user_id, created_at, new_account_value, 'game_004'
  from public.color_scheme_rounds
  where status='completed' and new_account_value is not null and coalesce(contest_id::text,'')=''
  union all
  select user_id, created_at, new_account_value, 'game_005'
  from public.fate_or_fortune_rounds
  where status='resolved' and new_account_value is not null and coalesce(contest_id::text,'')=''
)
insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
select user_id, ts, round(bal,2), 0, src
from g
where ts >= timestamptz '2026-06-30 00:00:00+00';

insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
select user_id, created_at, round(new_balance,2), round(coalesce(amount,0),2), event_type
from public.account_events
where event_type in ('rank_up_bonus','affiliate_signup') and new_balance is not null
  and created_at >= timestamptz '2026-06-30 00:00:00+00';
