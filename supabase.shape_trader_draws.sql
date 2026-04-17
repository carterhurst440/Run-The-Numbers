create table if not exists public.shape_trader_draws (
  draw_id bigint primary key,
  game_id text not null default 'game_003' references public.games(id),
  window_index bigint not null check (window_index >= 0),
  sequence_in_window integer not null check (sequence_in_window >= 1),
  is_data_dump boolean not null default false,
  card_kind text not null check (card_kind in ('asset', 'macro')),
  shape text check (shape in ('circle', 'square', 'triangle') or shape is null),
  percentage numeric(7,2) not null,
  card_label text not null,
  drawn_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_shape_trader_draws_window_sequence
  on public.shape_trader_draws (window_index, sequence_in_window);

create index if not exists idx_shape_trader_draws_drawn_at
  on public.shape_trader_draws (drawn_at desc);

create index if not exists idx_shape_trader_draws_shape
  on public.shape_trader_draws (shape, drawn_at desc);

insert into public.games (id, name, status)
values
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());
