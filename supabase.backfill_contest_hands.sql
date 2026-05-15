-- ============================================================
-- Backfill: stamp contest_id + mode_type on historical hands
--
-- Old hands played during a contest window have contest_id = NULL
-- because the client wasn't passing _contest_id at the time.
-- We recover them by joining:
--   hand table  ← user_id + hand timestamp
--   contest_entries ← user opted into contest
--   contests ← contest starts_at / ends_at window
--
-- A hand is tagged when ALL of:
--   • hand.contest_id IS NULL  (not already tagged)
--   • hand timestamp ≥ contest starts_at
--   • hand timestamp ≤ contest ends_at
--   • hand timestamp ≥ contest_entries.opted_in_at
--     (don't tag hands played before the user entered)
--
-- Runs across rtn_live_hands, guess10_live_hands,
-- shape_trader_trades, and game_hands (legacy).
-- Safe to run multiple times — skips already-tagged rows.
-- ============================================================


-- ── 1. rtn_live_hands ───────────────────────────────────────
UPDATE public.rtn_live_hands rlh
SET
  contest_id = ce.contest_id,
  mode_type   = 'contest'
FROM public.contest_entries ce
JOIN public.contests c ON c.id = ce.contest_id
WHERE rlh.user_id        = ce.user_id
  AND rlh.contest_id    IS NULL
  AND c.starts_at       IS NOT NULL
  AND c.ends_at         IS NOT NULL
  AND rlh.started_at    >= c.starts_at
  AND rlh.started_at    <= c.ends_at
  AND rlh.started_at    >= ce.opted_in_at;

DO $$
BEGIN
  RAISE NOTICE 'rtn_live_hands backfill: % rows updated', (SELECT COUNT(*) FROM public.rtn_live_hands WHERE mode_type = 'contest' AND contest_id IS NOT NULL);
END $$;


-- ── 2. guess10_live_hands ────────────────────────────────────
UPDATE public.guess10_live_hands glh
SET
  contest_id = ce.contest_id,
  mode_type   = 'contest'
FROM public.contest_entries ce
JOIN public.contests c ON c.id = ce.contest_id
WHERE glh.user_id        = ce.user_id
  AND glh.contest_id    IS NULL
  AND c.starts_at       IS NOT NULL
  AND c.ends_at         IS NOT NULL
  AND glh.started_at    >= c.starts_at
  AND glh.started_at    <= c.ends_at
  AND glh.started_at    >= ce.opted_in_at;

DO $$
BEGIN
  RAISE NOTICE 'guess10_live_hands backfill: % rows updated', (SELECT COUNT(*) FROM public.guess10_live_hands WHERE mode_type = 'contest' AND contest_id IS NOT NULL);
END $$;


-- ── 3. shape_trader_trades ───────────────────────────────────
UPDATE public.shape_trader_trades st
SET
  contest_id = ce.contest_id
FROM public.contest_entries ce
JOIN public.contests c ON c.id = ce.contest_id
WHERE st.user_id         = ce.user_id
  AND st.contest_id     IS NULL
  AND c.starts_at       IS NOT NULL
  AND c.ends_at         IS NOT NULL
  AND st.executed_at    >= c.starts_at
  AND st.executed_at    <= c.ends_at
  AND st.executed_at    >= ce.opted_in_at;

DO $$
BEGIN
  RAISE NOTICE 'shape_trader_trades backfill: % rows updated', (SELECT COUNT(*) FROM public.shape_trader_trades WHERE contest_id IS NOT NULL);
END $$;


-- ── 4. game_hands (legacy) ───────────────────────────────────
UPDATE public.game_hands gh
SET
  contest_id = ce.contest_id,
  mode_type   = 'contest'
FROM public.contest_entries ce
JOIN public.contests c ON c.id = ce.contest_id
WHERE gh.user_id         = ce.user_id
  AND gh.contest_id     IS NULL
  AND c.starts_at       IS NOT NULL
  AND c.ends_at         IS NOT NULL
  AND gh.created_at     >= c.starts_at
  AND gh.created_at     <= c.ends_at
  AND gh.created_at     >= ce.opted_in_at;

DO $$
BEGIN
  RAISE NOTICE 'game_hands backfill: % rows updated', (SELECT COUNT(*) FROM public.game_hands WHERE mode_type = 'contest' AND contest_id IS NOT NULL);
END $$;
