-- Fate or Fortune — character stats
-- One row per fighter archetype. Stat probabilities stored as decimals 0..1
-- (e.g. 0.96 means 96% accuracy). attack_time is seconds between attacks.
-- constitution reduces an attacker's effective crit chance against this fighter:
--   effectiveCritChance = attackerCritChance * (1 - defenderConstitution)

CREATE TABLE IF NOT EXISTS public.fate_or_fortune_character_stats (
  character     TEXT PRIMARY KEY,
  hp            INT     NOT NULL,
  damage        INT     NOT NULL,
  crit_mult     NUMERIC NOT NULL,
  crit_chance   NUMERIC NOT NULL,
  accuracy      NUMERIC NOT NULL,
  dodge         NUMERIC NOT NULL,
  attack_time   NUMERIC NOT NULL,
  constitution  NUMERIC NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add column to existing tables (no-op if already present)
ALTER TABLE public.fate_or_fortune_character_stats
  ADD COLUMN IF NOT EXISTS constitution NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.fate_or_fortune_character_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_fof_stats" ON public.fate_or_fortune_character_stats;
CREATE POLICY "auth_all_fof_stats"
  ON public.fate_or_fortune_character_stats
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_fof_stats" ON public.fate_or_fortune_character_stats;
CREATE POLICY "anon_read_fof_stats"
  ON public.fate_or_fortune_character_stats
  FOR SELECT
  TO anon
  USING (true);

-- Seed starting stats (idempotent — re-running updates values).
INSERT INTO public.fate_or_fortune_character_stats
  (character, hp, damage, crit_mult, crit_chance, accuracy, dodge, attack_time, constitution)
VALUES
  ('knight',    180, 16, 1.5, 0.05, 0.96, 0.04, 1.10, 0.50),
  ('rogue',      60, 10, 3.2, 0.32, 0.76, 0.55, 0.62, 0.05),
  ('berserker', 115, 33, 3.5, 0.30, 0.62, 0.02, 1.00, 0.30),
  ('mage',       92, 44, 2.0, 0.18, 1.00, 0.08, 1.80, 0.10)
ON CONFLICT (character) DO UPDATE SET
  hp           = EXCLUDED.hp,
  damage       = EXCLUDED.damage,
  crit_mult    = EXCLUDED.crit_mult,
  crit_chance  = EXCLUDED.crit_chance,
  accuracy     = EXCLUDED.accuracy,
  dodge        = EXCLUDED.dodge,
  attack_time  = EXCLUDED.attack_time,
  constitution = EXCLUDED.constitution,
  updated_at   = NOW();
