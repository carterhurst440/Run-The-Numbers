-- BLOOM — bets.
-- One row per individual flower wager. Rounds still hold the aggregate
-- (total_wagered / total_returned / net_profit) so account reconciliation
-- can keep using bloom_rounds as the source of truth; bets give us the
-- per-pick granularity needed for analytics, ML, and per-flower leaderboards.
--
-- bet_key is denormalized as "<flower>_<region>" so callers can group by
-- the matchup without parsing. flower + region are also kept as their own
-- FK columns for cheap joins.
--
-- `raw` captures the full per-round snapshot duplicated across each bet in
-- the round: region, pre-hand win probabilities for every candidate, final
-- scores from the sim, and the winning flower. Same payload on every bet
-- in the round — it's denormalized on purpose so a single bet row carries
-- everything an analyst needs without joining bloom_rounds.

CREATE TABLE IF NOT EXISTS public.bloom_bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES public.bloom_rounds (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users (id)         ON DELETE CASCADE,
  contest_id      UUID          REFERENCES public.contests (id)    ON DELETE SET NULL,

  bet_key         TEXT    NOT NULL,
  flower          TEXT    NOT NULL REFERENCES public.bloom_flowers (flower),
  region          TEXT    NOT NULL REFERENCES public.bloom_regions (region),

  win_probability NUMERIC NOT NULL,                           -- 0..1 snapshot at lock time
  wager           NUMERIC NOT NULL CHECK (wager > 0),
  outcome         TEXT    NOT NULL CHECK (outcome IN ('win', 'loss')),
  returned        NUMERIC NOT NULL DEFAULT 0,
  net_profit      NUMERIC GENERATED ALWAYS AS (returned - wager) STORED,

  raw             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bloom_bets_round_idx
  ON public.bloom_bets (round_id);
CREATE INDEX IF NOT EXISTS bloom_bets_user_placed_idx
  ON public.bloom_bets (user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS bloom_bets_contest_placed_idx
  ON public.bloom_bets (contest_id, placed_at DESC)
  WHERE contest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bloom_bets_bet_key_placed_idx
  ON public.bloom_bets (bet_key, placed_at DESC);
CREATE INDEX IF NOT EXISTS bloom_bets_region_flower_idx
  ON public.bloom_bets (region, flower);

-- RLS — same shape as bloom_rounds.
ALTER TABLE public.bloom_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloom_bets_owner_select" ON public.bloom_bets;
CREATE POLICY "bloom_bets_owner_select"
  ON public.bloom_bets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_bets_owner_insert" ON public.bloom_bets;
CREATE POLICY "bloom_bets_owner_insert"
  ON public.bloom_bets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_bets_admin_all" ON public.bloom_bets;
CREATE POLICY "bloom_bets_admin_all"
  ON public.bloom_bets
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
