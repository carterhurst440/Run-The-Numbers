-- Migration: Backfill first_name and last_name in profiles table from auth.users metadata
-- This script extracts the display name from auth.users and splits it into first_name and last_name

DO $$
DECLARE
  user_record RECORD;
  display_name TEXT;
  name_parts TEXT[];
  first_name_val TEXT;
  last_name_val TEXT;
  updated_count INTEGER := 0;
BEGIN
  -- Loop through all profiles that have NULL first_name or last_name
  FOR user_record IN 
    SELECT p.id, u.raw_user_meta_data
    FROM public.profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE p.first_name IS NULL OR p.last_name IS NULL
  LOOP
    -- Extract display name from metadata
    display_name := COALESCE(
      user_record.raw_user_meta_data->>'full_name',
      user_record.raw_user_meta_data->>'name',
      ''
    );
    
    -- Skip if no display name found
    IF display_name = '' THEN
      RAISE NOTICE 'No display name found for user %', user_record.id;
      CONTINUE;
    END IF;
    
    -- Split the display name into parts
    name_parts := string_to_array(trim(display_name), ' ');
    
    -- Extract first name (first part)
    first_name_val := NULLIF(trim(name_parts[1]), '');
    
    -- Extract last name (everything after first part)
    IF array_length(name_parts, 1) > 1 THEN
      last_name_val := NULLIF(trim(array_to_string(name_parts[2:array_length(name_parts, 1)], ' ')), '');
    ELSE
      last_name_val := NULL;
    END IF;
    
    -- Update the profile
    UPDATE public.profiles
    SET 
      first_name = COALESCE(first_name, first_name_val),
      last_name = COALESCE(last_name, last_name_val)
    WHERE id = user_record.id;
    
    updated_count := updated_count + 1;
    RAISE NOTICE 'Updated user % with first_name: %, last_name: %', 
      user_record.id, first_name_val, last_name_val;
  END LOOP;
  
  RAISE NOTICE 'Migration complete. Updated % profiles.', updated_count;
END $$;

-- Verify the results
SELECT 
  p.id,
  u.email,
  u.raw_user_meta_data->>'full_name' as original_name,
  p.first_name,
  p.last_name
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY u.created_at DESC
LIMIT 10;
