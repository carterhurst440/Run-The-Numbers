create table if not exists public.shape_trader_accounts_current (
  user_id uuid not null,
  game_id text not null default 'game_003' references public.games(id),
  contest_id uuid references public.contests(id) on delete set null,
  account_scope text not null default 'normal',
  cash_balance numeric(12,2) not null default 0,
  holdings_value numeric(12,2) not null default 0,
  account_value numeric(12,2) not null default 0,
  last_active_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, account_scope)
);

create table if not exists public.shape_trader_positions_current (
  user_id uuid not null,
  game_id text not null default 'game_003' references public.games(id),
  contest_id uuid references public.contests(id) on delete set null,
  account_scope text not null default 'normal',
  shape text not null check (shape in ('circle', 'square', 'triangle')),
  quantity integer not null default 0 check (quantity >= 0),
  average_price numeric(12,2) not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, account_scope, shape)
);

create index if not exists idx_shape_trader_accounts_current_last_active
  on public.shape_trader_accounts_current (last_active_at desc);

create index if not exists idx_shape_trader_positions_current_shape
  on public.shape_trader_positions_current (shape, updated_at desc);

create index if not exists idx_shape_trader_accounts_current_contest_id
  on public.shape_trader_accounts_current (contest_id);

create index if not exists idx_shape_trader_positions_current_contest_id
  on public.shape_trader_positions_current (contest_id);

insert into public.games (id, name, status)
values
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());
