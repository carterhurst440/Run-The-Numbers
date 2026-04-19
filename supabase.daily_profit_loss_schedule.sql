-- Daily profit and loss snapshot schedule
--
-- Runs the daily realized P&L snapshot once per day.
-- Safe to run repeatedly; the cron job is recreated idempotently.
--
-- NOTE:
-- This schedule runs at 07:00 UTC, which corresponds to roughly midnight
-- America/Denver during standard time. If you want exact local-midnight
-- behavior across DST changes, manage the job seasonally or use a scheduler
-- that supports America/Denver directly.

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'daily-profit-loss-snapshot';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'daily-profit-loss-snapshot',
  '0 7 * * *',
  $$select public.snapshot_daily_profit_loss();$$
);
