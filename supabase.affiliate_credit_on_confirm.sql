-- ============================================================================
-- AFFILIATE CREDITING — server-side, on email confirmation.
--
-- Root cause of missed credits: profiles are auto-created by the
-- handle_new_user_with_names trigger on auth.users INSERT. The client's
-- provisionProfileForUser therefore always hits a duplicate insert and skips its
-- maybeRecordAffiliateSignup call, so referral credit never fired.
--
-- Fix: credit server-side from an auth.users trigger, keyed by the referred user
-- id (no auth.uid() dependency), gated on email confirmation so unconfirmed fake
-- signups cannot farm credits. Idempotent via the affiliate_signups unique
-- referred_user_id + an explicit already_recorded guard. The account_events row
-- it writes also produces the referrer's bankroll point (record_event_bankroll_point).
-- ============================================================================

create or replace function public.credit_affiliate_signup(_referred_user uuid, _referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer     public.profiles%rowtype;
  v_new_profile  public.profiles%rowtype;
  v_award        constant numeric(12,2) := 1000;
  v_prev         numeric(12,2);
  v_new          numeric(12,2);
  v_code         text := upper(nullif(trim(coalesce(_referral_code, '')), ''));
begin
  if _referred_user is null or v_code is null then
    return jsonb_build_object('credited', false, 'reason', 'no_code');
  end if;

  if exists (select 1 from public.affiliate_signups where referred_user_id = _referred_user) then
    return jsonb_build_object('credited', false, 'reason', 'already_recorded');
  end if;

  select * into v_referrer from public.profiles where upper(referral_code) = v_code for update;
  if not found then
    return jsonb_build_object('credited', false, 'reason', 'unknown_code');
  end if;

  if v_referrer.id = _referred_user then
    return jsonb_build_object('credited', false, 'reason', 'self_referral');
  end if;

  select * into v_new_profile from public.profiles where id = _referred_user;

  v_prev := coalesce(v_referrer.credits, 0);
  v_new  := round(v_prev + v_award, 2);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles set credits = v_new where id = v_referrer.id;

  insert into public.affiliate_signups (
    referred_user_id, affiliate_user_id, affiliate_username, referred_username,
    amount_credited, referrer_new_balance
  ) values (
    _referred_user, v_referrer.id, v_referrer.username,
    coalesce(v_new_profile.username, ''), v_award, v_new
  );

  insert into public.account_events (
    user_id, event_type, amount, previous_balance, new_balance, metadata, created_at
  ) values (
    v_referrer.id, 'affiliate_signup', v_award, v_prev, v_new,
    jsonb_build_object('referred_user_id', _referred_user, 'source', 'credit_affiliate_signup'),
    timezone('utc', now())
  );

  return jsonb_build_object('credited', true, 'amount', v_award, 'affiliate_username', v_referrer.username);
end;
$$;

create or replace function public.award_affiliate_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := nullif(trim(coalesce(new.raw_user_meta_data->>'referred_by', '')), '');
begin
  if v_code is null or new.email_confirmed_at is null then
    return new;
  end if;
  perform public.credit_affiliate_signup(new.id, v_code);
  return new;
end;
$$;

-- Confirmed later (the common email-confirmation flow).
drop trigger if exists award_affiliate_on_confirm_upd on auth.users;
create trigger award_affiliate_on_confirm_upd
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.award_affiliate_on_confirm();

-- Confirmed at creation (OAuth / admin-created).
drop trigger if exists award_affiliate_on_confirm_ins on auth.users;
create trigger award_affiliate_on_confirm_ins
after insert on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function public.award_affiliate_on_confirm();

-- One-time backfill for the signup missed before this fix (carter@sixfifty.com,
-- referred by code 5DCFFMTE). Idempotent — re-running is a no-op.
-- select public.credit_affiliate_signup('98ec5f7d-dba8-4f4c-8db5-7e0a90896c47', '5DCFFMTE');
