-- FOF — seed WARLOCK animations.
-- GIFs ship in assets/fof/warlock/ and are served by Vercel under the
-- same origin as the app, so the clip URLs are relative.
-- Re-running this upsert overwrites the clip_data for each row.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('warlock', 'IDLE',                 '{"url":"assets/fof/warlock/idle.gif",                  "loop":true,  "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'HIT',                  '{"url":"assets/fof/warlock/hit.gif",                   "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'CRITICAL_HIT',         '{"url":"assets/fof/warlock/critical_hit.gif",          "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'TAKE_DAMAGE',          '{"url":"assets/fof/warlock/take_damage.gif",           "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/warlock/take_critical_damage.gif",  "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'DODGE',                '{"url":"assets/fof/warlock/dodge.gif",                 "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'MISS',                 '{"url":"assets/fof/warlock/miss.gif",                  "loop":false, "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'VICTORY',              '{"url":"assets/fof/warlock/victory.gif",               "loop":true,  "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'DEFEAT',               '{"url":"assets/fof/warlock/defeat.gif",                "loop":true,  "notes":"bloodbond v2"}'::jsonb),
  ('warlock', 'SPECIAL',              '{"url":"assets/fof/warlock/special.gif",               "loop":false, "notes":"bloodbond v2 heal"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
