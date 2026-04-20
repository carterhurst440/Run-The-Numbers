alter table public.shape_trader_structural_events_applied enable row level security;

drop policy if exists "shape_trader_structural_events_applied_select_own" on public.shape_trader_structural_events_applied;
create policy "shape_trader_structural_events_applied_select_own"
on public.shape_trader_structural_events_applied
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_structural_events_applied_insert_own" on public.shape_trader_structural_events_applied;
create policy "shape_trader_structural_events_applied_insert_own"
on public.shape_trader_structural_events_applied
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "shape_trader_structural_events_applied_delete_own" on public.shape_trader_structural_events_applied;
create policy "shape_trader_structural_events_applied_delete_own"
on public.shape_trader_structural_events_applied
for delete
to authenticated
using (user_id = auth.uid());
