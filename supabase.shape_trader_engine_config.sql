-- Shape Traders backend engine configuration
-- Run this first so the eventual SQL engine reads one canonical ruleset
-- instead of hardcoded deck/timing values.

create table if not exists public.shape_trader_engine_config (
  id boolean primary key default true,
  epoch_at timestamptz not null,
  draw_interval_ms integer not null check (draw_interval_ms > 0),
  dump_every_windows integer not null check (dump_every_windows > 0),
  dump_cards integer not null check (dump_cards > 0),
  dump_card_interval_ms integer not null check (dump_card_interval_ms > 0),
  start_price numeric(12,2) not null check (start_price > 0),
  split_threshold numeric(12,2) not null check (split_threshold > 0),
  split_factor integer not null check (split_factor > 1),
  shuffle_version text not null default 'shape_trader_v1',
  updated_at timestamptz not null default now(),
  check (id = true)
);

insert into public.shape_trader_engine_config (
  id,
  epoch_at,
  draw_interval_ms,
  dump_every_windows,
  dump_cards,
  dump_card_interval_ms,
  start_price,
  split_threshold,
  split_factor,
  shuffle_version
)
values (
  true,
  '2026-04-16T00:00:00Z',
  15000,
  10,
  5,
  2000,
  100.00,
  1000.00,
  10,
  'shape_trader_v1'
)
on conflict (id) do update
set
  epoch_at = excluded.epoch_at,
  draw_interval_ms = excluded.draw_interval_ms,
  dump_every_windows = excluded.dump_every_windows,
  dump_cards = excluded.dump_cards,
  dump_card_interval_ms = excluded.dump_card_interval_ms,
  start_price = excluded.start_price,
  split_threshold = excluded.split_threshold,
  split_factor = excluded.split_factor,
  shuffle_version = excluded.shuffle_version,
  updated_at = now();

create table if not exists public.shape_trader_deck_cards (
  card_key text primary key,
  kind text not null check (kind in ('asset', 'macro')),
  shape text null check (shape in ('square', 'triangle', 'circle')),
  percentage numeric(8,2) not null,
  label text not null,
  enabled boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'asset' and shape is not null)
    or
    (kind = 'macro' and shape is null)
  )
);

insert into public.shape_trader_deck_cards (card_key, kind, shape, percentage, label, sort_order)
values
  ('square_5', 'asset', 'square', 5, 'Square +5%', 10),
  ('square_10', 'asset', 'square', 10, 'Square +10%', 20),
  ('square_15', 'asset', 'square', 15, 'Square +15%', 30),
  ('square_20', 'asset', 'square', 20, 'Square +20%', 40),
  ('square_25', 'asset', 'square', 25, 'Square +25%', 50),
  ('square_30', 'asset', 'square', 30, 'Square +30%', 60),
  ('square_40', 'asset', 'square', 40, 'Square +40%', 70),
  ('square_50', 'asset', 'square', 50, 'Square +50%', 80),
  ('square_100', 'asset', 'square', 100, 'Square +100%', 90),
  ('square_m5', 'asset', 'square', -5, 'Square -5%', 100),
  ('square_m9', 'asset', 'square', -9, 'Square -9%', 110),
  ('square_m13', 'asset', 'square', -13, 'Square -13%', 120),
  ('square_m17', 'asset', 'square', -17, 'Square -17%', 130),
  ('square_m20', 'asset', 'square', -20, 'Square -20%', 140),
  ('square_m23', 'asset', 'square', -23, 'Square -23%', 150),
  ('square_m30', 'asset', 'square', -30, 'Square -30%', 160),
  ('square_m33', 'asset', 'square', -33, 'Square -33%', 170),
  ('square_m50', 'asset', 'square', -50, 'Square -50%', 180),

  ('triangle_5', 'asset', 'triangle', 5, 'Triangle +5%', 210),
  ('triangle_10', 'asset', 'triangle', 10, 'Triangle +10%', 220),
  ('triangle_15', 'asset', 'triangle', 15, 'Triangle +15%', 230),
  ('triangle_20', 'asset', 'triangle', 20, 'Triangle +20%', 240),
  ('triangle_25', 'asset', 'triangle', 25, 'Triangle +25%', 250),
  ('triangle_30', 'asset', 'triangle', 30, 'Triangle +30%', 260),
  ('triangle_40', 'asset', 'triangle', 40, 'Triangle +40%', 270),
  ('triangle_50', 'asset', 'triangle', 50, 'Triangle +50%', 280),
  ('triangle_100', 'asset', 'triangle', 100, 'Triangle +100%', 290),
  ('triangle_m5', 'asset', 'triangle', -5, 'Triangle -5%', 300),
  ('triangle_m9', 'asset', 'triangle', -9, 'Triangle -9%', 310),
  ('triangle_m13', 'asset', 'triangle', -13, 'Triangle -13%', 320),
  ('triangle_m17', 'asset', 'triangle', -17, 'Triangle -17%', 330),
  ('triangle_m20', 'asset', 'triangle', -20, 'Triangle -20%', 340),
  ('triangle_m23', 'asset', 'triangle', -23, 'Triangle -23%', 350),
  ('triangle_m30', 'asset', 'triangle', -30, 'Triangle -30%', 360),
  ('triangle_m33', 'asset', 'triangle', -33, 'Triangle -33%', 370),
  ('triangle_m50', 'asset', 'triangle', -50, 'Triangle -50%', 380),

  ('circle_5', 'asset', 'circle', 5, 'Circle +5%', 410),
  ('circle_10', 'asset', 'circle', 10, 'Circle +10%', 420),
  ('circle_15', 'asset', 'circle', 15, 'Circle +15%', 430),
  ('circle_20', 'asset', 'circle', 20, 'Circle +20%', 440),
  ('circle_25', 'asset', 'circle', 25, 'Circle +25%', 450),
  ('circle_30', 'asset', 'circle', 30, 'Circle +30%', 460),
  ('circle_40', 'asset', 'circle', 40, 'Circle +40%', 470),
  ('circle_50', 'asset', 'circle', 50, 'Circle +50%', 480),
  ('circle_100', 'asset', 'circle', 100, 'Circle +100%', 490),
  ('circle_m5', 'asset', 'circle', -5, 'Circle -5%', 500),
  ('circle_m9', 'asset', 'circle', -9, 'Circle -9%', 510),
  ('circle_m13', 'asset', 'circle', -13, 'Circle -13%', 520),
  ('circle_m17', 'asset', 'circle', -17, 'Circle -17%', 530),
  ('circle_m20', 'asset', 'circle', -20, 'Circle -20%', 540),
  ('circle_m23', 'asset', 'circle', -23, 'Circle -23%', 550),
  ('circle_m30', 'asset', 'circle', -30, 'Circle -30%', 560),
  ('circle_m33', 'asset', 'circle', -33, 'Circle -33%', 570),
  ('circle_m50', 'asset', 'circle', -50, 'Circle -50%', 580),

  ('macro_5', 'macro', null, 5, 'Macro +5%', 610),
  ('macro_10', 'macro', null, 10, 'Macro +10%', 620),
  ('macro_15', 'macro', null, 15, 'Macro +15%', 630),
  ('macro_20', 'macro', null, 20, 'Macro +20%', 640),
  ('macro_25', 'macro', null, 25, 'Macro +25%', 650),
  ('macro_m5', 'macro', null, -5, 'Macro -5%', 660),
  ('macro_m9', 'macro', null, -9, 'Macro -9%', 670),
  ('macro_m13', 'macro', null, -13, 'Macro -13%', 680),
  ('macro_m17', 'macro', null, -17, 'Macro -17%', 690),
  ('macro_m20', 'macro', null, -20, 'Macro -20%', 700),
  ('macro_50', 'macro', null, 50, 'Animal Spirits +50%', 710),
  ('macro_m33', 'macro', null, -33, 'Market Panic -33%', 720)
on conflict (card_key) do update
set
  kind = excluded.kind,
  shape = excluded.shape,
  percentage = excluded.percentage,
  label = excluded.label,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();
