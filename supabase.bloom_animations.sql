-- BLOOM — animation clips.
-- Single table partitioned by `kind`, identified by (subject, variant).
--   kind = 'region_bg'      → subject = region slug, variant = 'default'
--   kind = 'card_overlay'   → subject = card slug,   variant = 'default'
--   kind = 'flower'         → subject = flower slug, variant = one of:
--       stage_1  stage_2  stage_3  stage_4  stage_5  stage_6
--       transition_1_2  transition_2_3  transition_3_4
--       transition_4_5  transition_5_6  transition_6_bloom
--
-- clip_data is JSONB so additional fields (anchor offsets, frame counts,
-- format hints) can land later without a schema change. Today it carries:
--   { url, duration, loop, notes }
--
-- No FK to bloom_regions / bloom_cards / bloom_flowers — slugs can be
-- renamed and Postgres can't conditional-FK to one of three tables based
-- on `kind`. Admin UI keeps things consistent; orphans are harmless until
-- cleaned up.

CREATE TABLE IF NOT EXISTS public.bloom_animations (
  kind        TEXT NOT NULL
                CHECK (kind IN ('region_bg','card_overlay','flower')),
  subject     TEXT NOT NULL,
  variant     TEXT NOT NULL,
  clip_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, subject, variant)
);

CREATE INDEX IF NOT EXISTS bloom_animations_kind_idx
  ON public.bloom_animations (kind);

ALTER TABLE public.bloom_animations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bloom_animations" ON public.bloom_animations;
CREATE POLICY "auth_all_bloom_animations"
  ON public.bloom_animations
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_animations" ON public.bloom_animations;
CREATE POLICY "anon_read_bloom_animations"
  ON public.bloom_animations
  FOR SELECT
  TO anon
  USING (true);
