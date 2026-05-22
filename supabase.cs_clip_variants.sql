-- ============================================================
-- cs_clip_variants
-- Admin scratch pad AND source of truth for live game clips.
--
-- How it works:
--   • Admins generate up to 5 animation variants per outcome.
--   • Star one variant (starred = TRUE) to make it the live clip.
--   • The GAME reads starred rows from this table first;
--     falls back to cs_animation_clips if none are starred,
--     then bakes a fresh clip if both are empty.
--   • Only one row per outcome_base should have starred = TRUE.
--   • No writes to cs_animation_clips are needed for starring.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cs_clip_variants (
  outcome_base   TEXT    NOT NULL,   -- e.g. 'RED_3'
  variant_num    INT     NOT NULL,   -- 0-4
  frames         FLOAT8[] NOT NULL DEFAULT '{}',
  starred        BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = this is the live game clip
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (outcome_base, variant_num)
);

-- Add starred column if the table already exists (migration):
ALTER TABLE public.cs_clip_variants
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;

-- RLS: authenticated users (admin UI) can do everything.
-- No PII — pure animation frame data.
ALTER TABLE public.cs_clip_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_cs_clip_variants"
  ON public.cs_clip_variants
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

-- ─── RPC: hard-delete a canonical game clip ────────────────────────────────
-- cs_animation_clips has RLS that blocks client-side DELETEs.
-- This SECURITY DEFINER function lets the admin wipe a canonical row
-- so the game will bake a fresh animation on next Color Scheme load.

CREATE OR REPLACE FUNCTION public.admin_delete_cs_clip(p_outcome TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.cs_animation_clips WHERE outcome = p_outcome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_cs_clip(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_cs_clip(TEXT) TO authenticated;
