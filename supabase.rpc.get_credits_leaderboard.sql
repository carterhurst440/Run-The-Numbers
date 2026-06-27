-- ============================================================================
-- Credits leaderboard: top players by credit balance.
--
-- Everything in RTN is now a CREDITS competition. This SECURITY DEFINER function
-- exposes each player's public username, credit balance, and rank tier so the
-- homepage leaderboard can rank everyone by who holds the most credits. No other
-- profile data is returned. Authenticated users only.
-- ============================================================================
create or replace function public.get_credits_leaderboard()
returns table(
  id uuid,
  username text,
  credits numeric,
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
    p.credits,
    p.current_rank_tier,
    p.current_rank_id
  from public.profiles p
  where p.username is not null
    and length(trim(p.username)) > 0
  order by p.credits desc nulls last, p.username asc
  limit 100;
$$;

grant execute on function public.get_credits_leaderboard() to authenticated;
