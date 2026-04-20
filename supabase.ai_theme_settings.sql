create table if not exists public.ai_theme_settings (
  key text primary key,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ai_theme_settings
  add column if not exists key text;

alter table public.ai_theme_settings
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.ai_theme_settings
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.ai_theme_settings
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop trigger if exists set_ai_theme_settings_updated_at on public.ai_theme_settings;
create trigger set_ai_theme_settings_updated_at
before update on public.ai_theme_settings
for each row
execute function public.set_updated_at_timestamp();

alter table public.ai_theme_settings enable row level security;

drop policy if exists "Authenticated users can view ai theme settings" on public.ai_theme_settings;
create policy "Authenticated users can view ai theme settings"
on public.ai_theme_settings
for select
to authenticated
using (true);

drop policy if exists "Admin can manage ai theme settings" on public.ai_theme_settings;
create policy "Admin can manage ai theme settings"
on public.ai_theme_settings
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

insert into public.ai_theme_settings (key, settings)
values ('global', '{}'::jsonb)
on conflict (key) do nothing;
