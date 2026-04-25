create table if not exists public.guess10_live_hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id text not null default 'game_002' references public.games(id),
  mode_type text,
  contest_id uuid,
  status text not null default 'active'
    check (status in ('active', 'loss', 'cashout', 'cancelled', 'void')),
  result text
    check (result is null or result in ('loss', 'cashout', 'cancelled', 'void')),
  selection_category text,
  selection_values jsonb not null default '[]'::jsonb,
  selection_label text not null default '',
  current_pot numeric not null default 0,
  current_rung integer not null default 0 check (current_rung >= 0),
  draw_count integer not null default 0 check (draw_count >= 0),
  started_at timestamptz not null default timezone('utc', now()),
  last_draw_at timestamptz,
  ended_at timestamptz,
  stopper_label text,
  stopper_suit text,
  total_cards integer,
  total_wager numeric not null default 0,
  total_paid numeric not null default 0,
  net numeric not null default 0,
  commission_kept numeric not null default 0,
  new_account_value numeric,
  drawn_cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_guess10_live_hands_user_started_at
  on public.guess10_live_hands (user_id, started_at desc);

create index if not exists idx_guess10_live_hands_status_started_at
  on public.guess10_live_hands (status, started_at desc);

create index if not exists idx_guess10_live_hands_user_status_started_at
  on public.guess10_live_hands (user_id, status, started_at desc);

create index if not exists idx_guess10_live_hands_contest_started_at
  on public.guess10_live_hands (contest_id, started_at desc);

create index if not exists idx_guess10_live_hands_drawn_cards_gin
  on public.guess10_live_hands
  using gin (drawn_cards);

insert into public.guess10_live_hands (
  id,
  user_id,
  game_id,
  mode_type,
  contest_id,
  status,
  result,
  selection_category,
  selection_values,
  selection_label,
  current_pot,
  current_rung,
  draw_count,
  started_at,
  last_draw_at,
  ended_at,
  stopper_label,
  stopper_suit,
  total_cards,
  total_wager,
  total_paid,
  net,
  commission_kept,
  new_account_value,
  drawn_cards,
  created_at,
  updated_at
)
select
  gh.id,
  gh.user_id,
  coalesce(gh.game_id, 'game_002'),
  gh.mode_type,
  gh.contest_id,
  case
    when coalesce(gh.total_cards, 0) > 0 then
      case
        when coalesce(gh.net, 0) > 0 then 'cashout'
        else 'loss'
      end
    else 'active'
  end as status,
  case
    when coalesce(gh.total_cards, 0) > 0 then
      case
        when coalesce(gh.net, 0) > 0 then 'cashout'
        else 'loss'
      end
    else null
  end as result,
  null as selection_category,
  '[]'::jsonb as selection_values,
  '' as selection_label,
  coalesce(gh.total_paid, 0) as current_pot,
  0 as current_rung,
  coalesce(jsonb_array_length(coalesce(gh.drawn_cards, '[]'::jsonb)), 0) as draw_count,
  gh.created_at as started_at,
  gh.created_at as last_draw_at,
  case when coalesce(gh.total_cards, 0) > 0 then gh.created_at else null end as ended_at,
  gh.stopper_label,
  gh.stopper_suit,
  gh.total_cards,
  coalesce(gh.total_wager, 0) as total_wager,
  coalesce(gh.total_paid, 0) as total_paid,
  coalesce(gh.net, 0) as net,
  coalesce(gh.commission_kept, 0) as commission_kept,
  gh.new_account_value,
  coalesce(gh.drawn_cards, '[]'::jsonb) as drawn_cards,
  gh.created_at,
  coalesce(gh.created_at, timezone('utc', now())) as updated_at
from public.game_hands gh
where coalesce(gh.game_id, 'game_001') = 'game_002'
on conflict (id) do update
set
  user_id = excluded.user_id,
  game_id = excluded.game_id,
  mode_type = excluded.mode_type,
  contest_id = excluded.contest_id,
  status = excluded.status,
  result = excluded.result,
  current_pot = excluded.current_pot,
  draw_count = excluded.draw_count,
  started_at = excluded.started_at,
  last_draw_at = excluded.last_draw_at,
  ended_at = excluded.ended_at,
  stopper_label = excluded.stopper_label,
  stopper_suit = excluded.stopper_suit,
  total_cards = excluded.total_cards,
  total_wager = excluded.total_wager,
  total_paid = excluded.total_paid,
  net = excluded.net,
  commission_kept = excluded.commission_kept,
  new_account_value = excluded.new_account_value,
  drawn_cards = excluded.drawn_cards,
  updated_at = timezone('utc', now());

alter table public.guess10_draw_plays
  add column if not exists origin text not null default 'client'
    check (origin in ('client', 'server')),
  add column if not exists resolved_at timestamptz not null default timezone('utc', now()),
  add column if not exists resulting_status text
    check (resulting_status is null or resulting_status in ('active', 'loss', 'cashout', 'cancelled', 'void')),
  add column if not exists resulting_rung integer not null default 0 check (resulting_rung >= 0),
  add column if not exists resulting_draw_count integer not null default 0 check (resulting_draw_count >= 0),
  add column if not exists resulting_commission_rate numeric not null default 0,
  add column if not exists server_seed text;

update public.guess10_draw_plays
set
  resolved_at = coalesce(resolved_at, placed_at),
  origin = coalesce(origin, 'client'),
  resulting_draw_count = greatest(coalesce(resulting_draw_count, 0), coalesce(draw_index, 0)),
  resulting_rung = greatest(
    coalesce(resulting_rung, 0),
    case when coalesce(was_correct, false) then coalesce(draw_index, 0) else greatest(coalesce(draw_index, 1) - 1, 0) end
  ),
  resulting_status = coalesce(
    resulting_status,
    case
      when hand_result in ('loss', 'cashout', 'cancelled', 'void') then hand_result
      else 'active'
    end
  )
where true;

with first_draw as (
  select distinct on (gdp.hand_id)
    gdp.hand_id,
    gdp.prediction_category,
    gdp.prediction_values,
    gdp.selection_label
  from public.guess10_draw_plays gdp
  order by gdp.hand_id, gdp.draw_index asc, gdp.placed_at asc
),
draw_rollup as (
  select
    gdp.hand_id,
    max(coalesce(gdp.draw_index, 0))::integer as draw_count,
    count(*) filter (where coalesce(gdp.was_correct, false))::integer as correct_draws,
    max(coalesce(gdp.resolved_at, gdp.placed_at)) as last_draw_at,
    max(gdp.resulting_status) filter (where gdp.resulting_status in ('loss', 'cashout', 'cancelled', 'void')) as final_status
  from public.guess10_draw_plays gdp
  group by gdp.hand_id
)
update public.guess10_live_hands ghl
set
  selection_category = coalesce(fd.prediction_category, ghl.selection_category),
  selection_values = coalesce(fd.prediction_values, ghl.selection_values),
  selection_label = coalesce(fd.selection_label, ghl.selection_label),
  draw_count = greatest(coalesce(dr.draw_count, 0), ghl.draw_count),
  current_rung = greatest(coalesce(dr.correct_draws, 0), ghl.current_rung),
  last_draw_at = coalesce(dr.last_draw_at, ghl.last_draw_at),
  status = coalesce(dr.final_status, ghl.status),
  result = case
    when coalesce(dr.final_status, ghl.status) in ('loss', 'cashout', 'cancelled', 'void')
      then coalesce(dr.final_status, ghl.status)
    else ghl.result
  end,
  updated_at = timezone('utc', now())
from first_draw fd
left join draw_rollup dr
  on dr.hand_id = fd.hand_id
where ghl.id = fd.hand_id;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'guess10_draw_plays_hand_id_fkey'
  ) then
    alter table public.guess10_draw_plays
      drop constraint guess10_draw_plays_hand_id_fkey;
  end if;
end
$$;

alter table public.guess10_draw_plays
  add constraint guess10_draw_plays_hand_id_fkey
  foreign key (hand_id) references public.guess10_live_hands(id) on delete cascade;

create index if not exists idx_guess10_draw_plays_hand_resolved_at
  on public.guess10_draw_plays (hand_id, resolved_at desc);

create index if not exists idx_guess10_draw_plays_origin_resolved_at
  on public.guess10_draw_plays (origin, resolved_at desc);
