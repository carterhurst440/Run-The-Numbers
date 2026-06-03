-- FOF — seed RANGER animations.
-- 10 GIFs in assets/fof/ranger/ (ranger v3 bluehood variant).
-- SPECIAL is "serenity" (CRITICAL_DAMAGE_REDUCTION): incoming critical hits
-- deal only 25% of their normal damage. When a crit lands on the ranger the
-- simulator emits a TAKE_CRITICAL_DAMAGE event followed by a defender
-- SPECIAL_TRIGGER (specialId "serenity") in the same beat, so the renderer
-- plays the SPECIAL clip as the crit reaction. No SPECIAL_CRIT variant.
-- No VICTORY_END/DEFEAT_END: the renderer falls back to the looping
-- VICTORY/DEFEAT pose. Re-runnable via ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('ranger', 'IDLE',                 '{"url":"assets/fof/ranger/idle.gif",                 "loop":true,  "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'HIT',                  '{"url":"assets/fof/ranger/hit.gif",                  "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'CRITICAL_HIT',         '{"url":"assets/fof/ranger/critical_hit.gif",         "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'TAKE_DAMAGE',          '{"url":"assets/fof/ranger/take_damage.gif",          "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/ranger/take_critical_damage.gif", "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'DODGE',                '{"url":"assets/fof/ranger/dodge.gif",                "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'MISS',                 '{"url":"assets/fof/ranger/miss.gif",                 "loop":false, "notes":"bluehood v3"}'::jsonb),
  ('ranger', 'SPECIAL',              '{"url":"assets/fof/ranger/special.gif",              "loop":false, "notes":"bluehood v3 serenity — crit-damage-reduction reaction"}'::jsonb),
  ('ranger', 'VICTORY',              '{"url":"assets/fof/ranger/victory.gif",              "loop":true,  "notes":"bluehood v3 looping finale pose"}'::jsonb),
  ('ranger', 'DEFEAT',               '{"url":"assets/fof/ranger/defeat.gif",               "loop":true,  "notes":"bluehood v3 looping finale pose"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
