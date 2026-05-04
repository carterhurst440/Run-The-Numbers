create or replace function public.get_shape_trader_market_activity_snapshot(
  target_contest_id uuid default null
)
returns table(
  active_trader_count integer,
  square_holdings numeric,
  triangle_holdings numeric,
  circle_holdings numeric
)
language sql
security definer
set search_path = public
as $$
  with active_accounts as (
    select distinct pos.user_id
    from public.shape_trader_positions_current pos
    where (
      (target_contest_id is null and pos.contest_id is null)
      or pos.contest_id = target_contest_id
    )
      and greatest(coalesce(pos.quantity, 0), 0) > 0
  ),
  live_positions as (
    select
      lower(coalesce(pos.shape, '')) as shape,
      round((greatest(coalesce(pos.quantity, 0), 0)::numeric * coalesce(market.current_price, 0))::numeric, 2) as holdings_value
    from public.shape_trader_positions_current pos
    join public.shape_trader_market_current market
      on market.shape = pos.shape
    join active_accounts active
      on active.user_id = pos.user_id
    where (
      (target_contest_id is null and pos.contest_id is null)
      or pos.contest_id = target_contest_id
    )
      and greatest(coalesce(pos.quantity, 0), 0) > 0
  )
  select
    (select count(*)::integer from active_accounts) as active_trader_count,
    coalesce(sum(case when shape = 'square' then holdings_value else 0 end), 0)::numeric as square_holdings,
    coalesce(sum(case when shape = 'triangle' then holdings_value else 0 end), 0)::numeric as triangle_holdings,
    coalesce(sum(case when shape = 'circle' then holdings_value else 0 end), 0)::numeric as circle_holdings
  from live_positions;
$$;

grant execute on function public.get_shape_trader_market_activity_snapshot(uuid) to authenticated;
