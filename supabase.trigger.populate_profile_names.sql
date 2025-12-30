-- Function to handle new user signup and populate profile with names
CREATE OR REPLACE FUNCTION public.handle_new_user_with_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_name_val TEXT;
  first_name_val TEXT;
  last_name_val TEXT;
  name_parts TEXT[];
BEGIN
  -- Extract first_name and last_name from NEW user's metadata
  first_name_val := NEW.raw_user_meta_data->>'first_name';
  last_name_val := NEW.raw_user_meta_data->>'last_name';
  full_name_val := NEW.raw_user_meta_data->>'full_name';
  
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
  
  -- Insert the profile with names
  INSERT INTO public.profiles (id, first_name, last_name, username, credits, carter_cash, carter_cash_progress)
  VALUES (
    NEW.id,
    first_name_val,
    last_name_val,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    ),
    1000, -- INITIAL_BANKROLL
    0,
    0
  );
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to run AFTER INSERT on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_with_names();

-- Add a comment
COMMENT ON FUNCTION public.handle_new_user_with_names() IS 
  'Creates a profile with first_name and last_name populated from auth.users metadata when a new user signs up';

