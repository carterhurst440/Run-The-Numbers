-- Fate or Fortune — lock in hero pick and wager; server simulates the
-- round, debits the wager, credits the prediction-market payout on win
-- (wager / hero_win_pct), refunds the wager on draw, and writes the
-- full event log + balance snapshot into fate_or_fortune_rounds.
--
-- All trust-sensitive math (win %, payout, sim outcome) is computed
-- here — the client passes only the chosen hero and wager.
--
-- Contest-aware: when the round carries a contest_id (stamped by
-- fof_start_round in contest account mode), the wager/payout settle
-- against public.contest_entries.current_credits for that contest, and
-- new_account_value is the post-round contest balance — so the value
-- plots on the cross-player contest journey chart. Otherwise it settles
-- against public.profiles.credits as before.

CREATE OR REPLACE FUNCTION public.fof_lock_round(
  p_round_id UUID,
  p_hero     TEXT,
  p_wager    NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_round          public.fate_or_fortune_rounds%ROWTYPE;
  v_opp_row        public.fate_or_fortune_character_stats%ROWTYPE;
  v_hero_row       public.fate_or_fortune_character_stats%ROWTYPE;
  v_hero_win_pct   NUMERIC;
  v_sim_result     JSONB;
  v_winner_id      TEXT;
  v_round_winner   TEXT;
  v_total_returned NUMERIC;
  v_pre_balance    NUMERIC;
  v_new_balance    NUMERIC;
  v_is_contest     BOOLEAN;
  v_entry          public.contest_entries%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_wager IS NULL OR p_wager <= 0 THEN RAISE EXCEPTION 'Wager must be > 0'; END IF;

  -- Permit the balance write below to pass the
  -- guard_profile_sensitive_fields trigger (same pattern as cs_settle_round /
  -- guess10_apply_balance_delta). Transaction-local (third arg true).
  PERFORM set_config('rtn.allow_sensitive_balance_write', '1', true);

  -- Lock the round row for the duration of this txn
  SELECT * INTO v_round
  FROM public.fate_or_fortune_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF v_round.user_id <> v_user_id THEN RAISE EXCEPTION 'Not your round'; END IF;
  IF v_round.status <> 'pending' THEN RAISE EXCEPTION 'Round already resolved'; END IF;
  IF v_round.opponent_character = p_hero THEN RAISE EXCEPTION 'Hero cannot equal opponent'; END IF;

  v_is_contest := v_round.contest_id IS NOT NULL;

  -- Validate hero exists
  SELECT * INTO v_hero_row
  FROM public.fate_or_fortune_character_stats
  WHERE character = p_hero;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hero not found: %', p_hero; END IF;

  -- Opponent row carries the snapshotted odds
  SELECT * INTO v_opp_row
  FROM public.fate_or_fortune_character_stats
  WHERE character = v_round.opponent_character;

  v_hero_win_pct := CASE p_hero
    WHEN 'knight'    THEN v_opp_row.vs_knight
    WHEN 'rogue'     THEN v_opp_row.vs_rogue
    WHEN 'berserker' THEN v_opp_row.vs_berserker
    WHEN 'mage'      THEN v_opp_row.vs_mage
    WHEN 'assassin'  THEN v_opp_row.vs_assassin
    WHEN 'ranger'    THEN v_opp_row.vs_ranger
    WHEN 'warlock'   THEN v_opp_row.vs_warlock
    WHEN 'paladin'   THEN v_opp_row.vs_paladin
  END;

  IF v_hero_win_pct IS NULL OR v_hero_win_pct <= 0 THEN
    RAISE EXCEPTION 'Odds not computed for % vs % — run Master Matrix first', p_hero, v_round.opponent_character;
  END IF;

  -- Lock the appropriate balance row and validate funds
  IF v_is_contest THEN
    SELECT * INTO v_entry
    FROM public.contest_entries
    WHERE contest_id = v_round.contest_id
      AND user_id    = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Contest entry not found'; END IF;
    v_pre_balance := round(coalesce(v_entry.current_credits, 0)::numeric, 2);
    IF v_pre_balance < p_wager THEN
      RAISE EXCEPTION 'Insufficient contest credits (have %, need %)', v_pre_balance, p_wager;
    END IF;
  ELSE
    SELECT credits INTO v_pre_balance
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_pre_balance IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
    IF v_pre_balance < p_wager THEN
      RAISE EXCEPTION 'Insufficient credits (have %, need %)', v_pre_balance, p_wager;
    END IF;
  END IF;

  -- Run the authoritative simulation. Hero is A so the event log
  -- reads naturally from the player's perspective.
  v_sim_result := public.fof_simulate_round(p_hero, v_round.opponent_character, NULL);
  v_winner_id := v_sim_result->'winner'->>'id';

  IF v_winner_id IS NULL THEN
    v_round_winner := 'draw';
    v_total_returned := p_wager;                   -- refund
  ELSIF v_winner_id = p_hero THEN
    v_round_winner := 'hero';
    v_total_returned := p_wager / v_hero_win_pct;  -- prediction-market payout
  ELSE
    v_round_winner := 'opponent';
    v_total_returned := 0;                          -- forfeit
  END IF;

  v_new_balance := round((v_pre_balance - p_wager + v_total_returned)::numeric, 2);

  -- Settle the balance against the correct ledger
  IF v_is_contest THEN
    UPDATE public.contest_entries
    SET current_credits = greatest(v_new_balance, 0),
        updated_at      = timezone('utc', now())
    WHERE contest_id = v_round.contest_id
      AND user_id    = v_user_id;
  ELSE
    UPDATE public.profiles
    SET credits = v_new_balance
    WHERE id = v_user_id;
  END IF;

  -- Persist the resolved round
  UPDATE public.fate_or_fortune_rounds
  SET status                 = 'resolved',
      locked_at              = NOW(),
      hero_character         = p_hero,
      hero_win_pct           = v_hero_win_pct,
      round_winner           = v_round_winner,
      round_details          = v_sim_result,
      total_wagered          = p_wager,
      total_returned         = v_total_returned,
      pre_hand_account_value = v_pre_balance,
      new_account_value      = v_new_balance
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'round_id', p_round_id,
    'hero', p_hero,
    'opponent', v_round.opponent_character,
    'hero_win_pct', v_hero_win_pct,
    'round_winner', v_round_winner,
    'total_wagered', p_wager,
    'total_returned', v_total_returned,
    'net_profit', v_total_returned - p_wager,
    'pre_balance', v_pre_balance,
    'new_balance', v_new_balance,
    'is_contest', v_is_contest,
    'contest_id', v_round.contest_id,
    'round_details', v_sim_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fof_lock_round(UUID, TEXT, NUMERIC) TO authenticated;
