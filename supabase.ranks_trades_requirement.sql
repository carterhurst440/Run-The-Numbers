alter table public.ranks
  add column if not exists required_trades_made integer not null default 0;

alter table public.profiles
  add column if not exists trades_made_all_time integer not null default 0;

update public.profiles p
set trades_made_all_time = coalesce(t.trade_count, 0)
from (
  select user_id, count(*)::integer as trade_count
  from public.shape_trader_trades
  group by user_id
) t
where p.id = t.user_id;

update public.profiles
set trades_made_all_time = 0
where trades_made_all_time is null;

create or replace function public.recompute_all_profile_ranks(target_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
begin
  with ranked as (
    select
      p.id as user_id,
      r.id as rank_id,
      r.tier,
      row_number() over (partition by p.id order by r.tier desc) as rn
    from public.profiles p
    join public.ranks r
      on coalesce(p.hands_played_all_time, 0) >= coalesce(r.required_hands_played, 0)
     and coalesce(p.contest_wins, 0) >= coalesce(r.required_contest_wins, 0)
     and coalesce(p.trades_made_all_time, 0) >= coalesce(r.required_trades_made, 0)
    where target_user_id is null or p.id = target_user_id
  )
  update public.profiles p
  set
    current_rank_id = ranked.rank_id,
    current_rank_tier = ranked.tier
  from ranked
  where p.id = ranked.user_id
    and ranked.rn = 1;
end;
$$;

create or replace function public.increment_profile_trades_made(target_user_id uuid, trade_increment integer default 1)
returns table(trades_made_all_time integer, current_rank_tier integer, current_rank_id uuid, updated_at timestamptz)
language plpgsql
security definer
as $$
begin
  update public.profiles as p
  set trades_made_all_time = greatest(
    0,
    coalesce(p.trades_made_all_time, 0) + greatest(coalesce(trade_increment, 1), 0)
  )
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.trades_made_all_time as trades_made_all_time,
    p.current_rank_tier as current_rank_tier,
    p.current_rank_id as current_rank_id,
    p.updated_at as updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.reconcile_profile_trades_made(target_user_id uuid default null)
returns table(trades_made_all_time integer, current_rank_tier integer, current_rank_id uuid, updated_at timestamptz)
language plpgsql
security definer
as $$
begin
  if target_user_id is null then
    update public.profiles p
    set trades_made_all_time = greatest(
      coalesce(p.trades_made_all_time, 0),
      coalesce(t.trade_count, 0)
    )
    from (
      select user_id, count(*)::integer as trade_count
      from public.shape_trader_trades
      group by user_id
    ) t
    where p.id = t.user_id;

    perform public.recompute_all_profile_ranks();
    return;
  end if;

  update public.profiles p
  set trades_made_all_time = greatest(
    coalesce(p.trades_made_all_time, 0),
    coalesce(t.trade_count, 0)
  )
  from (
    select count(*)::integer as trade_count
    from public.shape_trader_trades
    where user_id = target_user_id
  ) t
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.trades_made_all_time as trades_made_all_time,
    p.current_rank_tier as current_rank_tier,
    p.current_rank_id as current_rank_id,
    p.updated_at as updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

grant execute on function public.increment_profile_trades_made(uuid, integer) to authenticated;
grant execute on function public.reconcile_profile_trades_made(uuid) to authenticated;

select public.recompute_all_profile_ranks();
