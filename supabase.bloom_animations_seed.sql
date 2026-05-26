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

-- ── CARD OVERLAYS (one per live card; slug→BloomWeather event id) ──
-- The bundled BloomWeather supports 10 events: arctic_wind, late_freeze,
-- monsoon, perfect_conditions, torrential_downpour, dense_mist, drought,
-- dry_heat, coastal_fog, morning_dew. The mapping below is a heuristic
-- starting point — admin can override per-card via the Anims editor.
INSERT INTO public.bloom_animations (kind, subject, variant, clip_data)
SELECT
  'card_overlay',
  c.card,
  'default',
  jsonb_build_object(
    'builtin_id',
      CASE
        WHEN c.card IN ('sunny_day','drought')              THEN 'drought'
        WHEN c.card IN ('dry_heat','heat_wave')             THEN 'dry_heat'
        WHEN c.card = 'gentle_rain'                         THEN 'torrential_downpour'
        WHEN c.card IN ('flooding','thunderstorm')          THEN 'monsoon'
        WHEN c.card IN ('late_freeze','hailstorm')          THEN 'late_freeze'
        WHEN c.card IN ('windstorm','cool_breeze')          THEN 'arctic_wind'
        WHEN c.card = 'morning_dew'                         THEN 'morning_dew'
        WHEN c.card = 'tropical_humidity'                   THEN 'coastal_fog'
        WHEN c.card = 'overcast'                            THEN 'dense_mist'
        WHEN c.card = 'perfect_conditions'                  THEN 'perfect_conditions'
        ELSE 'perfect_conditions'
      END,
    'loop', true
  )
FROM public.bloom_cards c
ON CONFLICT (kind, subject, variant) DO NOTHING;

-- ── Force-migrate any pre-existing card_overlay rows that still carry
-- the obsolete card-* keyframe IDs from the old CSS-only system. Those
-- IDs no longer resolve to anything, so we rewrite them to BloomWeather
-- event IDs. Any rows already carrying a valid weather id are left alone.
UPDATE public.bloom_animations a
SET clip_data = jsonb_set(
  COALESCE(a.clip_data, '{}'::jsonb),
  '{builtin_id}',
  to_jsonb(
    CASE
      WHEN a.subject IN ('sunny_day','drought')              THEN 'drought'
      WHEN a.subject IN ('dry_heat','heat_wave')             THEN 'dry_heat'
      WHEN a.subject = 'gentle_rain'                         THEN 'torrential_downpour'
      WHEN a.subject IN ('flooding','thunderstorm')          THEN 'monsoon'
      WHEN a.subject IN ('late_freeze','hailstorm')          THEN 'late_freeze'
      WHEN a.subject IN ('windstorm','cool_breeze')          THEN 'arctic_wind'
      WHEN a.subject = 'morning_dew'                         THEN 'morning_dew'
      WHEN a.subject = 'tropical_humidity'                   THEN 'coastal_fog'
      WHEN a.subject = 'overcast'                            THEN 'dense_mist'
      WHEN a.subject = 'perfect_conditions'                  THEN 'perfect_conditions'
      ELSE 'perfect_conditions'
    END
  )
)
WHERE a.kind = 'card_overlay'
  AND (a.clip_data->>'builtin_id') LIKE 'card-%';

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
