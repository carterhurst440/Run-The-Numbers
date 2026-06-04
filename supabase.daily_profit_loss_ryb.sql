-- ============================================================
-- Fix: daily_profit_loss missing pnl_ryb (Color Scheme / RYB)
--
-- The snapshot_daily_profit_loss function never queried
-- color_scheme_rounds, so all historical RYB PNL showed as 0.
-- Today worked because the client computes it live from
-- color_scheme_rounds directly. Historical days only have the
-- snapshot, which had no RYB column.
--
-- This migration:
--   1. Adds pnl_ryb column to daily_profit_loss
--   2. Rewrites snapshot_daily_profit_loss to include RYB
--   3. Backfills all existing snapshot rows using the
--      updated function
-- ============================================================

-- 1. Add pnl_ryb column
alter table public.daily_profit_loss
  add column if not exists pnl_ryb numeric(12,2) not null default 0;

-- 2. Rewrite snapshot function with RYB support
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

      select
        glh.user_id,
        timezone('America/Denver', glh.started_at)::date as profit_date,
        'game_002' as game_id,
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
  ryb_totals as (
    select
      csr.user_id,
      timezone('America/Denver', csr.created_at)::date as profit_date,
      sum(coalesce(csr.net_profit, 0))::numeric(12,2) as pnl_ryb
    from public.color_scheme_rounds csr
    where csr.status = 'completed'
      and timezone('America/Denver', csr.created_at)::date = target_date
      and coalesce(csr.contest_id::text, '') = ''
    group by csr.user_id, timezone('America/Denver', csr.created_at)::date
  ),
  merged as (
    select
      coalesce(h.user_id, t.user_id, r.user_id)       as user_id,
      coalesce(h.profit_date, t.profit_date, r.profit_date, target_date) as profit_date,
      coalesce(h.pnl_rtn,           0)::numeric(12,2) as pnl_rtn,
      coalesce(h.pnl_g10,           0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders, 0)::numeric(12,2) as pnl_shape_traders,
      coalesce(r.pnl_ryb,           0)::numeric(12,2) as pnl_ryb
    from hand_totals h
    full outer join trade_totals t
      on h.user_id   = t.user_id
     and h.profit_date = t.profit_date
    full outer join ryb_totals r
      on coalesce(h.user_id, t.user_id) = r.user_id
     and coalesce(h.profit_date, t.profit_date) = r.profit_date
  ),
  upserted as (
    insert into public.daily_profit_loss (
      user_id,
      profit_date,
      pnl_total,
      pnl_rtn,
      pnl_g10,
      pnl_shape_traders,
      pnl_ryb,
      updated_at
    )
    select
      merged.user_id,
      merged.profit_date,
      (merged.pnl_rtn + merged.pnl_g10 + merged.pnl_shape_traders + merged.pnl_ryb)::numeric(12,2) as pnl_total,
      merged.pnl_rtn,
      merged.pnl_g10,
      merged.pnl_shape_traders,
      merged.pnl_ryb,
      timezone('utc', now())
    from merged
    where merged.user_id is not null
    on conflict (user_id, profit_date) do update
    set
      pnl_total         = excluded.pnl_total,
      pnl_rtn           = excluded.pnl_rtn,
      pnl_g10           = excluded.pnl_g10,
      pnl_shape_traders = excluded.pnl_shape_traders,
      pnl_ryb           = excluded.pnl_ryb,
      updated_at        = timezone('utc', now())
    returning 1
  )
  select count(*)::integer into affected_count from upserted;

  return affected_count;
end;
$$;

grant execute on function public.snapshot_daily_profit_loss(date) to authenticated;

-- 3. Backfill all existing snapshot rows with correct RYB PNL.
--    Updates every date that already has a snapshot row AND
--    re-runs the snapshot for any date with RYB activity that
--    may not have a row yet (up to 365 days back).
do $$
declare
  target_date   date;
  affected_count integer;
begin
  for target_date in
    select generate_series(
      (timezone('America/Denver', now())::date - 365),
      (timezone('America/Denver', now())::date - 1),
      interval '1 day'
    )::date
  loop
    select public.snapshot_daily_profit_loss(target_date)
    into affected_count;

    if coalesce(affected_count, 0) > 0 then
      raise notice 'Backfilled RYB for % (% rows)', target_date, affected_count;
    end if;
  end loop;
end;
$$;
