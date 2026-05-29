-- BLOOM — server-side single-round race simulator.
-- Pure function: returns JSONB, does not write any rows. Round persistence
-- belongs to bloom_start_round / bloom_lock_round (added when betting lands).
--
-- Usage:
--   SELECT public.bloom_simulate_round();                      -- random region, random seed
--   SELECT public.bloom_simulate_round('desert');              -- chosen region, random seed
--   SELECT public.bloom_simulate_round('desert', 883194);      -- reproducible
--
-- Mechanics:
--   * Each draw is an INDEPENDENT pick from the region's full deck — the
--     deck is freshly shuffled before every card (equivalent to a uniform
--     random pick from the expanded deck array). Card frequencies in
--     deck_composition act as weights; cards do not "run out".
--   * Each draw applies that card's effects to every flower:
--       newScore = max(0, oldScore + cardEffect)   -- floor-at-zero
--   * First flower to reach its bloom_target wins immediately.
--     If multiple cross on the same draw, highest post-draw score wins;
--     a true tie is broken by sort_order (lower wins).
--   * A safety cap (MAX_DRAWS) prevents infinite loops on pathological
--     decks. If hit, the leading flower wins via SAFETY_CAP_VICTORY.
--
-- Returns:
--   {
--     roundId, seed, region: { slug, name, identity, deckSize },
--     bloomTarget,
--     flowers: [{ slug, name, sort_order }, ...],
--     winner: { slug, name, finalScore, viaSafetyCap: bool },
--     totalDraws, finalScores: { flower: score },
--     events: [
--       { type: 'DRAW', drawNumber, card, cardName,
--         effects: {flower: delta}, scoresAfter: {flower: score},
--         leader: { flower, name, score }, message },
--       { type: 'BLOOM' | 'SAFETY_CAP_VICTORY', winnerFlower, winnerName,
--         finalScores, message }
--     ]
--   }

-- ── helper: Mulberry32 one step (mirrors fof_rng_next; kept local so the
--    bloom module is self-contained and doesn't depend on fate_or_fortune). ─
CREATE OR REPLACE FUNCTION public.bloom_rng_next(p_state BIGINT)
RETURNS TABLE(state_out BIGINT, value DOUBLE PRECISION)
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  s    BIGINT;
  t    BIGINT;
  prod NUMERIC;
BEGIN
  s := (p_state + 1831565813) & 4294967295;  -- 0x6D2B79F5
  state_out := s;
  t := s;
  -- t = imul(t XOR (t >>> 15), t | 1)
  prod := ((t # (t >> 15)) & 4294967295)::NUMERIC * (t | 1)::NUMERIC;
  t := (prod % 4294967296)::BIGINT;
  -- t = (t + imul(t XOR (t >>> 7), t | 61)) XOR t
  prod := ((t # (t >> 7)) & 4294967295)::NUMERIC * (t | 61)::NUMERIC;
  t := (t # (((t + (prod % 4294967296)::BIGINT)) & 4294967295)) & 4294967295;
  value := ((t # (t >> 14)) & 4294967295)::DOUBLE PRECISION / 4294967296.0;
  RETURN NEXT;
END;
$$;

-- ── main simulator ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bloom_simulate_round(
  p_region TEXT   DEFAULT NULL,
  p_seed   BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_region        public.bloom_regions%ROWTYPE;

  -- Flower arrays (parallel, indexed 1..n_flowers)
  flower_slugs    TEXT[];
  flower_names    TEXT[];
  flower_orders   INT[];
  scores          INT[];
  targets         INT[];
  n_flowers       INT;

  -- Card lookup: slug -> { display_name, effects (JSONB keyed by flower slug) }
  card_names      JSONB := '{}'::jsonb;
  card_effects    JSONB := '{}'::jsonb;
  card_row        RECORD;

  -- Deck (expanded weighted array — sampled with replacement every draw)
  deck            TEXT[];
  deck_size       INT;

  -- PRNG
  rng_state       BIGINT;
  rng_val         DOUBLE PRECISION;

  -- Per-draw scratch
  draw_no         INT := 0;
  i               INT;
  pick_idx        INT;
  card_slug       TEXT;
  card_name       TEXT;
  effects_obj     JSONB;
  delta           INT;
  effects_jb      JSONB;
  scores_after_jb JSONB;
  leader_idx      INT;
  leader_score    INT;
  winner_idx      INT := NULL;
  via_cap         BOOLEAN := FALSE;
  best_score      INT;
  final_scores_jb JSONB;
  events          JSONB := '[]'::jsonb;

  -- ──────────────────────────────────────────────────────────────────
  -- CRITICAL: MAX_DRAWS is a CONSTANT FUSE that has NO RELATION to the
  -- deck size. The deck NEVER runs out — every draw is an independent
  -- uniform pick from the expanded deck array (with replacement). If
  -- the deck has 13 cards, draw 14, 15, 16, ... still keep picking
  -- from those same 13 cards. The loop only exits when a flower hits
  -- its bloom_target OR the MAX_DRAWS fuse trips.
  -- ──────────────────────────────────────────────────────────────────
  MAX_DRAWS CONSTANT INT := 50000;
BEGIN
  -- Resolve region (random if NULL)
  IF p_region IS NULL THEN
    SELECT * INTO v_region
    FROM public.bloom_regions
    ORDER BY random()
    LIMIT 1;
  ELSE
    SELECT * INTO v_region
    FROM public.bloom_regions
    WHERE region = p_region;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Region not found: %', COALESCE(p_region, '<random>');
  END IF;

  -- Seed
  IF p_seed IS NULL THEN
    p_seed := floor(random() * 1000000000)::BIGINT;
  END IF;
  rng_state := p_seed;
  IF rng_state = 0 THEN rng_state := 1; END IF;

  -- Load flowers (parallel arrays, ordered by sort_order)
  SELECT
    array_agg(flower      ORDER BY sort_order),
    array_agg(display_name ORDER BY sort_order),
    array_agg(sort_order  ORDER BY sort_order),
    array_agg(0           ORDER BY sort_order),
    array_agg(bloom_target ORDER BY sort_order)
  INTO flower_slugs, flower_names, flower_orders, scores, targets
  FROM public.bloom_flowers;
  n_flowers := COALESCE(array_length(flower_slugs, 1), 0);
  IF n_flowers = 0 THEN RAISE EXCEPTION 'No flowers seeded'; END IF;

  -- Load card lookup (display_name + effects keyed by slug)
  FOR card_row IN SELECT card, display_name, effects FROM public.bloom_cards LOOP
    card_names   := card_names   || jsonb_build_object(card_row.card, card_row.display_name);
    card_effects := card_effects || jsonb_build_object(card_row.card, card_row.effects);
  END LOOP;

  -- Build the weighted deck array. Each draw is an independent uniform pick
  -- from this array (equivalent to "fresh shuffle, take top card").
  SELECT array_agg(key)
  INTO deck
  FROM (
    SELECT kv.key
    FROM jsonb_each_text(v_region.deck_composition) AS kv(key, value),
         generate_series(1, kv.value::INT)
  ) expanded;
  deck_size := COALESCE(array_length(deck, 1), 0);
  IF deck_size = 0 THEN
    RAISE EXCEPTION 'Region % has an empty deck', v_region.region;
  END IF;

  -- Validate every card slug in the deck exists in bloom_cards
  FOREACH card_slug IN ARRAY deck LOOP
    IF NOT (card_effects ? card_slug) THEN
      RAISE EXCEPTION 'Region % references unknown card "%": seed bloom_cards first',
        v_region.region, card_slug;
    END IF;
  END LOOP;

  -- Main draw loop. Each iteration is a FRESH independent pick from
  -- the deck array (with replacement). The deck array is NEVER mutated
  -- inside this loop — only read by index. The only loop exits are:
  --   (a) a flower reached bloom_target, or
  --   (b) the MAX_DRAWS fuse fired.
  LOOP
    EXIT WHEN winner_idx IS NOT NULL;
    EXIT WHEN draw_no >= MAX_DRAWS;

    draw_no := draw_no + 1;

    -- DEFENSIVE: deck must never change size between draws. If this
    -- ever raises, some code path is mutating the deck array.
    IF array_length(deck, 1) <> deck_size THEN
      RAISE EXCEPTION 'Deck size changed mid-race: was %, now % (draw %)',
        deck_size, array_length(deck, 1), draw_no;
    END IF;

    -- Independent uniform pick from the deck — with replacement, so
    -- the same card can be drawn back-to-back.
    SELECT * INTO rng_state, rng_val FROM public.bloom_rng_next(rng_state);
    pick_idx  := 1 + floor(rng_val * deck_size)::INT;     -- 1..deck_size
    IF pick_idx > deck_size THEN pick_idx := deck_size; END IF;  -- guard rng_val == 1.0
    IF pick_idx < 1          THEN pick_idx := 1;          END IF;  -- guard against any weirdness
    card_slug := deck[pick_idx];

    card_name   := card_names   ->> card_slug;
    effects_obj := card_effects -> card_slug;

    effects_jb      := '{}'::jsonb;
    scores_after_jb := '{}'::jsonb;
    leader_idx      := 1;
    leader_score    := -1;

    -- Apply effects to each flower (floor-at-0)
    FOR i IN 1..n_flowers LOOP
      delta     := COALESCE((effects_obj ->> flower_slugs[i])::INT, 0);
      scores[i] := GREATEST(0, scores[i] + delta);

      effects_jb      := effects_jb      || jsonb_build_object(flower_slugs[i], delta);
      scores_after_jb := scores_after_jb || jsonb_build_object(flower_slugs[i], scores[i]);

      IF scores[i] > leader_score THEN
        leader_idx   := i;
        leader_score := scores[i];
      END IF;
    END LOOP;

    -- Check for winner (highest score among those at/above target;
    -- tiebreak via sort_order = ascending i).
    winner_idx := NULL;
    best_score := -1;
    FOR i IN 1..n_flowers LOOP
      IF scores[i] >= targets[i] AND scores[i] > best_score THEN
        winner_idx := i;
        best_score := scores[i];
      END IF;
    END LOOP;

    events := events || jsonb_build_object(
      'type',         'DRAW',
      'drawNumber',   draw_no,
      'card',         card_slug,
      'cardName',     card_name,
      'effects',      effects_jb,
      'scoresAfter',  scores_after_jb,
      'leader',       jsonb_build_object(
                        'flower', flower_slugs[leader_idx],
                        'name',   flower_names[leader_idx],
                        'score',  leader_score
                      ),
      'message',      'DRAW ' || draw_no || ' — ' || UPPER(card_name)
                      || '. Leader: ' || flower_names[leader_idx]
                      || ' (' || leader_score || ').'
    );
  END LOOP;

  -- Build final-scores JSONB
  final_scores_jb := '{}'::jsonb;
  FOR i IN 1..n_flowers LOOP
    final_scores_jb := final_scores_jb || jsonb_build_object(flower_slugs[i], scores[i]);
  END LOOP;

  -- Safety-cap fallback: pick highest score (tiebreak: sort_order).
  IF winner_idx IS NULL THEN
    via_cap    := TRUE;
    winner_idx := 1;
    FOR i IN 2..n_flowers LOOP
      IF scores[i] > scores[winner_idx] THEN
        winner_idx := i;
      END IF;
    END LOOP;
  END IF;

  events := events || jsonb_build_object(
    'type',         CASE WHEN via_cap THEN 'SAFETY_CAP_VICTORY' ELSE 'BLOOM' END,
    'winnerFlower', flower_slugs[winner_idx],
    'winnerName',   flower_names[winner_idx],
    'finalScores',  final_scores_jb,
    'message',      CASE WHEN via_cap
                      THEN 'Safety cap (' || MAX_DRAWS || ' draws) hit — '
                           || UPPER(flower_names[winner_idx])
                           || ' leads at ' || scores[winner_idx] || '.'
                      ELSE UPPER(flower_names[winner_idx])
                           || ' blooms first after ' || draw_no || ' draws!'
                    END
  );

  RETURN jsonb_build_object(
    'roundId', 'bloom_' || lpad(p_seed::TEXT, 6, '0'),
    'seed',    p_seed,
    'region',  jsonb_build_object(
      'slug',     v_region.region,
      'name',     v_region.display_name,
      'identity', v_region.identity,
      'deckSize', deck_size
    ),
    'bloomTarget', targets[1],
    'flowers', (
      SELECT jsonb_agg(jsonb_build_object(
        'slug', flower_slugs[k],
        'name', flower_names[k],
        'sort_order', flower_orders[k]
      ) ORDER BY flower_orders[k])
      FROM generate_series(1, n_flowers) AS k
    ),
    'winner', jsonb_build_object(
      'slug',         flower_slugs[winner_idx],
      'name',         flower_names[winner_idx],
      'finalScore',   scores[winner_idx],
      'viaSafetyCap', via_cap
    ),
    'totalDraws',  draw_no,
    'finalScores', final_scores_jb,
    'events',      events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bloom_rng_next(BIGINT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloom_simulate_round(TEXT, BIGINT) TO authenticated;
