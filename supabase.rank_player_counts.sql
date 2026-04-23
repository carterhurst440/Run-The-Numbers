create or replace function public.get_rank_player_counts()
returns table(rank_tier integer, player_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    greatest(coalesce(p.current_rank_tier, 1), 1)::integer as rank_tier,
    count(*)::bigint as player_count
  from public.profiles p
  group by 1
  order by 1;
$$;

grant execute on function public.get_rank_player_counts() to authenticated;
