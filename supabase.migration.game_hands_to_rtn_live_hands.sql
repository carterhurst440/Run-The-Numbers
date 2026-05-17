-- ============================================================
-- Migrate legacy RTN hands from game_hands → rtn_live_hands
--
-- Context: The RTN server-path (start_rtn_hand / draw_rtn_card)
-- writes directly to rtn_live_hands. But before the server path
-- was fully deployed, hands were dealt client-side and saved via
-- logRunTheNumbersHandAndBets → game_hands only.
--
-- This script inserts those orphaned game_hands RTN rows into
-- rtn_live_hands so the PNL and activity systems are complete.
--
-- De-duplication: A game_hands row is considered "already present"
-- in rtn_live_hands if there is a row with the same user_id, the
-- same net (rounded to 2dp), and an ended_at within 5 minutes of
-- game_hands.created_at. Server-path hands satisfy this because
-- draw_rtn_card sets ended_at the moment the stopper fires, and
-- logRunTheNumbersHandAndBets runs immediately afterward.
--
-- Safe to re-run: uses ON CONFLICT (id) DO NOTHING, with the
-- game_hands.id as the rtn_live_hands.id for migrated rows.
-- ============================================================

insert into public.rtn_live_hands (
  id,
  user_id,
  game_id,
  mode_type,
  contest_id,
  status,
  result,
  started_at,
  last_draw_at,
  ended_at,
  deck_order,
  draw_index,
  drawn_cards,
  total_cards,
  total_wager,
  total_paid,
  net,
  commission_kept,
  new_account_value,
  carter_cash_awarded,
  carter_cash_progress_after,
  hand_state,
  stopper_card,
  ended_by,
  created_at,
  updated_at
)
select
  gh.id,
  gh.user_id,
  'game_001',
  coalesce(gh.mode_type, 'normal'),
  gh.contest_id,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'complete'
    else 'void'
  end                                                        as status,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'stopper'
    else null
  end                                                        as result,
  gh.created_at                                              as started_at,
  gh.created_at                                              as last_draw_at,
  case
    when coalesce(gh.total_cards, 0) > 0 then gh.created_at
    else null
  end                                                        as ended_at,
  '[]'::jsonb                                                as deck_order,
  coalesce(jsonb_array_length(coalesce(gh.drawn_cards, '[]'::jsonb)), 0) as draw_index,
  coalesce(gh.drawn_cards, '[]'::jsonb)                     as drawn_cards,
  greatest(
    coalesce(gh.total_cards, 0),
    coalesce(jsonb_array_length(coalesce(gh.drawn_cards, '[]'::jsonb)), 0)
  )                                                          as total_cards,
  coalesce(gh.total_wager, 0)                               as total_wager,
  coalesce(gh.total_paid,  0)                               as total_paid,
  coalesce(gh.net,         0)                               as net,
  coalesce(gh.commission_kept, 0)                           as commission_kept,
  gh.new_account_value,
  0                                                          as carter_cash_awarded,
  null::numeric                                              as carter_cash_progress_after,
  jsonb_build_object(
    'paytable_id',              'legacy',
    'migrated_from_game_hands', true
  )                                                          as hand_state,
  case
    when gh.stopper_label is null then null
    else jsonb_build_object(
      'label',    gh.stopper_label,
      'suitName', gh.stopper_suit
    )
  end                                                        as stopper_card,
  case
    when coalesce(gh.total_cards, 0) > 0 then 'stopper'
    else null
  end                                                        as ended_by,
  gh.created_at,
  timezone('utc', now())                                     as updated_at

from public.game_hands gh
where coalesce(gh.game_id, 'game_001') = 'game_001'
  -- Only migrate rows not already represented in rtn_live_hands.
  -- A server-path hand writes ended_at the moment the stopper fires;
  -- logRunTheNumbersHandAndBets fires immediately after, so the gap
  -- between rtn_live_hands.ended_at and game_hands.created_at is
  -- typically < 10 seconds. 5 minutes is a very conservative window.
  and not exists (
    select 1
    from public.rtn_live_hands rlh
    where rlh.user_id = gh.user_id
      and round(rlh.net::numeric, 2) = round(gh.net::numeric, 2)
      and rlh.ended_at is not null
      and abs(extract(epoch from (rlh.ended_at - gh.created_at))) < 300
  )

on conflict (id) do nothing;

-- ── Verification: how many rows were migrated? ───────────────
select
  count(*)                                    as migrated_rows,
  count(*) filter (where contest_id is not null) as contest_rows,
  count(*) filter (where contest_id is null)     as normal_rows,
  min(created_at)                             as oldest_hand,
  max(created_at)                             as newest_hand
from public.rtn_live_hands
where (hand_state ->> 'migrated_from_game_hands')::boolean is true;
