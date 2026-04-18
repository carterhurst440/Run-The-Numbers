alter table public.game_hands
  add column if not exists new_account_value numeric(12,2);

create index if not exists idx_game_hands_user_id_created_at_account_value
  on public.game_hands (user_id, created_at desc, new_account_value);
