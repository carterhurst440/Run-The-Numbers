-- ============================================================
-- get_contest_game_stats(p_contest_id)
--
-- Returns per-user game activity counts for every participant
-- in a contest. Runs as SECURITY DEFINER so it can read across
-- all users' hands/rounds despite RLS policies.
--
-- Called from the leaderboard to show RTN / G10 / ST / RYB
-- breakdowns per player without exposing individual hand details.
--
-- Uses correlated subqueries (not multi-table LEFT JOIN) to
-- avoid combinatorial explosion in the intermediate result set.
-- ============================================================

create or replace function public.get_contest_game_stats(
  p_contest_id uuid
)
returns table (
  user_id       uuid,
  rtn_hands     bigint,
  g10_hands     bigint,
  st_trades     bigint,
  ryb_rounds    bigint
)
language sql
security definer
stable
as $$
  select
    ce.user_id,
    (select count(*)
       from public.rtn_live_hands
      where user_id    = ce.user_id
        and contest_id = p_contest_id
        and status    <> 'active') as rtn_hands,
    (select count(*)
       from public.guess10_live_hands
      where user_id    = ce.user_id
        and contest_id = p_contest_id
        and status    <> 'active') as g10_hands,
    (select count(*)
       from public.shape_trader_trades
      where user_id    = ce.user_id
        and contest_id = p_contest_id) as st_trades,
    (select count(*)
       from public.color_scheme_rounds
      where user_id    = ce.user_id
        and contest_id = p_contest_id
        and status     = 'completed') as ryb_rounds
  from public.contest_entries ce
  where ce.contest_id = p_contest_id;
$$;

grant execute on function public.get_contest_game_stats(uuid) to authenticated;
