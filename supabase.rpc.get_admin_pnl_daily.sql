-- ============================================================
-- get_admin_pnl_daily(p_start_date, p_end_date, p_modes, p_user_id)
--
-- Returns daily PNL rows from daily_profit_loss for the admin
-- PNL chart. Filtered by date range, mode(s), and optionally
-- a specific user. Returns one row per (user_id, profit_date, mode).
--
-- p_modes:   ARRAY['normal','contest']  both
--            ARRAY['normal']            normal only
--            ARRAY['contest']           contest only
-- p_user_id: NULL = all users, uuid = specific player
-- ============================================================

create or replace function public.get_admin_pnl_daily(
  p_start_date  date,
  p_end_date    date,
  p_modes       text[],
  p_user_id     uuid
)
returns table (
  profit_date       date,
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
  select
    dpl.profit_date,
    dpl.mode,
    dpl.user_id,
    dpl.pnl_rtn,
    dpl.pnl_g10,
    dpl.pnl_shape_traders,
    dpl.pnl_ryb
  from public.daily_profit_loss dpl
  where dpl.profit_date >= p_start_date
    and dpl.profit_date <= p_end_date
    and dpl.mode = any(p_modes)
    and (p_user_id is null or dpl.user_id = p_user_id);
end;
$$;

grant execute on function public.get_admin_pnl_daily(date, date, text[], uuid) to authenticated;
