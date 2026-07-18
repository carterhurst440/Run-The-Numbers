-- BLOOM — small key/value config for the game.
-- Extensible bag of tunables the admin can change without a deploy. Public/anon
-- readable so the anon-key game iframe can pull it; authenticated admins write.
--
-- Keys in use:
--   background_url  public URL of the garden backdrop image (uploaded to the
--                   bloom-assets bucket via the admin "BLOOM — Background" uploader).
--
-- The game reads this through the deck bridge (bloomFetchDeck adds background_url to
-- the deck payload; bloomApplyDeck sets the garden-card's --garden-bg CSS var). If a
-- row is absent the game falls back to the baked-in default image in games/bloom.html.

create table if not exists public.bloom_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.bloom_settings enable row level security;

-- Admin writes; everyone (incl. the anon-key iframe) reads.
drop policy if exists "auth_all_bloom_settings" on public.bloom_settings;
create policy "auth_all_bloom_settings" on public.bloom_settings
  for all to authenticated using (true) with check (true);

drop policy if exists "anon_read_bloom_settings" on public.bloom_settings;
create policy "anon_read_bloom_settings" on public.bloom_settings
  for select to anon using (true);

-- Seed the default background (the 2/3-dirt landscape). Re-running updates it.
insert into public.bloom_settings (key, value)
values ('background_url',
        'https://jfqdjqhqumoqcoivjwbi.supabase.co/storage/v1/object/public/bloom-assets/bg/garden-2thirds-v1.png')
on conflict (key) do update set value = excluded.value, updated_at = now();
