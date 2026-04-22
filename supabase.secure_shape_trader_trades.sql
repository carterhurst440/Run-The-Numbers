-- Secure Shape Traders execution.
--
-- This migration moves the authoritative trade execution path to Postgres so
-- the browser can no longer spoof balances, holdings, or trade history by
-- writing snapshots directly.

alter table public.shape_trader_trades
  add column if not exists contest_id uuid references public.contests(id) on delete set null;

alter table public.shape_trader_trades
  add column if not exists trade_reason text not null default '';

create index if not exists idx_shape_trader_trades_contest_id_executed_at
  on public.shape_trader_trades (contest_id, executed_at desc);

create or replace function public.is_rtn_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com', false);
$$;

create or replace function public.guard_shape_trader_mutation()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_shape_trader_write', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Direct Shape Traders writes are not allowed.';
end;
$$;

drop trigger if exists guard_shape_trader_accounts_current_mutation on public.shape_trader_accounts_current;
create trigger guard_shape_trader_accounts_current_mutation
before insert or update or delete on public.shape_trader_accounts_current
for each row
execute function public.guard_shape_trader_mutation();

drop trigger if exists guard_shape_trader_positions_current_mutation on public.shape_trader_positions_current;
create trigger guard_shape_trader_positions_current_mutation
before insert or update or delete on public.shape_trader_positions_current
for each row
execute function public.guard_shape_trader_mutation();

drop trigger if exists guard_shape_trader_trades_mutation on public.shape_trader_trades;
create trigger guard_shape_trader_trades_mutation
before insert or update or delete on public.shape_trader_trades
for each row
execute function public.guard_shape_trader_mutation();

create or replace function public.sync_shape_trader_account_state(
  _contest_id uuid default null,
  _last_active_at timestamptz default null
)
returns table (
  contest_id uuid,
  account_scope text,
  cash_balance numeric,
  holdings_value numeric,
  account_value numeric,
  carter_cash integer,
  carter_cash_progress numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := case when _contest_id is null then 'normal' else 'contest:' || _contest_id::text end;
  v_cash_balance numeric := 0;
  v_carter_cash integer := 0;
  v_carter_cash_progress numeric := 0;
  v_holdings_value numeric := 0;
  v_account_value numeric := 0;
  v_updated_at timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _contest_id is null then
    select
      round(coalesce(p.credits, 0)::numeric, 2),
      greatest(coalesce(p.carter_cash, 0), 0),
      greatest(coalesce(p.carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.profiles p
    where p.id = auth.uid();

    if v_cash_balance is null then
      raise exception 'Profile not found';
    end if;
  else
    select
      round(coalesce(e.current_credits, 0)::numeric, 2),
      greatest(coalesce(e.current_carter_cash, 0), 0),
      greatest(coalesce(e.current_carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.contest_entries e
    where e.contest_id = _contest_id
      and e.user_id = auth.uid();

    if v_cash_balance is null then
      raise exception 'Contest entry not found';
    end if;
  end if;

  select round(coalesce(sum(pos.quantity * market.current_price), 0)::numeric, 2)
  into v_holdings_value
  from public.shape_trader_positions_current pos
  join public.shape_trader_market_current market
    on market.shape = pos.shape
  where pos.user_id = auth.uid()
    and pos.account_scope = v_scope;

  v_account_value := round(v_cash_balance + v_holdings_value, 2);

  perform set_config('rtn.allow_shape_trader_write', '1', true);

  insert into public.shape_trader_accounts_current (
    user_id,
    game_id,
    contest_id,
    account_scope,
    cash_balance,
    holdings_value,
    account_value,
    last_active_at,
    updated_at
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    v_scope,
    v_cash_balance,
    v_holdings_value,
    v_account_value,
    coalesce(_last_active_at, timezone('utc', now())),
    v_updated_at
  )
  on conflict (user_id, account_scope) do update
  set
    contest_id = excluded.contest_id,
    cash_balance = excluded.cash_balance,
    holdings_value = excluded.holdings_value,
    account_value = excluded.account_value,
    last_active_at = excluded.last_active_at,
    updated_at = excluded.updated_at;

  return query
  select
    _contest_id,
    v_scope,
    v_cash_balance,
    v_holdings_value,
    v_account_value,
    v_carter_cash,
    v_carter_cash_progress,
    v_updated_at;
end;
$$;

create or replace function public.execute_shape_trader_trade(
  _shape text,
  _side text,
  _quantity integer,
  _contest_id uuid default null,
  _reason text default '',
  _award_carter_cash boolean default true
)
returns table (
  trade_id uuid,
  contest_id uuid,
  account_scope text,
  shape text,
  trade_side text,
  quantity integer,
  price numeric,
  total_value numeric,
  net_profit numeric,
  cash_balance numeric,
  holdings_value numeric,
  account_value numeric,
  carter_cash integer,
  carter_cash_progress numeric,
  position_quantity integer,
  position_average_price numeric,
  balance_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := case when _contest_id is null then 'normal' else 'contest:' || _contest_id::text end;
  v_side text := lower(coalesce(_side, 'buy'));
  v_quantity integer := greatest(coalesce(_quantity, 0), 0);
  v_price numeric;
  v_total_value numeric;
  v_net_profit numeric := null;
  v_position public.shape_trader_positions_current%rowtype;
  v_existing_quantity integer := 0;
  v_existing_average numeric := 0;
  v_next_quantity integer := 0;
  v_next_average numeric := 0;
  v_cash_balance numeric := 0;
  v_carter_cash integer := 0;
  v_carter_cash_progress numeric := 0;
  v_progress_gain integer := 0;
  v_total_progress integer := 0;
  v_earned integer := 0;
  v_holdings_value numeric := 0;
  v_account_value numeric := 0;
  v_trade_id uuid;
  v_balance_updated_at timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _shape not in ('circle', 'square', 'triangle') then
    raise exception 'Invalid shape';
  end if;

  if v_side not in ('buy', 'sell') then
    raise exception 'Invalid trade side';
  end if;

  if v_quantity <= 0 then
    raise exception 'Quantity must be at least 1';
  end if;

  select round(coalesce(current_price, 0)::numeric, 2)
  into v_price
  from public.shape_trader_market_current
  where shape = _shape;

  if v_price is null then
    raise exception 'Current market price is unavailable';
  end if;

  if _contest_id is null then
    select
      round(coalesce(p.credits, 0)::numeric, 2),
      greatest(coalesce(p.carter_cash, 0), 0),
      greatest(coalesce(p.carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.profiles p
    where p.id = auth.uid()
    for update;

    if v_cash_balance is null then
      raise exception 'Profile not found';
    end if;
  else
    select
      round(coalesce(e.current_credits, 0)::numeric, 2),
      greatest(coalesce(e.current_carter_cash, 0), 0),
      greatest(coalesce(e.current_carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.contest_entries e
    where e.contest_id = _contest_id
      and e.user_id = auth.uid()
    for update;

    if v_cash_balance is null then
      raise exception 'Contest entry not found';
    end if;
  end if;

  select *
  into v_position
  from public.shape_trader_positions_current
  where user_id = auth.uid()
    and account_scope = v_scope
    and shape = _shape
  for update;

  v_existing_quantity := greatest(coalesce(v_position.quantity, 0), 0);
  v_existing_average := round(coalesce(v_position.average_price, 0)::numeric, 2);
  v_total_value := round(v_quantity * v_price, 2);

  if v_side = 'buy' then
    if v_cash_balance < v_total_value then
      raise exception 'Insufficient funds';
    end if;

    v_next_quantity := v_existing_quantity + v_quantity;
    v_next_average := case
      when v_next_quantity > 0
        then round(((v_existing_quantity * v_existing_average) + v_total_value) / v_next_quantity, 2)
      else 0
    end;
    v_cash_balance := round(v_cash_balance - v_total_value, 2);
  else
    if v_existing_quantity < v_quantity then
      raise exception 'Insufficient holdings';
    end if;

    v_net_profit := round((v_price - v_existing_average) * v_quantity, 2);
    v_next_quantity := v_existing_quantity - v_quantity;
    v_next_average := case when v_next_quantity > 0 then v_existing_average else 0 end;
    v_cash_balance := round(v_cash_balance + v_total_value, 2);

    if coalesce(_award_carter_cash, true) then
      v_progress_gain := greatest(coalesce(abs(v_net_profit), 0), 0);
      v_total_progress := greatest(coalesce(v_carter_cash_progress, 0)::integer, 0) + v_progress_gain;
      v_earned := floor(v_total_progress / 1000.0);
      v_carter_cash := greatest(0, v_carter_cash + v_earned);
      v_carter_cash_progress := v_total_progress - (v_earned * 1000);
    end if;
  end if;

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  perform set_config('rtn.allow_shape_trader_write', '1', true);

  if _contest_id is null then
    update public.profiles
    set
      credits = v_cash_balance,
      carter_cash = v_carter_cash,
      carter_cash_progress = v_carter_cash_progress
    where id = auth.uid()
    returning updated_at into v_balance_updated_at;
  else
    update public.contest_entries
    set
      current_credits = v_cash_balance,
      current_carter_cash = v_carter_cash,
      current_carter_cash_progress = v_carter_cash_progress
    where contest_id = _contest_id
      and user_id = auth.uid();
    v_balance_updated_at := timezone('utc', now());
  end if;

  insert into public.shape_trader_positions_current (
    user_id,
    game_id,
    contest_id,
    account_scope,
    shape,
    quantity,
    average_price,
    updated_at
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    v_scope,
    _shape,
    v_next_quantity,
    v_next_average,
    timezone('utc', now())
  )
  on conflict (user_id, account_scope, shape) do update
  set
    contest_id = excluded.contest_id,
    quantity = excluded.quantity,
    average_price = excluded.average_price,
    updated_at = excluded.updated_at;

  select round(coalesce(sum(pos.quantity * market.current_price), 0)::numeric, 2)
  into v_holdings_value
  from public.shape_trader_positions_current pos
  join public.shape_trader_market_current market
    on market.shape = pos.shape
  where pos.user_id = auth.uid()
    and pos.account_scope = v_scope;

  v_account_value := round(v_cash_balance + v_holdings_value, 2);

  insert into public.shape_trader_accounts_current (
    user_id,
    game_id,
    contest_id,
    account_scope,
    cash_balance,
    holdings_value,
    account_value,
    last_active_at,
    updated_at
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    v_scope,
    v_cash_balance,
    v_holdings_value,
    v_account_value,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id, account_scope) do update
  set
    contest_id = excluded.contest_id,
    cash_balance = excluded.cash_balance,
    holdings_value = excluded.holdings_value,
    account_value = excluded.account_value,
    last_active_at = excluded.last_active_at,
    updated_at = excluded.updated_at;

  insert into public.shape_trader_trades (
    user_id,
    game_id,
    contest_id,
    shape,
    shape_price,
    executed_at,
    trade_side,
    quantity,
    total_value,
    net_profit,
    new_account_value,
    trade_reason
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    _shape,
    v_price,
    timezone('utc', now()),
    v_side,
    v_quantity,
    v_total_value,
    v_net_profit,
    v_account_value,
    coalesce(_reason, '')
  )
  returning id into v_trade_id;

  return query
  select
    v_trade_id,
    _contest_id,
    v_scope,
    _shape,
    v_side,
    v_quantity,
    v_price,
    v_total_value,
    v_net_profit,
    v_cash_balance,
    v_holdings_value,
    v_account_value,
    v_carter_cash,
    v_carter_cash_progress,
    v_next_quantity,
    v_next_average,
    v_balance_updated_at;
end;
$$;

grant execute on function public.sync_shape_trader_account_state(uuid, timestamptz) to authenticated;
grant execute on function public.execute_shape_trader_trade(text, text, integer, uuid, text, boolean) to authenticated;

create or replace function public.apply_shape_trader_structural_event(
  _draw_id bigint,
  _shape text,
  _event_type text,
  _contest_id uuid default null
)
returns table (
  applied boolean,
  resolved_account_scope text,
  resolved_shape text,
  resolved_event_type text,
  position_quantity integer,
  position_average_price numeric,
  cash_balance numeric,
  holdings_value numeric,
  account_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := case when _contest_id is null then 'normal' else 'contest:' || _contest_id::text end;
  v_draw public.shape_trader_draws%rowtype;
  v_position public.shape_trader_positions_current%rowtype;
  v_existing_quantity integer := 0;
  v_existing_average numeric := 0;
  v_cash_balance numeric := 0;
  v_carter_cash integer := 0;
  v_carter_cash_progress numeric := 0;
  v_holdings_value numeric := 0;
  v_account_value numeric := 0;
  v_previous_price numeric := 0;
  v_new_price numeric := 0;
  v_next_quantity integer := 0;
  v_next_average numeric := 0;
  v_claimed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _shape not in ('circle', 'square', 'triangle') then
    raise exception 'Invalid shape';
  end if;

  if _event_type not in ('split', 'bankruptcy') then
    raise exception 'Invalid structural event type';
  end if;

  select *
  into v_draw
  from public.shape_trader_draws
  where draw_id = _draw_id
  for share;

  if not found then
    raise exception 'Shape Traders draw not found';
  end if;

  if _contest_id is null then
    select
      round(coalesce(p.credits, 0)::numeric, 2),
      greatest(coalesce(p.carter_cash, 0), 0),
      greatest(coalesce(p.carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.profiles p
    where p.id = auth.uid()
    for update;
  else
    select
      round(coalesce(e.current_credits, 0)::numeric, 2),
      greatest(coalesce(e.current_carter_cash, 0), 0),
      greatest(coalesce(e.current_carter_cash_progress, 0), 0)
    into
      v_cash_balance,
      v_carter_cash,
      v_carter_cash_progress
    from public.contest_entries e
    where e.contest_id = _contest_id
      and e.user_id = auth.uid()
    for update;
  end if;

  select *
  into v_position
  from public.shape_trader_positions_current
  where user_id = auth.uid()
    and account_scope = v_scope
    and shape = _shape
  for update;

  v_existing_quantity := greatest(coalesce(v_position.quantity, 0), 0);
  v_existing_average := round(coalesce(v_position.average_price, 0)::numeric, 2);

  perform set_config('rtn.allow_shape_trader_write', '1', true);

  insert into public.shape_trader_structural_events_applied (
    user_id,
    game_id,
    contest_id,
    account_scope,
    draw_id,
    shape,
    event_type
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    v_scope,
    _draw_id,
    _shape,
    _event_type
  )
  on conflict do nothing;

  get diagnostics v_claimed = row_count;
  if not v_claimed then
    select round(coalesce(sum(pos.quantity * market.current_price), 0)::numeric, 2)
    into v_holdings_value
    from public.shape_trader_positions_current pos
    join public.shape_trader_market_current market
      on market.shape = pos.shape
    where pos.user_id = auth.uid()
      and pos.account_scope = v_scope;

    v_account_value := round(v_cash_balance + v_holdings_value, 2);

    return query
    select
      false,
      v_scope,
      _shape,
      _event_type,
      v_existing_quantity,
      v_existing_average,
      v_cash_balance,
      v_holdings_value,
      v_account_value;
    return;
  end if;

  if _event_type = 'split' then
    v_previous_price := round(coalesce(
      case _shape
        when 'circle' then v_draw.previous_circle_price
        when 'square' then v_draw.previous_square_price
        when 'triangle' then v_draw.previous_triangle_price
      end,
      case _shape
        when 'circle' then v_draw.new_circle_price
        when 'square' then v_draw.new_square_price
        when 'triangle' then v_draw.new_triangle_price
      end * 10,
      0
    )::numeric, 2);
    v_new_price := round(coalesce(
      case _shape
        when 'circle' then v_draw.new_circle_price
        when 'square' then v_draw.new_square_price
        when 'triangle' then v_draw.new_triangle_price
      end,
      0
    )::numeric, 2);
    v_next_quantity := v_existing_quantity * 10;
    v_next_average := case when v_existing_quantity > 0 then round(v_existing_average / 10.0, 2) else 0 end;

    insert into public.shape_trader_positions_current (
      user_id,
      game_id,
      contest_id,
      account_scope,
      shape,
      quantity,
      average_price,
      updated_at
    )
    values (
      auth.uid(),
      'game_003',
      _contest_id,
      v_scope,
      _shape,
      v_next_quantity,
      v_next_average,
      timezone('utc', now())
    )
    on conflict (user_id, account_scope, shape) do update
    set
      contest_id = excluded.contest_id,
      quantity = excluded.quantity,
      average_price = excluded.average_price,
      updated_at = excluded.updated_at;

    if v_existing_quantity > 0 and v_previous_price > 0 and v_new_price > 0 then
      insert into public.shape_trader_trades (
        user_id,
        game_id,
        contest_id,
        shape,
        shape_price,
        executed_at,
        trade_side,
        quantity,
        total_value,
        net_profit,
        new_account_value,
        trade_reason
      )
      values
      (
        auth.uid(),
        'game_003',
        _contest_id,
        _shape,
        v_previous_price,
        coalesce(v_draw.drawn_at, timezone('utc', now())),
        'sell',
        v_existing_quantity,
        round(v_existing_quantity * v_previous_price, 2),
        null,
        0,
        '10:1 asset split'
      ),
      (
        auth.uid(),
        'game_003',
        _contest_id,
        _shape,
        v_new_price,
        coalesce(v_draw.drawn_at, timezone('utc', now())) + interval '1 millisecond',
        'buy',
        v_next_quantity,
        round(v_next_quantity * v_new_price, 2),
        null,
        0,
        '10:1 asset split'
      );
    end if;
  else
    v_next_quantity := 0;
    v_next_average := 0;

    insert into public.shape_trader_positions_current (
      user_id,
      game_id,
      contest_id,
      account_scope,
      shape,
      quantity,
      average_price,
      updated_at
    )
    values (
      auth.uid(),
      'game_003',
      _contest_id,
      v_scope,
      _shape,
      0,
      0,
      timezone('utc', now())
    )
    on conflict (user_id, account_scope, shape) do update
    set
      contest_id = excluded.contest_id,
      quantity = 0,
      average_price = 0,
      updated_at = excluded.updated_at;

    if v_existing_quantity > 0 then
      insert into public.shape_trader_trades (
        user_id,
        game_id,
        contest_id,
        shape,
        shape_price,
        executed_at,
        trade_side,
        quantity,
        total_value,
        net_profit,
        new_account_value,
        trade_reason
      )
      values (
        auth.uid(),
        'game_003',
        _contest_id,
        _shape,
        0,
        coalesce(v_draw.drawn_at, timezone('utc', now())),
        'sell',
        v_existing_quantity,
        0,
        round(-1 * v_existing_average * v_existing_quantity, 2),
        0,
        'Bankruptcy reset'
      );
    end if;
  end if;

  select round(coalesce(sum(pos.quantity * market.current_price), 0)::numeric, 2)
  into v_holdings_value
  from public.shape_trader_positions_current pos
  join public.shape_trader_market_current market
    on market.shape = pos.shape
  where pos.user_id = auth.uid()
    and pos.account_scope = v_scope;

  v_account_value := round(v_cash_balance + v_holdings_value, 2);

  insert into public.shape_trader_accounts_current (
    user_id,
    game_id,
    contest_id,
    account_scope,
    cash_balance,
    holdings_value,
    account_value,
    last_active_at,
    updated_at
  )
  values (
    auth.uid(),
    'game_003',
    _contest_id,
    v_scope,
    v_cash_balance,
    v_holdings_value,
    v_account_value,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id, account_scope) do update
  set
    contest_id = excluded.contest_id,
    cash_balance = excluded.cash_balance,
    holdings_value = excluded.holdings_value,
    account_value = excluded.account_value,
    last_active_at = excluded.last_active_at,
    updated_at = excluded.updated_at;

  update public.shape_trader_trades
  set new_account_value = v_account_value
  where user_id = auth.uid()
    and contest_id is not distinct from _contest_id
    and shape = _shape
    and trade_reason in ('10:1 asset split', 'Bankruptcy reset')
    and executed_at >= coalesce(v_draw.drawn_at, timezone('utc', now()))
    and executed_at < coalesce(v_draw.drawn_at, timezone('utc', now())) + interval '2 milliseconds';

  return query
  select
    true,
    v_scope,
    _shape,
    _event_type,
    v_next_quantity,
    v_next_average,
    v_cash_balance,
    v_holdings_value,
    v_account_value;
end;
$$;

grant execute on function public.apply_shape_trader_structural_event(bigint, text, text, uuid) to authenticated;
