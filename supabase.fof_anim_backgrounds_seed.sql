-- FOF — seed per-character ARENA BACKGROUNDS.
-- Static landscape PNGs in assets/fof/backgrounds/<character>.png (1024x512,
-- pixel-art, 4x). Stored as a BACKGROUND "action" row in the existing
-- fate_or_fortune_animations table so it loads with everything else.
-- The renderer always paints the OPPONENT's background behind the fight
-- stage. loop is irrelevant for a still image. Re-runnable via ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('knight',    'BACKGROUND', '{"url":"assets/fof/backgrounds/knight.png",    "loop":false, "static":true, "notes":"castle wall arena"}'::jsonb),
  ('rogue',     'BACKGROUND', '{"url":"assets/fof/backgrounds/rogue.png",     "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('berserker', 'BACKGROUND', '{"url":"assets/fof/backgrounds/berserker.png", "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('mage',      'BACKGROUND', '{"url":"assets/fof/backgrounds/mage.png",      "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('assassin',  'BACKGROUND', '{"url":"assets/fof/backgrounds/assassin.png",  "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('ranger',    'BACKGROUND', '{"url":"assets/fof/backgrounds/ranger.png",    "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('warlock',   'BACKGROUND', '{"url":"assets/fof/backgrounds/warlock.png",   "loop":false, "static":true, "notes":"arena"}'::jsonb),
  ('paladin',   'BACKGROUND', '{"url":"assets/fof/backgrounds/paladin.png",   "loop":false, "static":true, "notes":"arena"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
