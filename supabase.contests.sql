create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contest_details text,
  starts_at timestamptz,
  ends_at timestamptz,
  start_mode text not null default 'scheduled' check (start_mode in ('scheduled', 'threshold')),
  status text not null default 'upcoming' check (status in ('pending', 'upcoming', 'live', 'ended')),
  contestant_starting_requirement integer,
  contest_length_hours integer,
  starting_credits numeric(12,2) not null default 1000.00,
  starting_carter_cash integer not null default 0,
  entry_fee_carter_cash integer not null default 0,
  contestant_limit integer not null default 100,
  required_rank_tier integer not null default 1,
  qualification_carter_cash integer not null default 0,
  winning_criteria text not null check (winning_criteria in ('highest_bankroll', 'highest_carter_cash', 'highest_combined')),
  reward text not null default '',
  prize_mode text not null default 'static' check (prize_mode in ('static', 'variable')),
  prize_static_amount numeric(12,2) not null default 0,
  prize_variable_basis text not null default 'none' check (prize_variable_basis in ('none', 'contestant', 'qualifying_contestant')),
  prize_variable_unit_amount numeric(12,2) not null default 0,
  prize_allocations jsonb not null default '[{"place":1,"percentage":100}]'::jsonb,
  send_start_email_notification boolean not null default false,
  is_test boolean not null default false,
  start_notifications_seeded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.contests add column if not exists contest_details text;
alter table public.contests alter column starts_at drop not null;
alter table public.contests alter column ends_at drop not null;
alter table public.contests add column if not exists start_mode text not null default 'scheduled';
alter table public.contests add column if not exists status text not null default 'upcoming';
alter table public.contests add column if not exists contestant_starting_requirement integer;
alter table public.contests add column if not exists contest_length_hours integer;
alter table public.contests add column if not exists qualification_carter_cash integer not null default 0;
alter table public.contests add column if not exists contestant_limit integer not null default 100;
alter table public.contests add column if not exists entry_fee_carter_cash integer not null default 0;
alter table public.contests add column if not exists required_rank_tier integer not null default 1;
alter table public.contests alter column reward set default '';
alter table public.contests add column if not exists prize_mode text not null default 'static';
alter table public.contests add column if not exists prize_static_amount numeric(12,2) not null default 0;
alter table public.contests add column if not exists prize_variable_basis text not null default 'none';
alter table public.contests add column if not exists prize_variable_unit_amount numeric(12,2) not null default 0;
alter table public.contests add column if not exists prize_allocations jsonb not null default '[{"place":1,"percentage":100}]'::jsonb;
alter table public.contests add column if not exists send_start_email_notification boolean not null default false;
alter table public.contests add column if not exists is_test boolean not null default false;
alter table public.contests add column if not exists start_notifications_seeded_at timestamptz;
alter table public.contests drop constraint if exists contests_start_mode_check;
alter table public.contests add constraint contests_start_mode_check check (start_mode in ('scheduled', 'threshold'));
alter table public.contests drop constraint if exists contests_status_check;
alter table public.contests add constraint contests_status_check check (status in ('pending', 'upcoming', 'live', 'ended'));
alter table public.contests drop constraint if exists contests_prize_mode_check;
alter table public.contests add constraint contests_prize_mode_check check (prize_mode in ('static', 'variable'));
alter table public.contests drop constraint if exists contests_prize_variable_basis_check;
alter table public.contests add constraint contests_prize_variable_basis_check check (prize_variable_basis in ('none', 'contestant', 'qualifying_contestant'));
update public.contests set winning_criteria = 'highest_bankroll' where winning_criteria <> 'highest_bankroll';
update public.contests
set status = case
  when status = 'pending' then 'pending'
  when ends_at is not null and ends_at <= timezone('utc', now()) then 'ended'
  when starts_at is not null and starts_at <= timezone('utc', now()) and ends_at is not null and ends_at > timezone('utc', now()) then 'live'
  else 'upcoming'
end
where coalesce(status, '') <> 'pending';

alter table public.profiles add column if not exists receive_contest_start_emails boolean not null default true;

create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  opted_in_at timestamptz not null default timezone('utc', now()),
  pre_contest_credits numeric(12,2) not null default 1000.00,
  pre_contest_carter_cash integer not null default 0,
  pre_contest_carter_cash_progress numeric not null default 0,
  starting_credits numeric(12,2) not null default 1000.00,
  starting_carter_cash integer not null default 0,
  current_credits numeric(12,2) not null default 1000.00,
  current_carter_cash integer not null default 0,
  current_carter_cash_progress numeric not null default 0,
  contest_history jsonb not null default '[]'::jsonb,
  display_name text,
  participant_email text,
  results_seen_at timestamptz,
  restored_at timestamptz,
  primary key (contest_id, user_id)
);

create table if not exists public.contest_medals (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contest_title text not null,
  awarded_at timestamptz not null default timezone('utc', now()),
  unique (contest_id, user_id)
);

create table if not exists public.contest_start_notifications (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  seen_at timestamptz,
  email_requested boolean not null default false,
  email_sent_at timestamptz,
  primary key (contest_id, user_id)
);

create table if not exists public.contest_publish_notifications (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  email_requested boolean not null default false,
  email_sent_at timestamptz,
  primary key (contest_id, user_id)
);

alter table public.contest_entries add column if not exists pre_contest_credits numeric(12,2) not null default 1000.00;
alter table public.contest_entries add column if not exists pre_contest_carter_cash integer not null default 0;
alter table public.contest_entries add column if not exists pre_contest_carter_cash_progress numeric not null default 0;
alter table public.contest_entries add column if not exists current_credits numeric(12,2) not null default 1000.00;
alter table public.contest_entries add column if not exists current_carter_cash integer not null default 0;
alter table public.contest_entries add column if not exists current_carter_cash_progress numeric not null default 0;
alter table public.contest_entries add column if not exists contest_history jsonb not null default '[]'::jsonb;
alter table public.contest_entries add column if not exists display_name text;
alter table public.contest_entries add column if not exists participant_email text;
alter table public.contest_entries add column if not exists results_seen_at timestamptz;
alter table public.contest_entries add column if not exists restored_at timestamptz;
alter table public.contest_medals add column if not exists contest_title text;
alter table public.contest_medals add column if not exists awarded_at timestamptz not null default timezone('utc', now());
alter table public.contest_start_notifications add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.contest_start_notifications add column if not exists seen_at timestamptz;
alter table public.contest_start_notifications add column if not exists email_requested boolean not null default false;
alter table public.contest_start_notifications add column if not exists email_sent_at timestamptz;
alter table public.contest_publish_notifications add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.contest_publish_notifications add column if not exists email_requested boolean not null default false;
alter table public.contest_publish_notifications add column if not exists email_sent_at timestamptz;

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_medals enable row level security;
alter table public.contest_start_notifications enable row level security;
alter table public.contest_publish_notifications enable row level security;

drop policy if exists "Authenticated users can view contests" on public.contests;
create policy "Authenticated users can view contests"
on public.contests
for select
to authenticated
using (coalesce(is_test, false) = false or (auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Admin can manage contests" on public.contests;
create policy "Admin can manage contests"
on public.contests
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Authenticated users can view contest entries" on public.contest_entries;
create policy "Authenticated users can view contest entries"
on public.contest_entries
for select
to authenticated
using (true);

drop policy if exists "Users can opt themselves into contests" on public.contest_entries;
create policy "Users can opt themselves into contests"
on public.contest_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own contest entries" on public.contest_entries;
create policy "Users can update their own contest entries"
on public.contest_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admin can manage contest entries" on public.contest_entries;
create policy "Admin can manage contest entries"
on public.contest_entries
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Users can view their contest medals" on public.contest_medals;
create policy "Users can view their contest medals"
on public.contest_medals
for select
to authenticated
using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Admin can manage contest medals" on public.contest_medals;
create policy "Admin can manage contest medals"
on public.contest_medals
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Users can view their contest start notifications" on public.contest_start_notifications;
create policy "Users can view their contest start notifications"
on public.contest_start_notifications
for select
to authenticated
using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Users can update their contest start notifications" on public.contest_start_notifications;
create policy "Users can update their contest start notifications"
on public.contest_start_notifications
for update
to authenticated
using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Admin can manage contest start notifications" on public.contest_start_notifications;
create policy "Admin can manage contest start notifications"
on public.contest_start_notifications
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

drop policy if exists "Admin can manage contest publish notifications" on public.contest_publish_notifications;
create policy "Admin can manage contest publish notifications"
on public.contest_publish_notifications
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

create or replace function public.seed_live_contest_notifications()
returns table(contest_id uuid, title text, inserted_notifications integer, email_requested integer)
language plpgsql
security definer
as $$
begin
  return query
  with live_contests as (
    select c.id, c.title, c.send_start_email_notification, c.is_test
    from public.contests c
    where coalesce(c.status, 'upcoming') <> 'pending'
      and c.starts_at <= timezone('utc', now())
      and c.ends_at > timezone('utc', now())
  ),
  inserted as (
    insert into public.contest_start_notifications (contest_id, user_id, email_requested)
    select
      c.id,
      p.id,
      (c.send_start_email_notification and coalesce(p.receive_contest_start_emails, true))
    from live_contests c
    join public.profiles p on true
    left join public.contest_start_notifications n
      on n.contest_id = c.id
     and n.user_id = p.id
    where n.contest_id is null
      and (
        c.is_test = false
        or p.id in (
          select id from public.profiles where lower(username) = 'carterwarrenhurst' or id in (
            select id from auth.users where email = 'carterwarrenhurst@gmail.com'
          )
        )
      )
    returning public.contest_start_notifications.contest_id, public.contest_start_notifications.email_requested
  ),
  updated as (
    update public.contests c
    set start_notifications_seeded_at = coalesce(c.start_notifications_seeded_at, timezone('utc', now()))
    where c.id in (select id from live_contests)
    returning c.id, c.title
  )
  select
    u.id,
    u.title,
    count(i.contest_id)::integer as inserted_notifications,
    coalesce(sum(case when i.email_requested then 1 else 0 end), 0)::integer as email_requested
  from updated u
  left join inserted i on i.contest_id = u.id
  group by u.id, u.title
  having count(i.contest_id) > 0;
end;
$$;

drop function if exists public.get_contest_start_email_recipients(uuid);
drop function if exists public.get_contest_publish_email_recipients(uuid);
drop function if exists public.maybe_activate_pending_contest(uuid);
drop function if exists public.seed_contest_publish_notifications(uuid);

create function public.get_contest_start_email_recipients(_contest_id uuid)
returns table(
  user_id uuid,
  email text,
  first_name text,
  contest_title text,
  contest_details text,
  starts_at timestamptz,
  ends_at timestamptz,
  prize_mode text,
  prize_static_amount numeric,
  prize_variable_basis text,
  prize_variable_unit_amount numeric
)
language sql
security definer
as $$
  select
    n.user_id,
    u.email::text,
    p.first_name,
    c.title,
    c.contest_details,
    c.starts_at,
    c.ends_at,
    c.prize_mode,
    c.prize_static_amount,
    c.prize_variable_basis,
    c.prize_variable_unit_amount
  from public.contest_start_notifications n
  join public.contests c on c.id = n.contest_id
  join public.profiles p on p.id = n.user_id
  join auth.users u on u.id = n.user_id
  where n.contest_id = _contest_id
    and (
      c.is_test = false
      or u.email = 'carterwarrenhurst@gmail.com'
    )
    and n.email_requested = true
    and n.email_sent_at is null
    and coalesce(u.email, '') <> '';
$$;

create function public.seed_contest_publish_notifications(_contest_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  inserted_count integer := 0;
begin
  with inserted as (
    insert into public.contest_publish_notifications (contest_id, user_id, email_requested)
    select
      c.id,
      p.id,
      true
    from public.contests c
    join public.profiles p
      on c.send_start_email_notification
     and coalesce(p.receive_contest_start_emails, true)
    join auth.users u on u.id = p.id
    left join public.contest_publish_notifications n
      on n.contest_id = c.id
     and n.user_id = p.id
    where c.id = _contest_id
      and c.start_mode = 'threshold'
      and (
        c.is_test = false
        or u.email = 'carterwarrenhurst@gmail.com'
      )
      and coalesce(u.email, '') <> ''
      and n.contest_id is null
    returning 1
  )
  select count(*)
  into inserted_count
  from inserted;

  return inserted_count;
end;
$$;

create function public.get_contest_publish_email_recipients(_contest_id uuid)
returns table(
  user_id uuid,
  email text,
  first_name text,
  contest_title text,
  contest_details text,
  starts_at timestamptz,
  contestant_starting_requirement integer,
  contest_length_hours integer
)
language sql
security definer
as $$
  select
    n.user_id,
    u.email::text,
    p.first_name,
    c.title,
    c.contest_details,
    c.starts_at,
    c.contestant_starting_requirement,
    c.contest_length_hours
  from public.contest_publish_notifications n
  join public.contests c on c.id = n.contest_id
  join public.profiles p on p.id = n.user_id
  join auth.users u on u.id = n.user_id
  where n.contest_id = _contest_id
    and c.start_mode = 'threshold'
    and (
      c.is_test = false
      or u.email = 'carterwarrenhurst@gmail.com'
    )
    and n.email_requested = true
    and n.email_sent_at is null
    and coalesce(u.email, '') <> '';
$$;

create function public.maybe_activate_pending_contest(_contest_id uuid)
returns table(
  contest_id uuid,
  activated boolean,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
security definer
as $$
declare
  contest_record public.contests%rowtype;
  participant_total integer;
  activated_contest public.contests%rowtype;
begin
  select *
  into contest_record
  from public.contests
  where id = _contest_id;

  if not found then
    return;
  end if;

  select count(*)
  into participant_total
  from public.contest_entries
  where public.contest_entries.contest_id = _contest_id;

  if contest_record.start_mode = 'threshold'
    and contest_record.status = 'pending'
    and participant_total >= greatest(coalesce(contest_record.contestant_starting_requirement, 1), 1) then
    update public.contests c
    set
      status = 'live',
      starts_at = timezone('utc', now()),
      ends_at = timezone('utc', now()) + make_interval(hours => greatest(coalesce(c.contest_length_hours, 1), 1)),
      updated_at = timezone('utc', now())
    where c.id = _contest_id
      and c.status = 'pending'
    returning *
    into activated_contest;

    if found then
      return query
      select activated_contest.id, true, activated_contest.starts_at, activated_contest.ends_at;
      return;
    end if;
  end if;

  return query
  select contest_record.id, false, contest_record.starts_at, contest_record.ends_at;
end;
$$;

grant select, insert, update, delete on public.contests to authenticated;
grant select, insert, update, delete on public.contest_entries to authenticated;
grant select, insert, update, delete on public.contest_medals to authenticated;
grant select, insert, update, delete on public.contest_start_notifications to authenticated;
grant select, insert, update, delete on public.contest_publish_notifications to authenticated;
grant execute on function public.seed_live_contest_notifications() to authenticated;
grant execute on function public.seed_contest_publish_notifications(uuid) to authenticated;
grant execute on function public.maybe_activate_pending_contest(uuid) to authenticated;
