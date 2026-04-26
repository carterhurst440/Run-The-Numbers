create table if not exists public.daily_profit_loss (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profit_date date not null,
  pnl_total numeric(12,2) not null default 0,
  pnl_rtn numeric(12,2) not null default 0,
  pnl_g10 numeric(12,2) not null default 0,
  pnl_shape_traders numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, profit_date)
);

create index if not exists idx_daily_profit_loss_user_date
  on public.daily_profit_loss (user_id, profit_date desc);

alter table public.daily_profit_loss enable row level security;

drop policy if exists "daily_profit_loss_select_own" on public.daily_profit_loss;
create policy "daily_profit_loss_select_own"
on public.daily_profit_loss
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.snapshot_daily_profit_loss(
  target_date date default ((timezone('America/Denver', now()))::date - 1)
)
returns integer
language plpgsql
security definer
as $$
declare
  affected_count integer := 0;
begin
  with hand_totals as (
    select
      hands.user_id,
      hands.profit_date,
      sum(case when hands.game_id = 'game_001' then coalesce(hands.net, 0) else 0 end)::numeric(12,2) as pnl_rtn,
      sum(case when hands.game_id = 'game_002' then coalesce(hands.net, 0) else 0 end)::numeric(12,2) as pnl_g10
    from (
      select
        rlh.user_id,
        timezone('America/Denver', rlh.started_at)::date as profit_date,
        rlh.game_id,
        rlh.net,
        rlh.contest_id,
        rlh.mode_type
      from public.rtn_live_hands rlh
      where rlh.status <> 'active'

      union all

      select
        gh.user_id,
        timezone('America/Denver', gh.created_at)::date as profit_date,
        gh.game_id,
        gh.net,
        gh.contest_id,
        gh.mode_type
      from public.game_hands gh
      where coalesce(gh.game_id, 'game_001') <> 'game_001'
    ) hands
    where hands.profit_date = target_date
      and coalesce(hands.contest_id::text, '') = ''
      and (
        hands.mode_type is null
        or lower(hands.mode_type) = 'normal'
      )
    group by hands.user_id, hands.profit_date
  ),
  trade_totals as (
    select
      st.user_id,
      timezone('America/Denver', st.executed_at)::date as profit_date,
      sum(coalesce(st.net_profit, 0))::numeric(12,2) as pnl_shape_traders
    from public.shape_trader_trades st
    where timezone('America/Denver', st.executed_at)::date = target_date
      and coalesce(st.contest_id::text, '') = ''
      and lower(coalesce(st.trade_side, '')) = 'sell'
    group by st.user_id, timezone('America/Denver', st.executed_at)::date
  ),
  merged as (
    select
      coalesce(h.user_id, t.user_id) as user_id,
      coalesce(h.profit_date, t.profit_date, target_date) as profit_date,
      coalesce(h.pnl_rtn, 0)::numeric(12,2) as pnl_rtn,
      coalesce(h.pnl_g10, 0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders, 0)::numeric(12,2) as pnl_shape_traders
    from hand_totals h
    full outer join trade_totals t
      on h.user_id = t.user_id
     and h.profit_date = t.profit_date
  ),
  upserted as (
    insert into public.daily_profit_loss (
      user_id,
      profit_date,
      pnl_total,
      pnl_rtn,
      pnl_g10,
      pnl_shape_traders,
      updated_at
    )
    select
      merged.user_id,
      merged.profit_date,
      (merged.pnl_rtn + merged.pnl_g10 + merged.pnl_shape_traders)::numeric(12,2) as pnl_total,
      merged.pnl_rtn,
      merged.pnl_g10,
      merged.pnl_shape_traders,
      timezone('utc', now())
    from merged
    where merged.user_id is not null
    on conflict (user_id, profit_date) do update
    set
      pnl_total = excluded.pnl_total,
      pnl_rtn = excluded.pnl_rtn,
      pnl_g10 = excluded.pnl_g10,
      pnl_shape_traders = excluded.pnl_shape_traders,
      updated_at = timezone('utc', now())
    returning 1
  )
  select count(*)::integer into affected_count from upserted;

  return affected_count;
end;
$$;

grant execute on function public.snapshot_daily_profit_loss(date) to authenticated;

-- Run this once per day after midnight America/Denver.
-- If your scheduler uses UTC, adjust the cron time seasonally for DST or use
-- a scheduler that supports America/Denver directly.
-- Example job body:
-- select public.snapshot_daily_profit_loss();
