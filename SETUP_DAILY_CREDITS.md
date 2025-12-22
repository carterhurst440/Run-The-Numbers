# Daily Credit Restoration Setup Guide

This guide explains how to set up the automated daily credit restoration system and related features.

## Features Implemented

1. **Daily Credit Restoration**: Automatically restores 1,000 credits at midnight to users with less than 100 credits
2. **Admin-Only Reset Button**: The RESET button in the header is now only visible to admin users
3. **Out-of-Credits Modal**: When a player with 0 credits tries to place a bet, they see a modal explaining the daily credit restoration

## Database Setup

### Step 1: Create the Daily Credit Restoration Function

Run the SQL commands in `supabase.function.restore_daily_credits.sql` in your Supabase SQL Editor:

```sql
-- This creates a function that updates all profiles with credits < 100 to 1000 credits
CREATE OR REPLACE FUNCTION restore_daily_credits()
RETURNS TABLE(restored_count INTEGER, user_ids TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_users TEXT[];
  update_count INTEGER;
BEGIN
  -- Update all profiles with credits < 100 to have 1000 credits
  WITH updated AS (
    UPDATE profiles
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

GRANT EXECUTE ON FUNCTION restore_daily_credits() TO authenticated;
```

### Step 2: Set Up Automated Daily Execution

You have two options for running this function automatically at midnight:

#### Option A: Using pg_cron (Recommended)

If your Supabase project has the `pg_cron` extension enabled:

1. Go to your Supabase SQL Editor
2. Run the following command:

```sql
-- Schedule the function to run every day at midnight UTC
SELECT cron.schedule(
  'restore-daily-credits',  -- Job name
  '0 0 * * *',              -- Cron expression: midnight UTC every day
  'SELECT restore_daily_credits();'
);
```

3. To verify the cron job is set up:

```sql
SELECT * FROM cron.job WHERE jobname = 'restore-daily-credits';
```

4. To manually test the function:

```sql
SELECT * FROM restore_daily_credits();
```

#### Option B: Using Supabase Edge Functions

If pg_cron is not available, you can use a Supabase Edge Function with a cron trigger:

1. Create a new Edge Function:

```bash
supabase functions new daily-credit-restore
```

2. Add this code to the function:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { data, error } = await supabaseClient.rpc('restore_daily_credits')
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return new Response(JSON.stringify({ 
    success: true, 
    restored_count: data[0]?.restored_count || 0,
    user_ids: data[0]?.user_ids || []
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
```

3. Deploy the function:

```bash
supabase functions deploy daily-credit-restore
```

4. Set up a cron trigger in the Supabase Dashboard:
   - Go to Database → Functions
   - Find your `daily-credit-restore` function
   - Set up a cron trigger with expression: `0 0 * * *` (midnight UTC daily)

## Frontend Changes

The following changes have been made to the frontend code:

### 1. Admin Check for Reset Button

- Added `updateResetButtonVisibility()` function in `script.js`
- The function uses the existing `isAdmin()` check (compares user email with `ADMIN_EMAIL`)
- Reset button is automatically hidden for non-admin users when they log in
- Reset button is shown for admin users (carterwarrenhurst@gmail.com)

### 2. Out-of-Credits Modal

- Added new modal HTML in `index.html` (id: `out-of-credits-modal`)
- Added `openOutOfCreditsModal()` and `closeOutOfCreditsModal()` functions
- Modal displays when a player with 0 credits tries to place a bet
- Message explains that 1,000 credits are restored daily at midnight for players with <100 credits

### 3. Credit Check Before Betting

- Modified `placeBet()` function to check if `bankroll === 0`
- If true, opens the out-of-credits modal instead of allowing bet placement
- Modal has OK button and X close button, both dismiss the modal

## Testing

### Test the Daily Restoration Function

1. Manually set a test user's credits to less than 100:

```sql
UPDATE profiles 
SET credits = 50 
WHERE id = 'YOUR_TEST_USER_ID';
```

2. Run the function manually:

```sql
SELECT * FROM restore_daily_credits();
```

3. Verify the credits were restored to 1000:

```sql
SELECT id, username, credits 
FROM profiles 
WHERE id = 'YOUR_TEST_USER_ID';
```

### Test the Admin Features

1. **Test Reset Button Visibility**:
   - Log in as admin (carterwarrenhurst@gmail.com) → Reset button should be visible
   - Log in as non-admin user → Reset button should be hidden

2. **Test Out-of-Credits Modal**:
   - Set your credits to 0 in Supabase
   - Try to place a bet
   - Modal should appear with the daily restoration message
   - Click OK or X to close the modal

## Timezone Considerations

The cron job runs at midnight UTC. If you want to run it at midnight in a different timezone:

- PST (UTC-8): Use `0 8 * * *`
- EST (UTC-5): Use `0 5 * * *`
- Adjust accordingly for your desired timezone

## Monitoring

To check when the function last ran and how many users were affected:

```sql
-- View pg_cron job run history (if using pg_cron)
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'restore-daily-credits')
ORDER BY start_time DESC 
LIMIT 10;
```

## Troubleshooting

### Function doesn't run automatically

1. Check if pg_cron extension is enabled:
```sql
SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';
```

2. Check if the cron job is scheduled:
```sql
SELECT * FROM cron.job WHERE jobname = 'restore-daily-credits';
```

3. Check for errors in the job logs:
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'restore-daily-credits')
AND status = 'failed';
```

### Reset button still showing for non-admin users

- Clear browser cache and reload
- Verify the user's email doesn't match the ADMIN_EMAIL constant in `script.js` (currently: carterwarrenhurst@gmail.com)

### Out-of-credits modal doesn't appear

- Check browser console for JavaScript errors
- Verify the modal HTML exists in `index.html`
- Make sure `bankroll === 0` when testing

## Admin Email Configuration

The admin email is currently hardcoded in `script.js`:

```javascript
const ADMIN_EMAIL = "carterwarrenhurst@gmail.com";
```

To change the admin user, update this constant and reload the application.
