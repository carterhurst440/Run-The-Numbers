alter table public.shape_trader_accounts_current enable row level security;
alter table public.shape_trader_draws enable row level security;
alter table public.shape_trader_market_current enable row level security;
alter table public.shape_trader_positions_current enable row level security;
alter table public.shape_trader_price_history enable row level security;
alter table public.shape_trader_trades enable row level security;

drop policy if exists "shape_trader_accounts_current_select_own" on public.shape_trader_accounts_current;
create policy "shape_trader_accounts_current_select_own"
on public.shape_trader_accounts_current
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_accounts_current_insert_own" on public.shape_trader_accounts_current;
create policy "shape_trader_accounts_current_insert_own"
on public.shape_trader_accounts_current
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "shape_trader_accounts_current_update_own" on public.shape_trader_accounts_current;
create policy "shape_trader_accounts_current_update_own"
on public.shape_trader_accounts_current
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "shape_trader_accounts_current_delete_own" on public.shape_trader_accounts_current;
create policy "shape_trader_accounts_current_delete_own"
on public.shape_trader_accounts_current
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_positions_current_select_own" on public.shape_trader_positions_current;
create policy "shape_trader_positions_current_select_own"
on public.shape_trader_positions_current
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_positions_current_insert_own" on public.shape_trader_positions_current;
create policy "shape_trader_positions_current_insert_own"
on public.shape_trader_positions_current
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "shape_trader_positions_current_update_own" on public.shape_trader_positions_current;
create policy "shape_trader_positions_current_update_own"
on public.shape_trader_positions_current
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "shape_trader_positions_current_delete_own" on public.shape_trader_positions_current;
create policy "shape_trader_positions_current_delete_own"
on public.shape_trader_positions_current
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_trades_select_own" on public.shape_trader_trades;
create policy "shape_trader_trades_select_own"
on public.shape_trader_trades
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_trades_insert_own" on public.shape_trader_trades;
create policy "shape_trader_trades_insert_own"
on public.shape_trader_trades
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "shape_trader_trades_update_own" on public.shape_trader_trades;
create policy "shape_trader_trades_update_own"
on public.shape_trader_trades
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "shape_trader_trades_delete_own" on public.shape_trader_trades;
create policy "shape_trader_trades_delete_own"
on public.shape_trader_trades
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_draws_select_authenticated" on public.shape_trader_draws;
create policy "shape_trader_draws_select_authenticated"
on public.shape_trader_draws
for select
to authenticated
using (true);

drop policy if exists "shape_trader_draws_write_authenticated" on public.shape_trader_draws;
create policy "shape_trader_draws_write_authenticated"
on public.shape_trader_draws
for all
to authenticated
using (true)
with check (true);

drop policy if exists "shape_trader_market_current_select_authenticated" on public.shape_trader_market_current;
create policy "shape_trader_market_current_select_authenticated"
on public.shape_trader_market_current
for select
to authenticated
using (true);

drop policy if exists "shape_trader_market_current_write_authenticated" on public.shape_trader_market_current;
create policy "shape_trader_market_current_write_authenticated"
on public.shape_trader_market_current
for all
to authenticated
using (true)
with check (true);

drop policy if exists "shape_trader_price_history_select_authenticated" on public.shape_trader_price_history;
create policy "shape_trader_price_history_select_authenticated"
on public.shape_trader_price_history
for select
to authenticated
using (true);

drop policy if exists "shape_trader_price_history_write_authenticated" on public.shape_trader_price_history;
create policy "shape_trader_price_history_write_authenticated"
on public.shape_trader_price_history
for all
to authenticated
using (true)
with check (true);

-- Note:
-- User-owned tables are locked to auth.uid().
-- Shared market tables are now behind RLS too, but still writable by authenticated users
-- because the current app writes to them directly from the client.
-- If you want those fully hardened, the next step is moving writes into an RPC or Edge Function
-- and then narrowing these write policies to a service role path only.
