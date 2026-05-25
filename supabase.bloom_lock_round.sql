-- BLOOM — lock flower pick + wager. Server runs the authoritative
-- bloom_simulate_round, debits the wager, credits prediction-market payout
-- on win (wager / picked_win_pct), forfeits on loss. Writes the full event
-- log + balance snapshot into bloom_rounds.

CREATE OR REPLACE FUNCTION public.bloom_lock_round(
  p_round_id UUID,
  p_flower   TEXT,
  p_wager    NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_round          public.bloom_rounds%ROWTYPE;
  v_flower_row     public.bloom_flowers%ROWTYPE;
  v_picked_win_pct NUMERIC;
  v_sim_result     JSONB;
  v_winner_slug    TEXT;
  v_round_winner   TEXT;
  v_total_returned NUMERIC;
  v_pre_balance    NUMERIC;
  v_new_balance    NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_wager IS NULL OR p_wager <= 0 THEN RAISE EXCEPTION 'Wager must be > 0'; END IF;

  -- Lock the round row for this transaction
  SELECT * INTO v_round
  FROM public.bloom_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF v_round.user_id <> v_user_id THEN RAISE EXCEPTION 'Not your round'; END IF;
  IF v_round.status <> 'pending' THEN RAISE EXCEPTION 'Round already resolved'; END IF;

  -- Validate flower exists, snapshot its pct for this region
  SELECT * INTO v_flower_row
  FROM public.bloom_flowers
  WHERE flower = p_flower;
  IF NOT FOUND THEN RAISE EXCEPTION 'Flower not found: %', p_flower; END IF;

  v_picked_win_pct := CASE v_round.region
    WHEN 'desert'           THEN v_flower_row.pct_desert
    WHEN 'rainforest'       THEN v_flower_row.pct_rainforest
    WHEN 'temperate_forest' THEN v_flower_row.pct_temperate_forest
    WHEN 'tundra'           THEN v_flower_row.pct_tundra
    WHEN 'tropical_island'  THEN v_flower_row.pct_tropical_island
  END;

  IF v_picked_win_pct IS NULL OR v_picked_win_pct <= 0 THEN
    RAISE EXCEPTION 'Odds not computed for % in % — run Master Matrix first',
      p_flower, v_round.region;
  END IF;

  -- Lock the profile row, validate balance
  SELECT credits INTO v_pre_balance
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;
  IF v_pre_balance IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_pre_balance < p_wager THEN
    RAISE EXCEPTION 'Insufficient credits (have %, need %)', v_pre_balance, p_wager;
  END IF;

  -- Run the authoritative simulation in this region
  v_sim_result  := public.bloom_simulate_round(v_round.region, NULL);
  v_winner_slug := v_sim_result->'winner'->>'slug';

  IF v_winner_slug = p_flower THEN
    v_round_winner   := 'hero';
    v_total_returned := p_wager / v_picked_win_pct;   -- prediction-market payout
  ELSE
    v_round_winner   := 'other';
    v_total_returned := 0;                            -- forfeit
  END IF;

  v_new_balance := v_pre_balance - p_wager + v_total_returned;

  -- Settle the profile balance
  UPDATE public.profiles
  SET credits = v_new_balance
  WHERE id = v_user_id;

  -- Persist the resolved round
  UPDATE public.bloom_rounds
  SET status                 = 'resolved',
      locked_at              = NOW(),
      picked_flower          = p_flower,
      picked_win_pct         = v_picked_win_pct,
      winner_flower          = v_winner_slug,
      round_winner           = v_round_winner,
      round_details          = v_sim_result,
      total_wagered          = p_wager,
      total_returned         = v_total_returned,
      pre_hand_account_value = v_pre_balance,
      new_account_value      = v_new_balance
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'round_id',       p_round_id,
    'region',         v_round.region,
    'picked_flower',  p_flower,
    'picked_win_pct', v_picked_win_pct,
    'winner_flower',  v_winner_slug,
    'round_winner',   v_round_winner,
    'total_wagered',  p_wager,
    'total_returned', v_total_returned,
    'net_profit',     v_total_returned - p_wager,
    'pre_balance',    v_pre_balance,
    'new_balance',    v_new_balance,
    'round_details',  v_sim_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bloom_lock_round(UUID, TEXT, NUMERIC) TO authenticated;
