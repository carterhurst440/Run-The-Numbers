-- BLOOM — per-region win-probability columns on bloom_flowers.
-- Convention: on row F, column `pct_<region>` = F's win % when the round is
-- played in <region>. Stored as decimal 0..1 (e.g. 0.214 = 21.4%).
-- Populated by the admin "Run Master Matrix" tool, which runs N sims per
-- region in the JS twin and writes the tally back. bloom_start_round reads
-- these columns to render the flower-pick screen, and bloom_lock_round
-- snapshots them at lock time so payouts are reproducible if retuned later.

ALTER TABLE public.bloom_flowers
  ADD COLUMN IF NOT EXISTS pct_desert            NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_rainforest        NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_temperate_forest  NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_tundra            NUMERIC,
  ADD COLUMN IF NOT EXISTS pct_tropical_island   NUMERIC,
  ADD COLUMN IF NOT EXISTS odds_sample_size      INT,
  ADD COLUMN IF NOT EXISTS odds_computed_at      TIMESTAMPTZ;
