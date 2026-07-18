-- BLOOM: per-flower ACTIVE flag + admin-uploaded custom art (icon + animation).
-- Only active flowers appear in the live game; the deck-admin still sees all.
-- Custom flowers render their uploaded animation (Lottie / video / gif) in the
-- bed instead of the hand-coded CODEX SVG, and their uploaded icon in the satchel.
-- Assets live in the public `bloom-assets` storage bucket; URLs are stored here.
--
-- Applied as migration: bloom_flowers_active_and_custom_art

alter table public.bloom_flowers
  add column if not exists active boolean not null default true,
  add column if not exists icon_url text,
  add column if not exists animation_url text,
  add column if not exists animation_kind text;

alter table public.bloom_flowers
  drop constraint if exists bloom_flowers_animation_kind_check;
alter table public.bloom_flowers
  add constraint bloom_flowers_animation_kind_check
  check (animation_kind is null or animation_kind in ('lottie', 'video', 'gif'));

-- Public bucket for flower icons + animations (mirrors prize-images / mm-sounds).
insert into storage.buckets (id, name, public)
values ('bloom-assets', 'bloom-assets', true)
on conflict (id) do nothing;

drop policy if exists "bloom-assets authenticated write" on storage.objects;
create policy "bloom-assets authenticated write"
  on storage.objects for all to authenticated
  using (bucket_id = 'bloom-assets')
  with check (bucket_id = 'bloom-assets');

drop policy if exists "bloom-assets public read" on storage.objects;
create policy "bloom-assets public read"
  on storage.objects for select to public
  using (bucket_id = 'bloom-assets');
