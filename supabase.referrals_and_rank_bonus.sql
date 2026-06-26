-- ============================================================================
-- Referrals + rank-advancement bonuses; removal of automatic credit refresh.
--
-- After this migration, credits are NEVER auto-refreshed. The only ways to gain
-- credits are:
--   1. Referrals  -> 1000 credits to the referrer when a referred user confirms
--      their email and first provisions a profile.
--   2. Rank advancement -> a configurable per-tier bonus (ranks.advancement_bonus_credits)
--      awarded automatically the first time a user crosses into each new tier.
--
-- Both paths respect the existing guard_profile_sensitive_fields trigger by
-- setting rtn.allow_sensitive_balance_write, and both write to account_events.
-- ============================================================================

-- 1) Stop the automatic daily credit refresh ---------------------------------
do $$
declare
  j record;
begin
  begin
    for j in select jobid from cron.job where command ilike '%restore_daily_credits%' loop
      perform cron.unschedule(j.jobid);
    end loop;
  exception when others then
    raise notice 'cron unschedule skipped: %', sqlerrm;
  end;
end
$$;

-- Neuter the function so any leftover/manual call is a no-op.
create or replace function public.restore_daily_credits()
returns table(restored_count integer, user_ids text[])
language plpgsql
security definer
as $$
begin
  -- Automatic credit refresh has been retired. Credits are earned only via
  -- referrals and rank advancement. This is intentionally a no-op.
  return query select 0::integer, array[]::text[];
end;
$$;

-- 2) Expand the account_events event_type whitelist --------------------------
alter table public.account_events
  drop constraint if exists account_events_event_type_check;
alter table public.account_events
  add constraint account_events_event_type_check
  check (event_type in ('daily_credit_refresh', 'affiliate_signup', 'rank_up_bonus'));

-- 3) New profile columns: referral_code + highest_rewarded_tier --------------
alter table public.profiles
  add column if not exists referral_code text;

alter table public.profiles
  add column if not exists highest_rewarded_tier integer not null default 1;

create unique index if not exists idx_profiles_referral_code
  on public.profiles (referral_code);

-- Unique 8-char code from an unambiguous alphabet (no 0/O/1/I/L).
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i integer;
  taken boolean;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.profiles where referral_code = code) into taken;
    if not taken then
      return code;
    end if;
  end loop;
end;
$$;

-- Assign a referral code on insert if the client did not provide one.
create or replace function public.assign_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null or length(trim(new.referral_code)) = 0 then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists assign_referral_code_trigger on public.profiles;
create trigger assign_referral_code_trigger
before insert on public.profiles
for each row
execute function public.assign_referral_code();

-- Backfill codes for existing profiles.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles
    set referral_code = public.generate_referral_code()
    where id = r.id;
  end loop;
end
$$;

-- Existing users must not retroactively earn rank bonuses: pin the high-water
-- mark to their current tier BEFORE the award trigger exists.
update public.profiles
set highest_rewarded_tier = greatest(coalesce(current_rank_tier, 1), 1)
where highest_rewarded_tier is distinct from greatest(coalesce(current_rank_tier, 1), 1);

-- 4) Per-rank advancement bonus column + seed defaults -----------------------
alter table public.ranks
  add column if not exists advancement_bonus_credits integer not null default 0;

update public.ranks set advancement_bonus_credits = 1000  where tier = 2 and advancement_bonus_credits = 0;
update public.ranks set advancement_bonus_credits = 2500  where tier = 3 and advancement_bonus_credits = 0;
update public.ranks set advancement_bonus_credits = 5000  where tier = 4 and advancement_bonus_credits = 0;
update public.ranks set advancement_bonus_credits = 10000 where tier = 5 and advancement_bonus_credits = 0;
update public.ranks set advancement_bonus_credits = 25000 where tier = 6 and advancement_bonus_credits = 0;
update public.ranks set advancement_bonus_credits = 50000 where tier = 7 and advancement_bonus_credits = 0;

-- 5) Award rank-up bonus automatically when current_rank_tier increases -------
-- Decoupled from recompute_all_profile_ranks (which is defined in several files)
-- so it survives any future redefinition of that function. Fires for every path
-- that bumps a tier: hands/trades increments, contest wins, manual recompute.
create or replace function public.award_rank_up_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(coalesce(new.highest_rewarded_tier, 1), 1);
  v_to   integer := greatest(coalesce(new.current_rank_tier, 1), 1);
  v_bonus numeric(12,2);
  v_prev numeric(12,2);
  v_new numeric(12,2);
begin
  if v_to <= v_from then
    return new;
  end if;

  -- Sum bonuses for every newly-crossed tier (handles multi-tier jumps).
  select coalesce(sum(r.advancement_bonus_credits), 0)::numeric(12,2)
  into v_bonus
  from public.ranks r
  where r.tier > v_from and r.tier <= v_to;

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  if v_bonus > 0 then
    v_prev := coalesce(new.credits, 0);
    v_new := round(v_prev + v_bonus, 2);

    update public.profiles
    set credits = v_new,
        highest_rewarded_tier = v_to
    where id = new.id;

    insert into public.account_events (
      user_id, event_type, amount, previous_balance, new_balance, metadata, created_at
    ) values (
      new.id, 'rank_up_bonus', v_bonus, v_prev, v_new,
      jsonb_build_object('from_tier', v_from, 'to_tier', v_to, 'source', 'award_rank_up_bonus'),
      timezone('utc', now())
    );
  else
    update public.profiles
    set highest_rewarded_tier = v_to
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists award_rank_up_bonus_trigger on public.profiles;
create trigger award_rank_up_bonus_trigger
after update of current_rank_tier on public.profiles
for each row
when (new.current_rank_tier is distinct from old.current_rank_tier)
execute function public.award_rank_up_bonus();

-- 6) Affiliate signup ledger + crediting RPC ---------------------------------
create table if not exists public.affiliate_signups (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,
  affiliate_username text,
  referred_username text,
  amount_credited numeric(12,2) not null default 0,
  referrer_new_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint affiliate_no_self_referral check (affiliate_user_id <> referred_user_id)
);

create index if not exists idx_affiliate_signups_affiliate
  on public.affiliate_signups (affiliate_user_id, created_at desc);

alter table public.affiliate_signups enable row level security;

drop policy if exists "affiliate_signups_select_involved" on public.affiliate_signups;
create policy "affiliate_signups_select_involved"
on public.affiliate_signups
for select
to authenticated
using (
  affiliate_user_id = auth.uid()
  or referred_user_id = auth.uid()
  or public.is_rtn_admin()
);

-- Called by a freshly-provisioned user with the referral code they signed up
-- under. Idempotent (one credit per referred user), no self-referral, awards the
-- referrer 1000 credits and logs both the affiliate_signups row and an
-- account_events row.
create or replace function public.record_affiliate_signup(_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_user uuid := auth.uid();
  v_referrer public.profiles%rowtype;
  v_new_profile public.profiles%rowtype;
  v_award constant numeric(12,2) := 1000;
  v_prev numeric(12,2);
  v_new numeric(12,2);
  v_code text := upper(nullif(trim(coalesce(_referral_code, '')), ''));
begin
  if v_new_user is null then
    raise exception 'Authentication required';
  end if;

  if v_code is null then
    return jsonb_build_object('credited', false, 'reason', 'no_code');
  end if;

  if exists (select 1 from public.affiliate_signups where referred_user_id = v_new_user) then
    return jsonb_build_object('credited', false, 'reason', 'already_recorded');
  end if;

  select * into v_referrer
  from public.profiles
  where upper(referral_code) = v_code
  for update;

  if not found then
    return jsonb_build_object('credited', false, 'reason', 'unknown_code');
  end if;

  if v_referrer.id = v_new_user then
    return jsonb_build_object('credited', false, 'reason', 'self_referral');
  end if;

  select * into v_new_profile from public.profiles where id = v_new_user;

  v_prev := coalesce(v_referrer.credits, 0);
  v_new := round(v_prev + v_award, 2);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles
  set credits = v_new
  where id = v_referrer.id;

  insert into public.affiliate_signups (
    referred_user_id, affiliate_user_id, affiliate_username, referred_username,
    amount_credited, referrer_new_balance
  ) values (
    v_new_user, v_referrer.id, v_referrer.username,
    coalesce(v_new_profile.username, ''), v_award, v_new
  );

  insert into public.account_events (
    user_id, event_type, amount, previous_balance, new_balance, metadata, created_at
  ) values (
    v_referrer.id, 'affiliate_signup', v_award, v_prev, v_new,
    jsonb_build_object('referred_user_id', v_new_user, 'source', 'record_affiliate_signup'),
    timezone('utc', now())
  );

  return jsonb_build_object(
    'credited', true,
    'amount', v_award,
    'affiliate_username', v_referrer.username
  );
end;
$$;

grant execute on function public.record_affiliate_signup(text) to authenticated;
grant execute on function public.generate_referral_code() to authenticated;
