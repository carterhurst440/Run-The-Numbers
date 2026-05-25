-- BLOOM — regions.
-- One row per region. deck_composition is a JSONB object keyed by card slug
-- whose value is the COUNT of that card to include in the region's deck.
-- (e.g. {"sunny_day": 6, "dry_heat": 6, ...}). Sum is the total deck size
-- (40 cards per region — keep regions equal-sized for fair sims).
-- hero_flower is the flower whose growth is most favored by this region.

CREATE TABLE IF NOT EXISTS public.bloom_regions (
  region            TEXT PRIMARY KEY,
  display_name      TEXT  NOT NULL,
  identity          TEXT,
  hero_flower       TEXT,
  deck_composition  JSONB NOT NULL,
  sort_order        INT   NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bloom_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bloom_regions" ON public.bloom_regions;
CREATE POLICY "auth_all_bloom_regions"
  ON public.bloom_regions
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_regions" ON public.bloom_regions;
CREATE POLICY "anon_read_bloom_regions"
  ON public.bloom_regions
  FOR SELECT
  TO anon
  USING (true);

-- Seed all 5 regions (idempotent — re-running RESETS values).
INSERT INTO public.bloom_regions
  (region, display_name, identity, hero_flower, deck_composition, sort_order)
VALUES
  ('desert', 'Desert', 'Hot / Dry / Volatile', 'cactus_bloom',
   '{"sunny_day":6,"dry_heat":6,"drought":5,"heat_wave":4,"morning_dew":4,"windstorm":3,"perfect_conditions":3,"gentle_rain":3,"overcast":2,"thunderstorm":2,"cool_breeze":2}'::jsonb,
   1),

  ('rainforest', 'Rainforest', 'Wet / Stormy / Chaotic', 'hibiscus',
   '{"tropical_humidity":6,"thunderstorm":6,"gentle_rain":5,"flooding":4,"morning_dew":4,"overcast":4,"windstorm":3,"perfect_conditions":3,"sunny_day":2,"cool_breeze":2,"heat_wave":1}'::jsonb,
   2),

  ('temperate_forest', 'Temperate Forest', 'Cool / Wet / Balanced', 'hydrangea',
   '{"gentle_rain":5,"overcast":5,"morning_dew":5,"cool_breeze":5,"perfect_conditions":4,"flooding":3,"thunderstorm":3,"windstorm":3,"sunny_day":3,"late_freeze":2,"tropical_humidity":2}'::jsonb,
   3),

  ('tundra', 'Tundra', 'Cold / Harsh / Survival', 'frost_lily',
   '{"late_freeze":6,"hailstorm":6,"cool_breeze":5,"overcast":4,"windstorm":4,"morning_dew":4,"gentle_rain":3,"thunderstorm":2,"perfect_conditions":2,"sunny_day":2,"dry_heat":2}'::jsonb,
   4),

  ('tropical_island', 'Tropical Island', 'Balanced / Warm / Ideal', 'plumeria',
   '{"morning_dew":6,"perfect_conditions":6,"sunny_day":5,"gentle_rain":4,"cool_breeze":3,"tropical_humidity":3,"overcast":3,"windstorm":2,"thunderstorm":2,"flooding":2,"heat_wave":2,"late_freeze":2}'::jsonb,
   5)
ON CONFLICT (region) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  identity         = EXCLUDED.identity,
  hero_flower      = EXCLUDED.hero_flower,
  deck_composition = EXCLUDED.deck_composition,
  sort_order       = EXCLUDED.sort_order,
  updated_at       = NOW();
