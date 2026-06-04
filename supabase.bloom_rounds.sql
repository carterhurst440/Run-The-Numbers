-- BLOOM — rounds.
-- One row per resolved bloom race. Server picks the region (or accepts a
-- player-influenced one later), simulates the full race authoritatively, and
-- persists the event log so the client can stitch the animation — or just
-- resolve cold if the client never returns. Money fields mirror
-- fate_or_fortune_rounds; they stay 0 for admin-only sims.

CREATE TABLE IF NOT EXISTS public.bloom_rounds (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id                UUID REFERENCES public.contests (id) ON DELETE SET NULL,

  -- Lifecycle. 'pending' = region shown, awaiting flower pick;
  -- 'resolved' = race simulated server-side, awaiting/finished animation.
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'resolved')),
  locked_at                 TIMESTAMPTZ,  -- when player committed pick + wager

  -- Matchup
  region                    TEXT NOT NULL
                              REFERENCES public.bloom_regions (region),
  picked_flower             TEXT
                              REFERENCES public.bloom_flowers (flower),
  -- Decimal 0..1 win % snapshot for the picked flower (set at lock time so
  -- payout is reproducible if odds are retuned later). Populated when the
  -- per-region master matrix is added; nullable for now.
  picked_win_pct            NUMERIC,

  -- Outcome
  winner_flower             TEXT REFERENCES public.bloom_flowers (flower),
  round_winner              TEXT CHECK (round_winner IN ('hero', 'other', 'draw')),
  round_details             JSONB,  -- full event log from bloom_simulate_round
  round_replay              JSONB,  -- reserved for client-stitched animation cache

  -- Money (NUMERIC — same precision pattern as fof_rounds)
  total_wagered             NUMERIC NOT NULL DEFAULT 0,
  total_returned            NUMERIC NOT NULL DEFAULT 0,
  net_profit                NUMERIC GENERATED ALWAYS AS (total_returned - total_wagered) STORED,
  pre_hand_account_value    NUMERIC,
  new_account_value         NUMERIC,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most-common reads
CREATE INDEX IF NOT EXISTS bloom_rounds_user_created_idx
  ON public.bloom_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bloom_rounds_contest_created_idx
  ON public.bloom_rounds (contest_id, created_at DESC)
  WHERE contest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bloom_rounds_status_idx
  ON public.bloom_rounds (status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS bloom_rounds_region_created_idx
  ON public.bloom_rounds (region, created_at DESC);

-- RLS
ALTER TABLE public.bloom_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloom_rounds_owner_select" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_select"
  ON public.bloom_rounds
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_rounds_owner_insert" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_insert"
  ON public.bloom_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_rounds_owner_update" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_update"
  ON public.bloom_rounds
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin (matches the pattern used by fate_or_fortune_rounds).
DROP POLICY IF EXISTS "bloom_rounds_admin_all" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_admin_all"
  ON public.bloom_rounds
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
