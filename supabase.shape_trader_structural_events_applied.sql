create table if not exists public.shape_trader_structural_events_applied (
  user_id uuid not null,
  game_id text not null default 'game_003' references public.games(id),
  contest_id uuid references public.contests(id) on delete set null,
  account_scope text not null default 'normal',
  draw_id bigint not null references public.shape_trader_draws(draw_id) on delete cascade,
  shape text not null check (shape in ('circle', 'square', 'triangle')),
  event_type text not null check (event_type in ('split', 'bankruptcy')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, account_scope, draw_id, shape, event_type)
);

create index if not exists idx_shape_trader_structural_events_applied_user_draw
  on public.shape_trader_structural_events_applied (user_id, account_scope, draw_id desc);
