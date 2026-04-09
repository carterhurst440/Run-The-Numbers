insert into public.games (id, name, status)
values
  ('game_001', 'Run the Numbers', 'active'),
  ('game_002', 'Guess 10', 'beta')
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());

alter table public.game_hands
  alter column game_id set default 'game_001';

update public.game_hands
set game_id = case
  when game_id in ('run-the-numbers', 'run_the_numbers', 'game_001') then 'game_001'
  when game_id in ('guess-10', 'red-black', 'red_black', 'guess10', 'game_002') then 'game_002'
  else game_id
end;

alter table public.contests
  alter column allowed_game_ids set default array['game_001', 'game_002']::text[];

update public.contests
set allowed_game_ids = (
  select array_agg(distinct mapped_id order by mapped_id)
  from (
    select case
      when candidate in ('run-the-numbers', 'run_the_numbers', 'game_001') then 'game_001'
      when candidate in ('guess-10', 'red-black', 'red_black', 'guess10', 'game_002') then 'game_002'
      else null
    end as mapped_id
    from unnest(coalesce(allowed_game_ids, array[]::text[])) as candidate
  ) mapped
  where mapped_id is not null
)
where allowed_game_ids is not null;

update public.contests
set allowed_game_ids = array['game_001', 'game_002']::text[]
where allowed_game_ids is null or cardinality(allowed_game_ids) = 0;

delete from public.games
where id in ('run-the-numbers', 'guess-10');
