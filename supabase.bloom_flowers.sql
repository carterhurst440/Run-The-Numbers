-- BLOOM — flower archetypes.
-- One row per flower competing to be first to bloom.
-- bloom_target is the score threshold a flower must reach.
-- hero_region is the region whose deck most favors this flower (lore + future
-- bonus odds). No FK to bloom_regions to avoid ordering coupling between seeds.

CREATE TABLE IF NOT EXISTS public.bloom_flowers (
  flower        TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  accent_color  TEXT,
  bloom_target  INT  NOT NULL DEFAULT 100,
  hero_region   TEXT,
  sort_order    INT  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bloom_flowers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bloom_flowers" ON public.bloom_flowers;
CREATE POLICY "auth_all_bloom_flowers"
  ON public.bloom_flowers
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_flowers" ON public.bloom_flowers;
CREATE POLICY "anon_read_bloom_flowers"
  ON public.bloom_flowers
  FOR SELECT
  TO anon
  USING (true);

-- Seed (idempotent — re-running RESETS values to these seeds).
INSERT INTO public.bloom_flowers
  (flower, display_name, accent_color, bloom_target, hero_region, sort_order)
VALUES
  ('cactus_bloom', 'Cactus Bloom', '#e91e63', 100, 'desert',           1),
  ('hibiscus',     'Hibiscus',     '#f44336', 100, 'rainforest',       2),
  ('hydrangea',    'Hydrangea',    '#7e57c2', 100, 'temperate_forest', 3),
  ('frost_lily',   'Frost Lily',   '#81d4fa', 100, 'tundra',           4),
  ('plumeria',     'Plumeria',     '#ffd54f', 100, 'tropical_island',  5)
ON CONFLICT (flower) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  accent_color = EXCLUDED.accent_color,
  bloom_target = EXCLUDED.bloom_target,
  hero_region  = EXCLUDED.hero_region,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
