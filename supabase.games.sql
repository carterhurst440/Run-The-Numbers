create table if not exists public.games (
  id text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.games (id, name, status)
values
  ('run-the-numbers', 'Run the Numbers', 'active'),
  ('guess-10', 'Guess 10', 'beta')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());

alter table public.game_hands
  add column if not exists game_id text not null default 'run-the-numbers';

update public.game_hands
set game_id = 'run-the-numbers'
where coalesce(game_id, '') = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_hands_game_id_fkey'
  ) then
    alter table public.game_hands
      add constraint game_hands_game_id_fkey
      foreign key (game_id) references public.games(id);
  end if;
end
$$;

create index if not exists idx_game_hands_game_id_created_at
  on public.game_hands (game_id, created_at desc);

create index if not exists idx_game_hands_user_id_game_id_created_at
  on public.game_hands (user_id, game_id, created_at desc);

alter table public.contests
  add column if not exists allowed_game_ids text[] not null default array['run-the-numbers', 'guess-10']::text[];

update public.contests
set allowed_game_ids = array['run-the-numbers', 'guess-10']::text[]
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
