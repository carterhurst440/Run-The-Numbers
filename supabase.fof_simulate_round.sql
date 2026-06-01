-- Fate or Fortune — server-side single-round battle simulator.
-- Mirrors the JS engine in script.js (fofSimulateOne) so that
-- round outcomes are produced authoritatively by the database
-- and cannot be forged by the client.
--
-- Usage:
--   SELECT public.fof_simulate_round('rogue', 'berserker');           -- random seed
--   SELECT public.fof_simulate_round('rogue', 'berserker', 883194);    -- reproducible
--
-- Returns the same JSONB shape as fofSimulateOne:
--   { roundId, seed, fighterA, fighterB, winner, durationSeconds, events: [...] }
--
-- Resolution order per attack turn (matches JS exactly):
--   1. ATTACK_REPLACED_BY_HEAL / FULL_HEAL  (skips the attack on proc)
--   2. INSTANT_KILL_CHANCE                  (bypasses accuracy + crit)
--   3. Hit/crit resolution                  (CRITICAL_HITS_CANNOT_MISS reorders)
--   4. GUARANTEED_NEXT_CRIT flag            (forces crit on next successful hit)
--   5. Defender DAMAGE_ABSORB_HEAL          (negates damage, heals defender)
--   6. Defender DAMAGE_REFLECTION           (bounces % back at attacker)
--   7. Attacker LIFESTEAL                   (heals attacker for % of damage)
--   8. Defender REVENGE arming              (if crit landed and defender has it)
--   9. BONUS_ATTACK chain                   (max 5 per turn)

-- ── helper: pull first enabled ability of a given type ──────────────
CREATE OR REPLACE FUNCTION public.fof_get_ability(p_abilities JSONB, p_type TEXT)
RETURNS JSONB
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ab
  FROM jsonb_array_elements(COALESCE(p_abilities, '[]'::jsonb)) AS ab
  WHERE ab->>'type' = p_type
    AND COALESCE((ab->>'enabled')::BOOLEAN, FALSE) = TRUE
  LIMIT 1;
$$;

-- ── helper: Mulberry32 one step. Returns (new_state, value 0..1) ────
-- All math is masked to 32 bits to match JavaScript |0 / >>> semantics.
CREATE OR REPLACE FUNCTION public.fof_rng_next(p_state BIGINT)
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
CREATE OR REPLACE FUNCTION public.fof_simulate_round(
  p_fighter_a TEXT,
  p_fighter_b TEXT,
  p_seed      BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  -- Loaded stat rows
  ra public.fate_or_fortune_character_stats%ROWTYPE;
  rb public.fate_or_fortune_character_stats%ROWTYPE;

  -- Per-matchup derived values
  a_hit_chance NUMERIC;  b_hit_chance NUMERIC;
  a_eff_crit   NUMERIC;  b_eff_crit   NUMERIC;

  -- Names for messages
  A_ID TEXT;  B_ID TEXT;
  A_NAME TEXT; B_NAME TEXT;

  -- Ability resolutions (one set per side)
  ab JSONB;
  a_ik_chance NUMERIC := 0;  b_ik_chance NUMERIC := 0;
  a_ik_id TEXT;              b_ik_id TEXT;
  a_cnm BOOLEAN := FALSE;    b_cnm BOOLEAN := FALSE;
  a_cnm_id TEXT;             b_cnm_id TEXT;
  a_rh_chance NUMERIC := 0;  b_rh_chance NUMERIC := 0;
  a_rh_heal NUMERIC := 0;    b_rh_heal NUMERIC := 0;
  a_rh_full BOOLEAN := FALSE; b_rh_full BOOLEAN := FALSE;
  a_rh_no_stack BOOLEAN := FALSE; b_rh_no_stack BOOLEAN := FALSE;
  a_rh_id TEXT;              b_rh_id TEXT;
  a_ls_pct NUMERIC := 0;     b_ls_pct NUMERIC := 0;
  a_ls_id TEXT;              b_ls_id TEXT;
  a_ba_chance NUMERIC := 0;  b_ba_chance NUMERIC := 0;
  a_ba_can_miss BOOLEAN := TRUE; b_ba_can_miss BOOLEAN := TRUE;
  a_ba_can_crit BOOLEAN := TRUE; b_ba_can_crit BOOLEAN := TRUE;
  a_ba_id TEXT;              b_ba_id TEXT;
  a_refl_chance NUMERIC := 0; b_refl_chance NUMERIC := 0;
  a_refl_pct NUMERIC := 0;   b_refl_pct NUMERIC := 0;
  a_refl_id TEXT;            b_refl_id TEXT;
  a_abs_chance NUMERIC := 0; b_abs_chance NUMERIC := 0;
  a_abs_id TEXT;             b_abs_id TEXT;
  a_guar_on_crit BOOLEAN := FALSE; b_guar_on_crit BOOLEAN := FALSE;
  a_rev_id TEXT;             b_rev_id TEXT;

  -- PRNG
  rng_state BIGINT;
  rng_val   DOUBLE PRECISION;

  -- Battle state
  hp_a NUMERIC; hp_b NUMERIC;
  t_a  NUMERIC; t_b  NUMERIC;
  cur_time NUMERIC := 0;
  attacks  INT := 0;
  a_last_heal BOOLEAN := FALSE; b_last_heal BOOLEAN := FALSE;
  a_guar_crit BOOLEAN := FALSE; b_guar_crit BOOLEAN := FALSE;

  -- Turn scratch
  is_a_turn BOOLEAN;
  did_hit BOOLEAN; did_crit BOOLEAN;
  from_revenge BOOLEAN; from_cnm BOOLEAN;
  is_bonus BOOLEAN; chain INT;
  can_miss BOOLEAN; can_crit BOOLEAN;
  dmg NUMERIC; dmg_int INT;
  absorbed BOOLEAN;
  reflect_dmg NUMERIC; reflect_int INT;
  heal_amt NUMERIC; heal_int INT;
  hit_msg TEXT;

  -- Output
  events JSONB := '[]'::jsonb;
  winner JSONB;
  final_t NUMERIC;
  proper_name_a TEXT;
  proper_name_b TEXT;

  T NUMERIC;  -- rounded current time for events

  MAX_ATTACKS CONSTANT INT := 1000;
  MAX_BONUS_CHAIN CONSTANT INT := 5;
BEGIN
  -- Seed
  IF p_seed IS NULL THEN
    p_seed := floor(random() * 1000000)::BIGINT;
  END IF;
  rng_state := p_seed;
  IF rng_state = 0 THEN rng_state := 1; END IF;

  -- Load both fighters
  SELECT * INTO ra FROM public.fate_or_fortune_character_stats WHERE character = p_fighter_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fighter not found: %', p_fighter_a; END IF;
  SELECT * INTO rb FROM public.fate_or_fortune_character_stats WHERE character = p_fighter_b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fighter not found: %', p_fighter_b; END IF;
  IF p_fighter_a = p_fighter_b THEN RAISE EXCEPTION 'Fighters must differ'; END IF;

  A_ID := ra.character;  B_ID := rb.character;
  A_NAME := UPPER(A_ID); B_NAME := UPPER(B_ID);
  proper_name_a := initcap(A_ID);
  proper_name_b := initcap(B_ID);

  -- Derived per-matchup values
  a_hit_chance := ra.accuracy * (1 - rb.dodge);
  b_hit_chance := rb.accuracy * (1 - ra.dodge);
  a_eff_crit := ra.crit_chance * (1 - COALESCE(rb.constitution, 0));
  b_eff_crit := rb.crit_chance * (1 - COALESCE(ra.constitution, 0));

  -- Ability resolution for A
  ab := public.fof_get_ability(ra.special_abilities, 'INSTANT_KILL_CHANCE');
  IF ab IS NOT NULL THEN
    a_ik_chance := COALESCE((ab->'effect'->>'instantKillChance')::NUMERIC, 0);
    a_ik_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'CRITICAL_HITS_CANNOT_MISS');
  IF ab IS NOT NULL THEN a_cnm := TRUE; a_cnm_id := ab->>'id'; END IF;
  ab := COALESCE(
    public.fof_get_ability(ra.special_abilities, 'ATTACK_REPLACED_BY_HEAL'),
    public.fof_get_ability(ra.special_abilities, 'ATTACK_REPLACED_BY_FULL_HEAL')
  );
  IF ab IS NOT NULL THEN
    a_rh_chance := COALESCE((ab->'effect'->>'replaceAttackChance')::NUMERIC, 0);
    a_rh_full := COALESCE((ab->'effect'->>'healToFullHp')::BOOLEAN, FALSE);
    IF a_rh_full THEN
      a_rh_heal := ra.hp;
    ELSE
      a_rh_heal := COALESCE((ab->'effect'->>'healPercentMaxHp')::NUMERIC, 0) * ra.hp;
    END IF;
    a_rh_no_stack := COALESCE((ab->'constraints'->>'cannotTriggerConsecutively')::BOOLEAN, FALSE);
    a_rh_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'LIFESTEAL');
  IF ab IS NOT NULL THEN
    a_ls_pct := COALESCE((ab->'effect'->>'healPercentOfDamageDealt')::NUMERIC, 0);
    a_ls_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'BONUS_ATTACK');
  IF ab IS NOT NULL THEN
    a_ba_chance := COALESCE((ab->'effect'->>'bonusAttackChance')::NUMERIC, 0);
    a_ba_can_miss := COALESCE((ab->'effect'->>'bonusAttackCanMiss')::BOOLEAN, TRUE);
    a_ba_can_crit := COALESCE((ab->'effect'->>'bonusAttackCanCrit')::BOOLEAN, TRUE);
    a_ba_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'DAMAGE_REFLECTION');
  IF ab IS NOT NULL THEN
    a_refl_chance := COALESCE((ab->'effect'->>'reflectChance')::NUMERIC, 0);
    a_refl_pct := COALESCE((ab->'effect'->>'reflectPercent')::NUMERIC, 0);
    a_refl_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'DAMAGE_ABSORB_HEAL');
  IF ab IS NOT NULL THEN
    a_abs_chance := COALESCE((ab->'effect'->>'absorbChance')::NUMERIC, 0);
    a_abs_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(ra.special_abilities, 'GUARANTEED_NEXT_CRIT');
  IF ab IS NOT NULL THEN a_guar_on_crit := TRUE; a_rev_id := ab->>'id'; END IF;

  -- Ability resolution for B (mirror of A)
  ab := public.fof_get_ability(rb.special_abilities, 'INSTANT_KILL_CHANCE');
  IF ab IS NOT NULL THEN
    b_ik_chance := COALESCE((ab->'effect'->>'instantKillChance')::NUMERIC, 0);
    b_ik_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'CRITICAL_HITS_CANNOT_MISS');
  IF ab IS NOT NULL THEN b_cnm := TRUE; b_cnm_id := ab->>'id'; END IF;
  ab := COALESCE(
    public.fof_get_ability(rb.special_abilities, 'ATTACK_REPLACED_BY_HEAL'),
    public.fof_get_ability(rb.special_abilities, 'ATTACK_REPLACED_BY_FULL_HEAL')
  );
  IF ab IS NOT NULL THEN
    b_rh_chance := COALESCE((ab->'effect'->>'replaceAttackChance')::NUMERIC, 0);
    b_rh_full := COALESCE((ab->'effect'->>'healToFullHp')::BOOLEAN, FALSE);
    IF b_rh_full THEN
      b_rh_heal := rb.hp;
    ELSE
      b_rh_heal := COALESCE((ab->'effect'->>'healPercentMaxHp')::NUMERIC, 0) * rb.hp;
    END IF;
    b_rh_no_stack := COALESCE((ab->'constraints'->>'cannotTriggerConsecutively')::BOOLEAN, FALSE);
    b_rh_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'LIFESTEAL');
  IF ab IS NOT NULL THEN
    b_ls_pct := COALESCE((ab->'effect'->>'healPercentOfDamageDealt')::NUMERIC, 0);
    b_ls_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'BONUS_ATTACK');
  IF ab IS NOT NULL THEN
    b_ba_chance := COALESCE((ab->'effect'->>'bonusAttackChance')::NUMERIC, 0);
    b_ba_can_miss := COALESCE((ab->'effect'->>'bonusAttackCanMiss')::BOOLEAN, TRUE);
    b_ba_can_crit := COALESCE((ab->'effect'->>'bonusAttackCanCrit')::BOOLEAN, TRUE);
    b_ba_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'DAMAGE_REFLECTION');
  IF ab IS NOT NULL THEN
    b_refl_chance := COALESCE((ab->'effect'->>'reflectChance')::NUMERIC, 0);
    b_refl_pct := COALESCE((ab->'effect'->>'reflectPercent')::NUMERIC, 0);
    b_refl_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'DAMAGE_ABSORB_HEAL');
  IF ab IS NOT NULL THEN
    b_abs_chance := COALESCE((ab->'effect'->>'absorbChance')::NUMERIC, 0);
    b_abs_id := ab->>'id';
  END IF;
  ab := public.fof_get_ability(rb.special_abilities, 'GUARANTEED_NEXT_CRIT');
  IF ab IS NOT NULL THEN b_guar_on_crit := TRUE; b_rev_id := ab->>'id'; END IF;

  -- Init battle state
  hp_a := ra.hp; hp_b := rb.hp;
  t_a := ra.attack_time; t_b := rb.attack_time;

  -- Main loop
  WHILE hp_a > 0 AND hp_b > 0 AND attacks < MAX_ATTACKS LOOP
    attacks := attacks + 1;

    IF t_a <= t_b THEN
      is_a_turn := TRUE;
      cur_time := t_a;
      t_a := t_a + ra.attack_time;
    ELSE
      is_a_turn := FALSE;
      cur_time := t_b;
      t_b := t_b + rb.attack_time;
    END IF;
    T := round(cur_time, 2);

    -- ── Heal-replace check ─────────────────────────────────────
    IF is_a_turn THEN
      IF a_rh_chance > 0 AND NOT (a_rh_no_stack AND a_last_heal) THEN
        SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
        IF rng_val < a_rh_chance THEN
          hp_a := LEAST(ra.hp, hp_a + a_rh_heal);
          a_last_heal := TRUE;
          events := events || jsonb_build_object(
            'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
            'specialId', COALESCE(a_rh_id, 'heal'),
            'message', A_NAME || ' casts ' || UPPER(COALESCE(a_rh_id, 'heal'))
                       || ', restoring HP to ' || (CASE WHEN a_rh_full THEN 'full' ELSE round(hp_a)::TEXT END)
                       || ' (' || round(hp_a)::TEXT || '/' || round(ra.hp)::TEXT || ').'
          );
          events := events || jsonb_build_object(
            'time', T, 'type', 'HEAL', 'actorId', A_ID,
            'hpAfter', round(hp_a)::INT,
            'message', A_NAME || ' heals to ' || round(hp_a)::TEXT || ' HP.'
          );
          CONTINUE;
        END IF;
      END IF;
      a_last_heal := FALSE;
    ELSE
      IF b_rh_chance > 0 AND NOT (b_rh_no_stack AND b_last_heal) THEN
        SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
        IF rng_val < b_rh_chance THEN
          hp_b := LEAST(rb.hp, hp_b + b_rh_heal);
          b_last_heal := TRUE;
          events := events || jsonb_build_object(
            'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
            'specialId', COALESCE(b_rh_id, 'heal'),
            'message', B_NAME || ' casts ' || UPPER(COALESCE(b_rh_id, 'heal'))
                       || ', restoring HP to ' || (CASE WHEN b_rh_full THEN 'full' ELSE round(hp_b)::TEXT END)
                       || ' (' || round(hp_b)::TEXT || '/' || round(rb.hp)::TEXT || ').'
          );
          events := events || jsonb_build_object(
            'time', T, 'type', 'HEAL', 'actorId', B_ID,
            'hpAfter', round(hp_b)::INT,
            'message', B_NAME || ' heals to ' || round(hp_b)::TEXT || ' HP.'
          );
          CONTINUE;
        END IF;
      END IF;
      b_last_heal := FALSE;
    END IF;

    -- ── Attack with possible bonus chain ────────────────────────
    is_bonus := FALSE;
    chain := 0;
    LOOP
      EXIT WHEN hp_a <= 0 OR hp_b <= 0;

      -- INSTANT_KILL
      IF (is_a_turn AND a_ik_chance > 0) OR (NOT is_a_turn AND b_ik_chance > 0) THEN
        SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
        IF (is_a_turn AND rng_val < a_ik_chance) OR (NOT is_a_turn AND rng_val < b_ik_chance) THEN
          IF is_a_turn THEN
            events := events || jsonb_build_object(
              'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
              'specialId', COALESCE(a_ik_id, 'instant_kill'),
              'message', A_NAME || ' triggers ' || UPPER(COALESCE(a_ik_id, 'instant_kill')) || ' — instantly killing ' || B_NAME || '!'
            );
            dmg_int := round(rb.hp)::INT;
            hp_b := 0;
            events := events || jsonb_build_object(
              'time', T, 'type', 'HIT', 'actorId', A_ID, 'targetId', B_ID,
              'damage', dmg_int, 'targetHpAfter', 0,
              'message', A_NAME || ' delivers a killing blow to ' || B_NAME || '.'
            );
            events := events || jsonb_build_object(
              'time', T, 'type', 'TAKE_DAMAGE', 'actorId', B_ID, 'sourceId', A_ID,
              'damage', dmg_int, 'hpAfter', 0,
              'message', B_NAME || ' takes a fatal blow.'
            );
            IF a_guar_crit THEN a_guar_crit := FALSE; END IF;
          ELSE
            events := events || jsonb_build_object(
              'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
              'specialId', COALESCE(b_ik_id, 'instant_kill'),
              'message', B_NAME || ' triggers ' || UPPER(COALESCE(b_ik_id, 'instant_kill')) || ' — instantly killing ' || A_NAME || '!'
            );
            dmg_int := round(ra.hp)::INT;
            hp_a := 0;
            events := events || jsonb_build_object(
              'time', T, 'type', 'HIT', 'actorId', B_ID, 'targetId', A_ID,
              'damage', dmg_int, 'targetHpAfter', 0,
              'message', B_NAME || ' delivers a killing blow to ' || A_NAME || '.'
            );
            events := events || jsonb_build_object(
              'time', T, 'type', 'TAKE_DAMAGE', 'actorId', A_ID, 'sourceId', B_ID,
              'damage', dmg_int, 'hpAfter', 0,
              'message', A_NAME || ' takes a fatal blow.'
            );
            IF b_guar_crit THEN b_guar_crit := FALSE; END IF;
          END IF;
          EXIT;
        END IF;
      END IF;

      -- Hit/crit roll
      did_hit := FALSE; did_crit := FALSE; from_revenge := FALSE; from_cnm := FALSE;
      IF is_a_turn THEN
        can_miss := (NOT is_bonus) OR a_ba_can_miss;
        can_crit := (NOT is_bonus) OR a_ba_can_crit;
      ELSE
        can_miss := (NOT is_bonus) OR b_ba_can_miss;
        can_crit := (NOT is_bonus) OR b_ba_can_crit;
      END IF;

      IF NOT can_miss THEN
        did_hit := TRUE;
        IF can_crit THEN
          SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
          IF (is_a_turn AND rng_val < a_eff_crit) OR (NOT is_a_turn AND rng_val < b_eff_crit) THEN
            did_crit := TRUE;
          END IF;
        END IF;
      ELSIF (is_a_turn AND a_cnm AND can_crit) OR (NOT is_a_turn AND b_cnm AND can_crit) THEN
        SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
        IF (is_a_turn AND rng_val < a_eff_crit) OR (NOT is_a_turn AND rng_val < b_eff_crit) THEN
          did_hit := TRUE; did_crit := TRUE; from_cnm := TRUE;
        ELSE
          SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
          IF (is_a_turn AND rng_val < a_hit_chance) OR (NOT is_a_turn AND rng_val < b_hit_chance) THEN
            did_hit := TRUE;
          END IF;
        END IF;
      ELSE
        SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
        IF (is_a_turn AND rng_val < a_hit_chance) OR (NOT is_a_turn AND rng_val < b_hit_chance) THEN
          did_hit := TRUE;
          IF can_crit THEN
            SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
            IF (is_a_turn AND rng_val < a_eff_crit) OR (NOT is_a_turn AND rng_val < b_eff_crit) THEN
              did_crit := TRUE;
            END IF;
          END IF;
        END IF;
      END IF;

      -- GUARANTEED_NEXT_CRIT override
      IF did_hit AND can_crit AND ((is_a_turn AND a_guar_crit) OR (NOT is_a_turn AND b_guar_crit)) THEN
        IF NOT did_crit THEN from_revenge := TRUE; END IF;
        did_crit := TRUE;
      END IF;

      IF NOT did_hit THEN
        IF is_a_turn THEN
          events := events || jsonb_build_object(
            'time', T, 'type', 'MISS', 'actorId', A_ID, 'targetId', B_ID,
            'message', A_NAME || ' attacks ' || B_NAME || (CASE WHEN is_bonus THEN ' (bonus)' ELSE '' END) || ' but misses.'
          );
        ELSE
          events := events || jsonb_build_object(
            'time', T, 'type', 'MISS', 'actorId', B_ID, 'targetId', A_ID,
            'message', B_NAME || ' attacks ' || A_NAME || (CASE WHEN is_bonus THEN ' (bonus)' ELSE '' END) || ' but misses.'
          );
        END IF;
      ELSE
        -- Compute damage
        IF is_a_turn THEN dmg := ra.damage; ELSE dmg := rb.damage; END IF;
        IF did_crit THEN
          IF is_a_turn THEN dmg := dmg * ra.crit_mult; ELSE dmg := dmg * rb.crit_mult; END IF;
        END IF;
        dmg_int := round(dmg)::INT;

        -- Defender ABSORB
        absorbed := FALSE;
        IF (is_a_turn AND b_abs_chance > 0) OR (NOT is_a_turn AND a_abs_chance > 0) THEN
          SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
          IF (is_a_turn AND rng_val < b_abs_chance) OR (NOT is_a_turn AND rng_val < a_abs_chance) THEN
            absorbed := TRUE;
            IF is_a_turn THEN
              hp_b := LEAST(rb.hp, hp_b + dmg);
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
                'specialId', COALESCE(b_abs_id, 'absorb'),
                'message', B_NAME || ' activates ' || UPPER(COALESCE(b_abs_id, 'absorb'))
                           || ', fully absorbing ' || dmg_int::TEXT || ' damage and healing for the same amount.'
              );
              events := events || jsonb_build_object(
                'time', T, 'type', (CASE WHEN did_crit THEN 'CRITICAL_HIT' ELSE 'HIT' END),
                'actorId', A_ID, 'targetId', B_ID,
                'damage', dmg_int, 'targetHpAfter', round(hp_b)::INT,
                'absorbed', TRUE,
                'message', A_NAME || (CASE WHEN from_revenge THEN '''s guaranteed REVENGE' WHEN from_cnm THEN '''s DEADEYE' ELSE '' END)
                           || ' ' || (CASE WHEN did_crit THEN 'critical' ELSE 'normal' END)
                           || ' hit on ' || B_NAME || ' is absorbed.'
              );
            ELSE
              hp_a := LEAST(ra.hp, hp_a + dmg);
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
                'specialId', COALESCE(a_abs_id, 'absorb'),
                'message', A_NAME || ' activates ' || UPPER(COALESCE(a_abs_id, 'absorb'))
                           || ', fully absorbing ' || dmg_int::TEXT || ' damage and healing for the same amount.'
              );
              events := events || jsonb_build_object(
                'time', T, 'type', (CASE WHEN did_crit THEN 'CRITICAL_HIT' ELSE 'HIT' END),
                'actorId', B_ID, 'targetId', A_ID,
                'damage', dmg_int, 'targetHpAfter', round(hp_a)::INT,
                'absorbed', TRUE,
                'message', B_NAME || (CASE WHEN from_revenge THEN '''s guaranteed REVENGE' WHEN from_cnm THEN '''s DEADEYE' ELSE '' END)
                           || ' ' || (CASE WHEN did_crit THEN 'critical' ELSE 'normal' END)
                           || ' hit on ' || A_NAME || ' is absorbed.'
              );
            END IF;
          END IF;
        END IF;

        IF NOT absorbed THEN
          -- Apply damage
          IF is_a_turn THEN
            hp_b := hp_b - dmg;
            hit_msg := A_NAME || ' '
              || (CASE WHEN did_crit
                    THEN 'lands a' || (CASE WHEN from_revenge THEN ' guaranteed REVENGE' WHEN from_cnm THEN ' DEADEYE' ELSE '' END) || ' CRITICAL HIT on '
                    ELSE 'hits ' || (CASE WHEN is_bonus THEN '(bonus) ' ELSE '' END)
                  END)
              || B_NAME || ' for ' || dmg_int::TEXT || ' damage.';
            events := events || jsonb_build_object(
              'time', T,
              'type', (CASE WHEN did_crit THEN 'CRITICAL_HIT' ELSE 'HIT' END),
              'actorId', A_ID, 'targetId', B_ID,
              'damage', dmg_int,
              'targetHpAfter', GREATEST(0, round(hp_b))::INT,
              'message', hit_msg
            );
            events := events || jsonb_build_object(
              'time', T,
              'type', (CASE WHEN did_crit THEN 'TAKE_CRITICAL_DAMAGE' ELSE 'TAKE_DAMAGE' END),
              'actorId', B_ID, 'sourceId', A_ID,
              'damage', dmg_int,
              'hpAfter', GREATEST(0, round(hp_b))::INT,
              'message', B_NAME || ' takes ' || dmg_int::TEXT
                         || (CASE WHEN did_crit THEN ' critical' ELSE '' END) || ' damage.'
            );

            -- Defender REVENGE arming (on landed crit)
            IF did_crit AND b_guar_on_crit THEN
              b_guar_crit := TRUE;
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
                'specialId', COALESCE(b_rev_id, 'revenge'),
                'message', B_NAME || ' activates ' || UPPER(COALESCE(b_rev_id, 'revenge'))
                           || '. Next successful attack is guaranteed critical.'
              );
            END IF;

            -- Defender REFLECT
            IF b_refl_chance > 0 AND hp_b > 0 THEN
              SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
              IF rng_val < b_refl_chance THEN
                reflect_dmg := dmg * b_refl_pct;
                reflect_int := round(reflect_dmg)::INT;
                hp_a := hp_a - reflect_dmg;
                events := events || jsonb_build_object(
                  'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
                  'specialId', COALESCE(b_refl_id, 'reflect'),
                  'reflectCrit', did_crit,
                  'message', B_NAME || ' activates ' || UPPER(COALESCE(b_refl_id, 'reflect'))
                             || ', reflecting ' || reflect_int::TEXT || ' damage back to ' || A_NAME || '.'
                );
                events := events || jsonb_build_object(
                  'time', T, 'type', 'TAKE_DAMAGE', 'actorId', A_ID, 'sourceId', B_ID,
                  'damage', reflect_int,
                  'hpAfter', GREATEST(0, round(hp_a))::INT,
                  'reflected', TRUE,
                  'message', A_NAME || ' takes ' || reflect_int::TEXT || ' reflected damage.'
                );
              END IF;
            END IF;

            -- Attacker LIFESTEAL
            IF a_ls_pct > 0 THEN
              heal_amt := dmg * a_ls_pct;
              heal_int := round(heal_amt)::INT;
              IF heal_int > 0 THEN
                hp_a := LEAST(ra.hp, hp_a + heal_amt);
                events := events || jsonb_build_object(
                  'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
                  'specialId', COALESCE(a_ls_id, 'lifesteal'),
                  'message', A_NAME || ' heals ' || heal_int::TEXT || ' HP via ' || UPPER(COALESCE(a_ls_id, 'lifesteal')) || '.'
                );
                events := events || jsonb_build_object(
                  'time', T, 'type', 'HEAL', 'actorId', A_ID,
                  'hpAfter', round(hp_a)::INT,
                  'message', A_NAME || ' heals to ' || round(hp_a)::TEXT || ' HP.'
                );
              END IF;
            END IF;
          ELSE
            hp_a := hp_a - dmg;
            hit_msg := B_NAME || ' '
              || (CASE WHEN did_crit
                    THEN 'lands a' || (CASE WHEN from_revenge THEN ' guaranteed REVENGE' WHEN from_cnm THEN ' DEADEYE' ELSE '' END) || ' CRITICAL HIT on '
                    ELSE 'hits ' || (CASE WHEN is_bonus THEN '(bonus) ' ELSE '' END)
                  END)
              || A_NAME || ' for ' || dmg_int::TEXT || ' damage.';
            events := events || jsonb_build_object(
              'time', T,
              'type', (CASE WHEN did_crit THEN 'CRITICAL_HIT' ELSE 'HIT' END),
              'actorId', B_ID, 'targetId', A_ID,
              'damage', dmg_int,
              'targetHpAfter', GREATEST(0, round(hp_a))::INT,
              'message', hit_msg
            );
            events := events || jsonb_build_object(
              'time', T,
              'type', (CASE WHEN did_crit THEN 'TAKE_CRITICAL_DAMAGE' ELSE 'TAKE_DAMAGE' END),
              'actorId', A_ID, 'sourceId', B_ID,
              'damage', dmg_int,
              'hpAfter', GREATEST(0, round(hp_a))::INT,
              'message', A_NAME || ' takes ' || dmg_int::TEXT
                         || (CASE WHEN did_crit THEN ' critical' ELSE '' END) || ' damage.'
            );

            IF did_crit AND a_guar_on_crit THEN
              a_guar_crit := TRUE;
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
                'specialId', COALESCE(a_rev_id, 'revenge'),
                'message', A_NAME || ' activates ' || UPPER(COALESCE(a_rev_id, 'revenge'))
                           || '. Next successful attack is guaranteed critical.'
              );
            END IF;

            IF a_refl_chance > 0 AND hp_a > 0 THEN
              SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
              IF rng_val < a_refl_chance THEN
                reflect_dmg := dmg * a_refl_pct;
                reflect_int := round(reflect_dmg)::INT;
                hp_b := hp_b - reflect_dmg;
                events := events || jsonb_build_object(
                  'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
                  'specialId', COALESCE(a_refl_id, 'reflect'),
                  'reflectCrit', did_crit,
                  'message', A_NAME || ' activates ' || UPPER(COALESCE(a_refl_id, 'reflect'))
                             || ', reflecting ' || reflect_int::TEXT || ' damage back to ' || B_NAME || '.'
                );
                events := events || jsonb_build_object(
                  'time', T, 'type', 'TAKE_DAMAGE', 'actorId', B_ID, 'sourceId', A_ID,
                  'damage', reflect_int,
                  'hpAfter', GREATEST(0, round(hp_b))::INT,
                  'reflected', TRUE,
                  'message', B_NAME || ' takes ' || reflect_int::TEXT || ' reflected damage.'
                );
              END IF;
            END IF;

            IF b_ls_pct > 0 THEN
              heal_amt := dmg * b_ls_pct;
              heal_int := round(heal_amt)::INT;
              IF heal_int > 0 THEN
                hp_b := LEAST(rb.hp, hp_b + heal_amt);
                events := events || jsonb_build_object(
                  'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
                  'specialId', COALESCE(b_ls_id, 'lifesteal'),
                  'message', B_NAME || ' heals ' || heal_int::TEXT || ' HP via ' || UPPER(COALESCE(b_ls_id, 'lifesteal')) || '.'
                );
                events := events || jsonb_build_object(
                  'time', T, 'type', 'HEAL', 'actorId', B_ID,
                  'hpAfter', round(hp_b)::INT,
                  'message', B_NAME || ' heals to ' || round(hp_b)::TEXT || ' HP.'
                );
              END IF;
            END IF;
          END IF;
        END IF;

        -- Consume attacker's revenge flag on any successful attack
        IF is_a_turn AND a_guar_crit THEN a_guar_crit := FALSE; END IF;
        IF NOT is_a_turn AND b_guar_crit THEN b_guar_crit := FALSE; END IF;
      END IF;

      -- BONUS_ATTACK chain
      is_bonus := FALSE;
      IF did_hit AND hp_a > 0 AND hp_b > 0 AND chain < MAX_BONUS_CHAIN THEN
        IF (is_a_turn AND a_ba_chance > 0) OR (NOT is_a_turn AND b_ba_chance > 0) THEN
          SELECT * INTO rng_state, rng_val FROM public.fof_rng_next(rng_state);
          IF (is_a_turn AND rng_val < a_ba_chance) OR (NOT is_a_turn AND rng_val < b_ba_chance) THEN
            is_bonus := TRUE;
            chain := chain + 1;
            IF is_a_turn THEN
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', A_ID,
                'specialId', COALESCE(a_ba_id, 'bonus_attack'),
                'message', A_NAME || ' triggers ' || UPPER(COALESCE(a_ba_id, 'bonus_attack')) || ' — bonus attack!'
              );
            ELSE
              events := events || jsonb_build_object(
                'time', T, 'type', 'SPECIAL_TRIGGER', 'actorId', B_ID,
                'specialId', COALESCE(b_ba_id, 'bonus_attack'),
                'message', B_NAME || ' triggers ' || UPPER(COALESCE(b_ba_id, 'bonus_attack')) || ' — bonus attack!'
              );
            END IF;
          END IF;
        END IF;
      END IF;

      EXIT WHEN NOT is_bonus;
    END LOOP;
  END LOOP;

  -- Resolve outcome
  final_t := round(cur_time, 2);
  IF hp_a > 0 AND hp_b <= 0 THEN
    events := events || jsonb_build_object('time', final_t, 'type', 'DEFEAT', 'actorId', B_ID, 'message', B_NAME || ' is defeated.');
    events := events || jsonb_build_object('time', final_t, 'type', 'VICTORY', 'actorId', A_ID, 'message', A_NAME || ' wins the battle.');
    winner := jsonb_build_object('id', A_ID, 'name', proper_name_a);
  ELSIF hp_a <= 0 AND hp_b > 0 THEN
    events := events || jsonb_build_object('time', final_t, 'type', 'DEFEAT', 'actorId', A_ID, 'message', A_NAME || ' is defeated.');
    events := events || jsonb_build_object('time', final_t, 'type', 'VICTORY', 'actorId', B_ID, 'message', B_NAME || ' wins the battle.');
    winner := jsonb_build_object('id', B_ID, 'name', proper_name_b);
  ELSE
    events := events || jsonb_build_object('time', final_t, 'type', 'DRAW', 'message', 'Both fighters fall — draw.');
    winner := NULL;
  END IF;

  RETURN jsonb_build_object(
    'roundId', 'round_' || lpad(p_seed::TEXT, 5, '0'),
    'seed', p_seed,
    'fighterA', jsonb_build_object('id', A_ID, 'name', proper_name_a),
    'fighterB', jsonb_build_object('id', B_ID, 'name', proper_name_b),
    'winner', winner,
    'durationSeconds', final_t,
    'events', events
  );
END;
$$;

-- Allow authenticated clients to invoke for testing (the lock RPC will
-- call it server-side; this grant is mostly for admin smoke-testing).
GRANT EXECUTE ON FUNCTION public.fof_simulate_round(TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fof_get_ability(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fof_rng_next(BIGINT) TO authenticated;
