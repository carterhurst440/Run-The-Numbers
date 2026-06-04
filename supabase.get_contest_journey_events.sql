-- ============================================================
-- Fix: contest journey charts show only a straight line for
--      players other than the viewer
--
-- Root cause: fetchContestJourneyEventStream queries game_hands,
-- rtn_live_hands, guess10_live_hands, shape_trader_trades, and
-- color_scheme_rounds directly. RLS only lets each user see their
-- own rows, so any other player returns 0 rows → only Start +
-- Finish points → a straight diagonal line.
--
-- Fix: create get_contest_journey_events with SECURITY DEFINER so
-- any authenticated user can retrieve the full event stream for any
-- contest participant. The client calls this RPC first; the direct-
-- query fallback (RLS-scoped) is used only if the RPC is missing.
-- ============================================================

drop function if exists public.get_contest_journey_events(uuid, uuid);

create or replace function public.get_contest_journey_events(
  p_contest_id uuid,
  p_user_id    uuid
)
returns table(
  event_id          text,
  created_at        timestamptz,
  new_account_value numeric,
  game_key          text,
  source_type       text
)
language sql
security definer
stable
as $$
  -- RTN server-draw hands
  select
    id::text               as event_id,
    started_at             as created_at,
    new_account_value,
    'game_001'             as game_key,
    'hand'                 as source_type
  from public.rtn_live_hands
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status    <> 'active'
    and new_account_value is not null

  union all

  -- G10 server-draw hands
  select
    id::text               as event_id,
    started_at             as created_at,
    new_account_value,
    'game_002'             as game_key,
    'hand'                 as source_type
  from public.guess10_live_hands
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status    <> 'active'
    and new_account_value is not null

  union all

  -- Shape Trader trades
  select
    id::text               as event_id,
    executed_at            as created_at,
    new_account_value,
    'game_003'             as game_key,
    'trade'                as source_type
  from public.shape_trader_trades
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and new_account_value is not null

  union all

  -- Color Scheme completed rounds
  select
    id::text               as event_id,
    created_at,
    new_account_value,
    'game_004'             as game_key,
    'round'                as source_type
  from public.color_scheme_rounds
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status     = 'completed'
    and new_account_value is not null

  union all

  -- Fate or Fortune resolved rounds
  select
    id::text               as event_id,
    created_at,
    new_account_value,
    'game_005'             as game_key,
    'round'                as source_type
  from public.fate_or_fortune_rounds
  where user_id    = p_user_id
    and contest_id = p_contest_id
    and status     = 'resolved'
    and new_account_value is not null

  order by created_at asc;
$$;

grant execute on function public.get_contest_journey_events(uuid, uuid) to authenticated;
