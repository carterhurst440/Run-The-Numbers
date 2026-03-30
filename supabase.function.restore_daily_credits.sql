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
  -- Only update Normal Mode balances in public.profiles.
  -- Contest Mode balances are stored separately in public.contest_entries.
  WITH updated AS (
    UPDATE public.profiles
    SET credits = 1000
    WHERE credits < 100
    RETURNING id
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
