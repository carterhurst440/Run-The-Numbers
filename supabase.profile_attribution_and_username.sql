-- ============================================================================
-- PROFILE ATTRIBUTION COLUMNS + UNIQUE USERNAMES
--
-- 1. profiles.referred_by_code / referred_by_user_id: the affiliate code used at
--    signup and the resolved referrer. Attribution (who a player signed up
--    under) — distinct from affiliate_signups, which records CREDITED referrals.
--    Captures the attempt even when crediting is blocked (self-referral, unknown
--    code, unconfirmed email).
-- 2. Case-insensitive unique usernames + an anon is_username_available() check
--    for the signup form. Users now choose their username explicitly.
--
-- handle_new_user_with_names stamps all of this at profile creation (it already
-- runs on auth.users INSERT — see reference_profile_autocreate_gotcha).
-- ============================================================================

alter table public.profiles
  add column if not exists referred_by_code text,
  add column if not exists referred_by_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(trim(username)));

create or replace function public.is_username_available(_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select length(trim(coalesce(_username, ''))) >= 3
     and not exists (
       select 1 from public.profiles
       where lower(trim(username)) = lower(trim(_username))
     );
$$;
grant execute on function public.is_username_available(text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_with_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  full_name_val TEXT;
  first_name_val TEXT;
  last_name_val TEXT;
  name_parts TEXT[];
  username_val TEXT;
  ref_code TEXT;
  ref_user UUID;
BEGIN
  first_name_val := NEW.raw_user_meta_data->>'first_name';
  last_name_val := NEW.raw_user_meta_data->>'last_name';
  full_name_val := NEW.raw_user_meta_data->>'full_name';

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

  username_val := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );

  ref_code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'referred_by'), ''));
  IF ref_code IS NOT NULL THEN
    SELECT id INTO ref_user FROM public.profiles
    WHERE upper(referral_code) = ref_code AND id <> NEW.id
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (
    id, first_name, last_name, username, credits, carter_cash, carter_cash_progress,
    referred_by_code, referred_by_user_id
  )
  VALUES (
    NEW.id, first_name_val, last_name_val, username_val, 1000, 0, 0,
    ref_code, ref_user
  );

  RETURN NEW;
END;
$function$;

-- Confirmation crediting reads attribution from profiles (falls back to metadata).
create or replace function public.award_affiliate_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  select nullif(trim(referred_by_code), '') into v_code from public.profiles where id = new.id;
  if v_code is null then
    v_code := nullif(trim(coalesce(new.raw_user_meta_data->>'referred_by', '')), '');
  end if;
  if v_code is null then
    return new;
  end if;
  perform public.credit_affiliate_signup(new.id, v_code);
  return new;
end;
$$;

-- Backfill attribution for existing profiles from auth metadata.
update public.profiles p
set referred_by_code = upper(nullif(trim(u.raw_user_meta_data->>'referred_by'), ''))
from auth.users u
where u.id = p.id
  and p.referred_by_code is null
  and nullif(trim(u.raw_user_meta_data->>'referred_by'), '') is not null;

update public.profiles p
set referred_by_user_id = r.id
from public.profiles r
where p.referred_by_user_id is null
  and p.referred_by_code is not null
  and upper(r.referral_code) = p.referred_by_code
  and r.id <> p.id;
