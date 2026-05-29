-- BLOOM — start a new round.
-- Server picks a region (uniform random if p_region is NULL/empty, or
-- the explicit slug if provided), creates a pending bloom_rounds row,
-- and returns the region info + all 5 flowers with their per-region
-- win % snapshotted from bloom_flowers.pct_<region>.

-- Drop prior overloads so re-running this file replaces every variant.
DROP FUNCTION IF EXISTS public.bloom_start_round(UUID);
DROP FUNCTION IF EXISTS public.bloom_start_round(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.bloom_start_round(
  p_contest_id UUID DEFAULT NULL,
  p_region     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_round_id   UUID;
  v_region     public.bloom_regions%ROWTYPE;
  v_candidates JSONB := '[]'::jsonb;
  v_flower     public.bloom_flowers%ROWTYPE;
  v_pct        NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Player-chosen region, OR uniform-random if none specified.
  IF p_region IS NOT NULL AND length(trim(p_region)) > 0 THEN
    SELECT * INTO v_region
    FROM public.bloom_regions
    WHERE region = p_region;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Region not found: %', p_region;
    END IF;
  ELSE
    SELECT * INTO v_region
    FROM public.bloom_regions
    ORDER BY random()
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No regions seeded';
    END IF;
  END IF;

  -- Build candidates list (one entry per flower)
  FOR v_flower IN
    SELECT * FROM public.bloom_flowers ORDER BY sort_order
  LOOP
    v_pct := CASE v_region.region
      WHEN 'desert'           THEN v_flower.pct_desert
      WHEN 'rainforest'       THEN v_flower.pct_rainforest
      WHEN 'temperate_forest' THEN v_flower.pct_temperate_forest
      WHEN 'tundra'           THEN v_flower.pct_tundra
      WHEN 'tropical_island'  THEN v_flower.pct_tropical_island
    END;

    v_candidates := v_candidates || jsonb_build_object(
      'flower',       v_flower.flower,
      'name',         v_flower.display_name,
      'accent_color', v_flower.accent_color,
      'bloom_target', v_flower.bloom_target,
      'win_pct',      v_pct,
      'is_hero',      (v_region.hero_flower = v_flower.flower)
    );
  END LOOP;

  -- Persist the pending round
  INSERT INTO public.bloom_rounds (user_id, contest_id, status, region)
  VALUES (v_user_id, p_contest_id, 'pending', v_region.region)
  RETURNING id INTO v_round_id;

  RETURN jsonb_build_object(
    'round_id', v_round_id,
    'region',   jsonb_build_object(
      'slug',        v_region.region,
      'name',        v_region.display_name,
      'identity',    v_region.identity,
      'hero_flower', v_region.hero_flower
    ),
    'candidates',         v_candidates,
    'odds_sample_size',   (SELECT odds_sample_size FROM public.bloom_flowers
                            ORDER BY sort_order LIMIT 1),
    'odds_computed_at',   (SELECT odds_computed_at FROM public.bloom_flowers
                            ORDER BY sort_order LIMIT 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bloom_start_round(UUID, TEXT) TO authenticated;
