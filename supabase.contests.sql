create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contest_details text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starting_credits integer not null default 1000,
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
alter table public.contests drop constraint if exists contests_prize_mode_check;
alter table public.contests add constraint contests_prize_mode_check check (prize_mode in ('static', 'variable'));
alter table public.contests drop constraint if exists contests_prize_variable_basis_check;
alter table public.contests add constraint contests_prize_variable_basis_check check (prize_variable_basis in ('none', 'contestant', 'qualifying_contestant'));
update public.contests set winning_criteria = 'highest_bankroll' where winning_criteria <> 'highest_bankroll';

alter table public.profiles add column if not exists receive_contest_start_emails boolean not null default true;

create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  opted_in_at timestamptz not null default timezone('utc', now()),
  pre_contest_credits integer not null default 1000,
  pre_contest_carter_cash integer not null default 0,
  pre_contest_carter_cash_progress numeric not null default 0,
  starting_credits integer not null default 1000,
  starting_carter_cash integer not null default 0,
  current_credits integer not null default 1000,
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

alter table public.contest_entries add column if not exists pre_contest_credits integer not null default 1000;
alter table public.contest_entries add column if not exists pre_contest_carter_cash integer not null default 0;
alter table public.contest_entries add column if not exists pre_contest_carter_cash_progress numeric not null default 0;
alter table public.contest_entries add column if not exists current_credits integer not null default 1000;
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

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_medals enable row level security;
alter table public.contest_start_notifications enable row level security;

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
    where c.starts_at <= timezone('utc', now())
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

grant select, insert, update, delete on public.contests to authenticated;
grant select, insert, update, delete on public.contest_entries to authenticated;
grant select, insert, update, delete on public.contest_medals to authenticated;
grant select, insert, update, delete on public.contest_start_notifications to authenticated;
grant execute on function public.seed_live_contest_notifications() to authenticated;
