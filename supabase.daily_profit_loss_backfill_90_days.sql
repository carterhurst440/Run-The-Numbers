-- Daily profit and loss backfill
--
-- Backfills the last 90 completed America/Denver-local days into
-- public.daily_profit_loss by repeatedly calling the snapshot function.
--
-- On April 18, 2026, this covers:
--   January 18, 2026 through April 17, 2026

do $$
declare
  target_date date;
  affected_count integer;
begin
  for target_date in
    select generate_series(
      (timezone('America/Denver', now())::date - 90),
      (timezone('America/Denver', now())::date - 1),
      interval '1 day'
    )::date
  loop
    select public.snapshot_daily_profit_loss(target_date)
    into affected_count;

    raise notice 'Backfilled % (% rows affected)', target_date, coalesce(affected_count, 0);
  end loop;
end;
$$;
