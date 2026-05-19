-- ============================================================
-- Color Scheme: server-side round settlement
--
-- Run AFTER supabase.color_scheme_contest_and_nav.sql
--
-- Creates:
--   1. cs_settle_round(p_round_id uuid)
--      SECURITY DEFINER function that settles all bets,
--      credits the winner, marks the round 'completed',
--      and increments profile hands-played progress.
--
--   2. cs_settle_round_trigger()
--      Thin trigger wrapper that calls cs_settle_round.
--
--   3. trg_cs_settle_on_roll3  (AFTER UPDATE on color_scheme_rounds)
--      Fires the moment roll_3 is written by cs_perform_roll.
--
-- After this migration the JS client (csSettleBetsOnServer) will
-- detect that total_wagered > 0 (written by the trigger) and skip
-- all redundant DB writes, acting only as a UI updater.
-- ============================================================


-- ============================================================
-- 1. cs_settle_round(p_round_id uuid)
-- ============================================================
create or replace function public.cs_settle_round(p_round_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_round            record;
  v_user_id          uuid;

  -- Color totals from the settled round
  v_red              numeric;
  v_blue             numeric;
  v_yellow           numeric;
  v_purple           numeric;
  v_green            numeric;
  v_orange           numeric;
  v_grand            numeric;
  v_pre_hand         numeric;

  -- Winning color / type derived from totals
  v_max_color_val    numeric;
  v_color_winner_cnt integer;
  v_winning_color    text;
  v_primary_sum      numeric;
  v_secondary_sum    numeric;
  v_winning_type     text;

  -- Per-bet iteration
  v_bet              record;
  v_won              boolean;
  v_odds             numeric;
  v_base             numeric;
  v_payout           numeric;
  v_amount_returned  numeric(12,2);
  v_bet_net          numeric(12,2);

  -- Round-level settlement accumulators
  v_total_wagered    numeric(12,2) := 0;
  v_total_returned   numeric(12,2) := 0;
  v_net_profit       numeric(12,2);
  v_new_acct_value   numeric(12,2);

  -- Fallback balance from profiles when pre_hand is missing
  v_current_credits  numeric(12,2);
begin
  -- Allow writes guarded by guard_profile_sensitive_fields
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  -- Lock the round row to prevent concurrent settlement
  select *
  into v_round
  from public.color_scheme_rounds
  where id = p_round_id
  for update;

  if not found then
    return;
  end if;

  -- ── Guard: skip if already settled or abandoned ───────────────────────
  if v_round.status in ('completed', 'abandoned') then
    return;
  end if;
  if coalesce(v_round.total_wagered, 0) > 0 then
    return;  -- already written (double-fire protection)
  end if;

  -- Must have all 3 rolls and a non-zero grand total
  if v_round.roll_3 is null or coalesce(v_round.grand_total, 0) = 0 then
    return;
  end if;

  -- ── Unpack color totals ───────────────────────────────────────────────
  v_user_id   := v_round.user_id;
  v_red       := coalesce(v_round.red_total,    0);
  v_blue      := coalesce(v_round.blue_total,   0);
  v_yellow    := coalesce(v_round.yellow_total, 0);
  v_purple    := coalesce(v_round.purple_total, 0);
  v_green     := coalesce(v_round.green_total,  0);
  v_orange    := coalesce(v_round.orange_total, 0);
  v_grand     := coalesce(v_round.grand_total,  0);
  v_pre_hand  := coalesce(v_round.pre_hand_account_value, 0);

  -- ── Determine winning COLOR ───────────────────────────────────────────
  -- The color with the highest total wins; ties → COLOR_TIE
  v_max_color_val := greatest(v_red, v_blue, v_yellow, v_purple, v_green, v_orange);
  v_color_winner_cnt :=
    (case when v_red    = v_max_color_val then 1 else 0 end) +
    (case when v_blue   = v_max_color_val then 1 else 0 end) +
    (case when v_yellow = v_max_color_val then 1 else 0 end) +
    (case when v_purple = v_max_color_val then 1 else 0 end) +
    (case when v_green  = v_max_color_val then 1 else 0 end) +
    (case when v_orange = v_max_color_val then 1 else 0 end);

  v_winning_color :=
    case
      when v_color_winner_cnt > 1   then 'COLOR_TIE'
      when v_red    = v_max_color_val then 'RED'
      when v_blue   = v_max_color_val then 'BLUE'
      when v_yellow = v_max_color_val then 'YELLOW'
      when v_purple = v_max_color_val then 'PURPLE'
      when v_green  = v_max_color_val then 'GREEN'
      else                               'ORANGE'
    end;

  -- ── Determine winning TYPE ────────────────────────────────────────────
  -- PRIMARY = RED+BLUE+YELLOW, SECONDARY = PURPLE+GREEN+ORANGE
  v_primary_sum   := v_red + v_blue + v_yellow;
  v_secondary_sum := v_purple + v_green + v_orange;

  v_winning_type :=
    case
      when v_primary_sum > v_secondary_sum   then 'TYPE_PRIMARY'
      when v_secondary_sum > v_primary_sum   then 'TYPE_SECONDARY'
      else                                        'TYPE_TIE'
    end;

  -- ── Process each bet ─────────────────────────────────────────────────
  for v_bet in
    select id, bet_key, amount_wagered
    from   public.color_scheme_bets
    where  round_id = p_round_id
  loop
    -- Determine win/loss (mirrors csIsCurrentlyWinning in JS)
    v_won := case v_bet.bet_key
      -- ── Solid color bets ──────────────────────────────────────────
      when 'RED'            then v_winning_color = 'RED'
      when 'BLUE'           then v_winning_color = 'BLUE'
      when 'YELLOW'         then v_winning_color = 'YELLOW'
      when 'PURPLE'         then v_winning_color = 'PURPLE'
      when 'GREEN'          then v_winning_color = 'GREEN'
      when 'ORANGE'         then v_winning_color = 'ORANGE'
      when 'COLOR_TIE'      then v_winning_color = 'COLOR_TIE'
      -- ── Type bets ─────────────────────────────────────────────────
      when 'TYPE_PRIMARY'   then v_winning_type = 'TYPE_PRIMARY'
      when 'TYPE_SECONDARY' then v_winning_type = 'TYPE_SECONDARY'
      when 'TYPE_TIE'       then v_winning_type = 'TYPE_TIE'
      -- ── Purple range bets ──────────────────────────────────────────
      when 'PUR_LO'         then v_purple between 1  and 16
      when 'PUR_MID'        then v_purple between 17 and 30
      when 'PUR_HI'         then v_purple >= 31
      -- ── Green range bets ───────────────────────────────────────────
      when 'GRN_LO'         then v_green  between 1  and 16
      when 'GRN_MID'        then v_green  between 17 and 30
      when 'GRN_HI'         then v_green  >= 31
      -- ── Orange range bets ──────────────────────────────────────────
      when 'ORG_LO'         then v_orange between 1  and 16
      when 'ORG_MID'        then v_orange between 17 and 30
      when 'ORG_HI'         then v_orange >= 31
      -- ── Blue exact-count bets ──────────────────────────────────────
      when 'BLU_1'          then v_blue = 1
      when 'BLU_2'          then v_blue = 2
      when 'BLU_3'          then v_blue = 3
      when 'BLU_4'          then v_blue = 4
      when 'BLU_5'          then v_blue = 5
      when 'BLU_6'          then v_blue = 6
      when 'BLU_7P'         then v_blue >= 7
      -- ── Red exact-count bets ───────────────────────────────────────
      when 'RED_1'          then v_red = 1
      when 'RED_2'          then v_red = 2
      when 'RED_3'          then v_red = 3
      when 'RED_4'          then v_red = 4
      when 'RED_5'          then v_red = 5
      when 'RED_6'          then v_red = 6
      when 'RED_7P'         then v_red >= 7
      -- ── Yellow exact-count bets ────────────────────────────────────
      when 'YEL_1'          then v_yellow = 1
      when 'YEL_2'          then v_yellow = 2
      when 'YEL_3'          then v_yellow = 3
      when 'YEL_4'          then v_yellow = 4
      when 'YEL_5'          then v_yellow = 5
      when 'YEL_6'          then v_yellow = 6
      when 'YEL_7P'         then v_yellow >= 7
      -- ── Grand-total range bets ─────────────────────────────────────
      when 'TOT_A'          then v_grand between 1  and 10
      when 'TOT_B'          then v_grand between 11 and 20
      when 'TOT_C'          then v_grand between 21 and 36
      when 'TOT_D'          then v_grand between 37 and 52
      when 'TOT_E'          then v_grand between 53 and 75
      when 'TOT_F'          then v_grand >= 76
      else false
    end;

    -- Look up payout multiplier (mirrors CS_ODDS in JS)
    v_odds := case v_bet.bet_key
      when 'RED'            then 9
      when 'BLUE'           then 9
      when 'YELLOW'         then 9
      when 'PURPLE'         then 5
      when 'GREEN'          then 5
      when 'ORANGE'         then 5
      when 'COLOR_TIE'      then 3
      when 'TYPE_PRIMARY'   then 1   -- 5 % vig applied below
      when 'TYPE_SECONDARY' then 1
      when 'TYPE_TIE'       then 50
      when 'PUR_LO'         then 3
      when 'PUR_MID'        then 9
      when 'PUR_HI'         then 31
      when 'GRN_LO'         then 3
      when 'GRN_MID'        then 9
      when 'GRN_HI'         then 31
      when 'ORG_LO'         then 3
      when 'ORG_MID'        then 9
      when 'ORG_HI'         then 31
      when 'BLU_1'          then 11
      when 'BLU_2'          then 10
      when 'BLU_3'          then 10
      when 'BLU_4'          then 9
      when 'BLU_5'          then 9
      when 'BLU_6'          then 8
      when 'BLU_7P'         then 5
      when 'RED_1'          then 11
      when 'RED_2'          then 10
      when 'RED_3'          then 10
      when 'RED_4'          then 9
      when 'RED_5'          then 9
      when 'RED_6'          then 8
      when 'RED_7P'         then 5
      when 'YEL_1'          then 11
      when 'YEL_2'          then 10
      when 'YEL_3'          then 10
      when 'YEL_4'          then 9
      when 'YEL_5'          then 9
      when 'YEL_6'          then 8
      when 'YEL_7P'         then 5
      when 'TOT_A'          then 10
      when 'TOT_B'          then 3
      when 'TOT_C'          then 2
      when 'TOT_D'          then 4
      when 'TOT_E'          then 7
      when 'TOT_F'          then 28
      else 0
    end;

    -- Compute gross payout (FLOOR matches JS Math.floor)
    -- TYPE_PRIMARY has a 5 % house vig: net gain = FLOOR(wager * 0.95)
    v_base   := case when v_won then floor(v_bet.amount_wagered * v_odds) else 0 end;
    v_payout := case
      when v_won and v_bet.bet_key = 'TYPE_PRIMARY' then floor(v_base * 0.95)
      else v_base
    end;

    v_amount_returned := case when v_won then v_bet.amount_wagered + v_payout else 0 end;
    v_bet_net         := case when v_won then v_payout else -v_bet.amount_wagered end;

    -- Write outcome back to the bet row
    update public.color_scheme_bets
    set
      outcome         = case when v_won then 'W' else 'L' end,
      amount_returned = v_amount_returned,
      net_profit      = v_bet_net,
      raw             = jsonb_build_object(
                          'totals', jsonb_build_object(
                            'RED',    v_red,
                            'BLUE',   v_blue,
                            'YELLOW', v_yellow,
                            'PURPLE', v_purple,
                            'GREEN',  v_green,
                            'ORANGE', v_orange
                          ),
                          'grand_total', v_grand,
                          'settled_by',  'server_trigger'
                        )
    where id = v_bet.id;

    -- Accumulate totals
    v_total_wagered  := v_total_wagered  + v_bet.amount_wagered;
    v_total_returned := v_total_returned + v_amount_returned;
  end loop;

  v_net_profit := v_total_returned - v_total_wagered;

  -- ── Compute final account value ───────────────────────────────────────
  -- Primary: pre_hand_account_value + net_profit
  --   (pre_hand = bankroll BEFORE bets, so this is independent of whether
  --    persistBankroll() ran before the round ended)
  -- Fallback: profiles.credits + total_returned
  --   (assumes persistBankroll already deducted wagers from credits)
  if v_pre_hand > 0 then
    v_new_acct_value := round((v_pre_hand + v_net_profit)::numeric, 2);
  else
    select credits
    into   v_current_credits
    from   public.profiles
    where  id = v_user_id;

    v_new_acct_value := round(
      (coalesce(v_current_credits, 0) + v_total_returned)::numeric,
      2
    );
  end if;

  -- ── Settle the round ──────────────────────────────────────────────────
  update public.color_scheme_rounds
  set
    total_wagered     = v_total_wagered,
    total_returned    = v_total_returned,
    net_profit        = v_net_profit,
    new_account_value = v_new_acct_value,
    status            = 'completed'
  where id = p_round_id;

  -- ── Update profile balance ────────────────────────────────────────────
  -- set_config above allows this past the guard_profile_sensitive_fields trigger
  if v_total_wagered > 0 then
    update public.profiles
    set credits = v_new_acct_value
    where id = v_user_id;

    -- Increment color scheme rounds played + rank recompute
    perform public.increment_profile_hands_played(v_user_id, 1, 'game_004');
  else
    -- No bets were placed — just mark round completed, don't touch credits
    null;
  end if;

end;
$$;


-- ============================================================
-- 2. Trigger wrapper function
-- ============================================================
create or replace function public.cs_settle_round_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Fire settlement asynchronously-safe: the FOR UPDATE inside
  -- cs_settle_round handles concurrent calls gracefully.
  perform public.cs_settle_round(NEW.id);
  return NEW;
end;
$$;


-- ============================================================
-- 3. Trigger on color_scheme_rounds
--    Fires AFTER UPDATE on either of two writes that cs_perform_roll
--    may make on the 3rd roll:
--
--    Path A — roll_3 and grand_total written in the same statement:
--      OLD.roll_3 IS NULL, NEW.roll_3 IS NOT NULL, grand_total > 0
--
--    Path B — grand_total written in a separate statement after roll_3:
--      roll_3 already present, grand_total just became > 0
--
--    The FOR UPDATE + total_wagered > 0 guard inside cs_settle_round
--    prevents double-settlement if both paths somehow fire.
-- ============================================================
drop trigger if exists trg_cs_settle_on_roll3 on public.color_scheme_rounds;

create trigger trg_cs_settle_on_roll3
  after update on public.color_scheme_rounds
  for each row
  when (
    -- shared guards
    NEW.status not in ('completed', 'abandoned')
    and coalesce(OLD.total_wagered, 0) = 0
    and (
      -- Path A: roll_3 just written, grand_total already present
      (
        OLD.roll_3 is null
        and NEW.roll_3 is not null
        and coalesce(NEW.grand_total, 0) > 0
      )
      or
      -- Path B: grand_total just written after roll_3 was already set
      (
        NEW.roll_3 is not null
        and coalesce(OLD.grand_total, 0) = 0
        and coalesce(NEW.grand_total, 0) > 0
      )
    )
  )
  execute function public.cs_settle_round_trigger();


-- ============================================================
-- Grants
-- ============================================================
-- cs_settle_round is SECURITY DEFINER — authenticated users
-- should not be able to call it directly from the client.
-- Do NOT grant execute to authenticated or anon.
-- (The trigger fires as the table owner; no client grant needed.)

revoke execute on function public.cs_settle_round(uuid)
  from authenticated, anon;

revoke execute on function public.cs_settle_round_trigger()
  from authenticated, anon;
