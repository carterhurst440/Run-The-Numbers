-- Per-game daily activity counts for any player, mirroring the homescreen
-- activity chart but readable cross-user (SECURITY DEFINER, like get_bankroll_series).
-- Powers the ACCOUNT ACTIVITY view in the leaderboard player modal
-- (bankroll-history-modal). Returns one row per day for the last p_days days;
-- the client re-buckets into week/month for longer windows.
create or replace function public.get_activity_series(p_user_id uuid, p_days int default 30)
returns table(d date, rtn bigint, g10 bigint, st bigint, ryb bigint, fof bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (current_date - (greatest(coalesce(p_days,30),1) - 1))::date as start_day
  ),
  days as (
    select generate_series((select start_day from bounds), current_date, interval '1 day')::date as d
  ),
  rtn_c as (
    select started_at::date d, count(*) n from rtn_live_hands
    where user_id = p_user_id and status <> 'active'
      and started_at >= (select start_day from bounds) group by 1
  ),
  g10_c as (
    select started_at::date d, count(*) n from guess10_live_hands
    where user_id = p_user_id and status <> 'active'
      and started_at >= (select start_day from bounds) group by 1
  ),
  st_c as (
    select executed_at::date d, count(*) n from shape_trader_trades
    where user_id = p_user_id
      and executed_at >= (select start_day from bounds) group by 1
  ),
  ryb_c as (
    select created_at::date d, count(*) n from color_scheme_rounds
    where user_id = p_user_id
      and created_at >= (select start_day from bounds) group by 1
  ),
  fof_c as (
    select created_at::date d, count(*) n from fate_or_fortune_rounds
    where user_id = p_user_id and status = 'resolved'
      and created_at >= (select start_day from bounds) group by 1
  )
  select days.d,
         coalesce(rtn_c.n,0), coalesce(g10_c.n,0), coalesce(st_c.n,0),
         coalesce(ryb_c.n,0), coalesce(fof_c.n,0)
  from days
  left join rtn_c on rtn_c.d = days.d
  left join g10_c on g10_c.d = days.d
  left join st_c  on st_c.d  = days.d
  left join ryb_c on ryb_c.d = days.d
  left join fof_c on fof_c.d = days.d
  order by days.d;
$$;

grant execute on function public.get_activity_series(uuid, int) to authenticated, anon;
