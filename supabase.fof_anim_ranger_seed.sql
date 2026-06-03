-- FOF — seed RANGER animations.
-- 9 GIFs in assets/fof/ranger/ (ranger v3 bluehood variant).
-- SPECIAL is "deadeye" (CRITICAL_HITS_CANNOT_MISS): it makes crit attempts
-- bypass the accuracy/dodge check and never miss — so the CRIT animation IS
-- the special. The simulator (and JS mirror) roll crit BEFORE the hit chance
-- for this ability; a landed crit emits a CRITICAL_HIT event (no separate
-- SPECIAL_TRIGGER), so the renderer plays CRITICAL_HIT. There is therefore
-- NO SPECIAL/SPECIAL_CRIT clip for the ranger. No VICTORY_END/DEFEAT_END:
-- the renderer falls back to the looping VICTORY/DEFEAT pose.
-- Re-runnable via ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('ranger', 'IDLE',                 '{"url":"assets/fof/ranger/idle.gif",                 "loop":true,  "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'HIT',                  '{"url":"assets/fof/ranger/hit.gif",                  "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'CRITICAL_HIT',         '{"url":"assets/fof/ranger/critical_hit.gif",         "loop":false, "notes":"bluehood v3 deadeye crit IS the special"}'::jsonb),
  ('ranger', 'TAKE_DAMAGE',          '{"url":"assets/fof/ranger/take_damage.gif",          "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/ranger/take_critical_damage.gif", "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'DODGE',                '{"url":"assets/fof/ranger/dodge.gif",                "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'MISS',                 '{"url":"assets/fof/ranger/miss.gif",                 "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'VICTORY',              '{"url":"assets/fof/ranger/victory.gif",              "loop":true,  "notes":"bluehood v3 looping finale pose"}'::jsonb),
  ('ranger', 'DEFEAT',               '{"url":"assets/fof/ranger/defeat.gif",               "loop":true,  "notes":"bluehood v3 looping finale pose"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
