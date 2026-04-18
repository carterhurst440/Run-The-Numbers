alter table public.shape_trader_draws
  add column if not exists previous_square_price numeric(12,2),
  add column if not exists previous_triangle_price numeric(12,2),
  add column if not exists previous_circle_price numeric(12,2),
  add column if not exists new_square_price numeric(12,2),
  add column if not exists new_triangle_price numeric(12,2),
  add column if not exists new_circle_price numeric(12,2),
  add column if not exists bankruptcy_split jsonb not null default '[]'::jsonb;
