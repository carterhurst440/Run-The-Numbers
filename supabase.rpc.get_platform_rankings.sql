create or replace function public.get_platform_rankings()
returns table(
  id uuid,
  username text,
  first_name text,
  last_name text,
  current_rank integer,
  current_rank_tier integer,
  current_rank_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.first_name,
    p.last_name,
    p.current_rank,
    p.current_rank_tier,
    p.current_rank_id
  from public.profiles p
  where p.current_rank is not null
  order by p.current_rank asc
  limit 200;
$$;

grant execute on function public.get_platform_rankings() to authenticated;
