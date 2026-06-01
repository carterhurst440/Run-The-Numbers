-- FOF — seed KNIGHT animations.
-- 11 GIFs in assets/fof/knight/ (knight v3 emberguard variant).
-- SPECIAL is "reflect" (DAMAGE_REFLECTION). The knight has TWO reflect clips:
--   SPECIAL      = reflect of a NORMAL incoming attack  (reflecthit.gif)
--   SPECIAL_CRIT = reflect of a CRITICAL incoming attack (reflectcrit.gif)
-- fof_simulate_round tags the reflect SPECIAL_TRIGGER with reflectCrit:bool;
-- the renderer plays SPECIAL_CRIT when reflectCrit is true and that clip
-- exists, otherwise it falls back to SPECIAL — so timing/pacing is unchanged.
-- Requires the action CHECK constraint to include 'SPECIAL_CRIT' (see migration
-- fof_animations_add_special_crit_action). No VICTORY_END/DEFEAT_END: the
-- renderer falls back to the looping VICTORY/DEFEAT pose. Re-runnable via
-- ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('knight', 'IDLE',                 '{"url":"assets/fof/knight/idle.gif",                 "loop":true,  "notes":"emberguard v3"}'::jsonb),
  ('knight', 'HIT',                  '{"url":"assets/fof/knight/hit.gif",                  "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'CRITICAL_HIT',         '{"url":"assets/fof/knight/critical_hit.gif",         "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'TAKE_DAMAGE',          '{"url":"assets/fof/knight/take_damage.gif",          "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/knight/take_critical_damage.gif", "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'DODGE',                '{"url":"assets/fof/knight/dodge.gif",                "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'MISS',                 '{"url":"assets/fof/knight/miss.gif",                 "loop":false, "notes":"emberguard v3"}'::jsonb),
  ('knight', 'VICTORY',              '{"url":"assets/fof/knight/victory.gif",              "loop":true,  "notes":"emberguard v3 looping finale pose"}'::jsonb),
  ('knight', 'DEFEAT',               '{"url":"assets/fof/knight/defeat.gif",               "loop":true,  "notes":"emberguard v3 looping finale pose"}'::jsonb),
  ('knight', 'SPECIAL',              '{"url":"assets/fof/knight/special.gif",              "loop":false, "notes":"emberguard v3 reflect - normal incoming attack"}'::jsonb),
  ('knight', 'SPECIAL_CRIT',         '{"url":"assets/fof/knight/special_crit.gif",         "loop":false, "notes":"emberguard v3 reflect - critical incoming attack"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
