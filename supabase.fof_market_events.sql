-- Fate or Fortune — MARKET MODE (v2, admin sandbox) — priced event timeline.
--
-- One row per HP-changing juncture in a market round. Generated once at round
-- start: the canonical battle is run, and at each juncture a Monte Carlo of M
-- continuations (CRN — common random numbers across junctures) produces the
-- conditional win odds, which become the contract prices for that tick.
--
-- This table is the price authority: a buy/sell at event_index N must settle at
-- the price stored on THIS row for N. resume_state carries the full engine state
-- so a juncture can be re-simulated / audited / driven live later.
--
-- Lean by design: only HP-changing junctures get rows (the price ticks). The
-- cosmetic event log (HIT/MISS/SPECIAL/messages) still lives in
-- fate_or_fortune_rounds.round_details for animation.

CREATE TABLE IF NOT EXISTS public.fof_market_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id                  UUID NOT NULL REFERENCES public.fate_or_fortune_rounds (id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Monotonic juncture index within the round (0,1,2,…). THE anchor a contract
  -- references — sim time is NOT unique (events share a "beat").
  event_index               INTEGER NOT NULL,
  last_event_time           NUMERIC,           -- sim clock at this juncture

  -- Matchup + state snapshot (hero == fighter A, the player's side)
  hero_character            TEXT NOT NULL,
  opponent_character        TEXT NOT NULL,
  hero_hp                   NUMERIC NOT NULL,
  opponent_hp               NUMERIC NOT NULL,
  hero_next_attack_time     NUMERIC,
  opponent_next_attack_time NUMERIC,

  -- Monte Carlo conditional odds == contract prices (decimal 0..1).
  hero_win_pct              NUMERIC NOT NULL,
  opponent_win_pct          NUMERIC NOT NULL,
  mc_runs                   INTEGER,           -- M continuations behind this price

  -- Full resumable engine state for this juncture (hp/timers/armed flags/last-heal).
  resume_state              JSONB,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (round_id, event_index)
);

CREATE INDEX IF NOT EXISTS fof_market_events_round_idx
  ON public.fof_market_events (round_id, event_index);

ALTER TABLE public.fof_market_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fof_market_events_owner_select" ON public.fof_market_events;
CREATE POLICY "fof_market_events_owner_select"
  ON public.fof_market_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_events_owner_insert" ON public.fof_market_events;
CREATE POLICY "fof_market_events_owner_insert"
  ON public.fof_market_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_market_events_admin_all" ON public.fof_market_events;
CREATE POLICY "fof_market_events_admin_all"
  ON public.fof_market_events FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
