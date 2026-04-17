create table if not exists public.shape_trader_price_history (
  id bigint generated always as identity primary key,
  draw_id bigint not null references public.shape_trader_draws(draw_id) on delete cascade,
  game_id text not null default 'game_003' references public.games(id),
  shape text not null check (shape in ('circle', 'square', 'triangle')),
  recorded_at timestamptz not null,
  previous_price numeric(14,2) not null default 0 check (previous_price >= 0),
  percentage_applied numeric(7,2) not null,
  new_price numeric(14,2) not null default 0 check (new_price >= 0),
  event_type text not null check (event_type in ('asset_card', 'macro_card', 'bankruptcy_reset', 'manual_reset')),
  split_triggered boolean not null default false,
  bankruptcy_triggered boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.shape_trader_price_history
  add column if not exists split_triggered boolean not null default false;

create unique index if not exists idx_shape_trader_price_history_draw_shape
  on public.shape_trader_price_history (draw_id, shape);

create index if not exists idx_shape_trader_price_history_shape_recorded_at
  on public.shape_trader_price_history (shape, recorded_at asc);

create index if not exists idx_shape_trader_price_history_recorded_at
  on public.shape_trader_price_history (recorded_at asc);

create index if not exists idx_shape_trader_price_history_event_type
  on public.shape_trader_price_history (event_type, recorded_at desc);

insert into public.games (id, name, status)
values
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());
