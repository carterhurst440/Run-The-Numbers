alter table public.shape_trader_trades
  add column if not exists trade_reason text not null default '';
