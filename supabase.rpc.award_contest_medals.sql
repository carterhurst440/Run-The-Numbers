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
