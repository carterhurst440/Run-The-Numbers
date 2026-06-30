-- ============================================================================
-- BANKROLL HISTORY — long-running time-series of a user's real credit balance.
--
-- Design (Option B): a single append-only ledger fed by ONE trigger on
-- profiles.credits. Because every NORMAL-mode game settlement, rank-up bonus,
-- affiliate signup, and admin grant ultimately writes profiles.credits — and
-- CONTEST play is isolated in contest_entries.current_credits and never touches
-- profiles.credits — this trigger captures exactly the non-contest bankroll the
-- chart needs, for every source, present and future, with no per-game wiring.
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

-- One trigger captures every credit change. Append-only; no recursion (it only
-- writes bankroll_history, never profiles).
create or replace function public.record_bankroll_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
  values (
    new.id,
    timezone('utc', now()),
    round(coalesce(new.credits, 0), 2),
    round(coalesce(new.credits, 0) - coalesce(old.credits, 0), 2),
    'credit_change'
  );
  return new;
end;
$$;

drop trigger if exists record_bankroll_point_trigger on public.profiles;
create trigger record_bankroll_point_trigger
after update of credits on public.profiles
for each row
when (new.credits is distinct from old.credits)
execute function public.record_bankroll_point();

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
    and (p_from is null or occurred_at >= p_from)
    and (p_to   is null or occurred_at <= p_to)
  order by occurred_at asc;
$$;

grant execute on function public.get_bankroll_series(uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- One-time backfill: seed past points from the existing per-game snapshots and
-- account_events. NORMAL mode only (contest_id null). Safe to re-run only after
-- truncating bankroll_history — otherwise it duplicates the seeded rows.
-- ----------------------------------------------------------------------------
with raw as (
  select user_id, started_at as occurred_at, new_account_value as balance, 'game_001'::text as source
  from public.rtn_live_hands
  where status <> 'active' and new_account_value is not null
    and coalesce(contest_id::text, '') = ''
    and (mode_type is null or lower(mode_type) = 'normal')

  union all
  select user_id, started_at, new_account_value, 'game_002'
  from public.guess10_live_hands
  where status <> 'active' and new_account_value is not null
    and coalesce(contest_id::text, '') = ''
    and (mode_type is null or lower(mode_type) = 'normal')

  union all
  select user_id, executed_at, new_account_value, 'game_003'
  from public.shape_trader_trades
  where new_account_value is not null
    and coalesce(contest_id::text, '') = ''

  union all
  select user_id, created_at, new_account_value, 'game_004'
  from public.color_scheme_rounds
  where status = 'completed' and new_account_value is not null
    and coalesce(contest_id::text, '') = ''

  union all
  select user_id, created_at, new_account_value, 'game_005'
  from public.fate_or_fortune_rounds
  where status = 'resolved' and new_account_value is not null
    and coalesce(contest_id::text, '') = ''

  union all
  select user_id, created_at, new_balance, event_type
  from public.account_events
  where event_type in ('rank_up_bonus', 'affiliate_signup')
    and new_balance is not null
),
ordered as (
  select
    user_id,
    occurred_at,
    round(balance, 2) as balance,
    source,
    round(balance - lag(balance) over (partition by user_id order by occurred_at, source), 2) as delta
  from raw
)
insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
select user_id, occurred_at, balance, coalesce(delta, 0), source
from ordered;
