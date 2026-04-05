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

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
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

select public.recompute_all_profile_ranks();

grant select, insert, update, delete on public.ranks to authenticated;
grant execute on function public.recompute_all_profile_ranks(uuid) to authenticated;
grant execute on function public.increment_profile_hands_played(uuid, integer) to authenticated;
grant execute on function public.reconcile_profile_hands_played(uuid) to authenticated;
grant execute on function public.get_admin_hands_played_timeseries(timestamptz, timestamptz, uuid[], text) to authenticated;
