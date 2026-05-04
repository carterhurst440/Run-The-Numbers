drop function if exists public.increment_profile_hands_played(uuid, integer);
drop function if exists public.increment_profile_hands_played(uuid, integer, text);
drop function if exists public.reconcile_profile_hands_played(uuid);
drop function if exists public.increment_profile_trades_made(uuid, integer);
drop function if exists public.reconcile_profile_trades_made(uuid);
drop function if exists public.recompute_all_profile_ranks(uuid);
drop function if exists public.recompute_all_profile_ranks();

alter table public.profiles
  add column if not exists run_the_numbers_hands_played_all_time integer not null default 0;

alter table public.profiles
  add column if not exists guess10_hands_played_all_time integer not null default 0;

alter table public.profiles
  add column if not exists total_progress_events integer not null default 0;

alter table public.profiles
  add column if not exists current_rank integer not null default 1;

create or replace function public.recompute_all_profile_ranks(target_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  with ranked as (
    select
      p.id as user_id,
      r.id as rank_id,
      r.tier,
      row_number() over (partition by p.id order by r.tier desc) as rn
    from public.profiles p
    join public.ranks r
      on coalesce(p.total_progress_events, p.hands_played_all_time, 0) >= coalesce(r.required_hands_played, 0)
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

  with ordered as (
    select
      p.id,
      dense_rank() over (
        order by
          greatest(coalesce(p.current_rank_tier, 1), 1) desc,
          coalesce(p.total_progress_events, p.hands_played_all_time, 0) desc,
          p.id
      )::integer as leaderboard_rank
    from public.profiles p
  )
  update public.profiles p
  set current_rank = ordered.leaderboard_rank
  from ordered
  where p.id = ordered.id;
end;
$$;

create or replace function public.reconcile_profile_hands_played(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles p
  set
    run_the_numbers_hands_played_all_time = coalesce(src.rtn_hands, 0),
    guess10_hands_played_all_time = coalesce(src.guess10_hands, 0),
    trades_made_all_time = coalesce(src.trades_made, 0),
    total_progress_events = coalesce(src.rtn_hands, 0) + coalesce(src.guess10_hands, 0) + coalesce(src.trades_made, 0),
    hands_played_all_time = coalesce(src.rtn_hands, 0) + coalesce(src.guess10_hands, 0) + coalesce(src.trades_made, 0)
  from (
    select
      p2.id as user_id,
      coalesce(rtn.hand_count, 0)::integer as rtn_hands,
      coalesce(g10.hand_count, 0)::integer as guess10_hands,
      coalesce(trades.trade_count, 0)::integer as trades_made
    from public.profiles p2
    left join (
      select user_id, count(*)::integer as hand_count
      from public.game_hands
      where coalesce(game_id, 'game_001') = 'game_001'
      group by user_id
    ) rtn on rtn.user_id = p2.id
    left join (
      select user_id, count(*)::integer as hand_count
      from public.game_hands
      where coalesce(game_id, 'game_001') = 'game_002'
      group by user_id
    ) g10 on g10.user_id = p2.id
    left join (
      select user_id, count(*)::integer as trade_count
      from public.shape_trader_trades
      group by user_id
    ) trades on trades.user_id = p2.id
    where target_user_id is null or p2.id = target_user_id
  ) src
  where p.id = src.user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.run_the_numbers_hands_played_all_time,
    p.guess10_hands_played_all_time,
    p.hands_played_all_time,
    p.total_progress_events,
    p.trades_made_all_time,
    p.current_rank_tier,
    p.current_rank_id,
    p.current_rank,
    p.updated_at
  from public.profiles p
  where target_user_id is null or p.id = target_user_id;
end;
$$;

create or replace function public.increment_profile_hands_played(
  target_user_id uuid,
  hand_increment integer,
  target_game_id text default null
)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
declare
  safe_increment integer := greatest(coalesce(hand_increment, 1), 0);
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles as p
  set
    run_the_numbers_hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
    ),
    guess10_hands_played_all_time = greatest(
      0,
      coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
    ),
    total_progress_events = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
      + coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
      + coalesce(p.trades_made_all_time, 0)
    ),
    hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_001' then safe_increment else 0 end
      + coalesce(p.guess10_hands_played_all_time, 0)
      + case when coalesce(target_game_id, '') = 'game_002' then safe_increment else 0 end
      + coalesce(p.trades_made_all_time, 0)
    )
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.run_the_numbers_hands_played_all_time,
    p.guess10_hands_played_all_time,
    p.hands_played_all_time,
    p.total_progress_events,
    p.trades_made_all_time,
    p.current_rank_tier,
    p.current_rank_id,
    p.current_rank,
    p.updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.increment_profile_hands_played(
  target_user_id uuid,
  hand_increment integer default 1
)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
declare
  safe_increment integer := greatest(coalesce(hand_increment, 1), 0);
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles as p
  set
    total_progress_events = greatest(
      0,
      coalesce(p.total_progress_events, coalesce(p.hands_played_all_time, 0), 0) + safe_increment
    ),
    hands_played_all_time = greatest(
      0,
      coalesce(p.hands_played_all_time, 0) + safe_increment
    )
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.run_the_numbers_hands_played_all_time,
    p.guess10_hands_played_all_time,
    p.hands_played_all_time,
    p.total_progress_events,
    p.trades_made_all_time,
    p.current_rank_tier,
    p.current_rank_id,
    p.current_rank,
    p.updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.increment_profile_trades_made(
  target_user_id uuid,
  trade_increment integer default 1
)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
declare
  safe_increment integer := greatest(coalesce(trade_increment, 1), 0);
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.profiles as p
  set
    trades_made_all_time = greatest(0, coalesce(p.trades_made_all_time, 0) + safe_increment),
    total_progress_events = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + coalesce(p.guess10_hands_played_all_time, 0)
      + coalesce(p.trades_made_all_time, 0)
      + safe_increment
    ),
    hands_played_all_time = greatest(
      0,
      coalesce(p.run_the_numbers_hands_played_all_time, 0)
      + coalesce(p.guess10_hands_played_all_time, 0)
      + coalesce(p.trades_made_all_time, 0)
      + safe_increment
    )
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.run_the_numbers_hands_played_all_time,
    p.guess10_hands_played_all_time,
    p.hands_played_all_time,
    p.total_progress_events,
    p.trades_made_all_time,
    p.current_rank_tier,
    p.current_rank_id,
    p.current_rank,
    p.updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.reconcile_profile_trades_made(target_user_id uuid default null)
returns table(
  run_the_numbers_hands_played_all_time integer,
  guess10_hands_played_all_time integer,
  hands_played_all_time integer,
  total_progress_events integer,
  trades_made_all_time integer,
  current_rank_tier integer,
  current_rank_id uuid,
  current_rank integer,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.reconcile_profile_hands_played(target_user_id);
end;
$$;

update public.profiles p
set
  run_the_numbers_hands_played_all_time = coalesce(src.rtn_hands, 0),
  guess10_hands_played_all_time = coalesce(src.guess10_hands, 0),
  trades_made_all_time = coalesce(src.trades_made, 0),
  total_progress_events = coalesce(src.rtn_hands, 0) + coalesce(src.guess10_hands, 0) + coalesce(src.trades_made, 0),
  hands_played_all_time = coalesce(src.rtn_hands, 0) + coalesce(src.guess10_hands, 0) + coalesce(src.trades_made, 0),
  current_rank = coalesce(current_rank, 1)
from (
  select
    p2.id as user_id,
    coalesce(rtn.hand_count, 0)::integer as rtn_hands,
    coalesce(g10.hand_count, 0)::integer as guess10_hands,
    coalesce(trades.trade_count, 0)::integer as trades_made
  from public.profiles p2
  left join (
    select user_id, count(*)::integer as hand_count
    from public.game_hands
    where coalesce(game_id, 'game_001') = 'game_001'
    group by user_id
  ) rtn on rtn.user_id = p2.id
  left join (
    select user_id, count(*)::integer as hand_count
    from public.game_hands
    where coalesce(game_id, 'game_001') = 'game_002'
    group by user_id
  ) g10 on g10.user_id = p2.id
  left join (
    select user_id, count(*)::integer as trade_count
    from public.shape_trader_trades
    group by user_id
  ) trades on trades.user_id = p2.id
) src
where p.id = src.user_id;

update public.profiles
set
  run_the_numbers_hands_played_all_time = coalesce(run_the_numbers_hands_played_all_time, 0),
  guess10_hands_played_all_time = coalesce(guess10_hands_played_all_time, 0),
  trades_made_all_time = coalesce(trades_made_all_time, 0),
  total_progress_events = coalesce(total_progress_events, coalesce(hands_played_all_time, 0), 0),
  hands_played_all_time = coalesce(total_progress_events, coalesce(hands_played_all_time, 0), 0),
  current_rank = coalesce(current_rank, 1);

create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_sensitive_balance_write', true) = '1' then
    return new;
  end if;

  if
    new.credits is distinct from old.credits or
    new.carter_cash is distinct from old.carter_cash or
    new.carter_cash_progress is distinct from old.carter_cash_progress or
    new.run_the_numbers_hands_played_all_time is distinct from old.run_the_numbers_hands_played_all_time or
    new.guess10_hands_played_all_time is distinct from old.guess10_hands_played_all_time or
    new.hands_played_all_time is distinct from old.hands_played_all_time or
    new.total_progress_events is distinct from old.total_progress_events or
    new.contest_wins is distinct from old.contest_wins or
    new.trades_made_all_time is distinct from old.trades_made_all_time or
    new.current_rank is distinct from old.current_rank or
    new.current_rank_tier is distinct from old.current_rank_tier or
    new.current_rank_id is distinct from old.current_rank_id
  then
    raise exception 'Direct financial or progression updates are not allowed.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profiles_sensitive_fields on public.profiles;
create trigger guard_profiles_sensitive_fields
before update on public.profiles
for each row
execute function public.guard_profile_sensitive_fields();

create or replace function public.award_contest_medals(_contest_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  perform public.finalize_shape_trader_contest(_contest_id);

  with winners as (
    with qualified as (
      select
        e.user_id,
        e.current_credits,
        e.current_carter_cash
      from public.contest_entries e
      join public.contests contest on contest.id = e.contest_id
      where e.contest_id = _contest_id
        and coalesce(e.current_carter_cash, 0) >= coalesce(contest.qualification_carter_cash, 0)
    ),
    top_score as (
      select max(current_credits) as max_credits
      from qualified
    )
    select q.user_id
    from qualified q
    cross join top_score t
    where t.max_credits is not null
      and q.current_credits = t.max_credits
  ),
  inserted_medals as (
    insert into public.contest_medals (contest_id, user_id, contest_title)
    select
      c.id,
      winners.user_id,
      c.title
    from public.contests c
    join winners on true
    where c.id = _contest_id
    on conflict (contest_id, user_id) do nothing
    returning user_id
  ),
  updated_profiles as (
    update public.profiles p
    set contest_wins = coalesce(p.contest_wins, 0) + 1
    from inserted_medals im
    where p.id = im.user_id
    returning p.id
  )
  select count(*) into inserted_count
  from inserted_medals;

  if inserted_count > 0 then
    perform public.recompute_all_profile_ranks();
  end if;

  return inserted_count;
end;
$$;

revoke all on function public.award_contest_medals(uuid) from public;
grant execute on function public.award_contest_medals(uuid) to authenticated;

grant execute on function public.recompute_all_profile_ranks(uuid) to authenticated;
grant execute on function public.increment_profile_hands_played(uuid, integer, text) to authenticated;
grant execute on function public.increment_profile_hands_played(uuid, integer) to authenticated;
grant execute on function public.increment_profile_trades_made(uuid, integer) to authenticated;
grant execute on function public.reconcile_profile_hands_played(uuid) to authenticated;
grant execute on function public.reconcile_profile_trades_made(uuid) to authenticated;

select public.recompute_all_profile_ranks();
