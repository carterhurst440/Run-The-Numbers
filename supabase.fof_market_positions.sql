-- Fate or Fortune — MARKET MODE (v2, admin sandbox) — open/closed positions.
--
-- A position is the player's running stake on ONE side of one round. Because the
-- rule is "one side at a time — fully flatten to flip," there is at most ONE
-- open position per (round, user) at any moment (enforced by the partial unique
-- index below). Multiple buys on the same side fold into a single weighted-
-- average cost; a flip closes the current position (qty→0) and opens a new one.
--
--   Buy:    new_qty  = qty + buyQty
--           new_avg  = (qty*avg + buyQty*price) / new_qty       (no realized P&L)
--   Sell:   realized += sellQty * (price - avg);  qty -= sellQty (avg unchanged)
--   Settle: forced final sell at 1.00 (winning side) / 0.00 (losing) / 0.50 (draw)
--
-- The contracts ledger derives from this; this table exists to make the
-- flatten-to-flip invariant and concurrency safety (SELECT … FOR UPDATE) trivial.

CREATE TABLE IF NOT EXISTS public.fof_market_positions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id          UUID NOT NULL REFERENCES public.fate_or_fortune_rounds (id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id        UUID REFERENCES public.contests (id) ON DELETE SET NULL,

  side              TEXT NOT NULL CHECK (side IN ('hero', 'opponent')),
  qty               NUMERIC NOT NULL DEFAULT 0,   -- contracts currently held
  avg_cost          NUMERIC NOT NULL DEFAULT 0,   -- weighted-average buy price (0..1)
  realized_profit   NUMERIC NOT NULL DEFAULT 0,   -- running realized P&L on this position
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one OPEN position per (round, user) — enforces flatten-to-flip.
CREATE UNIQUE INDEX IF NOT EXISTS fof_market_positions_one_open_idx
  ON public.fof_market_positions (round_id, user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS fof_market_positions_user_idx
  ON public.fof_market_positions (user_id, opened_at DESC);

ALTER TABLE public.fof_market_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fof_market_positions_owner_select" ON public.fof_market_positions;
CREATE POLICY "fof_market_positions_owner_select"
  ON public.fof_market_positions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_positions_owner_cud" ON public.fof_market_positions;
CREATE POLICY "fof_market_positions_owner_cud"
  ON public.fof_market_positions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_positions_admin_all" ON public.fof_market_positions;
CREATE POLICY "fof_market_positions_admin_all"
  ON public.fof_market_positions FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
