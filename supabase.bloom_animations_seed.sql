-- BLOOM — seed bloom_animations with built-in clip pointers.
-- These are vanilla-JS parametric SVG clips bundled in assets/bloom/
-- (no external URL — clip_data carries a `builtin_id` instead).
--
-- ON CONFLICT DO NOTHING — re-running is safe; any rows already
-- customised via the admin Anims editor are preserved.
--
-- Built-in IDs:
--   flowers      → species_id maps to the bundle's species (cactus_bloom
--                  DB slug routes to 'cactus_blossom' bundle, etc.).
--                  Variant carries the stage / transition identifier
--                  natively, so JS just calls FlowerStage.setStage(N) or
--                  .transitionTo(N+1) — no per-variant URL needed.
--   card_overlay → builtin_id picks the CSS keyframe set (card-rain,
--                  card-sun, card-frost, …). 10 distinct keyframes in
--                  bloom-flowers.css.
--   region_bg    → builtin_id picks the biome CSS class
--                  (biome-desert, biome-rainforest, …).

-- ── FLOWERS (12 variants × N flowers) ───────────────────────────────
INSERT INTO public.bloom_animations (kind, subject, variant, clip_data)
SELECT
  'flower',
  f.flower,
  v.variant,
  jsonb_build_object(
    'builtin_id', 'flower',
    'species_id',
      CASE f.flower
        WHEN 'cactus_bloom' THEN 'cactus_blossom'
        WHEN 'frost_lily'   THEN 'arctic_poppy'
        WHEN 'plumeria'     THEN 'orchid'
        ELSE f.flower
      END,
    'loop', (v.variant LIKE 'stage_%')
  )
FROM public.bloom_flowers f
CROSS JOIN (VALUES
  ('stage_1'), ('transition_1_2'),
  ('stage_2'), ('transition_2_3'),
  ('stage_3'), ('transition_3_4'),
  ('stage_4'), ('transition_4_5'),
  ('stage_5'), ('transition_5_6'),
  ('stage_6'), ('transition_6_bloom')
) AS v(variant)
ON CONFLICT (kind, subject, variant) DO NOTHING;

-- ── CARD OVERLAYS (one per live card; slug-heuristic mapping) ───────
INSERT INTO public.bloom_animations (kind, subject, variant, clip_data)
SELECT
  'card_overlay',
  c.card,
  'default',
  jsonb_build_object(
    'builtin_id',
      CASE
        WHEN c.card IN ('sunny_day','dry_heat','heat_wave','drought')   THEN 'card-sun'
        WHEN c.card IN ('gentle_rain','flooding')                       THEN 'card-rain'
        WHEN c.card = 'thunderstorm'                                    THEN 'card-thunder'
        WHEN c.card IN ('late_freeze','hailstorm')                      THEN 'card-frost'
        WHEN c.card IN ('windstorm','cool_breeze')                      THEN 'card-wind'
        WHEN c.card IN ('morning_dew','tropical_humidity')              THEN 'card-pollen'
        WHEN c.card = 'overcast'                                        THEN 'card-nutrients'
        WHEN c.card = 'perfect_conditions'                              THEN 'card-bloom-burst'
        ELSE 'card-wild'
      END,
    'loop', false
  )
FROM public.bloom_cards c
ON CONFLICT (kind, subject, variant) DO NOTHING;

-- ── REGION BACKGROUNDS ──────────────────────────────────────────────
INSERT INTO public.bloom_animations (kind, subject, variant, clip_data)
SELECT
  'region_bg',
  r.region,
  'default',
  jsonb_build_object(
    'builtin_id',
      CASE r.region
        WHEN 'desert'           THEN 'biome-desert'
        WHEN 'rainforest'       THEN 'biome-rainforest'
        WHEN 'temperate_forest' THEN 'biome-forest'
        WHEN 'tundra'           THEN 'biome-tundra'
        WHEN 'tropical_island'  THEN 'biome-tropical'
        ELSE 'biome-default'
      END,
    'loop', true
  )
FROM public.bloom_regions r
ON CONFLICT (kind, subject, variant) DO NOTHING;
