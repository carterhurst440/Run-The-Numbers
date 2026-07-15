-- BLOOM — rounds ledger (the reconciliation spine for the satchel slot).
-- One row per cast round. BLOOM is single-wager (one bet buys the whole 10-seed
-- satchel), so this rounds table doubles as the bet record — no child _bets table,
-- same as mm_spins. Money fields + account-value snapshots mirror mm_spins /
-- fate_or_fortune_rounds so the account-journey reconciler (script.js) reads it
-- identically. Fields stay 0 for admin-only sims until the wallet postMessage seam
-- is wired (balance is still in-memory in the iframe today).
--
-- The whole round is decided at cast (all outcomes rolled up front, then revealed
-- reel-by-reel as pure animation), so a row is fully auditable the instant it lands.

CREATE TABLE IF NOT EXISTS public.bloom_rounds (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  contest_id                UUID REFERENCES public.contests (id) ON DELETE SET NULL,

  -- Lifecycle. A cast is atomic: it resolves the instant it is played.
  -- 'resolved' is the only terminal state today; 'pending' is reserved for a
  -- future server-authoritative cast that locks the wager before the reels settle.
  status                    TEXT NOT NULL DEFAULT 'resolved'
                              CHECK (status IN ('pending', 'resolved')),

  round_number              INTEGER,     -- client session round counter (like spin_number)

  -- ── The three JSON blobs ──────────────────────────────────────────────
  -- 1) SATCHEL — the 10 seeds the player packed, in slot order. Array of flower
  --    slugs (bloom_flowers.flower); duplicates = stacking that seed. Shape:
  --      ["orchid","orchid","lotus","daisy","daisy","tulip","poppy","sunflower","lotus","cactus"]
  satchel                   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 2) OUTCOMES — what each seed position ended at, aligned 1:1 to `satchel` by
  --    index. One object per slot. Shape:
  --      [ { "pos":0, "flower":"orchid", "sprouted":true, "alive":true,
  --          "phase":"super", "events":["bloom","none","bloom"], "pay":576.0 }, ... ]
  --    sprouted = the take_pct roll; alive = survived (no wilt); phase =
  --    seed|bloom|super (dead plants stay 'seed'); events = per-reel result
  --    ('bloom'|'super'|'wilt'|'none'), one entry per revealed reel; pay = credits
  --    this seed contributed after payScale + board mult. Σ pay = total_returned.
  outcomes                  JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 3) WEATHER PATTERNS — the reels that landed, in reveal order. Self-contained
  --    so a round is auditable from this column alone. Shape:
  --      { "reels":["w_rain","w_rain","w_rain"], "match":true, "board_mult":5 }
  --    reels = bloom_weather.weather ids (one per reel); match = all reels equal;
  --    board_mult = 5 on a full match else 1.
  weather_patterns          JSONB NOT NULL DEFAULT '{}'::jsonb,

  round_replay              JSONB,       -- reserved: growth-step states for a client replay

  -- Denormalized round summary (cheap analytics without cracking the JSON).
  board_mult                SMALLINT NOT NULL DEFAULT 1,   -- 1 or 5
  all_match                 BOOLEAN NOT NULL DEFAULT FALSE, -- 3-reel match this round
  seeds_sprouted            SMALLINT NOT NULL DEFAULT 0,    -- how many of the 10 germinated
  living_count              SMALLINT NOT NULL DEFAULT 0,    -- plants alive at settle
  bloom_count               SMALLINT NOT NULL DEFAULT 0,    -- plants that reached Bloom
  super_count               SMALLINT NOT NULL DEFAULT 0,    -- plants that reached Super Bloom
  wilt_count                SMALLINT NOT NULL DEFAULT 0,    -- plants that wilted (died)
  pay_scale                 NUMERIC,     -- payScale() snapshot (targetRTP/100) at cast

  -- Money (NUMERIC — same precision pattern as mm_spins / fof_rounds).
  -- Single-wager: total_wagered = the bet, total_returned = the round payout.
  total_wagered             NUMERIC NOT NULL DEFAULT 0,
  total_returned            NUMERIC NOT NULL DEFAULT 0,
  net_profit                NUMERIC GENERATED ALWAYS AS (total_returned - total_wagered) STORED,
  pre_hand_account_value    NUMERIC,
  new_account_value         NUMERIC,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most-common reads
CREATE INDEX IF NOT EXISTS bloom_rounds_user_created_idx
  ON public.bloom_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bloom_rounds_contest_created_idx
  ON public.bloom_rounds (contest_id, created_at DESC)
  WHERE contest_id IS NOT NULL;
-- Analytics: board-match / big-win scans.
CREATE INDEX IF NOT EXISTS bloom_rounds_match_idx
  ON public.bloom_rounds (created_at DESC)
  WHERE all_match;

-- RLS
ALTER TABLE public.bloom_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloom_rounds_owner_select" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_select"
  ON public.bloom_rounds
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_rounds_owner_insert" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_insert"
  ON public.bloom_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bloom_rounds_owner_update" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_owner_update"
  ON public.bloom_rounds
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin (matches the pattern used by mm_spins / fate_or_fortune_rounds).
DROP POLICY IF EXISTS "bloom_rounds_admin_all" ON public.bloom_rounds;
CREATE POLICY "bloom_rounds_admin_all"
  ON public.bloom_rounds
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com');
