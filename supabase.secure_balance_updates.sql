-- Secure balance mutations for profiles and contest entries.
--
-- This migration closes the client-side balance escalation path by:
-- 1. Enabling RLS on profiles.
-- 2. Blocking direct user edits to financial columns on profiles/contest_entries.
-- 3. Requiring security-definer RPCs for legitimate balance changes.
-- 4. Making contest join atomic so entry fees cannot be bypassed client-side.

create or replace function public.is_rtn_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com', false);
$$;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Admin can manage profiles" on public.profiles;
create policy "Admin can manage profiles"
on public.profiles
for all
to authenticated
using (public.is_rtn_admin())
with check (public.is_rtn_admin());

create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_sensitive_balance_write', true) = '1' then
    return new;
  end if;

  if
    new.credits is distinct from old.credits or
    new.carter_cash is distinct from old.carter_cash or
    new.carter_cash_progress is distinct from old.carter_cash_progress or
    new.hands_played_all_time is distinct from old.hands_played_all_time or
    new.contest_wins is distinct from old.contest_wins or
    new.trades_made_all_time is distinct from old.trades_made_all_time or
    new.current_rank_tier is distinct from old.current_rank_tier or
    new.current_rank_id is distinct from old.current_rank_id
  then
    raise exception 'Direct financial or progression updates are not allowed.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profiles_sensitive_fields on public.profiles;
create trigger guard_profiles_sensitive_fields
before update on public.profiles
for each row
execute function public.guard_profile_sensitive_fields();

drop policy if exists "Users can opt themselves into contests" on public.contest_entries;
drop policy if exists "Users can update their own contest entries" on public.contest_entries;

create or replace function public.guard_contest_entry_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_sensitive_balance_write', true) = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Contest entries must be created through the secure join RPC.';
  end if;

  if
    new.current_credits is distinct from old.current_credits or
    new.current_carter_cash is distinct from old.current_carter_cash or
    new.current_carter_cash_progress is distinct from old.current_carter_cash_progress or
    new.pre_contest_credits is distinct from old.pre_contest_credits or
    new.pre_contest_carter_cash is distinct from old.pre_contest_carter_cash or
    new.pre_contest_carter_cash_progress is distinct from old.pre_contest_carter_cash_progress or
    new.starting_credits is distinct from old.starting_credits or
    new.starting_carter_cash is distinct from old.starting_carter_cash or
    new.contest_history is distinct from old.contest_history
  then
    raise exception 'Direct contest balance updates are not allowed.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_contest_entries_sensitive_update on public.contest_entries;
create trigger guard_contest_entries_sensitive_update
before update on public.contest_entries
for each row
execute function public.guard_contest_entry_sensitive_fields();

drop trigger if exists guard_contest_entries_sensitive_insert on public.contest_entries;
create trigger guard_contest_entries_sensitive_insert
before insert on public.contest_entries
for each row
execute function public.guard_contest_entry_sensitive_fields();

create or replace function public.save_player_balance_snapshot(
  _credits numeric,
  _playthrough_delta numeric default 0,
  _carter_cash_adjustment integer default 0,
  _expected_updated_at timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_playthrough integer := greatest(coalesce(round(_playthrough_delta), 0), 0);
  v_adjustment integer := coalesce(_carter_cash_adjustment, 0);
  v_total_progress integer;
  v_earned integer;
  v_target_credits numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_adjustment > 0 and not public.is_rtn_admin() then
    raise exception 'Positive Carter Cash adjustments must be awarded server-side.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if _expected_updated_at is not null and v_profile.updated_at is distinct from _expected_updated_at then
    raise exception 'Your account changed in another tab. Refresh and try again.';
  end if;

  v_target_credits := round(greatest(coalesce(_credits, v_profile.credits, 0), 0)::numeric, 2);
  if abs(v_target_credits - coalesce(v_profile.credits, 0)) > 100000 and not public.is_rtn_admin() then
    raise exception 'Balance change is too large to accept from the client.';
  end if;

  v_total_progress := greatest(0, coalesce(v_profile.carter_cash_progress, 0)::integer + v_playthrough);
  v_earned := floor(v_total_progress / 1000.0);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles
  set
    credits = v_target_credits,
    carter_cash = greatest(0, coalesce(v_profile.carter_cash, 0) + v_earned + v_adjustment),
    carter_cash_progress = v_total_progress - (v_earned * 1000)
  where id = auth.uid()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.save_contest_entry_snapshot(
  _contest_id uuid,
  _current_credits numeric,
  _playthrough_delta numeric default 0,
  _carter_cash_adjustment integer default 0,
  _contest_history jsonb default null,
  _display_name text default null,
  _participant_email text default null
)
returns public.contest_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.contest_entries%rowtype;
  v_playthrough integer := greatest(coalesce(round(_playthrough_delta), 0), 0);
  v_adjustment integer := coalesce(_carter_cash_adjustment, 0);
  v_total_progress integer;
  v_earned integer;
  v_target_credits numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _contest_id is null then
    raise exception 'Contest id is required';
  end if;

  if v_adjustment > 0 and not public.is_rtn_admin() then
    raise exception 'Positive Carter Cash adjustments must be awarded server-side.';
  end if;

  select *
  into v_entry
  from public.contest_entries
  where contest_id = _contest_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Contest entry not found';
  end if;

  v_target_credits := round(greatest(coalesce(_current_credits, v_entry.current_credits, 0), 0)::numeric, 2);
  if abs(v_target_credits - coalesce(v_entry.current_credits, 0)) > 100000 and not public.is_rtn_admin() then
    raise exception 'Contest balance change is too large to accept from the client.';
  end if;

  v_total_progress := greatest(0, coalesce(v_entry.current_carter_cash_progress, 0)::integer + v_playthrough);
  v_earned := floor(v_total_progress / 1000.0);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.contest_entries
  set
    current_credits = v_target_credits,
    current_carter_cash = greatest(0, coalesce(v_entry.current_carter_cash, 0) + v_earned + v_adjustment),
    current_carter_cash_progress = v_total_progress - (v_earned * 1000),
    contest_history = coalesce(_contest_history, v_entry.contest_history),
    display_name = coalesce(_display_name, v_entry.display_name),
    participant_email = coalesce(_participant_email, v_entry.participant_email)
  where contest_id = _contest_id
    and user_id = auth.uid()
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.join_contest_secure(
  _contest_id uuid
)
returns public.contest_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_contest public.contests%rowtype;
  v_entry public.contest_entries%rowtype;
  v_rank_tier integer;
  v_participants integer;
  v_pre_contest_credits numeric;
  v_pre_contest_carter_cash integer;
  v_pre_contest_carter_cash_progress numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _contest_id is null then
    raise exception 'Contest id is required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  select *
  into v_contest
  from public.contests
  where id = _contest_id;

  if not found then
    raise exception 'Contest not found';
  end if;

  if exists (
    select 1
    from public.contest_entries
    where contest_id = _contest_id
      and user_id = auth.uid()
  ) then
    raise exception 'You are already entered in this contest.';
  end if;

  select count(*)::integer
  into v_participants
  from public.contest_entries
  where contest_id = _contest_id;

  if v_participants >= greatest(coalesce(v_contest.contestant_limit, 100), 1) then
    raise exception 'This contest is already full.';
  end if;

  v_rank_tier := greatest(coalesce(v_profile.current_rank_tier, 1), 1);
  if v_rank_tier < greatest(coalesce(v_contest.required_rank_tier, 1), 1) then
    raise exception 'You do not meet the required rank for this contest.';
  end if;

  if coalesce(v_profile.carter_cash, 0) < greatest(coalesce(v_contest.entry_fee_carter_cash, 0), 0) then
    raise exception 'Not enough Carter Cash to join this contest.';
  end if;

  v_pre_contest_credits := round(greatest(coalesce(v_profile.credits, 0), 0)::numeric, 2);
  v_pre_contest_carter_cash := greatest(coalesce(v_profile.carter_cash, 0), 0);
  v_pre_contest_carter_cash_progress := greatest(coalesce(v_profile.carter_cash_progress, 0), 0);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles
  set carter_cash = greatest(
    0,
    coalesce(v_profile.carter_cash, 0) - greatest(coalesce(v_contest.entry_fee_carter_cash, 0), 0)
  )
  where id = auth.uid()
  returning * into v_profile;

  insert into public.contest_entries (
    contest_id,
    user_id,
    pre_contest_credits,
    pre_contest_carter_cash,
    pre_contest_carter_cash_progress,
    starting_credits,
    starting_carter_cash,
    current_credits,
    current_carter_cash,
    current_carter_cash_progress,
    contest_history,
    display_name,
    participant_email
  )
  values (
    _contest_id,
    auth.uid(),
    v_pre_contest_credits,
    v_pre_contest_carter_cash,
    v_pre_contest_carter_cash_progress,
    round(greatest(coalesce(v_contest.starting_credits, 0), 0)::numeric, 2),
    greatest(coalesce(v_contest.starting_carter_cash, 0), 0),
    round(greatest(coalesce(v_contest.starting_credits, 0), 0)::numeric, 2),
    greatest(coalesce(v_contest.starting_carter_cash, 0), 0),
    0,
    jsonb_build_array(
      jsonb_build_object(
        'label', 'Start',
        'credits', round(greatest(coalesce(v_contest.starting_credits, 0), 0)::numeric, 2),
        'timestamp', coalesce(v_contest.starts_at, timezone('utc', now()))
      )
    ),
    coalesce(nullif(trim(coalesce(v_profile.username, '')), ''), 'Player'),
    coalesce((auth.jwt() ->> 'email'), '')
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.save_player_balance_snapshot(numeric, numeric, integer, timestamptz) to authenticated;
grant execute on function public.save_contest_entry_snapshot(uuid, numeric, numeric, integer, jsonb, text, text) to authenticated;
grant execute on function public.join_contest_secure(uuid) to authenticated;
