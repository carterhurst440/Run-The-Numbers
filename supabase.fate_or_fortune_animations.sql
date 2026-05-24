-- Fate or Fortune — animation clips.
-- One row per (character, action). clip_data is JSONB so additional
-- fields (anchor offsets, frame counts, source format) can be added
-- later without a schema change. Today it holds: url, duration, loop,
-- notes. Tomorrow it could hold frames[], lottieJson, spriteSheet,
-- whatever — the client just reads the shape it expects.

CREATE TABLE IF NOT EXISTS public.fate_or_fortune_animations (
  character   TEXT NOT NULL
                REFERENCES public.fate_or_fortune_character_stats(character)
                ON DELETE CASCADE,
  action      TEXT NOT NULL
                CHECK (action IN (
                  'IDLE','HIT','CRITICAL_HIT','TAKE_DAMAGE','TAKE_CRITICAL_DAMAGE',
                  'DODGE','MISS','VICTORY','DEFEAT','SPECIAL'
                )),
  clip_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character, action)
);

ALTER TABLE public.fate_or_fortune_animations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_fof_animations" ON public.fate_or_fortune_animations;
CREATE POLICY "auth_all_fof_animations"
  ON public.fate_or_fortune_animations
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_fof_animations" ON public.fate_or_fortune_animations;
CREATE POLICY "anon_read_fof_animations"
  ON public.fate_or_fortune_animations
  FOR SELECT
  TO anon
  USING (true);
