-- Fate or Fortune — start a new round.
-- Server picks the opponent, creates a pending round row, and returns
-- the opponent's full stats + the 7 candidate heroes with their win % (snapshotted
-- from the precomputed master matrix on the opponent's row).
--
-- The client uses this payload to render the hero-selection screen.
-- All odds come from `vs_*` columns on the opponent's stat row, so the
-- player cannot manipulate them.

CREATE OR REPLACE FUNCTION public.fof_start_round(
  p_contest_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_round_id   UUID;
  v_opp        TEXT;
  v_opp_row    public.fate_or_fortune_character_stats%ROWTYPE;
  v_candidates JSONB := '[]'::jsonb;
  v_char       public.fate_or_fortune_character_stats%ROWTYPE;
  v_win_pct    NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pick opponent uniformly at random
  SELECT character INTO v_opp
  FROM public.fate_or_fortune_character_stats
  ORDER BY random()
  LIMIT 1;

  -- Load opponent's row (carries all 7 vs_* odds)
  SELECT * INTO v_opp_row
  FROM public.fate_or_fortune_character_stats
  WHERE character = v_opp;

  -- Build candidates list
  FOR v_char IN
    SELECT * FROM public.fate_or_fortune_character_stats
    WHERE character <> v_opp
    ORDER BY character
  LOOP
    v_win_pct := CASE v_char.character
      WHEN 'knight'    THEN v_opp_row.vs_knight
      WHEN 'rogue'     THEN v_opp_row.vs_rogue
      WHEN 'berserker' THEN v_opp_row.vs_berserker
      WHEN 'mage'      THEN v_opp_row.vs_mage
      WHEN 'assassin'  THEN v_opp_row.vs_assassin
      WHEN 'ranger'    THEN v_opp_row.vs_ranger
      WHEN 'warlock'   THEN v_opp_row.vs_warlock
      WHEN 'paladin'   THEN v_opp_row.vs_paladin
    END;

    v_candidates := v_candidates || jsonb_build_object(
      'character', v_char.character,
      'name', initcap(v_char.character),
      'win_pct', v_win_pct,
      'stats', jsonb_build_object(
        'hp', v_char.hp,
        'damage', v_char.damage,
        'crit_mult', v_char.crit_mult,
        'crit_chance', v_char.crit_chance,
        'accuracy', v_char.accuracy,
        'dodge', v_char.dodge,
        'attack_time', v_char.attack_time,
        'constitution', v_char.constitution
      ),
      'special_abilities', v_char.special_abilities
    );
  END LOOP;

  -- Persist the pending round
  INSERT INTO public.fate_or_fortune_rounds (user_id, contest_id, status, opponent_character)
  VALUES (v_user_id, p_contest_id, 'pending', v_opp)
  RETURNING id INTO v_round_id;

  RETURN jsonb_build_object(
    'round_id', v_round_id,
    'opponent', jsonb_build_object(
      'character', v_opp_row.character,
      'name', initcap(v_opp_row.character),
      'stats', jsonb_build_object(
        'hp', v_opp_row.hp,
        'damage', v_opp_row.damage,
        'crit_mult', v_opp_row.crit_mult,
        'crit_chance', v_opp_row.crit_chance,
        'accuracy', v_opp_row.accuracy,
        'dodge', v_opp_row.dodge,
        'attack_time', v_opp_row.attack_time,
        'constitution', v_opp_row.constitution
      ),
      'special_abilities', v_opp_row.special_abilities
    ),
    'candidates', v_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fof_start_round(UUID) TO authenticated;
