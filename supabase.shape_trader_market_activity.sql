create or replace function public.get_shape_trader_market_activity_snapshot(
  target_contest_id uuid default null
)
returns table(
  active_trader_count integer,
  square_quantity numeric,
  triangle_quantity numeric,
  circle_quantity numeric
)
language sql
security definer
set search_path = public
as $$
  with active_accounts as (
    select distinct acct.user_id
    from public.shape_trader_accounts_current acct
    where (
      (target_contest_id is null and acct.contest_id is null)
      or acct.contest_id = target_contest_id
    )
      and coalesce(acct.last_active_at, timezone('utc', now()) - interval '100 years')
        >= timezone('utc', now()) - interval '5 minutes'
  ),
  filtered_positions as (
    select
      lower(coalesce(pos.shape, '')) as shape,
      greatest(0, coalesce(pos.quantity, 0))::numeric as quantity
    from public.shape_trader_positions_current pos
    inner join active_accounts active
      on active.user_id = pos.user_id
    where (
      (target_contest_id is null and pos.contest_id is null)
      or pos.contest_id = target_contest_id
    )
  )
  select
    (select count(*)::integer from active_accounts) as active_trader_count,
    coalesce(sum(case when shape = 'square' then quantity else 0 end), 0)::numeric as square_quantity,
    coalesce(sum(case when shape = 'triangle' then quantity else 0 end), 0)::numeric as triangle_quantity,
    coalesce(sum(case when shape = 'circle' then quantity else 0 end), 0)::numeric as circle_quantity
  from filtered_positions;
$$;

grant execute on function public.get_shape_trader_market_activity_snapshot(uuid) to authenticated;
