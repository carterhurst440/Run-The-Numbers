-- ============================================================
-- Migration: add mode column to daily_profit_loss
--            + full recompute from live game tables
--
-- Splits every row into 'normal' (contest_id IS NULL) and
-- 'contest' (contest_id IS NOT NULL).
--
-- Unique key changes from (user_id, profit_date)
--                      to (user_id, profit_date, mode).
--
-- Safe to run multiple times — TRUNCATE clears first.
-- Run in Supabase SQL editor. Takes ~5–30 sec on large datasets.
-- ============================================================


-- ── 1. Add mode column ────────────────────────────────────────
ALTER TABLE public.daily_profit_loss
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal';


-- ── 2. Swap unique constraint ────────────────────────────────
-- Drop the old single-mode unique key (try both common names)
ALTER TABLE public.daily_profit_loss
  DROP CONSTRAINT IF EXISTS daily_profit_loss_user_id_profit_date_key;

ALTER TABLE public.daily_profit_loss
  DROP CONSTRAINT IF EXISTS daily_profit_loss_pkey;

-- Add new unique key that includes mode
ALTER TABLE public.daily_profit_loss
  ADD CONSTRAINT daily_profit_loss_user_date_mode_key
  UNIQUE (user_id, profit_date, mode);

-- Remove the column default now that the constraint is in place
ALTER TABLE public.daily_profit_loss
  ALTER COLUMN mode DROP DEFAULT;


-- ── 3. Full recompute ────────────────────────────────────────
TRUNCATE public.daily_profit_loss;

INSERT INTO public.daily_profit_loss
  (user_id, profit_date, mode, pnl_rtn, pnl_g10, pnl_shape_traders, pnl_ryb, pnl_total)
WITH

rtn AS (
  SELECT
    user_id,
    (started_at AT TIME ZONE 'America/Denver')::date            AS profit_date,
    CASE WHEN contest_id IS NULL THEN 'normal' ELSE 'contest' END AS mode,
    SUM(COALESCE(net, 0))                                        AS pnl
  FROM public.rtn_live_hands
  WHERE status <> 'active'
  GROUP BY 1, 2, 3
),

g10 AS (
  SELECT
    user_id,
    (started_at AT TIME ZONE 'America/Denver')::date            AS profit_date,
    CASE WHEN contest_id IS NULL THEN 'normal' ELSE 'contest' END AS mode,
    SUM(COALESCE(net, 0))                                        AS pnl
  FROM public.guess10_live_hands
  WHERE status <> 'active'
  GROUP BY 1, 2, 3
),

st AS (
  SELECT
    user_id,
    (executed_at AT TIME ZONE 'America/Denver')::date           AS profit_date,
    CASE WHEN contest_id IS NULL THEN 'normal' ELSE 'contest' END AS mode,
    SUM(COALESCE(net_profit, 0))                                 AS pnl
  FROM public.shape_trader_trades
  GROUP BY 1, 2, 3
),

ryb AS (
  SELECT
    user_id,
    (created_at AT TIME ZONE 'America/Denver')::date            AS profit_date,
    CASE WHEN contest_id IS NULL THEN 'normal' ELSE 'contest' END AS mode,
    SUM(COALESCE(net_profit, 0))                                 AS pnl
  FROM public.color_scheme_rounds
  WHERE status = 'completed'
  GROUP BY 1, 2, 3
),

-- All unique (user, date, mode) combinations across all games
spine AS (
  SELECT user_id, profit_date, mode FROM rtn
  UNION
  SELECT user_id, profit_date, mode FROM g10
  UNION
  SELECT user_id, profit_date, mode FROM st
  UNION
  SELECT user_id, profit_date, mode FROM ryb
)

SELECT
  s.user_id,
  s.profit_date,
  s.mode,
  COALESCE(r.pnl, 0)                                                AS pnl_rtn,
  COALESCE(g.pnl, 0)                                                AS pnl_g10,
  COALESCE(st2.pnl, 0)                                              AS pnl_shape_traders,
  COALESCE(y.pnl, 0)                                                AS pnl_ryb,
  ROUND(
    (COALESCE(r.pnl,0) + COALESCE(g.pnl,0) +
     COALESCE(st2.pnl,0) + COALESCE(y.pnl,0))::numeric, 2
  )                                                                  AS pnl_total
FROM spine s
LEFT JOIN rtn  r   ON r.user_id   = s.user_id AND r.profit_date   = s.profit_date AND r.mode   = s.mode
LEFT JOIN g10  g   ON g.user_id   = s.user_id AND g.profit_date   = s.profit_date AND g.mode   = s.mode
LEFT JOIN st  st2  ON st2.user_id = s.user_id AND st2.profit_date = s.profit_date AND st2.mode = s.mode
LEFT JOIN ryb  y   ON y.user_id   = s.user_id AND y.profit_date   = s.profit_date AND y.mode   = s.mode;


-- ── 4. Verify ────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'daily_profit_loss rows after recompute: %',
    (SELECT COUNT(*) FROM public.daily_profit_loss);
  RAISE NOTICE 'normal rows: %',
    (SELECT COUNT(*) FROM public.daily_profit_loss WHERE mode = ''normal'');
  RAISE NOTICE 'contest rows: %',
    (SELECT COUNT(*) FROM public.daily_profit_loss WHERE mode = ''contest'');
END $$;
