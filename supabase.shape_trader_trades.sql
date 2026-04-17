create table if not exists public.shape_trader_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id text not null default 'game_003' references public.games(id),
  shape text not null check (shape in ('circle', 'square', 'triangle')),
  shape_price numeric(12,2) not null default 0,
  executed_at timestamptz not null default timezone('utc', now()),
  trade_side text not null check (trade_side in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  total_value numeric(12,2) not null default 0,
  net_profit numeric(12,2),
  new_account_value numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_shape_trader_trades_user_id_executed_at
  on public.shape_trader_trades (user_id, executed_at desc);

create index if not exists idx_shape_trader_trades_game_id_executed_at
  on public.shape_trader_trades (game_id, executed_at desc);

create index if not exists idx_shape_trader_trades_shape_executed_at
  on public.shape_trader_trades (shape, executed_at desc);

insert into public.games (id, name, status)
values
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());
