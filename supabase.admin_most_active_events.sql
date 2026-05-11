-- ============================================================
-- Fix: get_admin_most_active_events misses server-draw hands
--      and Color Scheme rounds
--
-- The original RPC only queried:
--   • game_hands (legacy/client-mode RTN + G10 only)
--   • shape_trader_trades
--
-- Missing:
--   • rtn_live_hands (server-draw RTN — used in contests)
--   • guess10_live_hands (server-draw G10 — used in contests)
--   • color_scheme_rounds (RYB entirely)
--
-- Players who exclusively use server-draw (e.g. contest participants)
-- had zero entries in game_hands and never appeared in the rankings.
--
-- Also adds color_scheme_rounds to the return type so the client
-- can display the RYB breakdown alongside RTN / G10 / ST.
-- ============================================================

drop function if exists public.get_admin_most_active_events(timestamptz, timestamptz, uuid[], integer);

create or replace function public.get_admin_most_active_events(
  start_at      timestamptz default null,
  end_at        timestamptz default null,
  target_user_ids uuid[]    default null,
  limit_count   integer     default 10
)
returns table(
  user_id              uuid,
  total_events         bigint,
  run_the_numbers_hands bigint,
  guess10_hands        bigint,
  shape_traders_trades bigint,
  color_scheme_rounds  bigint,
  username             text,
  first_name           text,
  last_name            text
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin event activity rankings';
  end if;

  return query
  with rtn_counts as (
    -- RTN server-draw hands (rtn_live_hands)
    select rlh.user_id, count(*)::bigint as hand_count
    from public.rtn_live_hands rlh
    where rlh.status <> 'active'
      and (start_at is null or rlh.started_at >= start_at)
      and (end_at   is null or rlh.started_at <= end_at)
      and (target_user_ids is null or rlh.user_id = any(target_user_ids))
    group by rlh.user_id
  ),
  g10_counts as (
    -- G10 server-draw hands (guess10_live_hands)
    select glh.user_id, count(*)::bigint as hand_count
    from public.guess10_live_hands glh
    where glh.status <> 'active'
      and (start_at is null or glh.started_at >= start_at)
      and (end_at   is null or glh.started_at <= end_at)
      and (target_user_ids is null or glh.user_id = any(target_user_ids))
    group by glh.user_id
  ),
  legacy_counts as (
    -- Legacy client-mode hands from game_hands
    -- RTN legacy entries have game_id = 'game_001' (or null).
    -- G10 legacy entries have game_id = 'game_002'.
    -- CS entries in game_hands are excluded (they live in color_scheme_rounds).
    select
      gh.user_id,
      count(*) filter (where coalesce(gh.game_id, 'game_001') = 'game_001')::bigint as rtn_hands,
      count(*) filter (where gh.game_id = 'game_002')::bigint                        as guess10_hands
    from public.game_hands gh
    where (start_at is null or gh.created_at >= start_at)
      and (end_at   is null or gh.created_at <= end_at)
      and (target_user_ids is null or gh.user_id = any(target_user_ids))
    group by gh.user_id
  ),
  trade_counts as (
    -- Shape Trader sell/buy events
    select st.user_id, count(*)::bigint as shape_traders_trades
    from public.shape_trader_trades st
    where (start_at is null or st.executed_at >= start_at)
      and (end_at   is null or st.executed_at <= end_at)
      and (target_user_ids is null or st.user_id = any(target_user_ids))
    group by st.user_id
  ),
  ryb_counts as (
    -- Color Scheme completed rounds
    select csr.user_id, count(*)::bigint as ryb_rounds
    from public.color_scheme_rounds csr
    where csr.status = 'completed'
      and (start_at is null or csr.created_at >= start_at)
      and (end_at   is null or csr.created_at <= end_at)
      and (target_user_ids is null or csr.user_id = any(target_user_ids))
    group by csr.user_id
  ),
  combined as (
    select
      coalesce(rtn.user_id, g10.user_id, lh.user_id, t.user_id, ryb.user_id) as user_id,
      coalesce(rtn.hand_count,        0) + coalesce(lh.rtn_hands,     0) as run_the_numbers_hands,
      coalesce(g10.hand_count,        0) + coalesce(lh.guess10_hands,  0) as guess10_hands,
      coalesce(t.shape_traders_trades, 0)                                  as shape_traders_trades,
      coalesce(ryb.ryb_rounds,         0)                                  as color_scheme_rounds
    from rtn_counts rtn
    full outer join g10_counts   g10 on g10.user_id = rtn.user_id
    full outer join legacy_counts lh  on lh.user_id  = coalesce(rtn.user_id, g10.user_id)
    full outer join trade_counts  t   on t.user_id   = coalesce(rtn.user_id, g10.user_id, lh.user_id)
    full outer join ryb_counts    ryb on ryb.user_id  = coalesce(rtn.user_id, g10.user_id, lh.user_id, t.user_id)
  )
  select
    c.user_id,
    (c.run_the_numbers_hands + c.guess10_hands + c.shape_traders_trades + c.color_scheme_rounds)::bigint as total_events,
    c.run_the_numbers_hands,
    c.guess10_hands,
    c.shape_traders_trades,
    c.color_scheme_rounds,
    p.username,
    p.first_name,
    p.last_name
  from combined c
  left join public.profiles p on p.id = c.user_id
  where c.user_id is not null
  order by
    total_events          desc,
    c.shape_traders_trades desc,
    c.run_the_numbers_hands desc,
    c.guess10_hands        desc,
    c.user_id
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

grant execute on function public.get_admin_most_active_events(timestamptz, timestamptz, uuid[], integer) to authenticated;
