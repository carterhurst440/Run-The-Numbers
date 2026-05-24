-- Fate or Fortune — rounds
-- One row per resolved battle. Server picks the opponent, player picks the
-- hero + wager, server resolves the whole fight, and the event log is
-- persisted so the client can stitch the animation (or just resolve cold
-- if the client never returns).

CREATE TABLE IF NOT EXISTS public.fate_or_fortune_rounds (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id                UUID REFERENCES public.contests (id) ON DELETE SET NULL,

  -- Lifecycle. 'pending' = opponent shown, awaiting champion pick;
  -- 'resolved' = fight simulated server-side, awaiting/finished animation.
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'resolved')),
  locked_at                 TIMESTAMPTZ,  -- when player committed pick + wager

  -- Matchup
  opponent_character        TEXT NOT NULL
                              REFERENCES public.fate_or_fortune_character_stats (character),
  hero_character            TEXT
                              REFERENCES public.fate_or_fortune_character_stats (character),
  -- Decimal 0..1 (e.g. 0.462 == 46.2%). Snapshot at lock time so payout
  -- is reproducible even if the underlying stats are retuned later.
  hero_win_pct              NUMERIC,

  -- Outcome
  round_winner              TEXT CHECK (round_winner IN ('hero', 'opponent', 'draw')),
  round_details             JSONB,  -- full event log from fofSimulateOne
  round_replay              JSONB,  -- reserved for client-stitched animation cache

  -- Money (NUMERIC — same precision pattern as game_hands)
  total_wagered             NUMERIC NOT NULL DEFAULT 0,
  total_returned            NUMERIC NOT NULL DEFAULT 0,
  net_profit                NUMERIC GENERATED ALWAYS AS (total_returned - total_wagered) STORED,
  pre_hand_account_value    NUMERIC,
  new_account_value         NUMERIC,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most-common reads
CREATE INDEX IF NOT EXISTS fof_rounds_user_created_idx
  ON public.fate_or_fortune_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fof_rounds_contest_created_idx
  ON public.fate_or_fortune_rounds (contest_id, created_at DESC)
  WHERE contest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fof_rounds_status_idx
  ON public.fate_or_fortune_rounds (status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE public.fate_or_fortune_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fof_rounds_owner_select" ON public.fate_or_fortune_rounds;
CREATE POLICY "fof_rounds_owner_select"
  ON public.fate_or_fortune_rounds
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_rounds_owner_insert" ON public.fate_or_fortune_rounds;
CREATE POLICY "fof_rounds_owner_insert"
  ON public.fate_or_fortune_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fof_rounds_owner_update" ON public.fate_or_fortune_rounds;
CREATE POLICY "fof_rounds_owner_update"
  ON public.fate_or_fortune_rounds
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin (matches the pattern used by public.contests — JWT email check).
DROP POLICY IF EXISTS "fof_rounds_admin_all" ON public.fate_or_fortune_rounds;
CREATE POLICY "fof_rounds_admin_all"
  ON public.fate_or_fortune_rounds
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
