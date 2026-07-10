-- ============================================================
-- Admin TOOLS · Award Credits
-- Lets an admin grant credits to any player's account. Logged as an
-- account_events row (event_type 'admin_grant') so it shows on the
-- player's bankroll chart. Admin-gated; bypasses guard_profile_sensitive_fields
-- via the rtn.allow_sensitive_balance_write flag.
-- ============================================================

-- 1. Allow the new account-event type.
alter table public.account_events drop constraint if exists account_events_event_type_check;
alter table public.account_events add constraint account_events_event_type_check
  check (event_type in ('daily_credit_refresh','affiliate_signup','rank_up_bonus','admin_grant'));

-- 2. admin_grant_credits(p_user_id, p_amount)
create or replace function public.admin_grant_credits(p_user_id uuid, p_amount numeric)
returns table(user_id uuid, previous_balance numeric, amount numeric, new_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_prev numeric(12,2);
  v_new  numeric(12,2);
  v_amt  numeric(12,2);
begin
  if (select auth.jwt() ->> 'email') not in (
    'carterwarrenhurst@gmail.com', 'carterscasinoapp@gmail.com'
  ) then
    raise exception 'Forbidden' using errcode = 'P0003';
  end if;

  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023', detail = 'a player is required';
  end if;
  v_amt := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amt <= 0 then
    raise exception 'invalid_amount' using errcode = '22023', detail = 'amount must be a positive number';
  end if;

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  select credits into v_prev from public.profiles where id = p_user_id for update;
  if v_prev is null then
    raise exception 'no_profile' using errcode = 'P0002', detail = 'player not found';
  end if;

  v_new := round(v_prev + v_amt, 2);
  update public.profiles set credits = v_new where id = p_user_id;

  insert into public.account_events (user_id, event_type, amount, previous_balance, new_balance, metadata)
  values (p_user_id, 'admin_grant', v_amt, v_prev, v_new,
          jsonb_build_object('granted_by', auth.uid()));

  return query select p_user_id, v_prev, v_amt, v_new;
end;
$$;

grant execute on function public.admin_grant_credits(uuid, numeric) to authenticated;

-- 3. Surface admin grants on the bankroll chart (get_bankroll_series account_events arm).
--    Re-run supabase.bankroll_series_union.sql after this so its event_type filter
--    includes 'admin_grant' (handled there).
