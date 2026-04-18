-- Shape Traders draw retention
--
-- Deletes persisted draw rows once they are older than 48 hours.
-- Safe to run repeatedly; the cron job is recreated idempotently.

create extension if not exists pg_cron;

create or replace function public.purge_old_shape_trader_draws()
returns bigint
language plpgsql
security definer
as $$
declare
  deleted_count bigint;
begin
  with deleted as (
    delete from public.shape_trader_draws
    where coalesce(drawn_at, created_at) < timezone('utc', now()) - interval '48 hours'
    returning 1
  )
  select count(*) into deleted_count
  from deleted;

  return coalesce(deleted_count, 0);
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'shape-trader-draw-retention-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'shape-trader-draw-retention-hourly',
  '0 * * * *',
  $$select public.purge_old_shape_trader_draws();$$
);
