-- ============================================================
-- get_contest_game_stats(p_contest_id)
--
-- Returns per-user game activity counts for every participant
-- in a contest. Runs as SECURITY DEFINER so it can read across
-- all users' hands/rounds despite RLS policies.
--
-- Called from the leaderboard to show RTN / G10 / ST / RYB
-- breakdowns per player without exposing individual hand details.
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
    count(distinct rlh.id)  as rtn_hands,
    count(distinct glh.id)  as g10_hands,
    count(distinct stt.id)  as st_trades,
    count(distinct csr.id)  as ryb_rounds
  from public.contest_entries ce
  left join public.rtn_live_hands rlh
    on rlh.user_id    = ce.user_id
   and rlh.contest_id = p_contest_id
   and rlh.status    <> 'active'
  left join public.guess10_live_hands glh
    on glh.user_id    = ce.user_id
   and glh.contest_id = p_contest_id
   and glh.status    <> 'active'
  left join public.shape_trader_trades stt
    on stt.user_id    = ce.user_id
   and stt.contest_id = p_contest_id
  left join public.color_scheme_rounds csr
    on csr.user_id    = ce.user_id
   and csr.contest_id = p_contest_id
   and csr.status     = 'completed'
  where ce.contest_id = p_contest_id
  group by ce.user_id;
$$;

grant execute on function public.get_contest_game_stats(uuid) to authenticated;
