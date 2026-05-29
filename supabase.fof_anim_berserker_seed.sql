-- FOF — seed BERSERKER animations.
-- 10 GIFs in assets/fof/berserker/ (berserker v2 amethyst variant).
-- revenge maps to SPECIAL since the berserker's special triggering
-- sequence is REVENGE (armed via SPECIAL_TRIGGER, like rogue doublestrike).
-- Re-runnable thanks to ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('berserker', 'IDLE',                 '{"url":"assets/fof/berserker/idle.gif",                 "loop":true,  "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'HIT',                  '{"url":"assets/fof/berserker/hit.gif",                  "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'CRITICAL_HIT',         '{"url":"assets/fof/berserker/critical_hit.gif",         "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'TAKE_DAMAGE',          '{"url":"assets/fof/berserker/take_damage.gif",          "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/berserker/take_critical_damage.gif", "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'DODGE',                '{"url":"assets/fof/berserker/dodge.gif",                "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'MISS',                 '{"url":"assets/fof/berserker/miss.gif",                 "loop":false, "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'VICTORY',              '{"url":"assets/fof/berserker/victory.gif",              "loop":true,  "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'DEFEAT',               '{"url":"assets/fof/berserker/defeat.gif",               "loop":true,  "notes":"amethyst v2"}'::jsonb),
  ('berserker', 'SPECIAL',              '{"url":"assets/fof/berserker/special.gif",              "loop":false, "notes":"amethyst v2 revenge"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
