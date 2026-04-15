alter table public.guess10_draw_plays enable row level security;

drop policy if exists "guess10_draw_plays_select_own" on public.guess10_draw_plays;
create policy "guess10_draw_plays_select_own"
on public.guess10_draw_plays
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "guess10_draw_plays_insert_own" on public.guess10_draw_plays;
create policy "guess10_draw_plays_insert_own"
on public.guess10_draw_plays
for insert
to authenticated
with check (user_id = auth.uid());
