create or replace function public.guess10_selection_label(
  _category text,
  _selection_values jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_category text := lower(trim(coalesce(_category, '')));
  v_values text[];
begin
  select coalesce(array_agg(value order by ordinality), array[]::text[])
  into v_values
  from jsonb_array_elements_text(coalesce(_selection_values, '[]'::jsonb)) with ordinality as j(value, ordinality);

  if v_category = 'color' then
    return upper(coalesce(v_values[1], ''));
  elsif v_category = 'suit' then
    return array_to_string(
      array(
        select upper(value)
        from unnest(v_values) as value
      ),
      ' + '
    );
  elsif v_category = 'rank' then
    return array_to_string(v_values, ' + ');
  end if;

  return '';
end;
$$;

create or replace function public.guess10_validate_selection(
  _category text,
  _selection_values jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_category text := lower(trim(coalesce(_category, '')));
  v_values text[];
  v_count integer;
  v_allowed text[];
begin
  if jsonb_typeof(coalesce(_selection_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Selection values must be an array.';
  end if;

  select coalesce(array_agg(distinct upper(trim(value)) order by upper(trim(value))), array[]::text[])
  into v_values
  from jsonb_array_elements_text(coalesce(_selection_values, '[]'::jsonb)) as j(value)
  where trim(coalesce(value, '')) <> '';

  v_count := coalesce(array_length(v_values, 1), 0);

  if v_category = 'color' then
    if v_count <> 1 then
      raise exception 'Guess 10 color selections must include exactly one value.';
    end if;
    if v_values[1] not in ('RED', 'BLACK') then
      raise exception 'Guess 10 color selection must be RED or BLACK.';
    end if;
  elsif v_category = 'suit' then
    if v_count < 1 or v_count > 3 then
      raise exception 'Guess 10 suit selections must include 1 to 3 suits.';
    end if;
    v_allowed := array['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
    if exists (
      select 1
      from unnest(v_values) as value
      where value <> all(v_allowed)
    ) then
      raise exception 'Guess 10 suit selections must be Hearts, Diamonds, Clubs, or Spades.';
    end if;
  elsif v_category = 'rank' then
    if v_count < 1 or v_count > 12 then
      raise exception 'Guess 10 rank selections must include 1 to 12 ranks.';
    end if;
    v_allowed := array['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    if exists (
      select 1
      from unnest(v_values) as value
      where value <> all(v_allowed)
    ) then
      raise exception 'Guess 10 rank selections must use standard card ranks.';
    end if;
  else
    raise exception 'Guess 10 category must be color, suit, or rank.';
  end if;

  return to_jsonb(v_values);
end;
$$;

create or replace function public.guess10_multiplier(
  _category text,
  _selection_values jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_category text := lower(trim(coalesce(_category, '')));
  v_count integer;
begin
  v_count := coalesce(jsonb_array_length(public.guess10_validate_selection(_category, _selection_values)), 0);

  if v_category = 'color' then
    return 2;
  elsif v_category = 'suit' then
    return round((4.0 / greatest(v_count, 1))::numeric, 6);
  elsif v_category = 'rank' then
    return round((13.0 / greatest(v_count, 1))::numeric, 6);
  end if;

  return 0;
end;
$$;

create or replace function public.guess10_commission_rate(_rung integer)
returns numeric
language sql
immutable
as $$
  select case greatest(coalesce(_rung, 0), 0)
    when 1 then 0.10
    when 2 then 0.09
    when 3 then 0.08
    when 4 then 0.07
    when 5 then 0.06
    when 6 then 0.05
    when 7 then 0.04
    when 8 then 0.03
    when 9 then 0.02
    when 10 then 0.01
    else 0
  end
$$;

create or replace function public.guess10_draw_random_card()
returns table(label text, suit text, suit_name text, color text)
language plpgsql
as $$
declare
  v_rank integer := floor(random() * 13)::integer + 1;
  v_suit_index integer := floor(random() * 4)::integer + 1;
begin
  label := case
    when v_rank = 1 then 'A'
    when v_rank = 11 then 'J'
    when v_rank = 12 then 'Q'
    when v_rank = 13 then 'K'
    else v_rank::text
  end;

  suit := case v_suit_index
    when 1 then '♥'
    when 2 then '♦'
    when 3 then '♣'
    else '♠'
  end;

  suit_name := case v_suit_index
    when 1 then 'Hearts'
    when 2 then 'Diamonds'
    when 3 then 'Clubs'
    else 'Spades'
  end;

  color := case when v_suit_index in (1, 2) then 'red' else 'black' end;
  return next;
end;
$$;

create or replace function public.guess10_card_matches(
  _category text,
  _selection_values jsonb,
  _label text,
  _suit_name text,
  _color text
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_category text := lower(trim(coalesce(_category, '')));
  v_values text[];
begin
  select coalesce(array_agg(value), array[]::text[])
  into v_values
  from jsonb_array_elements_text(public.guess10_validate_selection(_category, _selection_values)) as j(value);

  if v_category = 'color' then
    return upper(coalesce(_color, '')) = any(v_values);
  elsif v_category = 'suit' then
    return upper(coalesce(_suit_name, '')) = any(v_values);
  elsif v_category = 'rank' then
    return upper(coalesce(_label, '')) = any(v_values);
  end if;

  return false;
end;
$$;

create or replace function public.guess10_get_account_snapshot(
  _mode_type text,
  _contest_id uuid
)
returns table(
  cash_balance numeric,
  carter_cash integer,
  carter_cash_progress integer,
  balance_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if lower(trim(coalesce(_mode_type, 'normal'))) = 'contest' then
    if _contest_id is null then
      raise exception 'Contest id is required for contest mode.';
    end if;

    return query
    select
      round(coalesce(ce.current_credits, 0)::numeric, 2) as cash_balance,
      greatest(coalesce(ce.current_carter_cash, 0), 0)::integer as carter_cash,
      greatest(coalesce(ce.current_carter_cash_progress, 0), 0)::integer as carter_cash_progress,
      coalesce(ce.updated_at, timezone('utc', now())) as balance_updated_at
    from public.contest_entries ce
    where ce.contest_id = _contest_id
      and ce.user_id = auth.uid();
  else
    return query
    select
      round(coalesce(p.credits, 0)::numeric, 2) as cash_balance,
      greatest(coalesce(p.carter_cash, 0), 0)::integer as carter_cash,
      greatest(coalesce(p.carter_cash_progress, 0), 0)::integer as carter_cash_progress,
      coalesce(p.updated_at, timezone('utc', now())) as balance_updated_at
    from public.profiles p
    where p.id = auth.uid();
  end if;
end;
$$;

create or replace function public.guess10_apply_balance_delta(
  _mode_type text,
  _contest_id uuid,
  _delta numeric
)
returns table(
  cash_balance numeric,
  carter_cash integer,
  carter_cash_progress integer,
  balance_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode_type text := lower(trim(coalesce(_mode_type, 'normal')));
  v_delta numeric := round(coalesce(_delta, 0)::numeric, 2);
  v_profile public.profiles%rowtype;
  v_entry public.contest_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_mode_type = 'contest' then
    if _contest_id is null then
      raise exception 'Contest id is required for contest mode.';
    end if;

    select *
    into v_entry
    from public.contest_entries
    where contest_id = _contest_id
      and user_id = auth.uid()
    for update;

    if not found then
      raise exception 'Contest entry not found';
    end if;

    if round(coalesce(v_entry.current_credits, 0)::numeric + v_delta, 2) < 0 then
      raise exception 'Insufficient contest credits';
    end if;

    perform set_config('rtn.allow_sensitive_balance_write', '1', true);

    update public.contest_entries
    set
      current_credits = round(greatest(coalesce(v_entry.current_credits, 0) + v_delta, 0)::numeric, 2),
      updated_at = timezone('utc', now())
    where contest_id = _contest_id
      and user_id = auth.uid()
    returning * into v_entry;

    return query
    select
      round(coalesce(v_entry.current_credits, 0)::numeric, 2),
      greatest(coalesce(v_entry.current_carter_cash, 0), 0)::integer,
      greatest(coalesce(v_entry.current_carter_cash_progress, 0), 0)::integer,
      coalesce(v_entry.updated_at, timezone('utc', now()));
  else
    select *
    into v_profile
    from public.profiles
    where id = auth.uid()
    for update;

    if not found then
      raise exception 'Profile not found';
    end if;

    if round(coalesce(v_profile.credits, 0)::numeric + v_delta, 2) < 0 then
      raise exception 'Insufficient credits';
    end if;

    perform set_config('rtn.allow_sensitive_balance_write', '1', true);

    update public.profiles
    set
      credits = round(greatest(coalesce(v_profile.credits, 0) + v_delta, 0)::numeric, 2),
      updated_at = timezone('utc', now())
    where id = auth.uid()
    returning * into v_profile;

    return query
    select
      round(coalesce(v_profile.credits, 0)::numeric, 2),
      greatest(coalesce(v_profile.carter_cash, 0), 0)::integer,
      greatest(coalesce(v_profile.carter_cash_progress, 0), 0)::integer,
      coalesce(v_profile.updated_at, timezone('utc', now()));
  end if;
end;
$$;

create or replace function public.start_guess10_hand(
  _wager_amount numeric,
  _selection_category text,
  _selection_values jsonb,
  _mode_type text default 'normal',
  _contest_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wager numeric := round(greatest(coalesce(_wager_amount, 0), 0)::numeric, 2);
  v_mode_type text := lower(trim(coalesce(_mode_type, 'normal')));
  v_selection_values jsonb;
  v_selection_label text;
  v_balance record;
  v_existing_hand_id uuid;
  v_hand public.guess10_live_hands%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_wager <= 0 then
    raise exception 'Guess 10 wager must be greater than zero.';
  end if;

  v_selection_values := public.guess10_validate_selection(_selection_category, _selection_values);
  v_selection_label := public.guess10_selection_label(_selection_category, v_selection_values);

  select ghl.id
  into v_existing_hand_id
  from public.guess10_live_hands ghl
  where ghl.user_id = auth.uid()
    and ghl.status = 'active'
  order by ghl.started_at desc
  limit 1;

  if v_existing_hand_id is not null then
    raise exception 'An active Guess 10 hand is already in progress.';
  end if;

  select *
  into v_balance
  from public.guess10_apply_balance_delta(v_mode_type, _contest_id, -v_wager);

  insert into public.guess10_live_hands (
    user_id,
    game_id,
    mode_type,
    contest_id,
    status,
    result,
    selection_category,
    selection_values,
    selection_label,
    current_pot,
    current_rung,
    draw_count,
    total_wager,
    total_paid,
    net,
    commission_kept,
    new_account_value,
    drawn_cards,
    started_at,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    'game_002',
    v_mode_type,
    _contest_id,
    'active',
    null,
    lower(trim(coalesce(_selection_category, ''))),
    v_selection_values,
    v_selection_label,
    v_wager,
    0,
    0,
    v_wager,
    0,
    0,
    0,
    v_balance.cash_balance,
    '[]'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning * into v_hand;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'wager_amount', v_hand.total_wager,
    'total_wager', v_hand.total_wager,
    'current_pot', v_hand.current_pot,
    'current_rung', v_hand.current_rung,
    'draw_count', v_hand.draw_count,
    'selection_category', v_hand.selection_category,
    'selection_values', v_hand.selection_values,
    'selection_label', v_hand.selection_label,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at,
    'started_at', v_hand.started_at
  );
end;
$$;

create or replace function public.draw_guess10_card(
  _hand_id uuid,
  _selection_category text default null,
  _selection_values jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hand public.guess10_live_hands%rowtype;
  v_category text;
  v_values jsonb;
  v_label text;
  v_multiplier numeric;
  v_card record;
  v_matched boolean;
  v_starting_pot numeric;
  v_ending_pot numeric;
  v_next_rung integer;
  v_next_draw_count integer;
  v_balance record;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_hand
  from public.guess10_live_hands
  where id = _hand_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Guess 10 hand not found.';
  end if;

  if v_hand.status <> 'active' then
    raise exception 'Guess 10 hand is already settled.';
  end if;

  v_category := lower(trim(coalesce(_selection_category, v_hand.selection_category)));
  v_values := public.guess10_validate_selection(v_category, coalesce(_selection_values, v_hand.selection_values));
  v_label := public.guess10_selection_label(v_category, v_values);
  v_multiplier := public.guess10_multiplier(v_category, v_values);

  select *
  into v_card
  from public.guess10_draw_random_card();

  v_matched := public.guess10_card_matches(v_category, v_values, v_card.label, v_card.suit_name, v_card.color);
  v_starting_pot := round(coalesce(v_hand.current_pot, v_hand.total_wager, 0)::numeric, 2);
  v_next_draw_count := coalesce(v_hand.draw_count, 0) + 1;

  if v_matched then
    v_ending_pot := round((v_starting_pot * v_multiplier)::numeric, 2);
    v_next_rung := coalesce(v_hand.current_rung, 0) + 1;

    update public.guess10_live_hands
    set
      selection_category = v_category,
      selection_values = v_values,
      selection_label = v_label,
      current_pot = v_ending_pot,
      current_rung = v_next_rung,
      draw_count = v_next_draw_count,
      last_draw_at = v_now,
      total_cards = v_next_draw_count,
      drawn_cards = coalesce(drawn_cards, '[]'::jsonb) || jsonb_build_object(
        'label', v_card.label,
        'suit', v_card.suit,
        'suitName', v_card.suit_name,
        'color', v_card.color
      ),
      updated_at = v_now
    where id = v_hand.id
    returning * into v_hand;

    insert into public.guess10_draw_plays (
      hand_id,
      user_id,
      game_id,
      draw_index,
      placed_at,
      wager_amount,
      prediction_category,
      prediction_values,
      selection_label,
      multiplier,
      drawn_card_label,
      drawn_card_suit,
      drawn_card_suit_name,
      drawn_card_color,
      was_correct,
      starting_pot,
      ending_pot,
      hand_result,
      cashout_payout,
      commission_kept,
      net_hand_profit,
      origin,
      resolved_at,
      resulting_status,
      resulting_rung,
      resulting_draw_count,
      resulting_commission_rate,
      server_seed
    )
    values (
      v_hand.id,
      auth.uid(),
      'game_002',
      v_next_draw_count,
      v_now,
      v_hand.total_wager,
      v_category,
      v_values,
      v_label,
      v_multiplier,
      v_card.label,
      v_card.suit,
      v_card.suit_name,
      v_card.color,
      true,
      v_starting_pot,
      v_ending_pot,
      null,
      0,
      0,
      0,
      'server',
      v_now,
      'active',
      v_next_rung,
      v_next_draw_count,
      public.guess10_commission_rate(v_next_rung),
      gen_random_uuid()::text
    );

    select *
    into v_balance
    from public.guess10_get_account_snapshot(v_hand.mode_type, v_hand.contest_id);
  else
    v_ending_pot := 0;
    v_next_rung := coalesce(v_hand.current_rung, 0);

    update public.guess10_live_hands
    set
      selection_category = v_category,
      selection_values = v_values,
      selection_label = v_label,
      current_pot = 0,
      current_rung = v_next_rung,
      draw_count = v_next_draw_count,
      status = 'loss',
      result = 'loss',
      last_draw_at = v_now,
      ended_at = v_now,
      stopper_label = v_card.label,
      stopper_suit = v_card.suit_name,
      total_cards = v_next_draw_count,
      total_paid = 0,
      net = round(-coalesce(v_hand.total_wager, 0)::numeric, 2),
      commission_kept = 0,
      drawn_cards = coalesce(drawn_cards, '[]'::jsonb) || jsonb_build_object(
        'label', v_card.label,
        'suit', v_card.suit,
        'suitName', v_card.suit_name,
        'color', v_card.color
      ),
      updated_at = v_now
    where id = v_hand.id
    returning * into v_hand;

    select *
    into v_balance
    from public.guess10_get_account_snapshot(v_hand.mode_type, v_hand.contest_id);

    update public.guess10_live_hands
    set new_account_value = v_balance.cash_balance
    where id = v_hand.id
    returning * into v_hand;

    insert into public.guess10_draw_plays (
      hand_id,
      user_id,
      game_id,
      draw_index,
      placed_at,
      wager_amount,
      prediction_category,
      prediction_values,
      selection_label,
      multiplier,
      drawn_card_label,
      drawn_card_suit,
      drawn_card_suit_name,
      drawn_card_color,
      was_correct,
      starting_pot,
      ending_pot,
      hand_result,
      cashout_payout,
      commission_kept,
      net_hand_profit,
      origin,
      resolved_at,
      resulting_status,
      resulting_rung,
      resulting_draw_count,
      resulting_commission_rate,
      server_seed
    )
    values (
      v_hand.id,
      auth.uid(),
      'game_002',
      v_next_draw_count,
      v_now,
      v_hand.total_wager,
      v_category,
      v_values,
      v_label,
      v_multiplier,
      v_card.label,
      v_card.suit,
      v_card.suit_name,
      v_card.color,
      false,
      v_starting_pot,
      0,
      'loss',
      0,
      0,
      round(-coalesce(v_hand.total_wager, 0)::numeric, 2),
      'server',
      v_now,
      'loss',
      v_next_rung,
      v_next_draw_count,
      public.guess10_commission_rate(v_next_rung),
      gen_random_uuid()::text
    );

    insert into public.game_hands (
      id,
      user_id,
      game_id,
      mode_type,
      contest_id,
      stopper_label,
      stopper_suit,
      total_cards,
      total_wager,
      total_paid,
      net,
      commission_kept,
      new_account_value,
      drawn_cards,
      created_at
    )
    values (
      v_hand.id,
      auth.uid(),
      'game_002',
      v_hand.mode_type,
      v_hand.contest_id,
      v_hand.stopper_label,
      v_hand.stopper_suit,
      v_hand.total_cards,
      v_hand.total_wager,
      v_hand.total_paid,
      v_hand.net,
      v_hand.commission_kept,
      v_hand.new_account_value,
      v_hand.drawn_cards,
      v_hand.started_at
    )
    on conflict (id) do update
    set
      stopper_label = excluded.stopper_label,
      stopper_suit = excluded.stopper_suit,
      total_cards = excluded.total_cards,
      total_wager = excluded.total_wager,
      total_paid = excluded.total_paid,
      net = excluded.net,
      commission_kept = excluded.commission_kept,
      new_account_value = excluded.new_account_value,
      drawn_cards = excluded.drawn_cards;
  end if;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'wager_amount', v_hand.total_wager,
    'total_wager', v_hand.total_wager,
    'current_pot', v_hand.current_pot,
    'current_rung', v_hand.current_rung,
    'draw_count', v_hand.draw_count,
    'selection_category', v_category,
    'selection_values', v_values,
    'selection_label', v_label,
    'multiplier', v_multiplier,
    'matched', v_matched,
    'starting_pot', v_starting_pot,
    'ending_pot', v_ending_pot,
    'card', jsonb_build_object(
      'label', v_card.label,
      'suit', v_card.suit,
      'suitName', v_card.suit_name,
      'color', v_card.color
    ),
    'total_paid', v_hand.total_paid,
    'net', v_hand.net,
    'commission_kept', v_hand.commission_kept,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at
  );
end;
$$;

create or replace function public.cashout_guess10_hand(
  _hand_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hand public.guess10_live_hands%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_commission_rate numeric;
  v_winnings numeric;
  v_commission numeric;
  v_payout numeric;
  v_balance record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_hand
  from public.guess10_live_hands
  where id = _hand_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Guess 10 hand not found.';
  end if;

  if v_hand.status <> 'active' then
    raise exception 'Guess 10 hand is already settled.';
  end if;

  if coalesce(v_hand.current_rung, 0) <= 0 or coalesce(v_hand.current_pot, 0) <= 0 then
    raise exception 'Guess 10 hand has no live winnings to cash out.';
  end if;

  v_commission_rate := public.guess10_commission_rate(v_hand.current_rung);
  v_winnings := round(greatest(coalesce(v_hand.current_pot, 0) - coalesce(v_hand.total_wager, 0), 0)::numeric, 2);
  v_commission := round((v_winnings * v_commission_rate)::numeric, 2);
  v_payout := round((coalesce(v_hand.current_pot, 0) - v_commission)::numeric, 2);

  select *
  into v_balance
  from public.guess10_apply_balance_delta(v_hand.mode_type, v_hand.contest_id, v_payout);

  update public.guess10_live_hands
  set
    status = 'cashout',
    result = 'cashout',
    ended_at = v_now,
    total_cards = greatest(coalesce(draw_count, 0), coalesce(total_cards, 0)),
    total_paid = v_payout,
    net = round((v_payout - coalesce(v_hand.total_wager, 0))::numeric, 2),
    commission_kept = v_commission,
    new_account_value = v_balance.cash_balance,
    updated_at = v_now
  where id = v_hand.id
  returning * into v_hand;

  update public.guess10_draw_plays
  set
    hand_result = 'cashout',
    cashout_payout = v_payout,
    commission_kept = v_commission,
    net_hand_profit = round((v_payout - coalesce(v_hand.total_wager, 0))::numeric, 2),
    resolved_at = v_now,
    resulting_status = 'cashout',
    resulting_rung = v_hand.current_rung,
    resulting_draw_count = v_hand.draw_count,
    resulting_commission_rate = v_commission_rate
  where id = (
    select gdp.id
    from public.guess10_draw_plays gdp
    where gdp.hand_id = v_hand.id
    order by gdp.draw_index desc, gdp.placed_at desc
    limit 1
  );

  insert into public.game_hands (
    id,
    user_id,
    game_id,
    mode_type,
    contest_id,
    stopper_label,
    stopper_suit,
    total_cards,
    total_wager,
    total_paid,
    net,
    commission_kept,
    new_account_value,
    drawn_cards,
    created_at
  )
  values (
    v_hand.id,
    auth.uid(),
    'game_002',
    v_hand.mode_type,
    v_hand.contest_id,
    v_hand.stopper_label,
    v_hand.stopper_suit,
    v_hand.total_cards,
    v_hand.total_wager,
    v_hand.total_paid,
    v_hand.net,
    v_hand.commission_kept,
    v_hand.new_account_value,
    v_hand.drawn_cards,
    v_hand.started_at
  )
  on conflict (id) do update
  set
    total_cards = excluded.total_cards,
    total_wager = excluded.total_wager,
    total_paid = excluded.total_paid,
    net = excluded.net,
    commission_kept = excluded.commission_kept,
    new_account_value = excluded.new_account_value,
    drawn_cards = excluded.drawn_cards;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'wager_amount', v_hand.total_wager,
    'total_wager', v_hand.total_wager,
    'current_pot', v_hand.current_pot,
    'current_rung', v_hand.current_rung,
    'draw_count', v_hand.draw_count,
    'selection_category', v_hand.selection_category,
    'selection_values', v_hand.selection_values,
    'selection_label', v_hand.selection_label,
    'payout', v_payout,
    'total_paid', v_hand.total_paid,
    'net', v_hand.net,
    'commission_kept', v_hand.commission_kept,
    'commission_rate', v_commission_rate,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at
  );
end;
$$;

grant execute on function public.guess10_selection_label(text, jsonb) to authenticated;
grant execute on function public.guess10_validate_selection(text, jsonb) to authenticated;
grant execute on function public.guess10_multiplier(text, jsonb) to authenticated;
grant execute on function public.guess10_commission_rate(integer) to authenticated;
grant execute on function public.guess10_draw_random_card() to authenticated;
grant execute on function public.guess10_card_matches(text, jsonb, text, text, text) to authenticated;
grant execute on function public.guess10_get_account_snapshot(text, uuid) to authenticated;
grant execute on function public.guess10_apply_balance_delta(text, uuid, numeric) to authenticated;
grant execute on function public.start_guess10_hand(numeric, text, jsonb, text, uuid) to authenticated;
grant execute on function public.draw_guess10_card(uuid, text, jsonb) to authenticated;
grant execute on function public.cashout_guess10_hand(uuid) to authenticated;
