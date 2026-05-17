-- ============================================================
-- Fix: snapshot_daily_profit_loss must write per-mode rows
--
-- The table unique key is now (user_id, profit_date, mode).
-- The old function inserted a single mode-agnostic row and used
-- on conflict (user_id, profit_date), which violates the NOT NULL
-- constraint on mode and the new unique key — causing nightly
-- snapshots to silently fail since the mode migration ran.
--
-- This rewrite splits each user+date into 'normal' and 'contest'
-- rows (matching what the daily_profit_loss_mode migration did),
-- and upserts on the correct (user_id, profit_date, mode) key.
--
-- Safe to re-run.  After deploying, manually run for any missed
-- dates:  SELECT public.snapshot_daily_profit_loss('2026-05-16');
-- ============================================================

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
  with

  -- RTN hands split by mode
  rtn as (
    select
      rlh.user_id,
      timezone('America/Denver', rlh.started_at)::date            as profit_date,
      case when rlh.contest_id is null then 'normal' else 'contest' end as mode,
      sum(coalesce(rlh.net, 0))::numeric(12,2)                    as pnl_rtn
    from public.rtn_live_hands rlh
    where rlh.status <> 'active'
      and timezone('America/Denver', rlh.started_at)::date = target_date
    group by 1, 2, 3
  ),

  -- G10 hands split by mode
  g10 as (
    select
      glh.user_id,
      timezone('America/Denver', glh.started_at)::date            as profit_date,
      case when glh.contest_id is null then 'normal' else 'contest' end as mode,
      sum(coalesce(glh.net, 0))::numeric(12,2)                    as pnl_g10
    from public.guess10_live_hands glh
    where glh.status <> 'active'
      and timezone('America/Denver', glh.started_at)::date = target_date
    group by 1, 2, 3
  ),

  -- Shape Trader trades split by mode
  st as (
    select
      stt.user_id,
      timezone('America/Denver', stt.executed_at)::date           as profit_date,
      case when stt.contest_id is null then 'normal' else 'contest' end as mode,
      sum(coalesce(stt.net_profit, 0))::numeric(12,2)             as pnl_shape_traders
    from public.shape_trader_trades stt
    where lower(coalesce(stt.trade_side, '')) = 'sell'
      and stt.net_profit is not null
      and timezone('America/Denver', stt.executed_at)::date = target_date
    group by 1, 2, 3
  ),

  -- RYB (Color Scheme) rounds split by mode
  ryb as (
    select
      csr.user_id,
      timezone('America/Denver', csr.created_at)::date            as profit_date,
      case when csr.contest_id is null then 'normal' else 'contest' end as mode,
      sum(coalesce(csr.net_profit, 0))::numeric(12,2)             as pnl_ryb
    from public.color_scheme_rounds csr
    where csr.status = 'completed'
      and timezone('America/Denver', csr.created_at)::date = target_date
    group by 1, 2, 3
  ),

  -- All unique (user, date, mode) combinations from any game
  spine as (
    select user_id, profit_date, mode from rtn
    union
    select user_id, profit_date, mode from g10
    union
    select user_id, profit_date, mode from st
    union
    select user_id, profit_date, mode from ryb
  ),

  merged as (
    select
      s.user_id,
      s.profit_date,
      s.mode,
      coalesce(r.pnl_rtn,           0)::numeric(12,2) as pnl_rtn,
      coalesce(g.pnl_g10,           0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders, 0)::numeric(12,2) as pnl_shape_traders,
      coalesce(y.pnl_ryb,           0)::numeric(12,2) as pnl_ryb
    from spine s
    left join rtn r   on r.user_id   = s.user_id and r.profit_date   = s.profit_date and r.mode   = s.mode
    left join g10 g   on g.user_id   = s.user_id and g.profit_date   = s.profit_date and g.mode   = s.mode
    left join st  t   on t.user_id   = s.user_id and t.profit_date   = s.profit_date and t.mode   = s.mode
    left join ryb y   on y.user_id   = s.user_id and y.profit_date   = s.profit_date and y.mode   = s.mode
  ),

  upserted as (
    insert into public.daily_profit_loss (
      user_id,
      profit_date,
      mode,
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
      merged.mode,
      (merged.pnl_rtn + merged.pnl_g10 + merged.pnl_shape_traders + merged.pnl_ryb)::numeric(12,2),
      merged.pnl_rtn,
      merged.pnl_g10,
      merged.pnl_shape_traders,
      merged.pnl_ryb,
      timezone('utc', now())
    from merged
    where merged.user_id is not null
    on conflict (user_id, profit_date, mode) do update
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

-- ── Backfill any dates that failed since the mode migration ──────────────
-- Adjust the start date below if you know exactly when the migration ran.
-- Using 30 days back as a safe window — already-correct rows will just
-- be re-upserted with the same values (no harm).
do $$
declare
  d              date;
  affected_count integer;
begin
  for d in
    select generate_series(
      (timezone('America/Denver', now())::date - 30),
      (timezone('America/Denver', now())::date - 1),
      interval '1 day'
    )::date
  loop
    select public.snapshot_daily_profit_loss(d) into affected_count;
    if coalesce(affected_count, 0) > 0 then
      raise notice 'Snapshotted % → % row(s)', d, affected_count;
    end if;
  end loop;
end;
$$;

-- ── Verify ───────────────────────────────────────────────────────────────
select
  mode,
  count(*)                                       as total_rows,
  count(*) filter (where pnl_rtn  <> 0)          as rtn_nonzero,
  min(profit_date)                               as oldest,
  max(profit_date)                               as newest
from public.daily_profit_loss
group by mode
order by mode;
