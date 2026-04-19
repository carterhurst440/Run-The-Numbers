create or replace function public.get_admin_activity_log(
  target_user_id uuid,
  limit_count integer default 100
)
returns table(
  entry_type text,
  id text,
  created_at timestamptz,
  game_id text,
  mode_type text,
  contest_id uuid,
  total_cards integer,
  stopper_label text,
  stopper_suit text,
  total_wager numeric,
  total_paid numeric,
  net numeric,
  commission_kept numeric,
  new_account_value numeric,
  drawn_cards jsonb,
  trade_side text,
  shape text,
  quantity numeric,
  total_value numeric,
  shape_price numeric,
  net_profit numeric,
  event_type text,
  amount numeric,
  previous_balance numeric
)
language plpgsql
security definer
as $$
begin
  if target_user_id is null then
    raise exception 'A target user is required';
  end if;

  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin activity log';
  end if;

  return query
  with merged as (
    select
      'hand'::text as entry_type,
      gh.id::text as id,
      gh.created_at,
      gh.game_id,
      gh.mode_type,
      gh.contest_id,
      gh.total_cards::integer as total_cards,
      gh.stopper_label,
      gh.stopper_suit,
      gh.total_wager,
      gh.total_paid,
      gh.net,
      gh.commission_kept,
      gh.new_account_value,
      gh.drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      null::numeric as net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.game_hands gh
    where gh.user_id = target_user_id

    union all

    select
      'trade'::text as entry_type,
      st.id::text as id,
      st.executed_at as created_at,
      coalesce(st.game_id, 'shape_traders') as game_id,
      case when st.contest_id is null then 'normal' else 'contest' end as mode_type,
      st.contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      null::numeric as total_wager,
      null::numeric as total_paid,
      null::numeric as net,
      null::numeric as commission_kept,
      st.new_account_value,
      null::jsonb as drawn_cards,
      st.trade_side,
      st.shape,
      st.quantity,
      st.total_value,
      st.shape_price,
      st.net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.shape_trader_trades st
    where st.user_id = target_user_id

    union all

    select
      'account'::text as entry_type,
      ae.id::text as id,
      ae.created_at,
      null::text as game_id,
      'normal'::text as mode_type,
      null::uuid as contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      null::numeric as total_wager,
      null::numeric as total_paid,
      null::numeric as net,
      null::numeric as commission_kept,
      ae.new_balance as new_account_value,
      null::jsonb as drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      null::numeric as net_profit,
      ae.event_type,
      ae.amount,
      ae.previous_balance
    from public.account_events ae
    where ae.user_id = target_user_id
  )
  select *
  from merged
  order by created_at desc, id desc
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

grant execute on function public.get_admin_activity_log(uuid, integer) to authenticated;
