-- Fate or Fortune — MARKET MODE (v2, admin sandbox) — transaction ledger.
--
-- One row per trade ACTION (buy / sell / settle), signed. This is the account-
-- of-record for market mode: a player's bankroll moves one row at a time, and
-- per-row new_account_value feeds the existing bankroll / activity charts the
-- same way RTN / Guess 10 / Shape Traders hands do.
--
-- Position ("I hold 100 hero @ avg 0.30") and round P&L both DERIVE by summing
-- this ledger — fate_or_fortune_rounds stays as the round-outcome/display row,
-- its aggregate net = SUM(net_profit) over the round's contracts.
--
--   buy:    cash_delta = -qty*price,  net_profit = NULL
--   sell:   cash_delta = +qty*price,  net_profit = qty*(price - cost_basis)
--   settle: forced final close at 1.00/0.00/0.50; same net_profit formula
--
-- event_index ties the trade to its fof_market_events juncture — the server
-- validates that `price` equals the price stored on that event row (anti-forge).

CREATE TABLE IF NOT EXISTS public.fof_market_contracts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- transaction id
  round_id           UUID NOT NULL REFERENCES public.fate_or_fortune_rounds (id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id         UUID REFERENCES public.contests (id) ON DELETE SET NULL,
  position_id        UUID REFERENCES public.fof_market_positions (id) ON DELETE SET NULL,

  event_index        INTEGER NOT NULL,            -- juncture this executed at (price anchor)
  side               TEXT NOT NULL CHECK (side IN ('hero', 'opponent')),
  action             TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'settle')),

  quantity           NUMERIC NOT NULL,            -- contracts in this action
  price              NUMERIC NOT NULL,            -- per-contract price (0..1) at event_index
  cost_basis         NUMERIC,                     -- weighted-avg buy price (sells/settles)
  cash_delta         NUMERIC NOT NULL,            -- -qty*price (buy) / +qty*price (sell/settle)
  net_profit         NUMERIC,                     -- realized on sell/settle: qty*(price-cost_basis)

  pre_account_value  NUMERIC,
  new_account_value  NUMERIC,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fof_market_contracts_round_idx
  ON public.fof_market_contracts (round_id, created_at);
CREATE INDEX IF NOT EXISTS fof_market_contracts_user_idx
  ON public.fof_market_contracts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fof_market_contracts_contest_idx
  ON public.fof_market_contracts (contest_id, created_at DESC)
  WHERE contest_id IS NOT NULL;

ALTER TABLE public.fof_market_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fof_market_contracts_owner_select" ON public.fof_market_contracts;
CREATE POLICY "fof_market_contracts_owner_select"
  ON public.fof_market_contracts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_contracts_owner_insert" ON public.fof_market_contracts;
CREATE POLICY "fof_market_contracts_owner_insert"
  ON public.fof_market_contracts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_contracts_admin_all" ON public.fof_market_contracts;
CREATE POLICY "fof_market_contracts_admin_all"
  ON public.fof_market_contracts FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
