-- ============================================================
-- Fate or Fortune rounds played tracking on profiles
-- Adds fof_rounds_played_all_time (game_005), wires it into
-- total_progress_events / hands_played_all_time, and updates all
-- related progression RPCs + the sensitive-fields guard.
--
-- Mirrors supabase.color_scheme_profile_progress.sql.
-- ============================================================

-- 1. Add the column
alter table public.profiles
  add column if not exists fof_rounds_played_all_time integer not null default 0;

-- 2. Protect it via the sensitive-fields guard trigger
create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_sensitive_balance_write', true) = '1' then
    return new;
  end if;

  if
    new.credits is distinct from old.credits or
    new.carter_cash is distinct from old.carter_cash or
    new.carter_cash_progress is distinct from old.carter_cash_progress or
    new.run_the_numbers_hands_played_all_time is distinct from old.run_the_numbers_hands_played_all_time or
    new.guess10_hands_played_all_time is distinct from old.guess10_hands_played_all_time or
    new.color_scheme_rounds_played_all_time is distinct from old.color_scheme_rounds_played_all_time or
    new.fof_rounds_played_all_time is distinct from old.fof_rounds_played_all_time or
    new.hands_played_all_time is distinct from old.hands_played_all_time or
    new.total_progress_events is distinct from old.total_progress_events or
    new.contest_wins is distinct from old.contest_wins or
    new.trades_made_all_time is distinct from old.trades_made_all_time or
    new.current_rank is distinct from old.current_rank or
    new.current_rank_tier is distinct from old.current_rank_tier or
    new.current_rank_id is distinct from old.current_rank_id
  then
    raise exception 'Direct financial or progression updates are not allowed.';
  end if;

  return new;
end;
$$;

-- 3a. increment_profile_hands_played (with game_id, now including game_005 = Fate or Fortune)
create or replace function public.increment_profile_hands_played(
  target_user_id uuid,
  hand_increment integer,
  target_game_id text default null
)
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
declare
  safe_increment integer := greatest(coalesce(hand_increment, 1), 0);
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles as p
  set
    run_the_numbers_hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
    ),
    guess10_hands_played_all_time = greatest(
      0,
      coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
    ),
    color_scheme_rounds_played_all_time = greatest(
      0,
      coalesce(p.color_scheme_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_004' then safe_increment else 0 end
    ),
    fof_rounds_played_all_time = greatest(
      0,
      coalesce(p.fof_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_005' then safe_increment else 0 end
    ),
    total_progress_events = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
      + coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
      + coalesce(p.color_scheme_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_004' then safe_increment else 0 end
      + coalesce(p.fof_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_005' then safe_increment else 0 end
      + coalesce(p.trades_made_all_time, 0)
    ),
    hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
      + coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
      + coalesce(p.color_scheme_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_004' then safe_increment else 0 end
      + coalesce(p.fof_rounds_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_005' then safe_increment else 0 end
      + coalesce(p.trades_made_all_time, 0)
    )
  where p.id = target_user_id;

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
  where p.id = target_user_id;
end;
$$;

-- 3b. increment_profile_trades_made (total now includes fof)
create or replace function public.increment_profile_trades_made(
  target_user_id uuid,
  trade_increment integer default 1
)
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
declare
  safe_increment integer := greatest(coalesce(trade_increment, 1), 0);
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles as p
  set
    trades_made_all_time = greatest(0, coalesce(p.trades_made_all_time, 0) + safe_increment),
    total_progress_events = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + coalesce(p.guess10_hands_played_all_time, 0)
      + coalesce(p.color_scheme_rounds_played_all_time, 0)
      + coalesce(p.fof_rounds_played_all_time, 0)
      + coalesce(p.trades_made_all_time, 0)
      + safe_increment
    ),
    hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + coalesce(p.guess10_hands_played_all_time, 0)
      + coalesce(p.color_scheme_rounds_played_all_time, 0)
      + coalesce(p.fof_rounds_played_all_time, 0)
      + coalesce(p.trades_made_all_time, 0)
      + safe_increment
    )
  where p.id = target_user_id;

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
  where p.id = target_user_id;
end;
$$;

-- 3c. reconcile_profile_hands_played (counts FOF resolved rounds from DB)
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
    run_the_numbers_hands_played_all_time = coalesce(src.rtn_hands, 0),
    guess10_hands_played_all_time         = coalesce(src.guess10_hands, 0),
    color_scheme_rounds_played_all_time   = coalesce(src.cs_rounds, 0),
    fof_rounds_played_all_time            = coalesce(src.fof_rounds, 0),
    trades_made_all_time                  = coalesce(src.trades_made, 0),
    total_progress_events = coalesce(src.rtn_hands, 0)
                          + coalesce(src.guess10_hands, 0)
                          + coalesce(src.cs_rounds, 0)
                          + coalesce(src.fof_rounds, 0)
                          + coalesce(src.trades_made, 0),
    hands_played_all_time = coalesce(src.rtn_hands, 0)
                          + coalesce(src.guess10_hands, 0)
                          + coalesce(src.cs_rounds, 0)
                          + coalesce(src.fof_rounds, 0)
                          + coalesce(src.trades_made, 0)
  from (
    select
      p2.id as user_id,
      coalesce(rtn.hand_count,    0)::integer as rtn_hands,
      coalesce(g10.hand_count,    0)::integer as guess10_hands,
      coalesce(cs.round_count,    0)::integer as cs_rounds,
      coalesce(fof.round_count,   0)::integer as fof_rounds,
      coalesce(trades.trade_count,0)::integer as trades_made
    from public.profiles p2
    left join (
      select user_id, count(*)::integer as hand_count
      from public.rtn_live_hands
      where status <> 'active'
      group by user_id
    ) rtn on rtn.user_id = p2.id
    left join (
      select user_id, count(*)::integer as hand_count
      from public.guess10_live_hands
      where status <> 'active'
      group by user_id
    ) g10 on g10.user_id = p2.id
    left join (
      select user_id, count(*)::integer as round_count
      from public.color_scheme_rounds
      where status = 'completed'
      group by user_id
    ) cs on cs.user_id = p2.id
    left join (
      select user_id, count(*)::integer as round_count
      from public.fate_or_fortune_rounds
      where status = 'resolved'
      group by user_id
    ) fof on fof.user_id = p2.id
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

-- 4. Re-grant permissions (signatures unchanged, but safe to re-run)
grant execute on function public.increment_profile_hands_played(uuid, integer, text) to authenticated;
grant execute on function public.increment_profile_trades_made(uuid, integer)        to authenticated;
grant execute on function public.reconcile_profile_hands_played(uuid)                to authenticated;

-- 5. Backfill existing data from fate_or_fortune_rounds (resolved rounds)
--    Must set the bypass config so the guard trigger allows this write.
do $$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles p
  set
    fof_rounds_played_all_time = coalesce(fof.round_count, 0),
    total_progress_events = coalesce(p.run_the_numbers_hands_played_all_time, 0)
                          + coalesce(p.guess10_hands_played_all_time, 0)
                          + coalesce(p.color_scheme_rounds_played_all_time, 0)
                          + coalesce(fof.round_count, 0)
                          + coalesce(p.trades_made_all_time, 0),
    hands_played_all_time = coalesce(p.run_the_numbers_hands_played_all_time, 0)
                          + coalesce(p.guess10_hands_played_all_time, 0)
                          + coalesce(p.color_scheme_rounds_played_all_time, 0)
                          + coalesce(fof.round_count, 0)
                          + coalesce(p.trades_made_all_time, 0)
  from (
    select user_id, count(*)::integer as round_count
    from public.fate_or_fortune_rounds
    where status = 'resolved'
    group by user_id
  ) fof
  where p.id = fof.user_id;
end;
$$;

-- 6. Recompute ranks after backfill
select public.recompute_all_profile_ranks();
