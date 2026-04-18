-- Shape Traders backend engine schedule
--
-- Recommended:
-- 1. Deploy the edge function:
--      supabase functions deploy shape-trader-engine
-- 2. Set an edge secret:
--      SHAPE_TRADER_CRON_SECRET
-- 3. Schedule the function.
--
-- If pg_cron + pg_net are available in your Supabase project, this SQL creates
-- a minute-based recurring trigger that backfills any due draws.
--
-- IMPORTANT:
-- Replace the placeholders below before running:
--   YOUR_PROJECT_REF
--   YOUR_SHAPE_TRADER_CRON_SECRET
--
-- NOTE:
-- Supabase pg_cron runs on minute granularity, not every 15 seconds.
-- This is still valuable because it prevents the market from stalling with no
-- active player and will backfill missed 15-second draws each minute.
-- For true headless 15-second cadence, use an external scheduler that can hit
-- the same edge function every 15 seconds.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'shape-trader-engine-minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'shape-trader-engine-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.functions.supabase.co/shape-trader-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-shape-trader-cron-secret', 'YOUR_SHAPE_TRADER_CRON_SECRET'
      ),
      body := jsonb_build_object(
        'reason', 'pg_cron-minute-tick'
      )
    );
  $cron$
);
