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
-- above enforces the floor). Rather than backfill years of pre-reset history,
-- we seed a single 1000 baseline per user at the era start. From here the
-- profiles.credits trigger appends every normal-mode change going forward.
--
-- (An earlier version of this file backfilled bankroll_history from the per-game
-- new_account_value snapshots + account_events; that historical seed was purged
-- in favor of the era reset below.)
-- ----------------------------------------------------------------------------
delete from public.bankroll_history
where occurred_at < timestamptz '2026-06-30 00:00:00+00';

insert into public.bankroll_history (user_id, occurred_at, balance, delta, source)
select p.id, timestamptz '2026-06-30 00:00:00+00', round(coalesce(p.credits, 0), 2), 0, 'era_start'
from public.profiles p
where not exists (
  select 1 from public.bankroll_history bh
  where bh.user_id = p.id
    and bh.occurred_at >= timestamptz '2026-06-30 00:00:00+00'
);
