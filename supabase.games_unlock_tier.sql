alter table public.games
  add column if not exists unlock_tier integer default null;
