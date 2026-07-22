-- BLOOM: server-authoritative round resolution (mirrors mm_play_spin).
--
-- Replaces the old client-trusted bloom_start_round / bloom_settle_round pair,
-- where the browser generated the outcome AND told the server what to pay
-- (bloom_settle_round credited an arbitrary client-supplied p_return — a direct
-- balance-inflation hole). BLOOM has no player choice once a round starts, so the
-- ENTIRE round is resolved here at cast: weather draws, seed-takes, per-plant
-- growth, line detection, pollination triggers and every wheel spin. The client
-- only animates the returned result.
--
-- This is a faithful port of the game engine in games/bloom.html
-- (weatherDeck/drawWeather, castSeeds _took roll, growPlant, lineMultiplier,
-- phasePay, beginPollinate/polSpin) and must stay in lockstep with the admin RTP
-- simulator in script.js (BloomAdmin._growPlant/_phasePay/_weatherDeck/_isLine/
-- simulateFlower/bloomWheelSegments). payScale() is a constant 1 in the client, so
-- there is no global scaler here — house edge lives entirely in the per-flower
-- bloom_pay/weather_odds and the pollination wheel.

create or replace function public.bloom_play_round(
  p_bet integer,
  p_satchel jsonb,
  p_contest_id uuid default null,
  p_round_number integer default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pre numeric; v_new numeric;
  v_pre_cc integer; v_pre_cc_prog integer;
  v_cc_total_prog integer; v_cc_earned integer; v_new_cc integer; v_new_cc_prog integer;
  v_id uuid;

  -- config (DB is the sole authority)
  v_flowers jsonb := '{}'::jsonb;       -- slug -> {take,pay,sm,odds}
  v_deck text[] := array[]::text[];     -- weighted weather-id multiset
  v_butter jsonb := '{}'::jsonb;        -- butterfly weather ids as object keys
  v_wheel numeric[] := array[]::numeric[]; -- flattened wheel multipliers

  -- round
  v_n int := 3;                         -- draws per round (drawsPerRound)
  v_satchel_max int := 10;              -- SATCHEL_SIZE
  v_draws text[] := array[]::text[];
  v_reals text[];
  v_line boolean := false;
  v_wild boolean := false;
  v_board_mult int := 1;

  v_total numeric := 0;
  v_seeds int := 0; v_living int := 0; v_bloom int := 0; v_super int := 0; v_wilt int := 0;
  v_outcomes jsonb := '[]'::jsonb;

  r record;
  i int; j int;
  v_fid text; v_frow jsonb;
  v_take numeric; v_pay numeric; v_sm numeric; v_odds jsonb;
  v_took boolean; v_alive boolean; v_phase int; v_everwilt boolean;
  v_events jsonb; v_wid text; v_b numeric; v_k numeric; v_roll numeric;
  v_base numeric; v_wheelmult numeric; v_seatpay numeric; v_seg int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_bet is null or p_bet < 1 then raise exception 'invalid_bet' using errcode = '22023'; end if;
  if p_satchel is null or jsonb_typeof(p_satchel) <> 'array'
     or jsonb_array_length(p_satchel) < 1
     or jsonb_array_length(p_satchel) > v_satchel_max then
    raise exception 'invalid_satchel' using errcode = '22023';
  end if;

  -- ---- load config ---------------------------------------------------------
  -- flowers: only active rows count (matches the game's active-only roster)
  select coalesce(jsonb_object_agg(flower, jsonb_build_object(
           'take', take_pct,
           'pay',  bloom_pay,
           'sm',   case when super_mult > 0 then super_mult else 2 end,
           'odds', coalesce(weather_odds, '{}'::jsonb))), '{}'::jsonb)
    into v_flowers
    from public.bloom_flowers where active is true;

  -- weather deck weighted by deck_count + butterfly set
  for r in select weather, kind, greatest(0, round(coalesce(deck_count, 1))::int) as cnt
             from public.bloom_weather loop
    if r.kind = 'butterfly' then
      v_butter := v_butter || jsonb_build_object(r.weather, true);
    end if;
    for j in 1 .. r.cnt loop
      v_deck := array_append(v_deck, r.weather);
    end loop;
  end loop;
  if array_length(v_deck, 1) is null then
    select array_agg(weather) into v_deck from public.bloom_weather;   -- fallback: one of each
  end if;
  if array_length(v_deck, 1) is null then
    raise exception 'no_weather' using errcode = 'P0002';
  end if;

  -- pollination wheel: flatten [{m,n}] into a multiplier multiset
  declare v_wheel_raw text; v_wheel_json jsonb;
  begin
    select value into v_wheel_raw from public.bloom_settings where key = 'pollinate_wheel';
    if v_wheel_raw is not null and v_wheel_raw <> '' then
      begin v_wheel_json := v_wheel_raw::jsonb; exception when others then v_wheel_json := null; end;
    end if;
    if v_wheel_json is not null and jsonb_typeof(v_wheel_json) = 'array' then
      for r in select (e->>'m')::numeric as m, round((e->>'n')::numeric)::int as n
                 from jsonb_array_elements(v_wheel_json) e loop
        if r.m > 0 and r.n > 0 then
          for j in 1 .. r.n loop v_wheel := array_append(v_wheel, r.m); end loop;
        end if;
      end loop;
    end if;
  end;
  if array_length(v_wheel, 1) is null or array_length(v_wheel, 1) < 2 then
    v_wheel := array[]::numeric[];   -- default: 9x2, 2x5, 1x10 (mean x3.1667)
    for j in 1 .. 9 loop v_wheel := array_append(v_wheel, 2::numeric); end loop;
    for j in 1 .. 2 loop v_wheel := array_append(v_wheel, 5::numeric); end loop;
    v_wheel := array_append(v_wheel, 10::numeric);
  end if;

  -- ---- wallet lock + funds -------------------------------------------------
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  select credits,
         greatest(coalesce(carter_cash, 0), 0),
         greatest(coalesce(carter_cash_progress, 0), 0)
    into v_pre, v_pre_cc, v_pre_cc_prog
    from public.profiles where id = v_uid for update;
  if v_pre is null then raise exception 'no_profile' using errcode = 'P0002'; end if;
  if v_pre < p_bet then
    raise exception 'insufficient_funds' using errcode = 'P0001',
      detail = format('have %s, need %s', v_pre, p_bet);
  end if;

  -- ---- RNG: weather draws --------------------------------------------------
  for i in 1 .. v_n loop
    v_draws := array_append(v_draws, v_deck[1 + floor(random() * array_length(v_deck, 1))::int]);
  end loop;

  -- line detection: butterflies are wild; a line = all real reels agree
  v_reals := array(select d from unnest(v_draws) d where not (v_butter ? d));
  if array_length(v_reals, 1) is null then
    v_line := true; v_wild := true;                       -- all butterflies (every() on empty = true)
  else
    v_line := (select bool_and(d = v_reals[1]) from unnest(v_reals) d);
    v_wild := array_length(v_reals, 1) < array_length(v_draws, 1);
  end if;
  v_board_mult := case when v_line then (case when v_wild then 2 else 5 end) else 1 end;

  -- ---- per-seat growth + pay ----------------------------------------------
  for i in 0 .. (jsonb_array_length(p_satchel) - 1) loop
    v_fid  := p_satchel->>i;
    v_frow := v_flowers -> v_fid;
    if v_frow is null then
      raise exception 'invalid_satchel' using errcode = '22023';   -- unknown/inactive flower
    end if;
    v_take := (v_frow->>'take')::numeric;
    v_pay  := (v_frow->>'pay')::numeric;
    v_sm   := (v_frow->>'sm')::numeric;
    v_odds := coalesce(v_frow->'odds', '{}'::jsonb);

    v_took     := (random() * 100) < v_take;
    v_alive    := v_took;
    v_phase    := 0;
    v_everwilt := false;
    v_events   := '[]'::jsonb;

    foreach v_wid in array v_draws loop
      if v_butter ? v_wid then
        if not v_alive then
          v_alive := true; v_phase := 0; v_events := v_events || to_jsonb('revive'::text);
        else
          v_events := v_events || to_jsonb('flutter'::text);
        end if;
      elsif not v_alive then
        v_events := v_events || to_jsonb('none'::text);
      else
        v_b := coalesce((v_odds -> v_wid ->> 'b')::numeric, 0);
        v_k := coalesce((v_odds -> v_wid ->> 'k')::numeric, 0);
        v_roll := random() * 100;
        if v_roll < v_b then
          v_phase  := least(2, v_phase + 1);
          v_events := v_events || to_jsonb(case when v_phase = 2 then 'super' else 'bloom' end);
        elsif v_roll < v_b + v_k then
          v_alive := false; v_phase := 0; v_everwilt := true;
          v_events := v_events || to_jsonb('wilt'::text);
        else
          v_events := v_events || to_jsonb('none'::text);
        end if;
      end if;
    end loop;

    if v_took then v_seeds := v_seeds + 1; end if;
    if v_alive then v_living := v_living + 1; end if;
    if v_alive and v_phase = 1 then v_bloom := v_bloom + 1; end if;
    if v_alive and v_phase = 2 then v_super := v_super + 1; end if;
    if v_everwilt and not v_alive then v_wilt := v_wilt + 1; end if;

    -- phasePay/100 * bet (payScale = 1). Only alive + bloomed seats pay.
    if v_alive and v_phase >= 1 then
      v_base := p_bet * ((case when v_phase >= 2 then v_pay * v_sm else v_pay end) / 100.0);
    else
      v_base := 0;
    end if;

    -- On a line, each paying seat spins its own wheel (per-flower "each" mode).
    v_wheelmult := null;
    if v_line then
      if v_base > 0 then
        v_seg := floor(random() * array_length(v_wheel, 1))::int;   -- 0-based uniform segment
        v_wheelmult := v_wheel[v_seg + 1];
        v_seatpay := round(v_base * v_wheelmult, 2);
      else
        v_seatpay := 0;                                             -- non-payer: no spin
      end if;
    else
      v_seatpay := round(v_base, 2);                               -- plain per-seat pay
    end if;
    v_total := v_total + v_seatpay;

    v_outcomes := v_outcomes || jsonb_build_object(
      'fid', v_fid, 'took', v_took, 'events', v_events,
      'pay', v_seatpay, 'wheel', v_wheelmult
    );
  end loop;

  v_total := round(v_total, 2);

  -- ---- credit + Carter Cash (same formula as the old bloom_start_round) ----
  v_cc_total_prog := greatest(0, v_pre_cc_prog + greatest(round(p_bet)::integer, 0));
  v_cc_earned     := floor(v_cc_total_prog / 1000.0);
  v_new_cc        := greatest(0, v_pre_cc + v_cc_earned);
  v_new_cc_prog   := v_cc_total_prog - (v_cc_earned * 1000);

  v_new := round(v_pre - p_bet + v_total, 2);
  update public.profiles
     set credits = v_new, carter_cash = v_new_cc, carter_cash_progress = v_new_cc_prog
   where id = v_uid;

  insert into public.bloom_rounds(
    user_id, contest_id, status, round_number,
    satchel, outcomes, weather_patterns,
    board_mult, all_match, seeds_sprouted, living_count, bloom_count, super_count, wilt_count, pay_scale,
    reels_revealed, total_wagered, total_returned, pre_hand_account_value, new_account_value
  ) values (
    v_uid, p_contest_id, 'resolved', p_round_number,
    p_satchel, v_outcomes,
    jsonb_build_object('reels', to_jsonb(v_draws), 'match', v_line, 'board_mult', v_board_mult),
    v_board_mult, v_line, v_seeds, v_living, v_bloom, v_super, v_wilt, 1,
    v_n, p_bet, v_total, v_pre, v_new
  ) returning id into v_id;

  perform public.increment_profile_hands_played(v_uid, 1, 'game_007');

  return jsonb_build_object(
    'round_id', v_id,
    'draws', to_jsonb(v_draws),
    'outcomes', v_outcomes,
    'board_mult', v_board_mult,
    'all_match', v_line,
    'seeds_sprouted', v_seeds, 'living_count', v_living, 'bloom_count', v_bloom,
    'super_count', v_super, 'wilt_count', v_wilt,
    'total_wagered', p_bet, 'total_returned', v_total,
    'net', round(v_total - p_bet, 2),
    'pre_hand_account_value', v_pre, 'new_account_value', v_new,
    'carter_cash', v_new_cc, 'carter_cash_progress', v_new_cc_prog
  );
end
$function$;

revoke all on function public.bloom_play_round(integer, jsonb, uuid, integer) from public;
grant execute on function public.bloom_play_round(integer, jsonb, uuid, integer) to authenticated;

-- Retire the client-trusted path (bloom_settle_round credited an arbitrary
-- client number — this is the hole being closed).
drop function if exists public.bloom_settle_round(uuid, numeric, jsonb);
drop function if exists public.bloom_start_round(integer, jsonb);
drop function if exists public.bloom_abort_round(uuid);

-- Close any rounds left pending by the old two-phase flow.
update public.bloom_rounds set status = 'aborted' where status = 'pending';
