-- ============================================================================
-- get_bankroll_series — read-time union (supersedes the ledger-table version).
--
-- The settlement triggers that populated bankroll_history did not fire for real
-- gameplay (only for the reseed backfill), so charts were empty for hands played
-- after the reset. This computes the series directly from the authoritative
-- per-game new_account_value snapshots + account_events, which are always
-- present — no trigger dependency. NORMAL mode only, floored at the 2026-06-30
-- era, with a synthetic 1000 baseline at account start.
--
-- (bankroll_history + its triggers are now vestigial and can be dropped later.)
-- ============================================================================
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
  with era as (select timestamptz '2026-06-30 00:00:00+00' as start),
  baseline as (
    select greatest(
      (select start from era),
      coalesce((select created_at from auth.users where id = p_user_id), (select start from era))
    ) as ts
  ),
  pts as (
    select (select ts from baseline) as occurred_at, 1000::numeric as balance, 0::numeric as delta, 'era_start'::text as source
    union all
    select coalesce(last_draw_at, started_at), new_account_value, 0, 'game_001'
    from public.rtn_live_hands
    where user_id = p_user_id and status <> 'active' and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select coalesce(last_draw_at, started_at), new_account_value, 0, 'game_002'
    from public.guess10_live_hands
    where user_id = p_user_id and status <> 'active' and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select executed_at, new_account_value, 0, 'game_003'
    from public.shape_trader_trades
    where user_id = p_user_id and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select created_at, new_account_value, 0, 'game_004'
    from public.color_scheme_rounds
    where user_id = p_user_id and status = 'completed' and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select created_at, new_account_value, 0, 'game_005'
    from public.fate_or_fortune_rounds
    where user_id = p_user_id and status = 'resolved' and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select created_at, new_account_value, 0, 'game_006'
    from public.mm_spins
    where user_id = p_user_id and status = 'resolved' and new_account_value is not null and coalesce(contest_id::text,'')=''
    union all
    select created_at, new_balance, amount, event_type
    from public.account_events
    where user_id = p_user_id and event_type in ('rank_up_bonus','affiliate_signup','admin_grant') and new_balance is not null
  )
  select occurred_at, round(balance, 2) as balance, delta, source
  from pts
  where occurred_at >= (select start from era)
    and (p_from is null or occurred_at >= p_from)
    and (p_to   is null or occurred_at <= p_to)
  order by occurred_at asc;
$$;

grant execute on function public.get_bankroll_series(uuid, timestamptz, timestamptz) to authenticated;
