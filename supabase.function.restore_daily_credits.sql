-- Function to restore credits to users with less than 100 credits.
-- Important: this only restores Normal Mode balances stored in public.profiles.
-- Contest balances live in public.contest_entries and must never be touched here.
-- This should be run daily at midnight via pg_cron or a scheduled edge function.

CREATE OR REPLACE FUNCTION restore_daily_credits()
RETURNS TABLE(restored_count INTEGER, user_ids TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_users TEXT[];
  update_count INTEGER;
BEGIN
  -- Allow this security-definer function to bypass the guard_profile_sensitive_fields trigger.
  PERFORM set_config('rtn.allow_sensitive_balance_write', '1', true);

  -- Only update Normal Mode balances in public.profiles.
  -- Contest Mode balances are stored separately in public.contest_entries.
  WITH targets AS (
    SELECT id, credits AS previous_balance
    FROM public.profiles
    WHERE credits < 100
  ),
  updated AS (
    UPDATE public.profiles profile
    SET credits = 1000
    FROM targets target
    WHERE profile.id = target.id
    RETURNING
      profile.id,
      target.previous_balance,
      (1000 - target.previous_balance)::numeric(12,2) AS added_amount,
      profile.credits::numeric(12,2) AS new_balance
  ),
  logged AS (
    INSERT INTO public.account_events (
      user_id,
      event_type,
      amount,
      previous_balance,
      new_balance,
      metadata,
      created_at
    )
    SELECT
      updated.id,
      'daily_credit_refresh',
      updated.added_amount,
      updated.previous_balance,
      updated.new_balance,
      jsonb_build_object(
        'source', 'restore_daily_credits',
        'target_balance', 1000
      ),
      timezone('utc', now())
    FROM updated
    RETURNING user_id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id::TEXT)
  INTO update_count, affected_users
  FROM updated;
  
  -- Log the restoration
  RAISE NOTICE 'Daily credit restoration: % users restored to 1000 credits', update_count;
  
  RETURN QUERY SELECT update_count, affected_users;
END;
$$;

-- Grant execute permission to authenticated users (for manual testing)
GRANT EXECUTE ON FUNCTION restore_daily_credits() TO authenticated;

-- To set up automatic daily execution at midnight UTC, you'll need to use pg_cron:
-- SELECT cron.schedule('restore-daily-credits', '0 0 * * *', 'SELECT restore_daily_credits()');
