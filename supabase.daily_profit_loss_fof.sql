-- ============================================================
-- Add Fate or Fortune (FOF) to daily_profit_loss snapshots
--
-- The mode-aware snapshot_daily_profit_loss never queried
-- fate_or_fortune_rounds, so FOF PNL was excluded from both the
-- per-day snapshot and the pnl_total. The client computes today's
-- PNL live, but historical days only have the snapshot.
--
-- This migration:
--   1. Adds pnl_fof column to daily_profit_loss
--   2. Rewrites snapshot_daily_profit_loss to include FOF
--      (rounds attributed by locked_at, status='resolved')
--   3. Updates get_admin_pnl_daily to return pnl_fof
--   4. Backfills all snapshot rows (last 365 days)
-- ============================================================

-- 1. Add pnl_fof column
alter table public.daily_profit_loss
  add column if not exists pnl_fof numeric(12,2) not null default 0;

-- 2. Rewrite the mode-aware snapshot function with FOF support
create or replace function public.snapshot_daily_profit_loss(
  target_date date default ((timezone('America/Denver'::text, now()))::date - 1)
)
returns integer
language plpgsql
security definer
as $function$
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

  -- FOF (Fate or Fortune) rounds split by mode.
  -- Realized at lock time, so attribute by locked_at.
  fof as (
    select
      fr.user_id,
      timezone('America/Denver', fr.locked_at)::date              as profit_date,
      case when fr.contest_id is null then 'normal' else 'contest' end as mode,
      sum(coalesce(fr.net_profit, 0))::numeric(12,2)              as pnl_fof
    from public.fate_or_fortune_rounds fr
    where fr.status = 'resolved'
      and fr.locked_at is not null
      and timezone('America/Denver', fr.locked_at)::date = target_date
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
    union
    select user_id, profit_date, mode from fof
  ),

  merged as (
    select
      s.user_id,
      s.profit_date,
      s.mode,
      coalesce(r.pnl_rtn,           0)::numeric(12,2) as pnl_rtn,
      coalesce(g.pnl_g10,           0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders, 0)::numeric(12,2) as pnl_shape_traders,
      coalesce(y.pnl_ryb,           0)::numeric(12,2) as pnl_ryb,
      coalesce(f.pnl_fof,           0)::numeric(12,2) as pnl_fof
    from spine s
    left join rtn r   on r.user_id   = s.user_id and r.profit_date   = s.profit_date and r.mode   = s.mode
    left join g10 g   on g.user_id   = s.user_id and g.profit_date   = s.profit_date and g.mode   = s.mode
    left join st  t   on t.user_id   = s.user_id and t.profit_date   = s.profit_date and t.mode   = s.mode
    left join ryb y   on y.user_id   = s.user_id and y.profit_date   = s.profit_date and y.mode   = s.mode
    left join fof f   on f.user_id   = s.user_id and f.profit_date   = s.profit_date and f.mode   = s.mode
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
      pnl_fof,
      updated_at
    )
    select
      merged.user_id,
      merged.profit_date,
      merged.mode,
      (merged.pnl_rtn + merged.pnl_g10 + merged.pnl_shape_traders + merged.pnl_ryb + merged.pnl_fof)::numeric(12,2),
      merged.pnl_rtn,
      merged.pnl_g10,
      merged.pnl_shape_traders,
      merged.pnl_ryb,
      merged.pnl_fof,
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
      pnl_fof           = excluded.pnl_fof,
      updated_at        = timezone('utc', now())
    returning 1
  )
  select count(*)::integer into affected_count from upserted;

  return affected_count;
end;
$function$;

grant execute on function public.snapshot_daily_profit_loss(date) to authenticated;

-- 3. Update get_admin_pnl_daily to surface pnl_fof
-- (return signature changes, so drop first)
drop function if exists public.get_admin_pnl_daily(date, date, text[], uuid);
create or replace function public.get_admin_pnl_daily(
  p_start_date date,
  p_end_date date,
  p_modes text[],
  p_user_id uuid
)
returns table(
  profit_date date,
  mode text,
  user_id uuid,
  pnl_rtn numeric,
  pnl_g10 numeric,
  pnl_shape_traders numeric,
  pnl_ryb numeric,
  pnl_fof numeric
)
language plpgsql
stable security definer
as $function$
begin
  if (select auth.jwt() ->> 'email') not in (
    'carterwarrenhurst@gmail.com',
    'carterscasinoapp@gmail.com'
  ) then
    raise exception 'Forbidden' using errcode = 'P0003';
  end if;

  return query
  select
    dpl.profit_date,
    dpl.mode,
    dpl.user_id,
    dpl.pnl_rtn,
    dpl.pnl_g10,
    dpl.pnl_shape_traders,
    dpl.pnl_ryb,
    dpl.pnl_fof
  from public.daily_profit_loss dpl
  where dpl.profit_date >= p_start_date
    and dpl.profit_date <= p_end_date
    and dpl.mode = any(p_modes)
    and (p_user_id is null or dpl.user_id = p_user_id);
end;
$function$;

grant execute on function public.get_admin_pnl_daily(date, date, text[], uuid) to authenticated;

-- 4. Backfill all existing snapshot rows with correct FOF PNL (last 365 days).
do $$
declare
  d              date;
  affected_count integer;
begin
  for d in
    select generate_series(
      (timezone('America/Denver', now())::date - 365),
      (timezone('America/Denver', now())::date - 1),
      interval '1 day'
    )::date
  loop
    select public.snapshot_daily_profit_loss(d) into affected_count;
    if coalesce(affected_count, 0) > 0 then
      raise notice 'Backfilled FOF for % (% rows)', d, affected_count;
    end if;
  end loop;
end;
$$;
