alter table public.rtn_live_hands enable row level security;

drop policy if exists "rtn_live_hands_select_own" on public.rtn_live_hands;
create policy "rtn_live_hands_select_own"
on public.rtn_live_hands
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "rtn_live_hands_insert_own" on public.rtn_live_hands;
create policy "rtn_live_hands_insert_own"
on public.rtn_live_hands
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "rtn_live_hands_update_own" on public.rtn_live_hands;
create policy "rtn_live_hands_update_own"
on public.rtn_live_hands
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
