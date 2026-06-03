-- FOF — seed PALADIN animations.
-- 10 GIFs in assets/fof/paladin/ (paladin v2 radiant variant).
-- SPECIAL is "holylight", healing 50% of damage dealt on a critical hit.
-- VICTORY and DEFEAT loop their finale pose like every other character — the
-- old VICTORY_END / DEFEAT_END still end-frames were removed. Re-runnable
-- thanks to ON CONFLICT (this seed no longer reinserts the end frames, but it
-- does NOT delete any that linger; remove those separately if present).

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('paladin', 'IDLE',                 '{"url":"assets/fof/paladin/idle.gif",                 "loop":true,  "notes":"radiant v2"}'::jsonb),
  ('paladin', 'HIT',                  '{"url":"assets/fof/paladin/hit.gif",                  "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'CRITICAL_HIT',         '{"url":"assets/fof/paladin/critical_hit.gif",         "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'TAKE_DAMAGE',          '{"url":"assets/fof/paladin/take_damage.gif",          "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/paladin/take_critical_damage.gif", "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'DODGE',                '{"url":"assets/fof/paladin/dodge.gif",                "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'MISS',                 '{"url":"assets/fof/paladin/miss.gif",                 "loop":false, "notes":"radiant v2"}'::jsonb),
  ('paladin', 'VICTORY',              '{"url":"assets/fof/paladin/victory.gif",              "loop":true,  "notes":"radiant v2 looping finale pose"}'::jsonb),
  ('paladin', 'DEFEAT',               '{"url":"assets/fof/paladin/defeat.gif",               "loop":true,  "notes":"radiant v2 looping finale pose"}'::jsonb),
  ('paladin', 'SPECIAL',              '{"url":"assets/fof/paladin/special.gif",              "loop":false, "notes":"radiant v2 holylight - heal 50% of damage on a crit"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
