-- MONKEY MOONSHINE — spins ledger (the reconciliation spine for the slot).
-- One row per spin. A slot is single-wager, so this rounds-equivalent table
-- doubles as the bet record (no child _bets table). Money fields + account-value
-- snapshots mirror bloom_rounds / fate_or_fortune_rounds so the account-journey
-- reconciler (script.js) can read it identically. Fields stay 0 for admin-only
-- sims until the wallet postMessage seam is wired (balance is still in-memory).

CREATE TABLE IF NOT EXISTS public.mm_spins (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id                UUID REFERENCES public.contests (id) ON DELETE SET NULL,

  -- Lifecycle. A slot spin is atomic: it resolves the instant it is played.
  -- 'resolved' is the only terminal state today; 'pending' is reserved for a
  -- future server-authoritative spin that locks a wager before the reels settle.
  status                    TEXT NOT NULL DEFAULT 'resolved'
                              CHECK (status IN ('pending', 'resolved')),

  -- Matchup: which wild fruit / deck was in play (drives scoring + the RTP band).
  wild                      TEXT NOT NULL REFERENCES public.mm_decks (wild),
  wild_mult                 INTEGER,   -- multiplier snapshot for `wild` at spin time

  -- Outcome
  moonshine_triggered       BOOLEAN NOT NULL DEFAULT FALSE,  -- full coconut row → raid
  monkeys_total             INTEGER NOT NULL DEFAULT 0,       -- cumulative monkeys landed
  bonus_rows                SMALLINT NOT NULL DEFAULT 0,      -- extra-shake rows unlocked (0..3)
  spin_number               INTEGER,                          -- client session spin counter

  -- Definitive board snapshot for reconciliation: the exact reels the spin
  -- settled on, self-contained (carries its own wild + multiplier) so a spin is
  -- auditable from this one column alone. Shape:
  --   { "wild":"apple", "wild_mult":2, "cols":5,
  --     "rows":[ ["apple","coconut","cherry","banana","apple"], ... ] }
  -- index 0 = top row; 3 base rows + up to 3 monkey-shake bonus rows (max 6).
  -- Each cell: a fruit name | 'coconut' | 'monkey' (raid-replaced coconut) | null.
  board                     JSONB,

  round_details             JSONB,   -- line wins / raid summary
  round_replay              JSONB,   -- reserved: grid states for client-stitched replay

  -- Money (NUMERIC — same precision pattern as bloom_rounds / fof_rounds).
  -- For a single-wager slot: total_wagered = the bet, total_returned = the payout.
  total_wagered             NUMERIC NOT NULL DEFAULT 0,
  total_returned            NUMERIC NOT NULL DEFAULT 0,
  net_profit                NUMERIC GENERATED ALWAYS AS (total_returned - total_wagered) STORED,
  pre_hand_account_value    NUMERIC,
  new_account_value         NUMERIC,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most-common reads
CREATE INDEX IF NOT EXISTS mm_spins_user_created_idx
  ON public.mm_spins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_spins_contest_created_idx
  ON public.mm_spins (contest_id, created_at DESC)
  WHERE contest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mm_spins_wild_created_idx
  ON public.mm_spins (wild, created_at DESC);
-- Analytics: Moonshine hit-rate / big-win scans.
CREATE INDEX IF NOT EXISTS mm_spins_moonshine_idx
  ON public.mm_spins (created_at DESC)
  WHERE moonshine_triggered;

-- RLS
ALTER TABLE public.mm_spins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_spins_owner_select" ON public.mm_spins;
CREATE POLICY "mm_spins_owner_select"
  ON public.mm_spins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mm_spins_owner_insert" ON public.mm_spins;
CREATE POLICY "mm_spins_owner_insert"
  ON public.mm_spins
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mm_spins_owner_update" ON public.mm_spins;
CREATE POLICY "mm_spins_owner_update"
  ON public.mm_spins
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin (matches the pattern used by bloom_rounds / fate_or_fortune_rounds).
DROP POLICY IF EXISTS "mm_spins_admin_all" ON public.mm_spins;
CREATE POLICY "mm_spins_admin_all"
  ON public.mm_spins
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
