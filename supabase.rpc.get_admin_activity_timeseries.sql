-- ============================================================
-- get_admin_activity_timeseries(p_start_at, p_end_at, p_bucket)
--
-- Returns bucketed event counts per game per user for the
-- admin activity chart. Covers all five live game tables:
--   rtn_live_hands, guess10_live_hands,
--   shape_trader_trades, color_scheme_rounds,
--   fate_or_fortune_rounds
--
-- FOF rounds are realized at lock time, so they're bucketed by
-- locked_at and counted only when status = 'resolved' (matching
-- get_admin_activity_log's FOF treatment).
--
-- Runs as SECURITY DEFINER to read across all users despite RLS.
-- Admin-gated: only the known admin emails may call this.
--
-- p_bucket is a PostgreSQL interval string, e.g.:
--   '5 minutes'  '1 hour'  '12 hours'  '1 day'  '3 days'
--   '1 week'     '2 weeks'
-- ============================================================

create or replace function public.get_admin_activity_timeseries(
  p_start_at timestamptz,
  p_end_at   timestamptz,
  p_bucket   interval
)
returns table (
  bucket   timestamptz,
  game     text,
  user_id  uuid,
  cnt      bigint
)
language plpgsql
security definer
stable
as $$
begin
  -- Admin-only gate via JWT email
  if (select auth.jwt() ->> 'email') not in (
    'carterwarrenhurst@gmail.com',
    'carterscasinoapp@gmail.com'
  ) then
    raise exception 'Forbidden' using errcode = 'P0003';
  end if;

  return query
    -- RTN
    select
      date_bin(p_bucket, rlh.started_at, p_start_at) as bucket,
      'rtn'::text                                     as game,
      rlh.user_id,
      count(*)::bigint                                as cnt
    from public.rtn_live_hands rlh
    where rlh.started_at >= p_start_at
      and rlh.started_at <= p_end_at
      and rlh.status     <> 'active'
    group by 1, 2, 3

    union all

    -- G10
    select
      date_bin(p_bucket, glh.started_at, p_start_at),
      'g10'::text,
      glh.user_id,
      count(*)::bigint
    from public.guess10_live_hands glh
    where glh.started_at >= p_start_at
      and glh.started_at <= p_end_at
      and glh.status     <> 'active'
    group by 1, 2, 3

    union all

    -- Shape Trader
    select
      date_bin(p_bucket, stt.executed_at, p_start_at),
      'st'::text,
      stt.user_id,
      count(*)::bigint
    from public.shape_trader_trades stt
    where stt.executed_at >= p_start_at
      and stt.executed_at <= p_end_at
    group by 1, 2, 3

    union all

    -- Color Scheme (RYB)
    select
      date_bin(p_bucket, csr.created_at, p_start_at),
      'ryb'::text,
      csr.user_id,
      count(*)::bigint
    from public.color_scheme_rounds csr
    where csr.created_at >= p_start_at
      and csr.created_at <= p_end_at
      and csr.status      = 'completed'
    group by 1, 2, 3

    union all

    -- Fate or Fortune (FOF)
    select
      date_bin(p_bucket, fr.locked_at, p_start_at),
      'fof'::text,
      fr.user_id,
      count(*)::bigint
    from public.fate_or_fortune_rounds fr
    where fr.locked_at >= p_start_at
      and fr.locked_at <= p_end_at
      and fr.status     = 'resolved'
    group by 1, 2, 3;
end;
$$;

grant execute on function public.get_admin_activity_timeseries(timestamptz, timestamptz, interval) to authenticated;
