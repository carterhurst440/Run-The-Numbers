-- Fate or Fortune — character stats
-- One row per fighter archetype. Stat probabilities stored as decimals 0..1
-- (e.g. 0.96 means 96% accuracy). attack_time is seconds between attacks.
-- constitution reduces an attacker's effective crit chance against this fighter:
--   effectiveCritChance = attackerCritChance * (1 - defenderConstitution)
-- special_abilities is a JSONB array; each ability is self-describing
-- with id/name/type/enabled/description/trigger/effect fields.

CREATE TABLE IF NOT EXISTS public.fate_or_fortune_character_stats (
  character         TEXT PRIMARY KEY,
  hp                INT     NOT NULL,
  damage            INT     NOT NULL,
  crit_mult         NUMERIC NOT NULL,
  crit_chance       NUMERIC NOT NULL,
  accuracy          NUMERIC NOT NULL,
  dodge             NUMERIC NOT NULL,
  attack_time       NUMERIC NOT NULL,
  constitution      NUMERIC NOT NULL DEFAULT 0,
  special_abilities JSONB   NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to existing tables (no-op if already present)
ALTER TABLE public.fate_or_fortune_character_stats
  ADD COLUMN IF NOT EXISTS constitution NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.fate_or_fortune_character_stats
  ADD COLUMN IF NOT EXISTS special_abilities JSONB NOT NULL DEFAULT '[]'::jsonb;

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

-- Seed all 8 fighters (idempotent — re-running RESETS values to these seeds).
INSERT INTO public.fate_or_fortune_character_stats
  (character, hp, damage, crit_mult, crit_chance, accuracy, dodge, attack_time, constitution, special_abilities)
VALUES
  ('knight',    180, 16, 1.5, 0.05, 0.96, 0.04, 1.10, 0.50, '[]'::jsonb),
  ('rogue',      60, 10, 3.2, 0.32, 0.76, 0.55, 0.62, 0.05, '[]'::jsonb),
  ('berserker', 115, 33, 3.5, 0.30, 0.62, 0.02, 1.00, 0.30, '[]'::jsonb),
  ('mage',       92, 44, 2.0, 0.18, 1.00, 0.08, 1.80, 0.10, '[]'::jsonb),
  ('assassin',   70, 25, 2.5, 0.25, 0.85, 0.40, 0.75, 0.05,
   '[{"id":"execution","name":"Execution","type":"INSTANT_KILL_CHANCE","enabled":true,"description":"Each attack has a 5% chance to instantly kill the opponent.","trigger":{"event":"ATTACK"},"effect":{"instantKillChance":0.05}}]'::jsonb),
  ('ranger',     95, 22, 2.5, 0.20, 0.70, 0.25, 1.00, 0.15,
   '[{"id":"deadeye","name":"Deadeye","type":"CRITICAL_HITS_CANNOT_MISS","enabled":true,"description":"Critical hit attempts bypass normal hit checks and cannot miss.","effect":{"criticalHitsBypassAccuracyCheck":true}}]'::jsonb),
  ('warlock',    80, 35, 2.0, 0.12, 0.88, 0.10, 1.50, 0.08,
   '[{"id":"regenerate","name":"Regenerate","type":"ATTACK_REPLACED_BY_HEAL","enabled":true,"description":"Each attack has a 10% chance to become a healing spell restoring 50% max HP instead of attacking.","trigger":{"event":"ATTACK_TURN_START"},"effect":{"replaceAttackChance":0.10,"healPercentMaxHp":0.50}}]'::jsonb),
  ('paladin',   150, 20, 1.8, 0.10, 0.92, 0.06, 1.30, 0.35,
   '[{"id":"holy_light","name":"Holy Light","type":"LIFESTEAL","enabled":true,"description":"Heals for 15% of damage dealt to the opponent.","effect":{"healPercentOfDamageDealt":0.15}}]'::jsonb)
ON CONFLICT (character) DO UPDATE SET
  hp                = EXCLUDED.hp,
  damage            = EXCLUDED.damage,
  crit_mult         = EXCLUDED.crit_mult,
  crit_chance       = EXCLUDED.crit_chance,
  accuracy          = EXCLUDED.accuracy,
  dodge             = EXCLUDED.dodge,
  attack_time       = EXCLUDED.attack_time,
  constitution      = EXCLUDED.constitution,
  special_abilities = EXCLUDED.special_abilities,
  updated_at        = NOW();
