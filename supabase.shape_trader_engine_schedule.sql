-- Shape Traders engine scheduler
--
-- Moves draw generation to pg_cron so browsers stop contending on shape_trader_tick().
-- Safe to run repeatedly; matching legacy jobs are removed before the canonical job is created.

create extension if not exists pg_cron;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where lower(coalesce(jobname, '')) like '%shape-trader%'
      and lower(coalesce(command, '')) like '%shape_trader_tick%'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'shape-trader-engine-every-second',
  '1 second',
  $$select public.shape_trader_tick();$$
);
