-- Shape Traders RLS
--
-- This file reflects the current Shape Traders architecture:
-- - shared market state is driven by Postgres functions / cron
-- - the draw table is the primary shared engine output
-- - user-owned state stays private
-- - contest-linked trade rows stay readable to authenticated users so
--   contest journey charts can be viewed by all signed-in players
--
-- IMPORTANT:
-- This intentionally does not manage old shared tables that are no longer
-- part of the primary runtime path, such as shape_trader_market_current and
-- shape_trader_price_history.

alter table public.shape_trader_accounts_current enable row level security;
alter table public.shape_trader_deck_cards enable row level security;
alter table public.shape_trader_draws enable row level security;
alter table public.shape_trader_engine_config enable row level security;
alter table public.shape_trader_positions_current enable row level security;
alter table public.shape_trader_trades enable row level security;

-- User-owned current account state

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

-- User-owned current positions

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

-- Trades
--
-- Normal-mode trades stay private to the owner.
-- Contest-linked trades are readable to authenticated users so contest
-- journey charts can show full participant history across all games.

drop policy if exists "shape_trader_trades_select_own" on public.shape_trader_trades;
create policy "shape_trader_trades_select_own"
on public.shape_trader_trades
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "shape_trader_trades_select_contest_authenticated" on public.shape_trader_trades;
create policy "shape_trader_trades_select_contest_authenticated"
on public.shape_trader_trades
for select
to authenticated
using (contest_id is not null);

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

-- Shared draw stream
--
-- Authenticated users can read the shared market draw history.
-- Admin keeps mutation access for reset / troubleshooting flows triggered from
-- the client. The server-side SQL engine itself runs independently of client RLS.

drop policy if exists "shape_trader_draws_select_authenticated" on public.shape_trader_draws;
create policy "shape_trader_draws_select_authenticated"
on public.shape_trader_draws
for select
to authenticated
using (true);

drop policy if exists "shape_trader_draws_admin_manage" on public.shape_trader_draws;
create policy "shape_trader_draws_admin_manage"
on public.shape_trader_draws
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

-- Engine config
--
-- The client still reads and admin-resets the engine epoch directly.

drop policy if exists "shape_trader_engine_config_select_authenticated" on public.shape_trader_engine_config;
create policy "shape_trader_engine_config_select_authenticated"
on public.shape_trader_engine_config
for select
to authenticated
using (true);

drop policy if exists "shape_trader_engine_config_admin_manage" on public.shape_trader_engine_config;
create policy "shape_trader_engine_config_admin_manage"
on public.shape_trader_engine_config
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

-- Deck definition
--
-- Read-only to authenticated users for transparency / debugging.
-- Writes remain admin-only.

drop policy if exists "shape_trader_deck_cards_select_authenticated" on public.shape_trader_deck_cards;
create policy "shape_trader_deck_cards_select_authenticated"
on public.shape_trader_deck_cards
for select
to authenticated
using (true);

drop policy if exists "shape_trader_deck_cards_admin_manage" on public.shape_trader_deck_cards;
create policy "shape_trader_deck_cards_admin_manage"
on public.shape_trader_deck_cards
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
