-- FOF — seed MAGE animations.
-- 11 GIFs in assets/fof/mage/ (mage v3 cryomancer variant).
-- SPECIAL is "arcane_absorption" (DAMAGE_ABSORB_HEAL). The mage has TWO
-- absorb clips (same pattern as the knight's reflect):
--   SPECIAL      = absorb of a NORMAL incoming attack   (absorbhit.gif)
--   SPECIAL_CRIT = absorb of a CRITICAL incoming attack (absorbcrit.gif)
-- fof_simulate_round tags the absorb SPECIAL_TRIGGER with absorbCrit:bool;
-- the renderer plays SPECIAL_CRIT when absorbCrit is true and that clip
-- exists, otherwise it falls back to SPECIAL — so timing/pacing is unchanged.
-- Requires the action CHECK constraint to include 'SPECIAL_CRIT' (added in
-- migration fof_animations_add_special_crit_action). No VICTORY_END/
-- DEFEAT_END: the renderer falls back to the looping VICTORY/DEFEAT pose.
-- Re-runnable via ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('mage', 'IDLE',                 '{"url":"assets/fof/mage/idle.gif",                 "loop":true,  "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'HIT',                  '{"url":"assets/fof/mage/hit.gif",                  "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'CRITICAL_HIT',         '{"url":"assets/fof/mage/critical_hit.gif",         "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'TAKE_DAMAGE',          '{"url":"assets/fof/mage/take_damage.gif",          "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/mage/take_critical_damage.gif", "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'DODGE',                '{"url":"assets/fof/mage/dodge.gif",                "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'MISS',                 '{"url":"assets/fof/mage/miss.gif",                 "loop":false, "notes":"cryomancer v3"}'::jsonb),
  ('mage', 'VICTORY',              '{"url":"assets/fof/mage/victory.gif",              "loop":true,  "notes":"cryomancer v3 looping finale pose"}'::jsonb),
  ('mage', 'DEFEAT',               '{"url":"assets/fof/mage/defeat.gif",               "loop":true,  "notes":"cryomancer v3 looping finale pose"}'::jsonb),
  ('mage', 'SPECIAL',              '{"url":"assets/fof/mage/special.gif",              "loop":false, "notes":"cryomancer v3 arcane_absorption - normal incoming attack"}'::jsonb),
  ('mage', 'SPECIAL_CRIT',         '{"url":"assets/fof/mage/special_crit.gif",         "loop":false, "notes":"cryomancer v3 arcane_absorption - critical incoming attack"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
