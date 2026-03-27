create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starting_credits integer not null default 1000,
  starting_carter_cash integer not null default 0,
  qualification_carter_cash integer not null default 0,
  winning_criteria text not null check (winning_criteria in ('highest_bankroll', 'highest_carter_cash', 'highest_combined')),
  reward text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.contests add column if not exists qualification_carter_cash integer not null default 0;
update public.contests set winning_criteria = 'highest_bankroll' where winning_criteria <> 'highest_bankroll';

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
  display_name text,
  participant_email text,
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

alter table public.contest_entries add column if not exists pre_contest_credits integer not null default 1000;
alter table public.contest_entries add column if not exists pre_contest_carter_cash integer not null default 0;
alter table public.contest_entries add column if not exists pre_contest_carter_cash_progress numeric not null default 0;
alter table public.contest_entries add column if not exists current_credits integer not null default 1000;
alter table public.contest_entries add column if not exists current_carter_cash integer not null default 0;
alter table public.contest_entries add column if not exists display_name text;
alter table public.contest_entries add column if not exists participant_email text;
alter table public.contest_entries add column if not exists restored_at timestamptz;
alter table public.contest_medals add column if not exists contest_title text;
alter table public.contest_medals add column if not exists awarded_at timestamptz not null default timezone('utc', now());

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_medals enable row level security;

drop policy if exists "Authenticated users can view contests" on public.contests;
create policy "Authenticated users can view contests"
on public.contests
for select
to authenticated
using (true);

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

grant select, insert, update, delete on public.contests to authenticated;
grant select, insert, update, delete on public.contest_entries to authenticated;
grant select, insert, update, delete on public.contest_medals to authenticated;
