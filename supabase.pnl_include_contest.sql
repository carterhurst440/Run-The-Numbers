-- ============================================================
-- Fix: snapshot_daily_profit_loss was excluding contest play
--
-- Previous version filtered:
--   coalesce(contest_id::text, '') = ''      (excluded contest hands)
--   mode_type is null or mode_type = 'normal' (excluded contest mode)
--
-- Per product decision: ALL play counts toward PNL — normal mode
-- and contest mode together.  The snapshot function is rewritten
-- to drop those filters, and all existing rows are backfilled.
-- ============================================================

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
      -- Server-draw RTN hands (all modes, including contest)
      select
        rlh.user_id,
        timezone('America/Denver', rlh.started_at)::date as profit_date,
        rlh.game_id,
        rlh.net
      from public.rtn_live_hands rlh
      where rlh.status <> 'active'

      union all

      -- Server-draw G10 hands (all modes, including contest)
      select
        glh.user_id,
        timezone('America/Denver', glh.started_at)::date as profit_date,
        glh.game_id,
        glh.net
      from public.guess10_live_hands glh
      where glh.status <> 'active'
    ) hands
    where hands.profit_date = target_date
    group by hands.user_id, hands.profit_date
  ),
  trade_totals as (
    select
      st.user_id,
      timezone('America/Denver', st.executed_at)::date as profit_date,
      sum(coalesce(st.net_profit, 0))::numeric(12,2) as pnl_shape_traders
    from public.shape_trader_trades st
    where timezone('America/Denver', st.executed_at)::date = target_date
      and lower(coalesce(st.trade_side, '')) = 'sell'
      and st.net_profit is not null
    group by st.user_id, timezone('America/Denver', st.executed_at)::date
  ),
  ryb_totals as (
    select
      csr.user_id,
      timezone('America/Denver', csr.created_at)::date as profit_date,
      sum(coalesce(csr.net_profit, 0))::numeric(12,2) as pnl_ryb
    from public.color_scheme_rounds csr
    where csr.status = 'completed'
      and timezone('America/Denver', csr.created_at)::date = target_date
    group by csr.user_id, timezone('America/Denver', csr.created_at)::date
  ),
  merged as (
    select
      coalesce(h.user_id, t.user_id, r.user_id)       as user_id,
      coalesce(h.profit_date, t.profit_date, r.profit_date, target_date) as profit_date,
      coalesce(h.pnl_rtn,           0)::numeric(12,2) as pnl_rtn,
      coalesce(h.pnl_g10,           0)::numeric(12,2) as pnl_g10,
      coalesce(t.pnl_shape_traders, 0)::numeric(12,2) as pnl_shape_traders,
      coalesce(r.pnl_ryb,           0)::numeric(12,2) as pnl_ryb
    from hand_totals h
    full outer join trade_totals t
      on h.user_id   = t.user_id
     and h.profit_date = t.profit_date
    full outer join ryb_totals r
      on coalesce(h.user_id, t.user_id) = r.user_id
     and coalesce(h.profit_date, t.profit_date) = r.profit_date
  ),
  upserted as (
    insert into public.daily_profit_loss (
      user_id,
      profit_date,
      pnl_total,
      pnl_rtn,
      pnl_g10,
      pnl_shape_traders,
      pnl_ryb,
      updated_at
    )
    select
      merged.user_id,
      merged.profit_date,
      (merged.pnl_rtn + merged.pnl_g10 + merged.pnl_shape_traders + merged.pnl_ryb)::numeric(12,2) as pnl_total,
      merged.pnl_rtn,
      merged.pnl_g10,
      merged.pnl_shape_traders,
      merged.pnl_ryb,
      timezone('utc', now())
    from merged
    where merged.user_id is not null
    on conflict (user_id, profit_date) do update
    set
      pnl_total         = excluded.pnl_total,
      pnl_rtn           = excluded.pnl_rtn,
      pnl_g10           = excluded.pnl_g10,
      pnl_shape_traders = excluded.pnl_shape_traders,
      pnl_ryb           = excluded.pnl_ryb,
      updated_at        = timezone('utc', now())
    returning 1
  )
  select count(*)::integer into affected_count from upserted;

  return affected_count;
end;
$$;

grant execute on function public.snapshot_daily_profit_loss(date) to authenticated;

-- Backfill all existing snapshot rows with correct all-modes PNL.
do $$
declare
  target_date    date;
  affected_count integer;
begin
  for target_date in
    select generate_series(
      (timezone('America/Denver', now())::date - 365),
      (timezone('America/Denver', now())::date - 1),
      interval '1 day'
    )::date
  loop
    select public.snapshot_daily_profit_loss(target_date)
    into affected_count;

    if coalesce(affected_count, 0) > 0 then
      raise notice 'Backfilled all-modes PNL for % (% rows)', target_date, affected_count;
    end if;
  end loop;
end;
$$;
