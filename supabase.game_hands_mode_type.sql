alter table public.game_hands
  add column if not exists mode_type text not null default 'normal';

update public.game_hands
set mode_type = 'normal'
where coalesce(mode_type, '') = '';

create index if not exists idx_game_hands_user_id_mode_type_created_at
  on public.game_hands (user_id, mode_type, created_at desc);
