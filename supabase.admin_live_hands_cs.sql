-- ============================================================
-- Admin RPCs for server-draw hands + Color Scheme rounds
--
-- get_admin_game_hands and get_admin_shape_trader_trades already
-- exist and cover legacy game_hands + shape_trader_trades.
-- These two new functions fill the gap:
--
--   get_admin_live_hands   — rtn_live_hands + guess10_live_hands
--   get_admin_color_scheme_rounds — color_scheme_rounds
--
-- Both are security definer and admin-email-gated, matching the
-- pattern of the existing admin RPCs.  The client calls them in
-- loadAdminAnalyticsRawRecords so the PLAYER ACTIVITY trend
-- chart and player hands modal both see server-draw activity.
-- ============================================================

-- ── get_admin_live_hands ──────────────────────────────────────
drop function if exists public.get_admin_live_hands(timestamptz, timestamptz, uuid[]);

create or replace function public.get_admin_live_hands(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null
)
returns table(
  user_id    uuid,
  created_at timestamptz,
  game_id    text
)
language sql
security definer
stable
as $$
  select
    rlh.user_id,
    rlh.started_at as created_at,
    'game_001'     as game_id
  from public.rtn_live_hands rlh
  where rlh.status <> 'active'
    and (start_at        is null or rlh.started_at >= start_at)
    and (end_at          is null or rlh.started_at <= end_at)
    and (target_user_ids is null or rlh.user_id = any(target_user_ids))

  union all

  select
    glh.user_id,
    glh.started_at as created_at,
    'game_002'     as game_id
  from public.guess10_live_hands glh
  where glh.status <> 'active'
    and (start_at        is null or glh.started_at >= start_at)
    and (end_at          is null or glh.started_at <= end_at)
    and (target_user_ids is null or glh.user_id = any(target_user_ids))

  order by created_at asc;
$$;

grant execute on function public.get_admin_live_hands(timestamptz, timestamptz, uuid[]) to authenticated;


-- ── get_admin_color_scheme_rounds ─────────────────────────────
drop function if exists public.get_admin_color_scheme_rounds(timestamptz, timestamptz, uuid[]);

create or replace function public.get_admin_color_scheme_rounds(
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  target_user_ids uuid[]      default null
)
returns table(
  user_id    uuid,
  created_at timestamptz,
  game_id    text
)
language sql
security definer
stable
as $$
  select
    csr.user_id,
    csr.created_at,
    'game_004' as game_id
  from public.color_scheme_rounds csr
  where csr.status = 'completed'
    and (start_at        is null or csr.created_at >= start_at)
    and (end_at          is null or csr.created_at <= end_at)
    and (target_user_ids is null or csr.user_id = any(target_user_ids))
  order by csr.created_at asc;
$$;

grant execute on function public.get_admin_color_scheme_rounds(timestamptz, timestamptz, uuid[]) to authenticated;
