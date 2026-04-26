create table if not exists public.rtn_live_hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id text not null default 'game_001' references public.games(id),
  mode_type text,
  contest_id uuid,
  status text not null default 'active'
    check (status in ('active', 'complete', 'void')),
  result text,
  started_at timestamptz not null default timezone('utc', now()),
  last_draw_at timestamptz,
  ended_at timestamptz,
  deck_order jsonb not null default '[]'::jsonb,
  draw_index integer not null default 0 check (draw_index >= 0),
  drawn_cards jsonb not null default '[]'::jsonb,
  total_cards integer not null default 0 check (total_cards >= 0),
  total_wager numeric not null default 0,
  total_paid numeric not null default 0,
  net numeric not null default 0,
  commission_kept numeric not null default 0,
  new_account_value numeric,
  carter_cash_awarded integer not null default 0,
  carter_cash_progress_after numeric,
  hand_state jsonb not null default '{}'::jsonb,
  stopper_card jsonb,
  ended_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_rtn_live_hands_user_started_at
  on public.rtn_live_hands (user_id, started_at desc);

create index if not exists idx_rtn_live_hands_user_status_started_at
  on public.rtn_live_hands (user_id, status, started_at desc);

create index if not exists idx_rtn_live_hands_contest_started_at
  on public.rtn_live_hands (contest_id, started_at desc);

create index if not exists idx_rtn_live_hands_drawn_cards_gin
  on public.rtn_live_hands using gin (drawn_cards);

insert into public.rtn_live_hands (
  id,
  user_id,
  game_id,
  mode_type,
  contest_id,
  status,
  result,
  started_at,
  last_draw_at,
  ended_at,
  deck_order,
  draw_index,
  drawn_cards,
  total_cards,
  total_wager,
  total_paid,
  net,
  commission_kept,
  new_account_value,
  carter_cash_awarded,
  carter_cash_progress_after,
  hand_state,
  stopper_card,
  ended_by,
  created_at,
  updated_at
)
select
  gh.id,
  gh.user_id,
  'game_001',
  gh.mode_type,
  gh.contest_id,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'complete'
    else 'active'
  end as status,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'stopper'
    else null
  end as result,
  gh.created_at as started_at,
  gh.created_at as last_draw_at,
  case when coalesce(gh.total_cards, 0) > 0 then gh.created_at else null end as ended_at,
  '[]'::jsonb as deck_order,
  coalesce(jsonb_array_length(coalesce(gh.drawn_cards, '[]'::jsonb)), 0) as draw_index,
  coalesce(gh.drawn_cards, '[]'::jsonb) as drawn_cards,
  greatest(coalesce(gh.total_cards, 0), coalesce(jsonb_array_length(coalesce(gh.drawn_cards, '[]'::jsonb)), 0)) as total_cards,
  coalesce(gh.total_wager, 0) as total_wager,
  coalesce(gh.total_paid, 0) as total_paid,
  coalesce(gh.net, 0) as net,
  coalesce(gh.commission_kept, 0) as commission_kept,
  gh.new_account_value,
  0 as carter_cash_awarded,
  null::numeric as carter_cash_progress_after,
  jsonb_build_object(
    'paytable_id', 'legacy',
    'migrated_from_game_hands', true
  ) as hand_state,
  case
    when gh.stopper_label is null then null
    else jsonb_build_object(
      'label', gh.stopper_label,
      'suitName', gh.stopper_suit
    )
  end as stopper_card,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'stopper'
    else null
  end as ended_by,
  gh.created_at,
  timezone('utc', now())
from public.game_hands gh
where coalesce(gh.game_id, 'game_001') = 'game_001'
on conflict (id) do update
set
  user_id = excluded.user_id,
  game_id = excluded.game_id,
  mode_type = excluded.mode_type,
  contest_id = excluded.contest_id,
  status = excluded.status,
  result = excluded.result,
  started_at = excluded.started_at,
  last_draw_at = excluded.last_draw_at,
  ended_at = excluded.ended_at,
  draw_index = excluded.draw_index,
  drawn_cards = excluded.drawn_cards,
  total_cards = excluded.total_cards,
  total_wager = excluded.total_wager,
  total_paid = excluded.total_paid,
  net = excluded.net,
  commission_kept = excluded.commission_kept,
  new_account_value = excluded.new_account_value,
  hand_state = excluded.hand_state,
  stopper_card = excluded.stopper_card,
  ended_by = excluded.ended_by,
  updated_at = timezone('utc', now());

alter table public.bet_plays
  add column if not exists rtn_hand_id uuid,
  add column if not exists bet_type text,
  add column if not exists amount numeric,
  add column if not exists placed_at_draw_index integer not null default 0,
  add column if not exists placement_phase text not null default 'pre-hand'
    check (placement_phase in ('pre-hand', 'mid-hand')),
  add column if not exists accepted boolean not null default true,
  add column if not exists rejection_reason text,
  add column if not exists resolved_at timestamptz,
  add column if not exists payout numeric not null default 0,
  add column if not exists result_snapshot jsonb not null default '{}'::jsonb;

alter table public.bet_plays
  alter column hand_id drop not null;

create index if not exists idx_bet_plays_rtn_hand_id_placed_at
  on public.bet_plays (rtn_hand_id, placed_at asc);

create index if not exists idx_bet_plays_rtn_hand_id_bet_key
  on public.bet_plays (rtn_hand_id, bet_key);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bet_plays_rtn_hand_id_fkey'
  ) then
    alter table public.bet_plays
      add constraint bet_plays_rtn_hand_id_fkey
      foreign key (rtn_hand_id) references public.rtn_live_hands(id) on delete cascade;
  end if;
end
$$;

update public.bet_plays bp
set rtn_hand_id = bp.hand_id
from public.game_hands gh
where bp.hand_id = gh.id
  and bp.rtn_hand_id is null
  and coalesce(gh.game_id, 'game_001') = 'game_001';

create or replace function public.rtn_paytable_steps(_paytable_id text)
returns integer[]
language plpgsql
immutable
as $$
begin
  case coalesce(_paytable_id, 'paytable-1')
    when 'paytable-1' then return array[3, 4, 15, 50];
    when 'paytable-2' then return array[2, 6, 36, 100];
    when 'paytable-3' then return array[1, 10, 40, 200];
    else raise exception 'Unknown RTN paytable id: %', _paytable_id;
  end case;
end;
$$;

create or replace function public.rtn_create_shuffled_deck()
returns jsonb
language sql
volatile
as $$
with numbered as (
  select rank::text as label, rank::text as rank, suit_symbol as suit, suit_name, suit_color as color, false as stopper
  from unnest(array['A','2','3','4','5','6','7','8','9','10']) as rank
  cross join (
    values
      ('♥','Hearts','red'),
      ('♦','Diamonds','red'),
      ('♣','Clubs','black'),
      ('♠','Spades','black')
  ) as suits(suit_symbol, suit_name, suit_color)
),
faces as (
  select face as label, face as rank, suit_symbol as suit, suit_name, suit_color as color, true as stopper
  from unnest(array['J','Q','K']) as face
  cross join (
    values
      ('♥','Hearts','red'),
      ('♦','Diamonds','red'),
      ('♣','Clubs','black'),
      ('♠','Spades','black')
  ) as suits(suit_symbol, suit_name, suit_color)
),
joker as (
  select 'Joker'::text as label, 'Joker'::text as rank, '★'::text as suit, null::text as suit_name, 'black'::text as color, true as stopper
),
combined as (
  select *, random() as shuffle_key from numbered
  union all
  select *, random() as shuffle_key from faces
  union all
  select *, random() as shuffle_key from joker
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'label', label,
      'rank', rank,
      'suit', suit,
      'suitName', suit_name,
      'color', color,
      'stopper', stopper
    )
    order by shuffle_key
  ),
  '[]'::jsonb
)
from combined;
$$;

create or replace function public.rtn_bet_is_midhand_allowed(_bet_type text)
returns boolean
language sql
immutable
as $$
  select coalesce(_bet_type, '') in ('specific-card', 'bust-suit', 'bust-rank', 'bust-joker')
$$;

create or replace function public.rtn_bet_is_removable(_bet_type text)
returns boolean
language sql
immutable
as $$
  select coalesce(_bet_type, '') in ('specific-card', 'bust-suit', 'bust-rank', 'bust-joker')
$$;

create or replace function public.rtn_build_live_bet_state(_hand_id uuid)
returns jsonb
language sql
stable
as $$
with grouped as (
  select
    bp.bet_key,
    min(coalesce(bp.bet_type, bp.raw ->> 'type', '')) as bet_type,
    min(coalesce(bp.raw ->> 'label', bp.bet_key, 'Bet')) as bet_label,
    round(sum(coalesce(bp.amount, bp.amount_wagered, 0))::numeric, 2) as total_units,
    round(sum(coalesce(bp.amount_paid, bp.payout, 0))::numeric, 2) as total_paid,
    coalesce(sum(coalesce((bp.result_snapshot ->> 'hits')::integer, 0)), 0) as total_hits,
    (jsonb_agg(coalesce(bp.raw -> 'metadata', '{}'::jsonb) order by bp.placed_at asc) -> 0) as metadata,
    jsonb_agg(round(coalesce(bp.amount, bp.amount_wagered, 0)::numeric, 2) order by bp.placed_at asc) as chips,
    min(bp.placed_at) as first_placed_at
  from public.bet_plays bp
  where bp.rtn_hand_id = _hand_id
    and coalesce(bp.accepted, true)
    and coalesce(bp.result_snapshot ->> 'resolved_reason', '') <> 'bet_removed'
  group by bp.bet_key
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'key', bet_key,
      'type', bet_type,
      'label', bet_label,
      'units', total_units,
      'hits', total_hits,
      'paid', total_paid,
      'chips', coalesce(chips, '[]'::jsonb),
      'metadata', coalesce(metadata, '{}'::jsonb)
    )
    order by first_placed_at asc, bet_key asc
  ),
  '[]'::jsonb
)
from grouped;
$$;

create or replace function public.rtn_get_account_snapshot(
  _mode_type text,
  _contest_id uuid
)
returns table(
  cash_balance numeric,
  carter_cash integer,
  carter_cash_progress integer,
  balance_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from public.guess10_get_account_snapshot(_mode_type, _contest_id)
$$;

create or replace function public.rtn_apply_balance_delta(
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
language sql
security definer
set search_path = public
as $$
  select * from public.guess10_apply_balance_delta(_mode_type, _contest_id, _delta)
$$;

create or replace function public.rtn_apply_playthrough_reward(
  _mode_type text,
  _contest_id uuid,
  _current_credits numeric,
  _playthrough_delta numeric
)
returns table(
  cash_balance numeric,
  carter_cash integer,
  carter_cash_progress integer,
  balance_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from public.guess10_apply_playthrough_reward(_mode_type, _contest_id, _current_credits, _playthrough_delta)
$$;

create or replace function public.start_rtn_hand(
  _opening_bets jsonb,
  _paytable_id text default 'paytable-1',
  _mode_type text default 'normal',
  _contest_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode_type text := lower(trim(coalesce(_mode_type, 'normal')));
  v_now timestamptz := timezone('utc', now());
  v_existing_hand_id uuid;
  v_balance record;
  v_hand public.rtn_live_hands%rowtype;
  v_deck jsonb;
  v_steps integer[];
  v_total_wager numeric := 0;
  v_bet jsonb;
  v_amount numeric;
  v_bet_key text;
  v_bet_type text;
  v_label text;
  v_metadata jsonb;
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(_opening_bets, '[]'::jsonb)) <> 'array' then
    raise exception 'Opening bets must be an array.';
  end if;

  v_steps := public.rtn_paytable_steps(_paytable_id);

  select rlh.id
  into v_existing_hand_id
  from public.rtn_live_hands rlh
  where rlh.user_id = auth.uid()
    and rlh.status = 'active'
  order by rlh.started_at desc
  limit 1;

  if v_existing_hand_id is not null then
    raise exception 'An active Run The Numbers hand is already in progress.';
  end if;

  for v_bet in
    select value
    from jsonb_array_elements(coalesce(_opening_bets, '[]'::jsonb))
  loop
    v_amount := round(greatest(coalesce((v_bet ->> 'amount')::numeric, 0), 0)::numeric, 2);
    v_bet_key := coalesce(v_bet ->> 'key', '');
    v_bet_type := coalesce(v_bet ->> 'type', '');
    v_label := coalesce(v_bet ->> 'label', v_bet_key, 'Bet');
    v_metadata := coalesce(v_bet -> 'metadata', '{}'::jsonb);

    if v_amount <= 0 then
      continue;
    end if;

    if v_bet_key = '' or v_bet_type = '' then
      raise exception 'Each opening bet must include key, type, and amount.';
    end if;

    v_total_wager := round(v_total_wager + v_amount, 2);
  end loop;

  if v_total_wager <= 0 then
    raise exception 'Run The Numbers requires at least one opening bet.';
  end if;

  select *
  into v_balance
  from public.rtn_apply_balance_delta(v_mode_type, _contest_id, -v_total_wager);

  v_deck := public.rtn_create_shuffled_deck();

  insert into public.rtn_live_hands (
    user_id,
    game_id,
    mode_type,
    contest_id,
    status,
    result,
    started_at,
    deck_order,
    draw_index,
    drawn_cards,
    total_cards,
    total_wager,
    total_paid,
    net,
    commission_kept,
    new_account_value,
    hand_state,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    'game_001',
    v_mode_type,
    _contest_id,
    'active',
    null,
    v_now,
    v_deck,
    0,
    '[]'::jsonb,
    0,
    v_total_wager,
    0,
    round(-v_total_wager, 2),
    0,
    v_balance.cash_balance,
    jsonb_build_object(
      'paytable_id', _paytable_id,
      'paytable_steps', to_jsonb(v_steps)
    ),
    v_now,
    v_now
  )
  returning * into v_hand;

  for v_bet in
    select value
    from jsonb_array_elements(coalesce(_opening_bets, '[]'::jsonb))
  loop
    v_amount := round(greatest(coalesce((v_bet ->> 'amount')::numeric, 0), 0)::numeric, 2);
    v_bet_key := coalesce(v_bet ->> 'key', '');
    v_bet_type := coalesce(v_bet ->> 'type', '');
    v_label := coalesce(v_bet ->> 'label', v_bet_key, 'Bet');
    v_metadata := coalesce(v_bet -> 'metadata', '{}'::jsonb);

    if v_amount <= 0 or v_bet_key = '' or v_bet_type = '' then
      continue;
    end if;

    insert into public.bet_plays (
      user_id,
      hand_id,
      rtn_hand_id,
      bet_key,
      bet_type,
      amount,
      amount_wagered,
      amount_paid,
      payout,
      outcome,
      net,
      raw,
      placed_at,
      placed_at_draw_index,
      placement_phase,
      accepted,
      rejection_reason,
      resolved_at,
      result_snapshot
    )
    values (
      auth.uid(),
      null,
      v_hand.id,
      v_bet_key,
      v_bet_type,
      v_amount,
      v_amount,
      0,
      0,
      'P',
      round(-v_amount, 2),
      jsonb_build_object(
        'key', v_bet_key,
        'type', v_bet_type,
        'label', v_label,
        'payout', coalesce((v_bet ->> 'payout')::numeric, 0),
        'metadata', v_metadata
      ),
      v_now,
      0,
      'pre-hand',
      true,
      null,
      null,
      jsonb_build_object('hits', 0, 'resolved', false)
    );
    v_inserted := true;
  end loop;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'paytable_id', _paytable_id,
    'draw_index', v_hand.draw_index,
    'drawn_cards', v_hand.drawn_cards,
    'total_cards', v_hand.total_cards,
    'total_wager', v_hand.total_wager,
    'total_paid', v_hand.total_paid,
    'net', v_hand.net,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at,
    'bet_state', public.rtn_build_live_bet_state(v_hand.id)
  );
end;
$$;

create or replace function public.draw_rtn_card(
  _hand_id uuid,
  _midhand_bets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_hand public.rtn_live_hands%rowtype;
  v_paytable_id text;
  v_steps integer[];
  v_card jsonb;
  v_draw_index integer;
  v_is_stopper boolean;
  v_card_rank text;
  v_card_suit text;
  v_card_suit_name text;
  v_total_new_wager numeric := 0;
  v_total_new_payout numeric := 0;
  v_total_paid numeric := 0;
  v_total_wager numeric := 0;
  v_balance record;
  v_snapshot record;
  v_bet jsonb;
  v_play record;
  v_amount numeric;
  v_bet_key text;
  v_bet_type text;
  v_label text;
  v_metadata jsonb;
  v_hits integer;
  v_pay numeric;
  v_resolved boolean;
  v_outcome text;
  v_rejected_bets jsonb := '[]'::jsonb;
  v_stopper_payout numeric := 0;
  v_starting_balance numeric;
  v_previous_progress integer := 0;
  v_previous_carter_cash integer := 0;
  v_awarded integer := 0;
  v_next_drawn_cards jsonb;
  v_status text := 'active';
  v_result text := null;
  v_ended_by text := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(_midhand_bets, '[]'::jsonb)) <> 'array' then
    raise exception 'Mid-hand bets must be an array.';
  end if;

  select *
  into v_hand
  from public.rtn_live_hands
  where id = _hand_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Run The Numbers hand not found.';
  end if;

  if v_hand.status <> 'active' then
    raise exception 'Run The Numbers hand is already settled.';
  end if;

  v_paytable_id := coalesce(v_hand.hand_state ->> 'paytable_id', 'paytable-1');
  v_steps := public.rtn_paytable_steps(v_paytable_id);
  v_draw_index := coalesce(v_hand.draw_index, 0);

  select *
  into v_snapshot
  from public.rtn_get_account_snapshot(v_hand.mode_type, v_hand.contest_id);

  v_previous_progress := greatest(coalesce(v_snapshot.carter_cash_progress, 0), 0);
  v_previous_carter_cash := greatest(coalesce(v_snapshot.carter_cash, 0), 0);

  for v_bet in
    select value
    from jsonb_array_elements(coalesce(_midhand_bets, '[]'::jsonb))
  loop
    v_amount := round(greatest(coalesce((v_bet ->> 'amount')::numeric, 0), 0)::numeric, 2);
    v_bet_key := coalesce(v_bet ->> 'key', '');
    v_bet_type := coalesce(v_bet ->> 'type', '');
    v_label := coalesce(v_bet ->> 'label', v_bet_key, 'Bet');
    v_metadata := coalesce(v_bet -> 'metadata', '{}'::jsonb);

    if v_amount <= 0 or v_bet_key = '' or v_bet_type = '' then
      v_rejected_bets := v_rejected_bets || jsonb_build_object(
        'key', v_bet_key,
        'type', v_bet_type,
        'amount', v_amount,
        'reason', 'Invalid bet payload.'
      );
      continue;
    end if;

    if not public.rtn_bet_is_midhand_allowed(v_bet_type) then
      v_rejected_bets := v_rejected_bets || jsonb_build_object(
        'key', v_bet_key,
        'type', v_bet_type,
        'amount', v_amount,
        'reason', 'That bet type is only allowed before the hand starts.'
      );
      continue;
    end if;

    v_total_new_wager := round(v_total_new_wager + v_amount, 2);

    insert into public.bet_plays (
      user_id,
      hand_id,
      rtn_hand_id,
      bet_key,
      bet_type,
      amount,
      amount_wagered,
      amount_paid,
      payout,
      outcome,
      net,
      raw,
      placed_at,
      placed_at_draw_index,
      placement_phase,
      accepted,
      rejection_reason,
      resolved_at,
      result_snapshot
    )
    values (
      auth.uid(),
      null,
      v_hand.id,
      v_bet_key,
      v_bet_type,
      v_amount,
      v_amount,
      0,
      0,
      'P',
      round(-v_amount, 2),
      jsonb_build_object(
        'key', v_bet_key,
        'type', v_bet_type,
        'label', v_label,
        'payout', coalesce((v_bet ->> 'payout')::numeric, 0),
        'metadata', v_metadata
      ),
      v_now,
      v_draw_index,
      'mid-hand',
      true,
      null,
      null,
      jsonb_build_object('hits', 0, 'resolved', false)
    );
  end loop;

  if v_total_new_wager > 0 then
    select *
    into v_balance
    from public.rtn_apply_balance_delta(v_hand.mode_type, v_hand.contest_id, -v_total_new_wager);
  else
    select *
    into v_balance
    from public.rtn_get_account_snapshot(v_hand.mode_type, v_hand.contest_id);
  end if;

  v_card := coalesce(v_hand.deck_order -> v_draw_index, '{}'::jsonb);
  if v_card = '{}'::jsonb then
    raise exception 'Run The Numbers hand has no remaining cards to draw.';
  end if;

  v_card_rank := coalesce(v_card ->> 'rank', v_card ->> 'label', '');
  v_card_suit := coalesce(v_card ->> 'suit', '');
  v_card_suit_name := coalesce(v_card ->> 'suitName', '');
  v_is_stopper := coalesce((v_card ->> 'stopper')::boolean, false);
  v_next_drawn_cards := coalesce(v_hand.drawn_cards, '[]'::jsonb) || v_card;

  for v_play in
    select *
    from public.bet_plays
    where rtn_hand_id = v_hand.id
      and coalesce(accepted, true)
    order by placed_at asc, id asc
    for update
  loop
    v_amount := round(coalesce(v_play.amount, v_play.amount_wagered, 0)::numeric, 2);
    v_bet_type := coalesce(v_play.bet_type, v_play.raw ->> 'type', '');
    v_metadata := coalesce(v_play.raw -> 'metadata', '{}'::jsonb);
    v_hits := greatest(coalesce((v_play.result_snapshot ->> 'hits')::integer, 0), 0);
    v_resolved := coalesce((v_play.result_snapshot ->> 'resolved')::boolean, false);
    v_pay := 0;
    v_outcome := v_play.outcome;

    if not v_resolved then
      if v_bet_type = 'number'
         and coalesce(v_metadata ->> 'rank', '') = v_card_rank
         and v_hits < coalesce(array_length(v_steps, 1), 0) then
        v_pay := round((v_steps[v_hits + 1] * v_amount)::numeric, 2);
        v_hits := v_hits + 1;
        v_total_new_payout := round(v_total_new_payout + v_pay, 2);
      elsif v_bet_type = 'specific-card'
        and coalesce(v_metadata ->> 'rank', '') = v_card_rank
        and coalesce(v_metadata ->> 'suit', '') = v_card_suit then
        v_pay := round((13 * v_amount)::numeric, 2);
        v_resolved := true;
        v_outcome := 'W';
        v_total_new_payout := round(v_total_new_payout + v_pay, 2);
      end if;
      update public.bet_plays
      set
        amount_paid = round(coalesce(amount_paid, 0) + v_pay, 2),
        payout = round(coalesce(amount_paid, 0) + v_pay, 2),
        outcome = case when v_resolved then coalesce(v_outcome, case when round(coalesce(amount_paid, 0) + v_pay, 2) > 0 then 'W' else 'L' end) else outcome end,
        net = round((coalesce(amount_paid, 0) + v_pay) - v_amount, 2),
        resolved_at = case when v_resolved then v_now else resolved_at end,
        result_snapshot = jsonb_build_object(
          'hits', v_hits,
          'resolved', v_resolved,
          'resolved_reason', case when v_resolved then 'draw-hit' else null end
        )
      where id = v_play.id;
    end if;
  end loop;

  if v_is_stopper then
    for v_play in
      select *
      from public.bet_plays
      where rtn_hand_id = v_hand.id
        and coalesce(accepted, true)
      order by placed_at asc, id asc
      for update
    loop
      v_amount := round(coalesce(v_play.amount, v_play.amount_wagered, 0)::numeric, 2);
      v_bet_type := coalesce(v_play.bet_type, v_play.raw ->> 'type', '');
      v_metadata := coalesce(v_play.raw -> 'metadata', '{}'::jsonb);
      v_hits := greatest(coalesce((v_play.result_snapshot ->> 'hits')::integer, 0), 0);
      v_resolved := coalesce((v_play.result_snapshot ->> 'resolved')::boolean, false);
      v_pay := 0;
      v_outcome := v_play.outcome;

      if not v_resolved then
        case v_bet_type
          when 'bust-suit' then
            if v_card_rank <> 'Joker' and coalesce(v_metadata ->> 'suit', '') = v_card_suit_name then
              v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
            end if;
          when 'bust-rank' then
            if coalesce(v_metadata ->> 'face', '') = coalesce(v_card ->> 'label', '') then
              v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
            end if;
          when 'bust-joker' then
            if coalesce(v_card ->> 'label', '') = 'Joker' then
              v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
            end if;
          when 'count' then
            if coalesce(v_metadata ->> 'countMax', '') = 'Infinity' then
              if coalesce(v_hand.total_cards, 0) + 1 >= coalesce((v_metadata ->> 'countMin')::integer, 0) then
                v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
              end if;
            elsif coalesce(v_hand.total_cards, 0) + 1 = coalesce((v_metadata ->> 'countMax')::integer, 0) then
              v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
            end if;
          when 'suit-pattern' then
            if coalesce(v_metadata ->> 'pattern', '') = 'none' then
              if not exists (
                select 1
                from jsonb_array_elements(v_next_drawn_cards) as cards(card)
                where coalesce(card ->> 'suitName', '') = coalesce(v_metadata ->> 'suit', '')
              ) then
                v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
              end if;
            elsif coalesce(v_metadata ->> 'pattern', '') = 'any' then
              if exists (
                select 1
                from jsonb_array_elements(v_next_drawn_cards) as cards(card)
                where coalesce(card ->> 'suitName', '') = coalesce(v_metadata ->> 'suit', '')
              ) then
                v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
              end if;
            elsif coalesce(v_metadata ->> 'pattern', '') = 'first' then
              if coalesce((v_next_drawn_cards -> 0) ->> 'suitName', '') = coalesce(v_metadata ->> 'suit', '') then
                v_pay := round((coalesce((v_play.raw ->> 'payout')::numeric, 0) * v_amount + v_amount)::numeric, 2);
              end if;
            end if;
          when 'specific-card' then
            v_pay := 0;
          when 'number' then
            v_pay := 0;
          else
            v_pay := 0;
        end case;

        v_resolved := true;
        v_outcome := case when round(coalesce(v_play.amount_paid, 0) + v_pay, 2) > 0 then 'W' else 'L' end;
        v_stopper_payout := round(v_stopper_payout + v_pay, 2);

        update public.bet_plays
        set
          amount_paid = round(coalesce(amount_paid, 0) + v_pay, 2),
          payout = round(coalesce(amount_paid, 0) + v_pay, 2),
          outcome = v_outcome,
          net = round((coalesce(amount_paid, 0) + v_pay) - v_amount, 2),
          resolved_at = v_now,
          result_snapshot = jsonb_build_object(
            'hits', v_hits,
            'resolved', true,
            'resolved_reason', 'stopper'
          )
        where id = v_play.id;
      elsif v_play.outcome is null then
        update public.bet_plays
        set
          outcome = case when coalesce(v_play.amount_paid, 0) > 0 then 'W' else 'L' end,
          net = round(coalesce(v_play.amount_paid, 0) - v_amount, 2),
          resolved_at = v_now,
          result_snapshot = jsonb_build_object(
            'hits', v_hits,
            'resolved', true,
            'resolved_reason', 'stopper'
          )
        where id = v_play.id;
      end if;
    end loop;

    v_total_new_payout := round(v_total_new_payout + v_stopper_payout, 2);
    v_status := 'complete';
    v_result := 'stopper';
    v_ended_by := 'stopper';
  end if;

  if v_total_new_payout <> 0 then
    select *
    into v_balance
    from public.rtn_apply_balance_delta(v_hand.mode_type, v_hand.contest_id, v_total_new_payout);
  end if;

  select
    round(coalesce(sum(coalesce(bp.amount_paid, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(bp.amount, bp.amount_wagered, 0)), 0)::numeric, 2)
  into v_total_paid, v_total_wager
  from public.bet_plays bp
  where bp.rtn_hand_id = v_hand.id
    and coalesce(bp.accepted, true);

  if v_status = 'complete' then
    v_starting_balance := coalesce(v_balance.cash_balance, (select cash_balance from public.rtn_get_account_snapshot(v_hand.mode_type, v_hand.contest_id)), 0);
    select *
    into v_balance
    from public.rtn_apply_playthrough_reward(
      v_hand.mode_type,
      v_hand.contest_id,
      v_starting_balance,
      v_total_wager
    );
    v_awarded := greatest(coalesce(v_balance.carter_cash, 0) - v_previous_carter_cash, 0);
  else
    select *
    into v_balance
    from public.rtn_get_account_snapshot(v_hand.mode_type, v_hand.contest_id);
  end if;

  update public.rtn_live_hands
  set
    draw_index = v_draw_index + 1,
    drawn_cards = v_next_drawn_cards,
    total_cards = jsonb_array_length(v_next_drawn_cards),
    total_wager = v_total_wager,
    total_paid = v_total_paid,
    net = round(v_total_paid - v_total_wager, 2),
    new_account_value = v_balance.cash_balance,
    carter_cash_awarded = case when v_status = 'complete' then v_awarded else carter_cash_awarded end,
    carter_cash_progress_after = case when v_status = 'complete' then v_balance.carter_cash_progress else carter_cash_progress_after end,
    status = v_status,
    result = v_result,
    last_draw_at = v_now,
    ended_at = case when v_status = 'complete' then v_now else ended_at end,
    stopper_card = case when v_is_stopper then v_card else stopper_card end,
    ended_by = case when v_status = 'complete' then v_ended_by else ended_by end,
    updated_at = v_now
  where id = v_hand.id
  returning * into v_hand;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'hand_complete', v_hand.status <> 'active',
    'ended_by', v_hand.ended_by,
    'draw_index', v_hand.draw_index,
    'total_cards', v_hand.total_cards,
    'total_wager', v_hand.total_wager,
    'total_paid', v_hand.total_paid,
    'net', v_hand.net,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at,
    'carter_cash_awarded', v_hand.carter_cash_awarded,
    'drawn_cards', v_hand.drawn_cards,
    'card', v_card,
    'stopper_card', v_hand.stopper_card,
    'bet_state', public.rtn_build_live_bet_state(v_hand.id),
    'rejected_bets', v_rejected_bets
  );
end;
$$;

create or replace function public.remove_rtn_bet_play(
  _hand_id uuid,
  _bet_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_hand public.rtn_live_hands%rowtype;
  v_play record;
  v_amount numeric;
  v_hits integer;
  v_total_removed numeric := 0;
  v_total_paid numeric := 0;
  v_total_wager numeric := 0;
  v_removed_count integer := 0;
  v_balance record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(trim(_bet_key), '') = '' then
    raise exception 'RTN bet removal requires a bet key.';
  end if;

  select *
  into v_hand
  from public.rtn_live_hands
  where id = _hand_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Run The Numbers hand not found.';
  end if;

  if v_hand.status <> 'active' then
    raise exception 'Run The Numbers hand is already settled.';
  end if;

  for v_play in
    select *
    from public.bet_plays
    where rtn_hand_id = v_hand.id
      and bet_key = _bet_key
      and coalesce(accepted, true)
    order by placed_at asc, id asc
    for update
  loop
    if not public.rtn_bet_is_removable(coalesce(v_play.bet_type, v_play.raw ->> 'type', '')) then
      continue;
    end if;

    if coalesce((v_play.result_snapshot ->> 'resolved')::boolean, false) then
      continue;
    end if;

    v_amount := round(coalesce(v_play.amount, v_play.amount_wagered, 0)::numeric, 2);
    v_hits := greatest(coalesce((v_play.result_snapshot ->> 'hits')::integer, 0), 0);

    update public.bet_plays
    set
      amount_paid = v_amount,
      payout = v_amount,
      outcome = 'P',
      net = 0,
      resolved_at = v_now,
      result_snapshot = jsonb_build_object(
        'hits', v_hits,
        'resolved', true,
        'resolved_reason', 'bet_removed',
        'removed_at_draw_index', coalesce(v_hand.draw_index, 0)
      )
    where id = v_play.id;

    v_total_removed := round(v_total_removed + v_amount, 2);
    v_removed_count := v_removed_count + 1;
  end loop;

  if v_removed_count = 0 then
    raise exception 'No removable live bet was found for that board spot.';
  end if;

  select *
  into v_balance
  from public.rtn_apply_balance_delta(v_hand.mode_type, v_hand.contest_id, v_total_removed);

  select
    round(coalesce(sum(coalesce(bp.amount_paid, 0)), 0)::numeric, 2),
    round(coalesce(sum(coalesce(bp.amount, bp.amount_wagered, 0)), 0)::numeric, 2)
  into v_total_paid, v_total_wager
  from public.bet_plays bp
  where bp.rtn_hand_id = v_hand.id
    and coalesce(bp.accepted, true);

  update public.rtn_live_hands
  set
    total_wager = v_total_wager,
    total_paid = v_total_paid,
    net = round(v_total_paid - v_total_wager, 2),
    new_account_value = v_balance.cash_balance,
    updated_at = v_now
  where id = v_hand.id
  returning * into v_hand;

  return jsonb_build_object(
    'hand_id', v_hand.id,
    'status', v_hand.status,
    'result', v_hand.result,
    'draw_index', v_hand.draw_index,
    'drawn_cards', v_hand.drawn_cards,
    'total_cards', v_hand.total_cards,
    'total_wager', v_hand.total_wager,
    'total_paid', v_hand.total_paid,
    'net', v_hand.net,
    'removed_amount', v_total_removed,
    'cash_balance', v_balance.cash_balance,
    'carter_cash', v_balance.carter_cash,
    'carter_cash_progress', v_balance.carter_cash_progress,
    'balance_updated_at', v_balance.balance_updated_at,
    'bet_state', public.rtn_build_live_bet_state(v_hand.id)
  );
end;
$$;

grant select on public.rtn_live_hands to authenticated;
grant execute on function public.rtn_paytable_steps(text) to authenticated;
grant execute on function public.rtn_create_shuffled_deck() to authenticated;
grant execute on function public.rtn_bet_is_midhand_allowed(text) to authenticated;
grant execute on function public.rtn_bet_is_removable(text) to authenticated;
grant execute on function public.rtn_build_live_bet_state(uuid) to authenticated;
grant execute on function public.rtn_get_account_snapshot(text, uuid) to authenticated;
grant execute on function public.rtn_apply_balance_delta(text, uuid, numeric) to authenticated;
grant execute on function public.rtn_apply_playthrough_reward(text, uuid, numeric, numeric) to authenticated;
grant execute on function public.start_rtn_hand(jsonb, text, text, uuid) to authenticated;
grant execute on function public.draw_rtn_card(uuid, jsonb) to authenticated;
grant execute on function public.remove_rtn_bet_play(uuid, text) to authenticated;
