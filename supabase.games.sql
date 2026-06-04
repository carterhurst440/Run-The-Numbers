create table if not exists public.games (
  id text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.games (id, name, status)
values
  ('game_001', 'Run the Numbers', 'active'),
  ('game_002', 'Guess 10', 'beta'),
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());

alter table public.contests
  add column if not exists allowed_game_ids text[] not null default array['game_001', 'game_002']::text[];

update public.contests
set allowed_game_ids = array['game_001', 'game_002']::text[]
where allowed_game_ids is null or cardinality(allowed_game_ids) = 0;

create or replace function public.validate_allowed_game_ids(ids text[])
returns boolean
language sql
stable
as $$
  select coalesce(
    array_length(ids, 1) > 0
    and not exists (
      select 1
      from unnest(ids) as candidate
      left join public.games g on g.id = candidate
      where g.id is null
    ),
    false
  );
$$;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

alter table public.contests drop constraint if exists contests_allowed_game_ids_check;
alter table public.contests
  add constraint contests_allowed_game_ids_check
  check (public.validate_allowed_game_ids(allowed_game_ids));

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at_timestamp();

alter table public.games enable row level security;

drop policy if exists "Authenticated users can view games" on public.games;
drop policy if exists "Public users can view games" on public.games;
create policy "Public users can view games"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "Admin can manage games" on public.games;
create policy "Admin can manage games"
on public.games
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
