-- FOF — seed ROGUE animations.
-- 10 GIFs in assets/fof/rogue/ (rogue v2 royal-blue bloodbond variant).
-- doublestrike maps to SPECIAL since rogues use a double-attack ability
-- instead of a heal. Re-runnable thanks to ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('rogue', 'IDLE',                 '{"url":"assets/fof/rogue/idle.gif",                  "loop":true,  "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'HIT',                  '{"url":"assets/fof/rogue/hit.gif",                   "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'CRITICAL_HIT',         '{"url":"assets/fof/rogue/critical_hit.gif",          "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'TAKE_DAMAGE',          '{"url":"assets/fof/rogue/take_damage.gif",           "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/rogue/take_critical_damage.gif",  "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'DODGE',                '{"url":"assets/fof/rogue/dodge.gif",                 "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'MISS',                 '{"url":"assets/fof/rogue/miss.gif",                  "loop":false, "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'VICTORY',              '{"url":"assets/fof/rogue/victory.gif",               "loop":true,  "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'DEFEAT',               '{"url":"assets/fof/rogue/defeat.gif",                "loop":true,  "notes":"royalblue v2"}'::jsonb),
  ('rogue', 'SPECIAL',              '{"url":"assets/fof/rogue/special.gif",               "loop":false, "notes":"royalblue v2 doublestrike"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
