-- ============================================================
-- Diagnostic: raw PNL data for a specific user
-- Replace the UUID below with any user you want to inspect.
-- Run in Supabase SQL editor.
-- ============================================================

do $$ declare target_id uuid := 'c28f240c-4020-4c37-8c98-8b49119c400b'; begin

  raise notice '=== RTN LIVE HANDS ===';
  raise notice 'count=%, sum(net)=%',
    (select count(*) from public.rtn_live_hands where user_id = target_id and status <> 'active'),
    (select coalesce(sum(net),0) from public.rtn_live_hands where user_id = target_id and status <> 'active');

  raise notice '=== GUESS10 LIVE HANDS ===';
  raise notice 'count=%, sum(net)=%',
    (select count(*) from public.guess10_live_hands where user_id = target_id and status <> 'active'),
    (select coalesce(sum(net),0) from public.guess10_live_hands where user_id = target_id and status <> 'active');

  raise notice '=== SHAPE TRADER TRADES ===';
  raise notice 'count=%, sum(net_profit)=%',
    (select count(*) from public.shape_trader_trades where user_id = target_id),
    (select coalesce(sum(net_profit),0) from public.shape_trader_trades where user_id = target_id);

  raise notice '=== COLOR SCHEME ROUNDS ===';
  raise notice 'count=%, sum(net_profit)=%',
    (select count(*) from public.color_scheme_rounds where user_id = target_id and status = 'completed'),
    (select coalesce(sum(net_profit),0) from public.color_scheme_rounds where user_id = target_id and status = 'completed');

  raise notice '=== GRAND TOTAL ===';
  raise notice 'total_pnl=%',
    (
      select coalesce(
        (select coalesce(sum(net),0) from public.rtn_live_hands where user_id = target_id and status <> 'active') +
        (select coalesce(sum(net),0) from public.guess10_live_hands where user_id = target_id and status <> 'active') +
        (select coalesce(sum(net_profit),0) from public.shape_trader_trades where user_id = target_id) +
        (select coalesce(sum(net_profit),0) from public.color_scheme_rounds where user_id = target_id and status = 'completed'),
      0)
    );

end $$;

-- ── Detailed rows: biggest losers per table ───────────────────────────────

-- Top 20 worst RTN hands
select 'RTN' as game, id, started_at, net, total_wager, total_paid, new_account_value,
       case when contest_id is null then 'normal' else 'contest' end as mode
from public.rtn_live_hands
where user_id = 'c28f240c-4020-4c37-8c98-8b49119c400b'
  and status <> 'active'
order by net asc
limit 20;

-- Top 20 worst G10 hands
select 'G10' as game, id, started_at, net, total_wager, total_paid, new_account_value,
       case when contest_id is null then 'normal' else 'contest' end as mode
from public.guess10_live_hands
where user_id = 'c28f240c-4020-4c37-8c98-8b49119c400b'
  and status <> 'active'
order by net asc
limit 20;

-- Top 20 worst ST trades
select 'ST' as game, id, executed_at, net_profit, total_value, new_account_value,
       case when contest_id is null then 'normal' else 'contest' end as mode
from public.shape_trader_trades
where user_id = 'c28f240c-4020-4c37-8c98-8b49119c400b'
order by net_profit asc
limit 20;

-- ALL color scheme rounds (often the hidden culprit)
select 'RYB' as game, id, created_at, net_profit, total_wagered, total_returned, new_account_value,
       case when contest_id is null then 'normal' else 'contest' end as mode
from public.color_scheme_rounds
where user_id = 'c28f240c-4020-4c37-8c98-8b49119c400b'
  and status = 'completed'
order by net_profit asc
limit 50;

-- ── daily_profit_loss rows for this user ─────────────────────────────────
select profit_date, mode, pnl_rtn, pnl_g10, pnl_shape_traders, pnl_ryb, pnl_total
from public.daily_profit_loss
where user_id = 'c28f240c-4020-4c37-8c98-8b49119c400b'
order by profit_date desc;
