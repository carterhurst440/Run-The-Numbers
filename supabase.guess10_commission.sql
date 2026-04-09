alter table public.game_hands
  add column if not exists commission_kept numeric(12,2) not null default 0;

update public.game_hands
set commission_kept = 0
where commission_kept is null;
