-- ============================================================
-- Add Fate or Fortune (FOF) rounds to get_admin_activity_log
--
-- The admin player activity log RPC unioned RTN, G10, Shape
-- Traders, Color Scheme, and account events — but never FOF.
-- This adds a FOF union block so resolved FOF rounds appear in
-- the admin player activity log (and its FOF filter checkbox).
--
-- FOF rounds are emitted as entry_type 'hand' with game_id
-- 'game_005' so the client routes them through the generic hand
-- mapper (mapGameHandRowToActivityEntry). Attributed by locked_at,
-- status='resolved'. Return signature is unchanged.
-- ============================================================

create or replace function public.get_admin_activity_log(target_user_id uuid, limit_count integer default 100)
returns table(entry_type text, id text, created_at timestamp with time zone, game_id text, mode_type text, contest_id uuid, total_cards integer, stopper_label text, stopper_suit text, total_wager numeric, total_paid numeric, net numeric, commission_kept numeric, new_account_value numeric, drawn_cards jsonb, trade_side text, shape text, quantity numeric, total_value numeric, shape_price numeric, net_profit numeric, event_type text, amount numeric, previous_balance numeric)
language plpgsql
security definer
as $function$
begin
  if target_user_id is null then
    raise exception 'A target user is required';
  end if;

  if (auth.jwt() ->> 'email') not in (
    'carterwarrenhurst@gmail.com',
    'carterscasinoapp@gmail.com'
  ) then
    raise exception 'Not authorized to view admin activity log';
  end if;

  return query
  with merged as (
    -- ── RTN live hands ────────────────────────────────────────────────────
    select
      'hand'::text as entry_type,
      rlh.id::text as id,
      rlh.started_at as created_at,
      rlh.game_id,
      rlh.mode_type,
      rlh.contest_id,
      rlh.total_cards::integer as total_cards,
      coalesce(rlh.stopper_card ->> 'label', null) as stopper_label,
      coalesce(rlh.stopper_card ->> 'suitName', rlh.stopper_card ->> 'suit') as stopper_suit,
      rlh.total_wager,
      rlh.total_paid,
      rlh.net,
      rlh.commission_kept,
      rlh.new_account_value,
      rlh.drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      null::numeric as net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.rtn_live_hands rlh
    where rlh.user_id = target_user_id
      and rlh.status <> 'active'

    union all

    -- ── Guess 10 live hands ───────────────────────────────────────────────
    select
      'hand'::text as entry_type,
      glh.id::text as id,
      glh.started_at as created_at,
      glh.game_id,
      glh.mode_type,
      glh.contest_id,
      glh.total_cards::integer as total_cards,
      glh.stopper_label,
      glh.stopper_suit,
      glh.total_wager,
      glh.total_paid,
      glh.net,
      glh.commission_kept,
      glh.new_account_value,
      glh.drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      null::numeric as net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.guess10_live_hands glh
    where glh.user_id = target_user_id
      and glh.status <> 'active'

    union all

    -- ── Shape Trader trades ───────────────────────────────────────────────
    select
      'trade'::text as entry_type,
      st.id::text as id,
      st.executed_at as created_at,
      coalesce(st.game_id, 'shape_traders') as game_id,
      case when st.contest_id is null then 'normal' else 'contest' end as mode_type,
      st.contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      null::numeric as total_wager,
      null::numeric as total_paid,
      null::numeric as net,
      null::numeric as commission_kept,
      st.new_account_value,
      null::jsonb as drawn_cards,
      st.trade_side,
      st.shape,
      st.quantity,
      st.total_value,
      st.shape_price,
      st.net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.shape_trader_trades st
    where st.user_id = target_user_id

    union all

    -- ── Color Scheme rounds ───────────────────────────────────────────────
    select
      'ryb_round'::text as entry_type,
      csr.id::text as id,
      csr.created_at,
      'game_004'::text as game_id,
      case when csr.contest_id is null then 'normal' else 'contest' end as mode_type,
      csr.contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      csr.total_wagered as total_wager,
      csr.total_returned as total_paid,
      csr.net_profit as net,
      null::numeric as commission_kept,
      csr.new_account_value,
      null::jsonb as drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      csr.net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.color_scheme_rounds csr
    where csr.user_id = target_user_id
      and csr.status = 'completed'

    union all

    -- ── Fate or Fortune rounds ────────────────────────────────────────────
    -- Emitted as a generic 'hand' with game_id 'game_005'. Realized at lock
    -- time, so attribute by locked_at; only resolved rounds.
    select
      'hand'::text as entry_type,
      fr.id::text as id,
      fr.locked_at as created_at,
      'game_005'::text as game_id,
      case when fr.contest_id is null then 'normal' else 'contest' end as mode_type,
      fr.contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      fr.total_wagered as total_wager,
      fr.total_returned as total_paid,
      fr.net_profit as net,
      null::numeric as commission_kept,
      fr.new_account_value,
      null::jsonb as drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      fr.net_profit,
      null::text as event_type,
      null::numeric as amount,
      null::numeric as previous_balance
    from public.fate_or_fortune_rounds fr
    where fr.user_id = target_user_id
      and fr.status = 'resolved'
      and fr.locked_at is not null

    union all

    -- ── Account events ────────────────────────────────────────────────────
    select
      'account'::text as entry_type,
      ae.id::text as id,
      ae.created_at,
      null::text as game_id,
      'normal'::text as mode_type,
      null::uuid as contest_id,
      null::integer as total_cards,
      null::text as stopper_label,
      null::text as stopper_suit,
      null::numeric as total_wager,
      null::numeric as total_paid,
      null::numeric as net,
      null::numeric as commission_kept,
      ae.new_balance as new_account_value,
      null::jsonb as drawn_cards,
      null::text as trade_side,
      null::text as shape,
      null::numeric as quantity,
      null::numeric as total_value,
      null::numeric as shape_price,
      null::numeric as net_profit,
      ae.event_type,
      ae.amount,
      ae.previous_balance
    from public.account_events ae
    where ae.user_id = target_user_id
  )
  select *
  from merged
  order by created_at desc, id desc
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$function$;
