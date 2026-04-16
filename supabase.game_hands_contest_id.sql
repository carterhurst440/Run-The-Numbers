alter table public.game_hands
  add column if not exists contest_id uuid references public.contests(id) on delete set null;

create index if not exists idx_game_hands_user_id_contest_id_created_at
  on public.game_hands (user_id, contest_id, created_at desc);
