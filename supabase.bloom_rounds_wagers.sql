-- BLOOM — multi-flower wagers.
-- Adds the per-flower wager map to bloom_rounds so a single round can
-- carry bets on multiple flowers. Shape: {"flower_slug": amount, ...}.
-- bloom_lock_round writes this column on resolve and uses it to settle
-- the round; only the winning flower's stack pays out.

ALTER TABLE public.bloom_rounds
  ADD COLUMN IF NOT EXISTS wagers JSONB NOT NULL DEFAULT '{}'::jsonb;
