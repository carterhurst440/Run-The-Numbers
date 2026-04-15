create table if not exists public.guess10_draw_plays (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references public.game_hands(id) on delete cascade,
  user_id uuid not null,
  game_id text not null default 'game_002' references public.games(id),
  draw_index integer not null check (draw_index >= 1),
  placed_at timestamptz not null default timezone('utc', now()),
  wager_amount numeric not null default 0,
  prediction_category text not null,
  prediction_values jsonb not null default '[]'::jsonb,
  selection_label text not null default '',
  multiplier numeric not null default 0,
  drawn_card_label text,
  drawn_card_suit text,
  drawn_card_suit_name text,
  drawn_card_color text,
  was_correct boolean not null default false,
  starting_pot numeric not null default 0,
  ending_pot numeric not null default 0,
  hand_result text,
  cashout_payout numeric not null default 0,
  commission_kept numeric not null default 0,
  net_hand_profit numeric not null default 0
);

alter table public.guess10_draw_plays
  add column if not exists hand_result text,
  add column if not exists cashout_payout numeric not null default 0,
  add column if not exists commission_kept numeric not null default 0,
  add column if not exists net_hand_profit numeric not null default 0;

create unique index if not exists idx_guess10_draw_plays_hand_draw_index
  on public.guess10_draw_plays (hand_id, draw_index);

create index if not exists idx_guess10_draw_plays_user_id_placed_at
  on public.guess10_draw_plays (user_id, placed_at desc);

create index if not exists idx_guess10_draw_plays_game_id_placed_at
  on public.guess10_draw_plays (game_id, placed_at desc);

create index if not exists idx_guess10_draw_plays_hand_id
  on public.guess10_draw_plays (hand_id);
