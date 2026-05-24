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

-- Precomputed matchup odds (one row per OPPONENT). Convention:
--   On row Y, column `vs_X` = the win % that hero X achieves
--   when Y is the opponent. Stored as decimal 0..1 (e.g. 0.462 = 46.2%).
-- So when the server picks opponent = Y, one SELECT on row Y returns
-- the 7 candidate hero odds with no JOIN, no CASE, no math.
ALTER TABLE public.fate_or_fortune_character_stats
  ADD COLUMN IF NOT EXISTS vs_knight        NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_rogue         NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_berserker     NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_mage          NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_assassin      NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_ranger        NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_warlock       NUMERIC,
  ADD COLUMN IF NOT EXISTS vs_paladin       NUMERIC,
  ADD COLUMN IF NOT EXISTS odds_sample_size INT,
  ADD COLUMN IF NOT EXISTS odds_computed_at TIMESTAMPTZ;

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
  ('knight',    190, 17, 1.50, 0.05, 0.96, 0.04, 1.12, 0.38,
   '[{"id":"reflect","name":"Reflect","type":"DAMAGE_REFLECTION","enabled":true,"description":"Incoming attacks have a 10% chance to reflect 50% of the damage back to the attacker.","trigger":{"event":"INCOMING_DAMAGE"},"effect":{"reflectChance":0.10,"reflectPercent":0.50}}]'::jsonb),
  ('rogue',      58, 10, 3.30, 0.32, 0.76, 0.56, 0.64, 0.04,
   '[{"id":"double_strike","name":"Double Strike","type":"BONUS_ATTACK","enabled":true,"description":"Each successful attack has a 10% chance to immediately trigger a second attack.","trigger":{"event":"SUCCESSFUL_ATTACK"},"effect":{"bonusAttackChance":0.10,"bonusAttackCanCrit":true,"bonusAttackCanMiss":true}}]'::jsonb),
  ('berserker', 120, 34, 3.60, 0.30, 0.61, 0.02, 1.02, 0.10,
   '[{"id":"revenge","name":"Revenge","type":"GUARANTEED_NEXT_CRIT","enabled":true,"description":"When struck by a critical hit, Berserker''s next successful attack is guaranteed to critically hit.","trigger":{"event":"TAKE_CRITICAL_DAMAGE"},"effect":{"grantGuaranteedNextCriticalHit":true,"consumedOn":"SUCCESSFUL_ATTACK"}}]'::jsonb),
  ('mage',       88, 46, 2.00, 0.17, 1.00, 0.08, 1.78, 0.18,
   '[{"id":"arcane_absorption","name":"Arcane Absorption","type":"DAMAGE_ABSORB_HEAL","enabled":true,"description":"Incoming attacks have a 10% chance to be completely absorbed, healing for the prevented damage instead.","trigger":{"event":"INCOMING_DAMAGE"},"effect":{"absorbChance":0.10,"negateDamage":true,"healEqualToPreventedDamage":true}}]'::jsonb),
  ('assassin',   55, 11, 2.90, 0.20, 0.76, 0.40, 0.72, 0.03,
   '[{"id":"execution","name":"Execution","type":"INSTANT_KILL_CHANCE","enabled":true,"description":"Each attack has a 6% chance to instantly kill the opponent.","trigger":{"event":"ATTACK"},"effect":{"instantKillChance":0.06}}]'::jsonb),
  ('ranger',     98, 18, 2.10, 0.18, 0.86, 0.20, 0.94, 0.14,
   '[{"id":"deadeye","name":"Deadeye","type":"CRITICAL_HITS_CANNOT_MISS","enabled":true,"description":"Critical hit attempts bypass normal hit checks and cannot miss.","effect":{"criticalHitsBypassAccuracyCheck":true}}]'::jsonb),
  ('warlock',   110, 20, 1.80, 0.11, 0.83, 0.09, 1.15, 0.22,
   '[{"id":"regenerate","name":"Regenerate","type":"ATTACK_REPLACED_BY_FULL_HEAL","enabled":true,"description":"Each attack has a 10% chance to become a full heal spell instead of attacking. Cannot trigger twice consecutively.","trigger":{"event":"ATTACK_TURN_START"},"constraints":{"cannotTriggerConsecutively":true},"effect":{"replaceAttackChance":0.10,"healToFullHp":true}}]'::jsonb),
  ('paladin',   165, 19, 1.65, 0.09, 0.89, 0.07, 1.22, 0.34,
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
