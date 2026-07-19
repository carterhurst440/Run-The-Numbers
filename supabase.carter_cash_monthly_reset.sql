-- Carter Cash — monthly wipe.
--
-- CC is use-it-or-lose-it: the spendable balance resets to 0 at 00:00 UTC on the
-- 1st of every month (the same slot as reset-prize-redemptions, so both monthly
-- resets land together). Surfaced to players in the CC tooltip in the header.
--
-- profiles.carter_cash is protected by guard_profile_sensitive_fields(), so this
-- follows the same pattern as reset_all_prize_redemptions(): SECURITY DEFINER
-- plus the rtn.allow_sensitive_balance_write flag to get past the guard.
--
-- SCOPE: only the spendable BALANCE (profiles.carter_cash) is wiped.
-- profiles.carter_cash_progress — the partial progress toward the next CC from
-- wagering — is deliberately left alone, so a player part-way to their next CC
-- doesn't lose that credit just because the month rolled over.

create or replace function public.reset_all_carter_cash()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  update public.profiles
     set carter_cash = 0
   where carter_cash is distinct from 0;
end;
$function$;

revoke all on function public.reset_all_carter_cash() from public, anon, authenticated;

-- pg_cron: 00:00 UTC on the 1st of every month.
select cron.schedule('reset-carter-cash-monthly', '0 0 1 * *',
  $$select public.reset_all_carter_cash();$$);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job
--   where jobname = 'reset-carter-cash-monthly';
