-- ============================================================
-- reconcile_profile_hands_played — recount all-time hands
--
-- All RTN hands now live in rtn_live_hands and all Guess 10 hands
-- in guess10_live_hands (legacy migrated + server-draw), so the
-- reconcile counts directly from those tables for RTN and G10
-- (plus color_scheme_rounds and shape_trader_trades).
-- ============================================================

drop function if exists public.reconcile_profile_hands_played(uuid);

create or replace function public.reconcile_profile_hands_played(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  color_scheme_rounds_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles p
  set
    run_the_numbers_hands_played_all_time = coalesce(src.rtn_hands,    0),
    guess10_hands_played_all_time         = coalesce(src.guess10_hands, 0),
    color_scheme_rounds_played_all_time   = coalesce(src.cs_rounds,    0),
    trades_made_all_time                  = coalesce(src.trades_made,  0),
    total_progress_events = coalesce(src.rtn_hands,    0)
                          + coalesce(src.guess10_hands, 0)
                          + coalesce(src.cs_rounds,    0)
                          + coalesce(src.trades_made,  0),
    hands_played_all_time = coalesce(src.rtn_hands,    0)
                          + coalesce(src.guess10_hands, 0)
                          + coalesce(src.cs_rounds,    0)
                          + coalesce(src.trades_made,  0)
  from (
    select
      p2.id as user_id,
      coalesce(rtn.hand_count,    0)::integer as rtn_hands,
      coalesce(g10.hand_count,    0)::integer as guess10_hands,
      coalesce(cs.round_count,    0)::integer as cs_rounds,
      coalesce(trades.trade_count,0)::integer as trades_made
    from public.profiles p2

    -- RTN: all hands now in rtn_live_hands (legacy migrated + server-draw)
    left join (
      select user_id, count(*)::integer as hand_count
      from public.rtn_live_hands
      where status <> 'active'
      group by user_id
    ) rtn on rtn.user_id = p2.id

    -- Guess 10: all hands now in guess10_live_hands
    left join (
      select user_id, count(*)::integer as hand_count
      from public.guess10_live_hands
      where status <> 'active'
      group by user_id
    ) g10 on g10.user_id = p2.id

    -- Color Scheme
    left join (
      select user_id, count(*)::integer as round_count
      from public.color_scheme_rounds
      where status = 'completed'
      group by user_id
    ) cs on cs.user_id = p2.id

    -- Shape Traders
    left join (
      select user_id, count(*)::integer as trade_count
      from public.shape_trader_trades
      group by user_id
    ) trades on trades.user_id = p2.id

    where target_user_id is null or p2.id = target_user_id
  ) src
  where p.id = src.user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.run_the_numbers_hands_played_all_time,
    p.guess10_hands_played_all_time,
    p.color_scheme_rounds_played_all_time,
    p.hands_played_all_time,
    p.total_progress_events,
    p.trades_made_all_time,
    p.current_rank_tier,
    p.current_rank_id,
    p.current_rank,
    p.updated_at
  from public.profiles p
  where target_user_id is null or p.id = target_user_id;
end;
$$;

-- reconcile_profile_trades_made delegates — no body change needed
drop function if exists public.reconcile_profile_trades_made(uuid);

create or replace function public.reconcile_profile_trades_made(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  color_scheme_rounds_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select * from public.reconcile_profile_hands_played(target_user_id);
end;
$$;

grant execute on function public.reconcile_profile_hands_played(uuid) to authenticated;
grant execute on function public.reconcile_profile_trades_made(uuid)  to authenticated;

-- Backfill all profiles with corrected counts and recompute ranks
select public.reconcile_profile_hands_played();
