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
