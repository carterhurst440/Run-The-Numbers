-- ============================================================================
-- Public lookup: referral code -> affiliate username.
--
-- The signup page is unauthenticated, so it cannot read the profiles table
-- directly (RLS). This SECURITY DEFINER function exposes ONLY the affiliate's
-- public username for a given referral code so the Create Account screen can
-- show "Invited by <username>". No other profile data is returned.
-- ============================================================================
create or replace function public.resolve_referral_affiliate(_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(nullif(trim(coalesce(_referral_code, '')), ''));
  v_username text;
begin
  if v_code is null then
    return jsonb_build_object('found', false);
  end if;

  select username into v_username
  from public.profiles
  where upper(referral_code) = v_code
  limit 1;

  if v_username is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object('found', true, 'affiliate_name', v_username);
end;
$$;

grant execute on function public.resolve_referral_affiliate(text) to anon, authenticated;
