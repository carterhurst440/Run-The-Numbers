-- Function to automatically populate first_name and last_name in profiles
-- from auth.users metadata when a profile is created
CREATE OR REPLACE FUNCTION public.populate_profile_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_metadata JSONB;
  full_name_val TEXT;
  first_name_val TEXT;
  last_name_val TEXT;
  name_parts TEXT[];
BEGIN
  -- Get the user metadata from auth.users
  SELECT raw_user_meta_data INTO user_metadata
  FROM auth.users
  WHERE id = NEW.id;
  
  -- Extract first_name and last_name from metadata
  first_name_val := user_metadata->>'first_name';
  last_name_val := user_metadata->>'last_name';
  full_name_val := user_metadata->>'full_name';
  
  -- If first_name or last_name is empty, try to parse from full_name
  IF (first_name_val IS NULL OR first_name_val = '') AND full_name_val IS NOT NULL THEN
    name_parts := string_to_array(trim(full_name_val), ' ');
    first_name_val := COALESCE(NULLIF(trim(name_parts[1]), ''), first_name_val);
    
    IF array_length(name_parts, 1) > 1 THEN
      last_name_val := COALESCE(
        NULLIF(trim(array_to_string(name_parts[2:array_length(name_parts, 1)], ' ')), ''),
        last_name_val
      );
    END IF;
  END IF;
  
  -- Set the first_name and last_name on the NEW row
  NEW.first_name := first_name_val;
  NEW.last_name := last_name_val;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS populate_profile_names_on_insert ON public.profiles;

-- Create trigger to run BEFORE INSERT on profiles table
CREATE TRIGGER populate_profile_names_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_profile_names();

-- Add a comment
COMMENT ON FUNCTION public.populate_profile_names() IS 
  'Automatically populates first_name and last_name fields in profiles table from auth.users metadata';
