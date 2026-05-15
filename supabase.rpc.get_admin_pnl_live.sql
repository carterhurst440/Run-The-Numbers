-- ============================================================
-- get_admin_pnl_live(p_start_at, p_end_at, p_bucket, p_modes, p_user_id)
--
-- Returns time-bucketed PNL computed directly from the four live
-- game tables. Used for:
--   • 24HR chart  (p_bucket = '1 hour')
--   • Today's bar on longer charts  (p_bucket = '1 day')
--
-- Splits by mode: contest_id IS NULL → 'normal', else → 'contest'
-- Filters by p_modes and optionally p_user_id.
-- Runs as SECURITY DEFINER to read across all users.
-- ============================================================

create or replace function public.get_admin_pnl_live(
  p_start_at  timestamptz,
  p_end_at    timestamptz,
  p_bucket    interval,
  p_modes     text[],
  p_user_id   uuid
)
returns table (
  bucket            timestamptz,
  mode              text,
  user_id           uuid,
  pnl_rtn           numeric,
  pnl_g10           numeric,
  pnl_shape_traders numeric,
  pnl_ryb           numeric
)
language plpgsql
security definer
stable
as $$
begin
  if (select auth.jwt() ->> 'email') not in (
    'carterwarrenhurst@gmail.com',
    'carterscasinoapp@gmail.com'
  ) then
    raise exception 'Forbidden' using errcode = 'P0003';
  end if;

  return query
  with

  rtn_data as (
    select
      date_bin(p_bucket, started_at, p_start_at)                  as bucket,
      case when contest_id is null then 'normal' else 'contest' end as mode,
      rlh.user_id,
      sum(coalesce(net, 0))::numeric                              as pnl
    from public.rtn_live_hands rlh
    where started_at >= p_start_at
      and started_at <= p_end_at
      and status <> 'active'
      and case when contest_id is null then 'normal' else 'contest' end = any(p_modes)
      and (p_user_id is null or rlh.user_id = p_user_id)
    group by 1, 2, 3
  ),

  g10_data as (
    select
      date_bin(p_bucket, started_at, p_start_at)                  as bucket,
      case when contest_id is null then 'normal' else 'contest' end as mode,
      glh.user_id,
      sum(coalesce(net, 0))::numeric                              as pnl
    from public.guess10_live_hands glh
    where started_at >= p_start_at
      and started_at <= p_end_at
      and status <> 'active'
      and case when contest_id is null then 'normal' else 'contest' end = any(p_modes)
      and (p_user_id is null or glh.user_id = p_user_id)
    group by 1, 2, 3
  ),

  st_data as (
    select
      date_bin(p_bucket, executed_at, p_start_at)                 as bucket,
      case when contest_id is null then 'normal' else 'contest' end as mode,
      stt.user_id,
      sum(coalesce(net_profit, 0))::numeric                       as pnl
    from public.shape_trader_trades stt
    where executed_at >= p_start_at
      and executed_at <= p_end_at
      and case when contest_id is null then 'normal' else 'contest' end = any(p_modes)
      and (p_user_id is null or stt.user_id = p_user_id)
    group by 1, 2, 3
  ),

  ryb_data as (
    select
      date_bin(p_bucket, created_at, p_start_at)                  as bucket,
      case when contest_id is null then 'normal' else 'contest' end as mode,
      csr.user_id,
      sum(coalesce(net_profit, 0))::numeric                       as pnl
    from public.color_scheme_rounds csr
    where created_at >= p_start_at
      and created_at <= p_end_at
      and status = 'completed'
      and case when contest_id is null then 'normal' else 'contest' end = any(p_modes)
      and (p_user_id is null or csr.user_id = p_user_id)
    group by 1, 2, 3
  ),

  spine as (
    select bucket, mode, user_id from rtn_data
    union
    select bucket, mode, user_id from g10_data
    union
    select bucket, mode, user_id from st_data
    union
    select bucket, mode, user_id from ryb_data
  )

  select
    sp.bucket,
    sp.mode,
    sp.user_id,
    coalesce(r.pnl,  0) as pnl_rtn,
    coalesce(g.pnl,  0) as pnl_g10,
    coalesce(s.pnl,  0) as pnl_shape_traders,
    coalesce(y.pnl,  0) as pnl_ryb
  from spine sp
  left join rtn_data r  on r.bucket  = sp.bucket and r.mode  = sp.mode and r.user_id  = sp.user_id
  left join g10_data g  on g.bucket  = sp.bucket and g.mode  = sp.mode and g.user_id  = sp.user_id
  left join st_data  s  on s.bucket  = sp.bucket and s.mode  = sp.mode and s.user_id  = sp.user_id
  left join ryb_data y  on y.bucket  = sp.bucket and y.mode  = sp.mode and y.user_id  = sp.user_id;
end;
$$;

grant execute on function public.get_admin_pnl_live(timestamptz, timestamptz, interval, text[], uuid) to authenticated;
