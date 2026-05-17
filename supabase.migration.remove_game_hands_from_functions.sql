-- ============================================================
-- Remove all game_hands references from Postgres functions
--
-- game_hands has been dropped. All RTN hands are now in
-- rtn_live_hands, all G10 hands in guess10_live_hands.
-- Safe to re-run (CREATE OR REPLACE / idempotent).
-- ============================================================


-- ── 1. get_contest_journey_events ────────────────────────────
-- Remove the legacy game_hands UNION block — all data is now
-- in rtn_live_hands (migrated) and guess10_live_hands.

drop function if exists public.get_contest_journey_events(uuid, uuid);

create or replace function public.get_contest_journey_events(
  p_contest_id uuid,
  p_user_id    uuid
)
returns table(
  event_id          text,
  created_at        timestamptz,
  new_account_value numeric,
  game_key          text,
  source_type       text
)
language sql
security definer
stable
as $$
  -- RTN server-draw hands
  select
    id::text               as event_id,
    started_at             as created_at,
    new_account_value,
    'game_001'             as game_key,
    'hand'                 as source_type
  from public.rtn_live_hands
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status    <> 'active'
    and new_account_value is not null

  union all

  -- G10 server-draw hands
  select
    id::text               as event_id,
    started_at             as created_at,
    new_account_value,
    'game_002'             as game_key,
    'hand'                 as source_type
  from public.guess10_live_hands
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status    <> 'active'
    and new_account_value is not null

  union all

  -- Shape Trader trades
  select
    id::text               as event_id,
    executed_at            as created_at,
    new_account_value,
    'game_003'             as game_key,
    'trade'                as source_type
  from public.shape_trader_trades
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and new_account_value is not null

  union all

  -- Color Scheme completed rounds
  select
    id::text               as event_id,
    created_at,
    new_account_value,
    'game_004'             as game_key,
    'round'                as source_type
  from public.color_scheme_rounds
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status     = 'completed'
    and new_account_value is not null

  order by created_at asc;
$$;

grant execute on function public.get_contest_journey_events(uuid, uuid) to authenticated;


-- ── 2. get_admin_most_active_events ──────────────────────────
-- Remove legacy_counts CTE — all data is now in live tables.

drop function if exists public.get_admin_most_active_events(timestamptz, timestamptz, uuid[], integer);

create or replace function public.get_admin_most_active_events(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null,
  limit_count     integer     default 10
)
returns table(
  user_id               uuid,
  total_events          bigint,
  run_the_numbers_hands bigint,
  guess10_hands         bigint,
  shape_traders_trades  bigint,
  color_scheme_rounds   bigint,
  username              text,
  first_name            text,
  last_name             text
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
    select rlh.user_id, count(*)::bigint as hand_count
    from public.rtn_live_hands rlh
    where rlh.status <> 'active'
      and (start_at is null or rlh.started_at >= start_at)
      and (end_at   is null or rlh.started_at <= end_at)
      and (target_user_ids is null or rlh.user_id = any(target_user_ids))
    group by rlh.user_id
  ),
  g10_counts as (
    select glh.user_id, count(*)::bigint as hand_count
    from public.guess10_live_hands glh
    where glh.status <> 'active'
      and (start_at is null or glh.started_at >= start_at)
      and (end_at   is null or glh.started_at <= end_at)
      and (target_user_ids is null or glh.user_id = any(target_user_ids))
    group by glh.user_id
  ),
  trade_counts as (
    select st.user_id, count(*)::bigint as shape_traders_trades
    from public.shape_trader_trades st
    where (start_at is null or st.executed_at >= start_at)
      and (end_at   is null or st.executed_at <= end_at)
      and (target_user_ids is null or st.user_id = any(target_user_ids))
    group by st.user_id
  ),
  ryb_counts as (
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
      coalesce(rtn.user_id, g10.user_id, t.user_id, ryb.user_id) as user_id,
      coalesce(rtn.hand_count,         0)                          as run_the_numbers_hands,
      coalesce(g10.hand_count,         0)                          as guess10_hands,
      coalesce(t.shape_traders_trades, 0)                          as shape_traders_trades,
      coalesce(ryb.ryb_rounds,         0)                          as color_scheme_rounds
    from rtn_counts rtn
    full outer join g10_counts   g10 on g10.user_id = rtn.user_id
    full outer join trade_counts t   on t.user_id   = coalesce(rtn.user_id, g10.user_id)
    full outer join ryb_counts   ryb on ryb.user_id  = coalesce(rtn.user_id, g10.user_id, t.user_id)
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
    total_events               desc,
    c.shape_traders_trades     desc,
    c.run_the_numbers_hands    desc,
    c.guess10_hands            desc,
    c.user_id
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

grant execute on function public.get_admin_most_active_events(timestamptz, timestamptz, uuid[], integer) to authenticated;


-- ── 3. get_admin_most_active_hands ───────────────────────────
-- Rewritten to count from rtn_live_hands + guess10_live_hands.

create or replace function public.get_admin_most_active_hands(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null,
  limit_count     integer     default 10
)
returns table(
  user_id    uuid,
  hands_played bigint,
  username   text,
  first_name text,
  last_name  text
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin hands activity rankings';
  end if;

  return query
  select
    u.user_id,
    count(*)::bigint as hands_played,
    p.username,
    p.first_name,
    p.last_name
  from (
    select user_id, started_at as ts
    from public.rtn_live_hands
    where status <> 'active'
    union all
    select user_id, started_at as ts
    from public.guess10_live_hands
    where status <> 'active'
  ) u
  left join public.profiles p on p.id = u.user_id
  where (start_at is null or u.ts >= start_at)
    and (end_at   is null or u.ts <= end_at)
    and (target_user_ids is null or u.user_id = any(target_user_ids))
  group by u.user_id, p.username, p.first_name, p.last_name
  order by count(*) desc, u.user_id
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

grant execute on function public.get_admin_most_active_hands(timestamptz, timestamptz, uuid[], integer) to authenticated;


-- ── 4. get_admin_most_active_players ─────────────────────────
-- hand_counts CTE rewritten to use rtn_live_hands + guess10_live_hands.

create or replace function public.get_admin_most_active_players(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null,
  limit_count     integer     default 10
)
returns table(
  user_id    uuid,
  bet_count  bigint,
  hands_played bigint,
  wagered    numeric,
  username   text,
  first_name text,
  last_name  text
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin activity rankings';
  end if;

  return query
  with top_bettors as (
    select
      bp.user_id,
      count(*)::bigint                        as bet_count,
      coalesce(sum(bp.amount_wagered), 0)     as wagered
    from public.bet_plays bp
    where (start_at is null or bp.placed_at >= start_at)
      and (end_at   is null or bp.placed_at <= end_at)
      and (target_user_ids is null or bp.user_id = any(target_user_ids))
    group by bp.user_id
    order by count(*) desc, coalesce(sum(bp.amount_wagered), 0) desc
    limit greatest(coalesce(limit_count, 10), 1) * 5
  ),
  hand_counts as (
    select u.user_id, count(*)::bigint as hands_played
    from (
      select user_id, started_at as ts from public.rtn_live_hands   where status <> 'active'
      union all
      select user_id, started_at as ts from public.guess10_live_hands where status <> 'active'
    ) u
    join top_bettors tb on tb.user_id = u.user_id
    where (start_at is null or u.ts >= start_at)
      and (end_at   is null or u.ts <= end_at)
    group by u.user_id
  ),
  ranked as (
    select
      tb.user_id,
      tb.bet_count,
      coalesce(hc.hands_played, 0)::bigint as hands_played,
      tb.wagered
    from top_bettors tb
    left join hand_counts hc on hc.user_id = tb.user_id
    order by tb.bet_count desc, coalesce(hc.hands_played, 0) desc, tb.wagered desc
    limit greatest(coalesce(limit_count, 10), 1)
  )
  select
    ranked.user_id,
    ranked.bet_count,
    ranked.hands_played,
    ranked.wagered,
    p.username,
    p.first_name,
    p.last_name
  from ranked
  left join public.profiles p on p.id = ranked.user_id
  order by ranked.bet_count desc, ranked.hands_played desc, ranked.wagered desc;
end;
$$;

grant execute on function public.get_admin_most_active_players(timestamptz, timestamptz, uuid[], integer) to authenticated;


-- ── 5. get_admin_hands_played_timeseries ─────────────────────
-- Rewritten to use rtn_live_hands + guess10_live_hands.

create or replace function public.get_admin_hands_played_timeseries(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null,
  local_tz        text        default 'UTC'
)
returns table(day date, hands_played integer)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin hands chart';
  end if;

  return query
  select
    timezone(local_tz, u.ts)::date as day,
    count(*)::integer               as hands_played
  from (
    select started_at as ts, user_id from public.rtn_live_hands   where status <> 'active'
    union all
    select started_at as ts, user_id from public.guess10_live_hands where status <> 'active'
  ) u
  where (start_at is null or u.ts >= start_at)
    and (end_at   is null or u.ts <= end_at)
    and (target_user_ids is null or u.user_id = any(target_user_ids))
  group by timezone(local_tz, u.ts)::date
  order by timezone(local_tz, u.ts)::date asc;
end;
$$;

grant execute on function public.get_admin_hands_played_timeseries(timestamptz, timestamptz, uuid[], text) to authenticated;


-- ── 6. reconcile_profile_hands_played ────────────────────────
-- Remove game_hands UNIONs — rtn_live_hands and guess10_live_hands
-- now hold all hands (legacy migrated + server-draw).

drop function if exists public.reconcile_profile_hands_played(uuid);

create or replace function public.reconcile_profile_hands_played(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time         integer,
  color_scheme_rounds_played_all_time   integer,
  hands_played_all_time                 integer,
  total_progress_events                 integer,
  trades_made_all_time                  integer,
  current_rank_tier                     integer,
  current_rank_id                       uuid,
  current_rank                          integer,
  updated_at                            timestamptz
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

drop function if exists public.reconcile_profile_trades_made(uuid);

create or replace function public.reconcile_profile_trades_made(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time         integer,
  color_scheme_rounds_played_all_time   integer,
  hands_played_all_time                 integer,
  total_progress_events                 integer,
  trades_made_all_time                  integer,
  current_rank_tier                     integer,
  current_rank_id                       uuid,
  current_rank                          integer,
  updated_at                            timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select * from public.reconcile_profile_hands_played(target_user_id);
end;
$$;

grant execute on function public.reconcile_profile_hands_played(uuid)  to authenticated;
grant execute on function public.reconcile_profile_trades_made(uuid)   to authenticated;


-- ── 7. snapshot_daily_profit_loss ────────────────────────────
-- Remove the game_hands UNION; add guess10_live_hands instead.

create or replace function public.snapshot_daily_profit_loss(
  target_date date default ((timezone('America/Denver', now()))::date - 1)
)
returns integer
language plpgsql
security definer
as $$
declare
  affected_count integer := 0;
begin
  with hand_totals as (
    select
      hands.user_id,
      hands.profit_date,
      sum(case when hands.game_id = 'game_001' then coalesce(hands.net, 0) else 0 end)::numeric(12,2) as pnl_rtn,
      sum(case when hands.game_id = 'game_002' then coalesce(hands.net, 0) else 0 end)::numeric(12,2) as pnl_g10
    from (
      -- RTN
      select
        rlh.user_id,
        timezone('America/Denver', rlh.started_at)::date as profit_date,
        rlh.game_id,
        rlh.net,
        rlh.contest_id,
        rlh.mode_type
      from public.rtn_live_hands rlh
      where rlh.status <> 'active'

      union all

      -- G10
      select
        glh.user_id,
        timezone('America/Denver', glh.started_at)::date as profit_date,
        'game_002'                                         as game_id,
        glh.net,
        glh.contest_id,
        glh.mode_type
      from public.guess10_live_hands glh
      where glh.status <> 'active'
    ) hands
    where hands.profit_date = target_date
      and coalesce(hands.contest_id::text, '') = ''
      and (
        hands.mode_type is null
        or lower(hands.mode_type) = 'normal'
      )
    group by hands.user_id, hands.profit_date
  ),
  trade_totals as (
    select
      st.user_id,
      timezone('America/Denver', st.executed_at)::date as profit_date,
      sum(coalesce(st.net_profit, 0))::numeric(12,2) as pnl_shape_traders
    from public.shape_trader_trades st
    where timezone('America/Denver', st.executed_at)::date = target_date
      and coalesce(st.contest_id::text, '') = ''
      and lower(coalesce(st.trade_side, '')) = 'sell'
    group by st.user_id, timezone('America/Denver', st.executed_at)::date
  ),
  merged as (
    select
      coalesce(h.user_id, t.user_id)           as user_id,
      coalesce(h.profit_date, t.profit_date, target_date) as profit_date,
      coalesce(h.pnl_rtn,          0)::numeric(12,2) as pnl_rtn,
      coalesce(h.pnl_g10,          0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders,0)::numeric(12,2) as pnl_shape_traders
    from hand_totals h
    full outer join trade_totals t
      on h.user_id    = t.user_id
     and h.profit_date = t.profit_date
  ),
  upserted as (
    insert into public.daily_profit_loss (
      user_id,
      profit_date,
      pnl_rtn,
      pnl_g10,
      pnl_shape_traders,
      pnl_total,
      updated_at
    )
    select
      m.user_id,
      m.profit_date,
      m.pnl_rtn,
      m.pnl_g10,
      m.pnl_shape_traders,
      (m.pnl_rtn + m.pnl_g10 + m.pnl_shape_traders)::numeric(12,2),
      timezone('utc', now())
    from merged m
    on conflict (user_id, profit_date) do update
    set
      pnl_rtn           = excluded.pnl_rtn,
      pnl_g10           = excluded.pnl_g10,
      pnl_shape_traders = excluded.pnl_shape_traders,
      pnl_total         = excluded.pnl_total,
      updated_at        = excluded.updated_at
    returning 1
  )
  select count(*) into affected_count from upserted;

  return affected_count;
end;
$$;

grant execute on function public.snapshot_daily_profit_loss(date) to authenticated;


-- ── 8. capture_app_activity_snapshot ─────────────────────────
-- Replace game_hands with rtn_live_hands + guess10_live_hands.

create or replace function public.capture_app_activity_snapshot(
  target_snapshot_date date        default (timezone('utc', now()))::date,
  snapshot_reference   timestamptz default timezone('utc', now())
)
returns void
language plpgsql
security definer
as $$
declare
  effective_snapshot_date date        := coalesce(target_snapshot_date, (timezone('utc', snapshot_reference))::date);
  effective_reference     timestamptz := coalesce(snapshot_reference, timezone('utc', now()));
begin
  if current_user <> 'postgres'
     and session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to capture app activity snapshots';
  end if;

  insert into public.app_activity_snapshots (
    snapshot_date,
    snapshot_at,
    daily_active_users,
    weekly_active_users,
    monthly_active_users
  )
  values (
    effective_snapshot_date,
    effective_reference,
    (
      select count(distinct activity.user_id)::integer
      from (
        select user_id from public.rtn_live_hands
          where started_at > effective_reference - interval '24 hours'
            and started_at <= effective_reference
        union
        select user_id from public.guess10_live_hands
          where started_at > effective_reference - interval '24 hours'
            and started_at <= effective_reference
        union
        select user_id from public.shape_trader_trades
          where executed_at > effective_reference - interval '24 hours'
            and executed_at <= effective_reference
      ) activity
    ),
    (
      select count(distinct activity.user_id)::integer
      from (
        select user_id from public.rtn_live_hands
          where started_at > effective_reference - interval '7 days'
            and started_at <= effective_reference
        union
        select user_id from public.guess10_live_hands
          where started_at > effective_reference - interval '7 days'
            and started_at <= effective_reference
        union
        select user_id from public.shape_trader_trades
          where executed_at > effective_reference - interval '7 days'
            and executed_at <= effective_reference
      ) activity
    ),
    (
      select count(distinct activity.user_id)::integer
      from (
        select user_id from public.rtn_live_hands
          where started_at > effective_reference - interval '30 days'
            and started_at <= effective_reference
        union
        select user_id from public.guess10_live_hands
          where started_at > effective_reference - interval '30 days'
            and started_at <= effective_reference
        union
        select user_id from public.shape_trader_trades
          where executed_at > effective_reference - interval '30 days'
            and executed_at <= effective_reference
      ) activity
    )
  )
  on conflict (snapshot_date) do update
  set
    snapshot_at          = excluded.snapshot_at,
    daily_active_users   = excluded.daily_active_users,
    weekly_active_users  = excluded.weekly_active_users,
    monthly_active_users = excluded.monthly_active_users;
end;
$$;

grant execute on function public.capture_app_activity_snapshot(date, timestamptz) to authenticated;


-- ── 9. backfill_app_activity_snapshots ───────────────────────
-- Fix derived_start_date — use rtn_live_hands instead of game_hands.

create or replace function public.backfill_app_activity_snapshots(
  start_snapshot_date date default null,
  end_snapshot_date   date default (timezone('utc', now()))::date
)
returns integer
language plpgsql
security definer
as $$
declare
  derived_start_date date;
  snapshot_day       date;
  affected_count     integer := 0;
begin
  if current_user <> 'postgres'
     and session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to backfill app activity snapshots';
  end if;

  select coalesce(
    start_snapshot_date,
    least(
      (select min((timezone('utc', started_at))::date) from public.rtn_live_hands),
      (select min((timezone('utc', started_at))::date) from public.guess10_live_hands)
    ),
    (timezone('utc', now()))::date
  )
  into derived_start_date;

  if derived_start_date is null or derived_start_date > end_snapshot_date then
    return 0;
  end if;

  for snapshot_day in
    select gs::date
    from generate_series(derived_start_date, end_snapshot_date, interval '1 day') as gs
  loop
    perform public.capture_app_activity_snapshot(
      snapshot_day,
      (snapshot_day::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC'
    );
    affected_count := affected_count + 1;
  end loop;

  return affected_count;
end;
$$;

grant execute on function public.backfill_app_activity_snapshots(date, date) to authenticated;
