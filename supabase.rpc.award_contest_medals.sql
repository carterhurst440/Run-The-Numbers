create or replace function public.award_contest_medals(_contest_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
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
  ),
  recomputed_profiles as (
    update public.profiles p
    set
      current_rank_id = ranked.rank_id,
      current_rank_tier = ranked.tier
    from (
      select
        p2.id as user_id,
        r.id as rank_id,
        r.tier,
        row_number() over (partition by p2.id order by r.tier desc) as rn
      from public.profiles p2
      join public.ranks r
        on coalesce(p2.hands_played_all_time, 0) >= coalesce(r.required_hands_played, 0)
       and coalesce(p2.contest_wins, 0) >= coalesce(r.required_contest_wins, 0)
      where p2.id in (select id from updated_profiles)
    ) ranked
    where p.id = ranked.user_id
      and ranked.rn = 1
    returning p.id
  )
  select count(*) into inserted_count
  from inserted_medals;

  return inserted_count;
end;
$$;

revoke all on function public.award_contest_medals(uuid) from public;
grant execute on function public.award_contest_medals(uuid) to authenticated;
