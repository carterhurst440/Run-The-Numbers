alter table public.game_hands
  add column if not exists drawn_cards jsonb not null default '[]'::jsonb;

create index if not exists idx_game_hands_drawn_cards_gin
  on public.game_hands
  using gin (drawn_cards);
