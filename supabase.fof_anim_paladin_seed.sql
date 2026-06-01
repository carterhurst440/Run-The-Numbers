-- FOF — seed PALADIN animations.
-- 12 GIFs in assets/fof/paladin/ (paladin v2 radiant variant).
-- SPECIAL is "holylight", fired after every successful attack. VICTORY and
-- DEFEAT each play once, then the renderer holds on the VICTORY_END /
-- DEFEAT_END still frame. Requires the action CHECK constraint to include
-- 'VICTORY_END' and 'DEFEAT_END' (see migration
-- fof_animations_add_end_frame_actions). Re-runnable thanks to ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('paladin', 'IDLE',                 '{"url":"assets/fof/paladin/idle.gif",                 "loop":true,  "notes":"radiant v2"}'::jsonb),
  ('paladin', 'HIT',                  '{"url":"assets/fof/paladin/hit.gif",                  "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'CRITICAL_HIT',         '{"url":"assets/fof/paladin/critical_hit.gif",         "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'TAKE_DAMAGE',          '{"url":"assets/fof/paladin/take_damage.gif",          "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/paladin/take_critical_damage.gif", "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'DODGE',                '{"url":"assets/fof/paladin/dodge.gif",                "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'MISS',                 '{"url":"assets/fof/paladin/miss.gif",                 "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'VICTORY',              '{"url":"assets/fof/paladin/victory.gif",              "loop":false, "notes":"radiant v2 plays once then VICTORY_END"}'::jsonb),
  ('paladin', 'DEFEAT',               '{"url":"assets/fof/paladin/defeat.gif",               "loop":false, "notes":"radiant v2 plays once then DEFEAT_END"}'::jsonb),
  ('paladin', 'SPECIAL',              '{"url":"assets/fof/paladin/special.gif",              "loop":false, "notes":"radiant v2 holylight - on every successful attack"}'::jsonb),
  ('paladin', 'VICTORY_END',          '{"url":"assets/fof/paladin/victory_end.gif",          "loop":false, "notes":"radiant v2 still end frame"}'::jsonb),
  ('paladin', 'DEFEAT_END',           '{"url":"assets/fof/paladin/defeat_end.gif",           "loop":false, "notes":"radiant v2 still end frame"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
