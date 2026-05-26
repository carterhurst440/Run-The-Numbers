-- BLOOM — one-shot: resync flower & card slugs to slugify(display_name).
--
-- Why: slugs were derived from the *original* seed display names. After
-- renaming "Frost Lily" → "Arctic Poppy", the slug stayed `frost_lily`,
-- which looks wrong in the admin DB view. While still in the building
-- phase, this script rewrites slugs in place and cascades through every
-- reference. Idempotent — running again after no further renames is a
-- no-op.
--
-- Scope: flowers + cards only. REGIONS are left alone because their slugs
-- are baked into the pct_<region> column names on bloom_flowers and into
-- the bloom_start_round / bloom_lock_round / bloom_simulate_round CASE
-- branches. Run a separate, more involved migration if you really need
-- to rename a region.
--
-- Cascade targets:
--   FLOWERS  →  bloom_cards.effects (JSONB keys)
--               bloom_regions.hero_flower
--               bloom_rounds.picked_flower, winner_flower
--   CARDS    →  bloom_regions.deck_composition (JSONB keys)
--
-- bloom_rounds FK constraints are temporarily dropped so the PK row can
-- be updated, then restored at the end.

-- ── helper ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bloom_slugify(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9]+', '_', 'g'),
    '^_+|_+$', '', 'g'
  );
$$;

-- ── temporarily drop bloom_rounds FKs so PK updates can propagate ───
ALTER TABLE public.bloom_rounds
  DROP CONSTRAINT IF EXISTS bloom_rounds_picked_flower_fkey,
  DROP CONSTRAINT IF EXISTS bloom_rounds_winner_flower_fkey;

-- ── FLOWERS ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_row      RECORD;
  v_new_slug TEXT;
BEGIN
  FOR v_row IN
    SELECT flower AS old_slug, display_name
    FROM public.bloom_flowers
  LOOP
    v_new_slug := public.bloom_slugify(v_row.display_name);

    -- Skip empty results or no-ops
    IF v_new_slug IS NULL OR v_new_slug = '' THEN CONTINUE; END IF;
    IF v_new_slug = v_row.old_slug THEN CONTINUE; END IF;

    -- Skip if the target slug already exists on another row
    IF EXISTS (
      SELECT 1 FROM public.bloom_flowers
      WHERE flower = v_new_slug AND flower <> v_row.old_slug
    ) THEN
      RAISE NOTICE 'flower: skipping % -> % (slug collision)', v_row.old_slug, v_new_slug;
      CONTINUE;
    END IF;

    -- 1. Rewrite the PK row
    UPDATE public.bloom_flowers SET flower = v_new_slug WHERE flower = v_row.old_slug;

    -- 2. Cascade — rewrite the JSONB key inside every card's effects
    UPDATE public.bloom_cards
    SET effects = (effects - v_row.old_slug)
                  || jsonb_build_object(v_new_slug, effects -> v_row.old_slug)
    WHERE effects ? v_row.old_slug;

    -- 3. Cascade — bloom_regions.hero_flower (TEXT, no FK constraint)
    UPDATE public.bloom_regions
    SET hero_flower = v_new_slug
    WHERE hero_flower = v_row.old_slug;

    -- 4. Cascade — bloom_rounds.picked_flower, winner_flower
    UPDATE public.bloom_rounds SET picked_flower = v_new_slug WHERE picked_flower = v_row.old_slug;
    UPDATE public.bloom_rounds SET winner_flower = v_new_slug WHERE winner_flower = v_row.old_slug;

    RAISE NOTICE 'flower: % -> %', v_row.old_slug, v_new_slug;
  END LOOP;
END $$;

-- ── CARDS ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_row      RECORD;
  v_new_slug TEXT;
BEGIN
  FOR v_row IN
    SELECT card AS old_slug, display_name
    FROM public.bloom_cards
  LOOP
    v_new_slug := public.bloom_slugify(v_row.display_name);

    IF v_new_slug IS NULL OR v_new_slug = '' THEN CONTINUE; END IF;
    IF v_new_slug = v_row.old_slug THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.bloom_cards
      WHERE card = v_new_slug AND card <> v_row.old_slug
    ) THEN
      RAISE NOTICE 'card: skipping % -> % (slug collision)', v_row.old_slug, v_new_slug;
      CONTINUE;
    END IF;

    -- 1. Rewrite the PK row
    UPDATE public.bloom_cards SET card = v_new_slug WHERE card = v_row.old_slug;

    -- 2. Cascade — rewrite the JSONB key inside every region's deck composition
    UPDATE public.bloom_regions
    SET deck_composition = (deck_composition - v_row.old_slug)
                           || jsonb_build_object(v_new_slug, deck_composition -> v_row.old_slug)
    WHERE deck_composition ? v_row.old_slug;

    RAISE NOTICE 'card: % -> %', v_row.old_slug, v_new_slug;
  END LOOP;
END $$;

-- ── restore bloom_rounds FKs ────────────────────────────────────────
ALTER TABLE public.bloom_rounds
  ADD CONSTRAINT bloom_rounds_picked_flower_fkey
    FOREIGN KEY (picked_flower) REFERENCES public.bloom_flowers(flower),
  ADD CONSTRAINT bloom_rounds_winner_flower_fkey
    FOREIGN KEY (winner_flower) REFERENCES public.bloom_flowers(flower);
