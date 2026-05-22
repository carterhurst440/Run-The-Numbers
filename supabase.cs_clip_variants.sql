-- ============================================================
-- cs_clip_variants
-- Admin-only scratch pad for managing multiple animation
-- options per roll outcome before publishing the chosen one
-- as the live game clip.
--
-- The GAME reads cs_animation_clips (one row per outcome).
-- Admins generate draft variants here, preview them, star
-- the best one (which upserts it into cs_animation_clips),
-- and delete the rest.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cs_clip_variants (
  outcome_base   TEXT    NOT NULL,   -- e.g. 'RED_3'
  variant_num    INT     NOT NULL,   -- 0-4
  frames         FLOAT8[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (outcome_base, variant_num)
);

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
