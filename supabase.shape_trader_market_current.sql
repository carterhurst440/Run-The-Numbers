create table if not exists public.shape_trader_market_current (
  shape text primary key check (shape in ('circle', 'square', 'triangle')),
  game_id text not null default 'game_003' references public.games(id),
  current_price numeric(14,2) not null default 100 check (current_price >= 0),
  last_draw_id bigint references public.shape_trader_draws(draw_id) on delete set null,
  last_window_index bigint check (last_window_index is null or last_window_index >= 0),
  last_sequence_in_window integer check (last_sequence_in_window is null or last_sequence_in_window >= 1),
  last_card_label text,
  last_percentage numeric(7,2),
  last_event_type text check (last_event_type in ('asset_card', 'macro_card', 'bankruptcy_reset', 'manual_reset') or last_event_type is null),
  bankruptcy_triggered boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_shape_trader_market_current_updated_at
  on public.shape_trader_market_current (updated_at desc);

insert into public.shape_trader_market_current (
  shape,
  game_id,
  current_price,
  last_draw_id,
  last_window_index,
  last_sequence_in_window,
  last_card_label,
  last_percentage,
  last_event_type,
  bankruptcy_triggered
)
values
  ('circle', 'game_003', 100, null, null, null, null, null, null, false),
  ('square', 'game_003', 100, null, null, null, null, null, null, false),
  ('triangle', 'game_003', 100, null, null, null, null, null, null, false)
on conflict (shape) do nothing;

insert into public.games (id, name, status)
values
  ('game_003', 'Shape Traders', 'admin')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());
