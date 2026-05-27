-- BLOOM — lock multi-flower wagers, simulate, and settle.
-- Replaces the prior single-flower signature. Client sends a JSONB map
-- of {flower_slug: wager_amount}; the server validates, runs the
-- authoritative bloom_simulate_round, finds the winner, pays out only
-- the winning flower's stack (forfeits the rest), and writes the full
-- event log + balance snapshot back to bloom_rounds.

DROP FUNCTION IF EXISTS public.bloom_lock_round(UUID, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.bloom_lock_round(
  p_round_id UUID,
  p_wagers   JSONB
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_round          public.bloom_rounds%ROWTYPE;
  v_total_wagered  NUMERIC := 0;
  v_pre_balance    NUMERIC;
  v_new_balance    NUMERIC;
  v_kv             RECORD;
  v_flower_row     public.bloom_flowers%ROWTYPE;
  v_sim_result     JSONB;
  v_winner_slug    TEXT;
  v_winner_pct     NUMERIC;
  v_winner_wager   NUMERIC := 0;
  v_total_returned NUMERIC := 0;
  v_round_winner   TEXT;
  v_top_slug       TEXT;
  v_top_wager      NUMERIC := -1;
  v_top_pct        NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_wagers IS NULL OR jsonb_typeof(p_wagers) <> 'object' OR p_wagers = '{}'::jsonb THEN
    RAISE EXCEPTION 'Wagers must be a non-empty object';
  END IF;

  -- Lock the round
  SELECT * INTO v_round FROM public.bloom_rounds
    WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF v_round.user_id <> v_user_id THEN RAISE EXCEPTION 'Not your round'; END IF;
  IF v_round.status <> 'pending' THEN RAISE EXCEPTION 'Round already resolved'; END IF;

  -- Walk the wager map. Validate each flower slug + amount, sum totals,
  -- and remember the flower carrying the largest wager (used for the
  -- legacy picked_flower / picked_win_pct columns).
  FOR v_kv IN SELECT key AS slug, (value::TEXT)::NUMERIC AS amount FROM jsonb_each_text(p_wagers) AS j(key, value) LOOP
    IF v_kv.amount IS NULL OR v_kv.amount <= 0 THEN
      RAISE EXCEPTION 'Wager amounts must be > 0 (got % for %)', v_kv.amount, v_kv.slug;
    END IF;
    SELECT * INTO v_flower_row FROM public.bloom_flowers WHERE flower = v_kv.slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown flower: %', v_kv.slug; END IF;
    v_total_wagered := v_total_wagered + v_kv.amount;
    IF v_kv.amount > v_top_wager THEN
      v_top_wager := v_kv.amount;
      v_top_slug  := v_kv.slug;
      v_top_pct   := CASE v_round.region
        WHEN 'desert'           THEN v_flower_row.pct_desert
        WHEN 'rainforest'       THEN v_flower_row.pct_rainforest
        WHEN 'temperate_forest' THEN v_flower_row.pct_temperate_forest
        WHEN 'tundra'           THEN v_flower_row.pct_tundra
        WHEN 'tropical_island'  THEN v_flower_row.pct_tropical_island
      END;
    END IF;
  END LOOP;

  -- Lock the profile and validate balance can cover the total stack.
  SELECT credits INTO v_pre_balance FROM public.profiles
    WHERE id = v_user_id FOR UPDATE;
  IF v_pre_balance IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_pre_balance < v_total_wagered THEN
    RAISE EXCEPTION 'Insufficient credits (have %, need %)', v_pre_balance, v_total_wagered;
  END IF;

  -- Authoritative sim.
  v_sim_result  := public.bloom_simulate_round(v_round.region, NULL);
  v_winner_slug := v_sim_result->'winner'->>'slug';

  -- If the user had a wager on the winning flower, that one stack pays
  -- out (wager / winner_win_pct). All other stacks are forfeit.
  IF v_winner_slug IS NOT NULL AND p_wagers ? v_winner_slug THEN
    v_winner_wager := (p_wagers->>v_winner_slug)::NUMERIC;
    SELECT * INTO v_flower_row FROM public.bloom_flowers WHERE flower = v_winner_slug;
    v_winner_pct := CASE v_round.region
      WHEN 'desert'           THEN v_flower_row.pct_desert
      WHEN 'rainforest'       THEN v_flower_row.pct_rainforest
      WHEN 'temperate_forest' THEN v_flower_row.pct_temperate_forest
      WHEN 'tundra'           THEN v_flower_row.pct_tundra
      WHEN 'tropical_island'  THEN v_flower_row.pct_tropical_island
    END;
    IF v_winner_pct IS NULL OR v_winner_pct <= 0 THEN
      RAISE EXCEPTION 'Odds not computed for % in % — run Master Matrix first',
        v_winner_slug, v_round.region;
    END IF;
    v_total_returned := v_winner_wager / v_winner_pct;
    v_round_winner   := 'hero';
  ELSE
    v_total_returned := 0;
    v_round_winner   := 'other';
  END IF;

  v_new_balance := v_pre_balance - v_total_wagered + v_total_returned;

  UPDATE public.profiles SET credits = v_new_balance WHERE id = v_user_id;

  UPDATE public.bloom_rounds
  SET status                 = 'resolved',
      locked_at              = NOW(),
      wagers                 = p_wagers,
      picked_flower          = v_top_slug,
      picked_win_pct         = v_top_pct,
      winner_flower          = v_winner_slug,
      round_winner           = v_round_winner,
      round_details          = v_sim_result,
      total_wagered          = v_total_wagered,
      total_returned         = v_total_returned,
      pre_hand_account_value = v_pre_balance,
      new_account_value      = v_new_balance
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'round_id',       p_round_id,
    'region',         v_round.region,
    'wagers',         p_wagers,
    'picked_flower',  v_top_slug,
    'picked_win_pct', v_top_pct,
    'winner_flower',  v_winner_slug,
    'winner_wager',   v_winner_wager,
    'winner_win_pct', v_winner_pct,
    'round_winner',   v_round_winner,
    'total_wagered',  v_total_wagered,
    'total_returned', v_total_returned,
    'net_profit',     v_total_returned - v_total_wagered,
    'pre_balance',    v_pre_balance,
    'new_balance',    v_new_balance,
    'round_details',  v_sim_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bloom_lock_round(UUID, JSONB) TO authenticated;
