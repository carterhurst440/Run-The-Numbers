create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  base_theme text not null default 'blue',
  palette jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_builtin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.themes
  add column if not exists key text;

alter table public.themes
  add column if not exists name text;

alter table public.themes
  add column if not exists base_theme text not null default 'blue';

alter table public.themes
  add column if not exists palette jsonb not null default '{}'::jsonb;

alter table public.themes
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.themes
  add column if not exists is_builtin boolean not null default false;

alter table public.themes
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.themes
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists idx_themes_key_unique
  on public.themes (key);

drop trigger if exists set_themes_updated_at on public.themes;
create trigger set_themes_updated_at
before update on public.themes
for each row
execute function public.set_updated_at_timestamp();

alter table public.themes enable row level security;

drop policy if exists "Authenticated users can view themes" on public.themes;
create policy "Authenticated users can view themes"
on public.themes
for select
to authenticated
using (true);

drop policy if exists "Admin can manage themes" on public.themes;
create policy "Admin can manage themes"
on public.themes
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

insert into public.themes (key, name, base_theme, palette, settings, is_builtin)
values
  ('blue', 'Blue', 'blue', '{}'::jsonb, '{}'::jsonb, true),
  ('pink', 'Pink', 'pink', '{}'::jsonb, '{}'::jsonb, true),
  ('orange', 'Orange', 'orange', '{}'::jsonb, '{}'::jsonb, true),
  ('steel-black', 'Steel Black', 'steel-black', '{}'::jsonb, '{}'::jsonb, true),
  ('angelic', 'Angelic', 'angelic', '{}'::jsonb, '{}'::jsonb, true),
  ('retro', 'Retro', 'retro', '{}'::jsonb, '{}'::jsonb, true),
  ('cotton-candy', 'Cotton Candy', 'cotton-candy', '{}'::jsonb, '{}'::jsonb, true),
  ('pastel', 'Pastel', 'pastel', '{}'::jsonb, '{}'::jsonb, true)
on conflict (key) do update
set
  name = excluded.name,
  base_theme = excluded.base_theme,
  is_builtin = true;
