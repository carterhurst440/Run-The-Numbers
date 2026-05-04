-- Shape Traders draw retention
--
-- Deletes persisted draw rows once they are older than 24 hours.
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
    where persisted_at < timezone('utc', now()) - interval '24 hours'
    returning 1
  )
  select count(*) into deleted_count
  from deleted;

  return coalesce(deleted_count, 0);
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in ('shape-trader-draw-retention-daily', 'shape-trader-draw-retention-hourly')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'shape-trader-draw-retention-hourly',
  '0 * * * *',
  $$select public.purge_old_shape_trader_draws();$$
);
