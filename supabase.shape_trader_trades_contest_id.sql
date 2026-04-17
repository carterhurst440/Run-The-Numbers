alter table public.shape_trader_trades
  add column if not exists contest_id uuid references public.contests(id) on delete set null;

create index if not exists idx_shape_trader_trades_contest_id_executed_at
  on public.shape_trader_trades (contest_id, executed_at desc);
