alter table public.profiles
  add column if not exists contest_wins integer not null default 0;

alter table public.profiles
  add column if not exists hands_played_all_time integer not null default 0;

update public.profiles p
set contest_wins = coalesce(w.win_count, 0)
from (
  select user_id, count(*)::integer as win_count
  from public.contest_medals
  group by user_id
) w
where p.id = w.user_id;

update public.profiles
set contest_wins = 0
where contest_wins is null;

update public.profiles p
set hands_played_all_time = coalesce(h.hand_count, 0)
from (
  select user_id, count(*)::integer as hand_count
  from public.game_hands
  group by user_id
) h
where p.id = h.user_id;

update public.profiles
set hands_played_all_time = 0
where hands_played_all_time is null;

create table if not exists public.ranks (
  id uuid primary key default gen_random_uuid(),
  tier integer not null unique,
  name text not null,
  welcome_phrase text not null,
  required_hands_played integer not null default 0,
  required_contest_wins integer not null default 0,
  icon_url text,
  theme_key text not null default 'blue',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ranks add column if not exists icon_url text;
alter table public.ranks add column if not exists theme_key text not null default 'blue';
alter table public.ranks add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.ranks add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.profiles
  add column if not exists current_rank_tier integer not null default 1;

alter table public.profiles
  add column if not exists current_rank_id uuid references public.ranks(id) on delete set null;

create table if not exists public.app_activity_snapshots (
  snapshot_date date primary key,
  snapshot_at timestamptz not null default timezone('utc', now()),
  daily_active_users integer not null default 0,
  weekly_active_users integer not null default 0,
  monthly_active_users integer not null default 0
);

create index if not exists idx_bet_plays_placed_at
  on public.bet_plays (placed_at desc);

create index if not exists idx_bet_plays_user_id_placed_at
  on public.bet_plays (user_id, placed_at desc);

create index if not exists idx_bet_plays_placed_at_user_id_hand_id
  on public.bet_plays (placed_at desc, user_id, hand_id);

create index if not exists idx_game_hands_created_at
  on public.game_hands (created_at desc);

create index if not exists idx_game_hands_user_id_created_at
  on public.game_hands (user_id, created_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.capture_app_activity_snapshot(
  target_snapshot_date date default (timezone('utc', now()))::date,
  snapshot_reference timestamptz default timezone('utc', now())
)
returns void
language plpgsql
security definer
as $$
declare
  effective_snapshot_date date := coalesce(target_snapshot_date, (timezone('utc', snapshot_reference))::date);
  effective_reference timestamptz := coalesce(snapshot_reference, timezone('utc', now()));
begin
  if current_user <> 'postgres'
     and session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to capture app activity snapshots';
  end if;

  insert into public.app_activity_snapshots (
    snapshot_date,
    snapshot_at,
    daily_active_users,
    weekly_active_users,
    monthly_active_users
  )
  values (
    effective_snapshot_date,
    effective_reference,
    (
      select count(distinct gh.user_id)::integer
      from public.game_hands gh
      where gh.created_at > effective_reference - interval '24 hours'
        and gh.created_at <= effective_reference
    ),
    (
      select count(distinct gh.user_id)::integer
      from public.game_hands gh
      where gh.created_at > effective_reference - interval '7 days'
        and gh.created_at <= effective_reference
    ),
    (
      select count(distinct gh.user_id)::integer
      from public.game_hands gh
      where gh.created_at > effective_reference - interval '30 days'
        and gh.created_at <= effective_reference
    )
  )
  on conflict (snapshot_date) do update
  set
    snapshot_at = excluded.snapshot_at,
    daily_active_users = excluded.daily_active_users,
    weekly_active_users = excluded.weekly_active_users,
    monthly_active_users = excluded.monthly_active_users;
end;
$$;

create or replace function public.backfill_app_activity_snapshots(
  start_snapshot_date date default null,
  end_snapshot_date date default (timezone('utc', now()))::date
)
returns integer
language plpgsql
security definer
as $$
declare
  derived_start_date date;
  snapshot_day date;
  affected_count integer := 0;
begin
  if current_user <> 'postgres'
     and session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to backfill app activity snapshots';
  end if;

  select coalesce(start_snapshot_date, min((timezone('utc', gh.created_at))::date), (timezone('utc', now()))::date)
  into derived_start_date
  from public.game_hands gh;

  if derived_start_date is null or derived_start_date > end_snapshot_date then
    return 0;
  end if;

  for snapshot_day in
    select gs::date
    from generate_series(derived_start_date, end_snapshot_date, interval '1 day') as gs
  loop
    perform public.capture_app_activity_snapshot(
      snapshot_day,
      (snapshot_day::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC'
    );
    affected_count := affected_count + 1;
  end loop;

  return affected_count;
end;
$$;

drop trigger if exists set_ranks_updated_at on public.ranks;
create trigger set_ranks_updated_at
before update on public.ranks
for each row
execute function public.set_updated_at_timestamp();

alter table public.ranks enable row level security;

drop policy if exists "Authenticated users can view ranks" on public.ranks;
create policy "Authenticated users can view ranks"
on public.ranks
for select
to authenticated
using (true);

drop policy if exists "Admin can manage ranks" on public.ranks;
create policy "Admin can manage ranks"
on public.ranks
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
with check ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');

insert into public.ranks (
  tier,
  name,
  welcome_phrase,
  required_hands_played,
  required_contest_wins,
  theme_key
)
values
  (1, 'Accountant', 'Welcome, Accountant {name}. We have work to do-these numbers won''t run themselves.', 0, 0, 'blue'),
  (2, 'Analyst', 'Analyst {name}, you''re on. Review the numbers and report your position.', 1000, 0, 'blue'),
  (3, 'Senior Analyst', 'Senior Analyst {name}, expectations are higher now. Don''t fall behind the numbers.', 2000, 1, 'pink'),
  (4, 'Auditor', 'Auditor {name}, let''s review the numbers together. Something feels... off.', 10000, 1, 'orange'),
  (5, 'Controller', 'Controller {name}, we''re seeing movement. Let''s keep this operation in balance.', 20000, 2, 'steel-black'),
  (6, 'Auditor General', 'Auditor General... the system is ready. Run the numbers, {name}.', 100000, 5, 'angelic'),
  (7, 'The Ledger', 'You are The Ledger. All numbers resolve through you. What is the next move, {name}?', 200000, 10, 'pastel')
on conflict (tier) do nothing;

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

create or replace function public.increment_profile_hands_played(target_user_id uuid, hand_increment integer default 1)
returns table(hands_played_all_time integer, current_rank_tier integer, current_rank_id uuid, updated_at timestamptz)
language plpgsql
security definer
as $$
begin
  update public.profiles as p
  set hands_played_all_time = greatest(
    0,
    coalesce(p.hands_played_all_time, 0) + greatest(coalesce(hand_increment, 1), 0)
  )
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.hands_played_all_time as hands_played_all_time,
    p.current_rank_tier as current_rank_tier,
    p.current_rank_id as current_rank_id,
    p.updated_at as updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.reconcile_profile_hands_played(target_user_id uuid default null)
returns table(hands_played_all_time integer, current_rank_tier integer, current_rank_id uuid, updated_at timestamptz)
language plpgsql
security definer
as $$
begin
  if target_user_id is null then
    update public.profiles p
    set hands_played_all_time = greatest(
      coalesce(p.hands_played_all_time, 0),
      coalesce(h.hand_count, 0)
    )
    from (
      select user_id, count(*)::integer as hand_count
      from public.game_hands
      group by user_id
    ) h
    where p.id = h.user_id;

    perform public.recompute_all_profile_ranks();
    return;
  end if;

  update public.profiles p
  set hands_played_all_time = greatest(
    coalesce(p.hands_played_all_time, 0),
    coalesce(h.hand_count, 0)
  )
  from (
    select count(*)::integer as hand_count
    from public.game_hands
    where user_id = target_user_id
  ) h
  where p.id = target_user_id;

  perform public.recompute_all_profile_ranks(target_user_id);

  return query
  select
    p.hands_played_all_time as hands_played_all_time,
    p.current_rank_tier as current_rank_tier,
    p.current_rank_id as current_rank_id,
    p.updated_at as updated_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

create or replace function public.get_admin_hands_played_timeseries(
  start_at timestamptz default null,
  end_at timestamptz default null,
  target_user_ids uuid[] default null,
  local_tz text default 'UTC'
)
returns table(day date, hands_played integer)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin hands chart';
  end if;

  return query
  select
    timezone(local_tz, gh.created_at)::date as day,
    count(*)::integer as hands_played
  from public.game_hands gh
  where (start_at is null or gh.created_at >= start_at)
    and (end_at is null or gh.created_at <= end_at)
    and (target_user_ids is null or gh.user_id = any(target_user_ids))
  group by timezone(local_tz, gh.created_at)::date
  order by timezone(local_tz, gh.created_at)::date asc;
end;
$$;

create or replace function public.get_admin_app_activity_snapshot_timeseries(
  start_at timestamptz default null,
  end_at timestamptz default null
)
returns table(
  snapshot_date date,
  daily_active_users integer,
  weekly_active_users integer,
  monthly_active_users integer
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view app activity snapshots';
  end if;

  return query
  select
    a.snapshot_date,
    a.daily_active_users,
    a.weekly_active_users,
    a.monthly_active_users
  from public.app_activity_snapshots a
  where (start_at is null or a.snapshot_at >= start_at)
    and (end_at is null or a.snapshot_at <= end_at)
  order by a.snapshot_date asc;
end;
$$;

create or replace function public.get_admin_analytics_players()
returns table(
  id uuid,
  username text,
  first_name text,
  last_name text,
  hands_played_all_time integer
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin analytics players';
  end if;

  return query
  select
    p.id,
    p.username,
    p.first_name,
    p.last_name,
    coalesce(p.hands_played_all_time, 0)::integer as hands_played_all_time
  from public.profiles p
  where coalesce(p.hands_played_all_time, 0) > 0
  order by lower(coalesce(p.username, concat_ws(' ', p.first_name, p.last_name), p.id::text));
end;
$$;

create or replace function public.get_admin_most_active_players(
  start_at timestamptz default null,
  end_at timestamptz default null,
  target_user_ids uuid[] default null,
  limit_count integer default 10
)
returns table(
  user_id uuid,
  bet_count bigint,
  hands_played bigint,
  wagered numeric,
  username text,
  first_name text,
  last_name text
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin activity rankings';
  end if;

  return query
  with top_bettors as (
    select
      bp.user_id,
      count(*)::bigint as bet_count,
      coalesce(sum(bp.amount_wagered), 0) as wagered
    from public.bet_plays bp
    where (start_at is null or bp.placed_at >= start_at)
      and (end_at is null or bp.placed_at <= end_at)
      and (target_user_ids is null or bp.user_id = any(target_user_ids))
    group by bp.user_id
    order by count(*) desc, coalesce(sum(bp.amount_wagered), 0) desc
    limit greatest(coalesce(limit_count, 10), 1) * 5
  ),
  hand_counts as (
    select
      gh.user_id,
      count(*)::bigint as hands_played
    from public.game_hands gh
    join top_bettors tb on tb.user_id = gh.user_id
    where (start_at is null or gh.created_at >= start_at)
      and (end_at is null or gh.created_at <= end_at)
    group by gh.user_id
  ),
  ranked as (
    select
      tb.user_id,
      tb.bet_count,
      coalesce(hc.hands_played, 0)::bigint as hands_played,
      tb.wagered
    from top_bettors tb
    left join hand_counts hc on hc.user_id = tb.user_id
    order by tb.bet_count desc, coalesce(hc.hands_played, 0) desc, tb.wagered desc
    limit greatest(coalesce(limit_count, 10), 1)
  )
  select
    ranked.user_id,
    ranked.bet_count,
    ranked.hands_played,
    ranked.wagered,
    p.username,
    p.first_name,
    p.last_name
  from ranked
  left join public.profiles p on p.id = ranked.user_id
  order by ranked.bet_count desc, ranked.hands_played desc, ranked.wagered desc;
end;
$$;

create or replace function public.get_admin_most_active_hands(
  start_at timestamptz default null,
  end_at timestamptz default null,
  target_user_ids uuid[] default null,
  limit_count integer default 10
)
returns table(
  user_id uuid,
  hands_played bigint,
  username text,
  first_name text,
  last_name text
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin hands activity rankings';
  end if;

  return query
  select
    gh.user_id,
    count(*)::bigint as hands_played,
    p.username,
    p.first_name,
    p.last_name
  from public.game_hands gh
  left join public.profiles p on p.id = gh.user_id
  where (start_at is null or gh.created_at >= start_at)
    and (end_at is null or gh.created_at <= end_at)
    and (target_user_ids is null or gh.user_id = any(target_user_ids))
  group by gh.user_id, p.username, p.first_name, p.last_name
  order by count(*) desc, gh.user_id
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

select public.recompute_all_profile_ranks();

grant select, insert, update, delete on public.ranks to authenticated;
grant execute on function public.recompute_all_profile_ranks(uuid) to authenticated;
grant execute on function public.increment_profile_hands_played(uuid, integer) to authenticated;
grant execute on function public.reconcile_profile_hands_played(uuid) to authenticated;
grant execute on function public.capture_app_activity_snapshot(date, timestamptz) to authenticated;
grant execute on function public.backfill_app_activity_snapshots(date, date) to authenticated;
grant execute on function public.get_admin_hands_played_timeseries(timestamptz, timestamptz, uuid[], text) to authenticated;
grant execute on function public.get_admin_app_activity_snapshot_timeseries(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_admin_analytics_players() to authenticated;
grant execute on function public.get_admin_most_active_players(timestamptz, timestamptz, uuid[], integer) to authenticated;
grant execute on function public.get_admin_most_active_hands(timestamptz, timestamptz, uuid[], integer) to authenticated;
