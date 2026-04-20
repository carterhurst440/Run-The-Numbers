alter table public.shape_trader_accounts_current
  add column if not exists last_structural_draw_id bigint not null default 0;
