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
  ('blue', 'Blue', 'blue', '{"accent":"#63f0ff","accentSecondary":"#f857c1","accentTertiary":"#8b80ff","heroButton":"#4f9bff","primaryButton":"#4f9bff","primaryButtonDisabled":"#7f9dc7","secondaryButton":"#2b6fd6","secondaryButtonDisabled":"#647da3","progressStart":"#63f0ff","progressEnd":"#8b80ff","gold":"#ffd166","muted":"#bfd5ff","success":"#5af78e","danger":"#ff5c8a","bgStart":"#08142d","bgEnd":"#050913","panelStart":"#0e2c63","panelEnd":"#08142d","headerStart":"#15386d","headerEnd":"#0b1b3d"}'::jsonb, '{"glowStrength":52,"surfaceContrast":60,"radiusScale":72,"flatSurfaces":false}'::jsonb, false),
  ('pink', 'Pink', 'pink', '{"accent":"#ff9bf3","accentSecondary":"#ff4fd2","accentTertiary":"#b78bff","heroButton":"#ffc3e5","primaryButton":"#ff79d2","primaryButtonDisabled":"#c68cb8","secondaryButton":"#8b3fa5","secondaryButtonDisabled":"#7e5b86","progressStart":"#ff9bf3","progressEnd":"#b78bff","gold":"#ffeac0","muted":"#f7bff0","success":"#a4ffe8","danger":"#ff6a9c","bgStart":"#25021c","bgEnd":"#1b0228","panelStart":"#501260","panelEnd":"#20062e","headerStart":"#5a1060","headerEnd":"#340c4a"}'::jsonb, '{"glowStrength":68,"surfaceContrast":62,"radiusScale":74,"flatSurfaces":false}'::jsonb, false),
  ('orange', 'Orange', 'orange', '{"accent":"#ffe58a","accentSecondary":"#ff8f3a","accentTertiary":"#ffb45c","heroButton":"#ffd197","primaryButton":"#ff9b47","primaryButtonDisabled":"#c79a6b","secondaryButton":"#8d4a20","secondaryButtonDisabled":"#7d6759","progressStart":"#ffe58a","progressEnd":"#ffb45c","gold":"#ffd372","muted":"#ffd8a6","success":"#9ff7d6","danger":"#ff6b5c","bgStart":"#261002","bgEnd":"#1d0800","panelStart":"#5b2400","panelEnd":"#241003","headerStart":"#682600","headerEnd":"#421400"}'::jsonb, '{"glowStrength":60,"surfaceContrast":64,"radiusScale":68,"flatSurfaces":false}'::jsonb, false),
  ('steel-black', 'Steel Black', 'steel-black', '{"accent":"#b7d0df","accentSecondary":"#d7dee5","accentTertiary":"#8f9cab","heroButton":"#d8dee5","primaryButton":"#607285","primaryButtonDisabled":"#7b8895","secondaryButton":"#39424d","secondaryButtonDisabled":"#5e6974","progressStart":"#b7d0df","progressEnd":"#8f9cab","gold":"#f1f5f9","muted":"#c9d2dc","success":"#d5dde3","danger":"#c46f7c","bgStart":"#0d1016","bgEnd":"#090b0f","panelStart":"#21272f","panelEnd":"#080a0d","headerStart":"#222831","headerEnd":"#0e1116"}'::jsonb, '{"glowStrength":18,"surfaceContrast":78,"radiusScale":58,"flatSurfaces":false}'::jsonb, false),
  ('angelic', 'Angelic', 'angelic', '{"accent":"#c8efff","accentSecondary":"#ffd7ee","accentTertiary":"#c7d6ff","heroButton":"#ffe5f3","primaryButton":"#9ec8ff","primaryButtonDisabled":"#b4c0d6","secondaryButton":"#6787bb","secondaryButtonDisabled":"#7f8faa","progressStart":"#c8efff","progressEnd":"#c7d6ff","gold":"#fff2cc","muted":"#e8f4ff","success":"#f2fbff","danger":"#ff8eb2","bgStart":"#152542","bgEnd":"#1a2745","panelStart":"#5878b0","panelEnd":"#1a2440","headerStart":"#405d8d","headerEnd":"#1b2d4e"}'::jsonb, '{"glowStrength":34,"surfaceContrast":54,"radiusScale":76,"flatSurfaces":false}'::jsonb, false),
  ('retro', 'Retro', 'retro', '{"accent":"#8ff2ff","accentSecondary":"#ff7a59","accentTertiary":"#ffd166","heroButton":"#ffc79c","primaryButton":"#ff946a","primaryButtonDisabled":"#bb8d72","secondaryButton":"#68407b","secondaryButtonDisabled":"#7f6b80","progressStart":"#8ff2ff","progressEnd":"#ffd166","gold":"#ffd166","muted":"#f4cf95","success":"#9ff7d6","danger":"#ff8b72","bgStart":"#1f1028","bgEnd":"#1a1326","panelStart":"#2f1c49","panelEnd":"#1b1030","headerStart":"#362354","headerEnd":"#22143a"}'::jsonb, '{"glowStrength":46,"surfaceContrast":56,"radiusScale":66,"flatSurfaces":false}'::jsonb, false),
  ('cotton-candy', 'Cotton Candy', 'cotton-candy', '{"accent":"#6ff4ff","accentSecondary":"#ff7fd8","accentTertiary":"#a8a6ff","heroButton":"#ffc7e9","primaryButton":"#7dbdff","primaryButtonDisabled":"#a18db8","secondaryButton":"#4f56b8","secondaryButtonDisabled":"#756c98","progressStart":"#6ff4ff","progressEnd":"#a8a6ff","gold":"#ffe88f","muted":"#f8d7ff","success":"#adffe9","danger":"#ff88d9","bgStart":"#180926","bgEnd":"#14081c","panelStart":"#241248","panelEnd":"#160a2c","headerStart":"#221e60","headerEnd":"#1a0e3e"}'::jsonb, '{"glowStrength":58,"surfaceContrast":52,"radiusScale":80,"flatSurfaces":false}'::jsonb, false),
  ('pastel', 'Pastel', 'pastel', '{"accent":"#9be7ff","accentSecondary":"#ffc1dc","accentTertiary":"#d6c4ff","heroButton":"#ffe0eb","primaryButton":"#7db6ff","primaryButtonDisabled":"#b5bbcf","secondaryButton":"#566f9c","secondaryButtonDisabled":"#8a92a8","progressStart":"#9be7ff","progressEnd":"#d6c4ff","gold":"#ffe1a8","muted":"#e8defc","success":"#c3ffe8","danger":"#ff9dbd","bgStart":"#142036","bgEnd":"#111b2b","panelStart":"#1b2a4a","panelEnd":"#111c30","headerStart":"#273a62","headerEnd":"#14223f"}'::jsonb, '{"glowStrength":30,"surfaceContrast":50,"radiusScale":82,"flatSurfaces":false}'::jsonb, false)
on conflict (key) do update
set
  name = excluded.name,
  base_theme = excluded.base_theme,
  palette = excluded.palette,
  settings = excluded.settings,
  is_builtin = false;
