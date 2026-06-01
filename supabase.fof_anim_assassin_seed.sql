-- FOF — seed ASSASSIN animations.
-- 10 GIFs in assets/fof/assassin/ (assassin v3 phantom variant).
-- SPECIAL is "execution" (INSTANT_KILL_CHANCE) — the SPECIAL clip plays when
-- fof_simulate_round emits a SPECIAL_TRIGGER for the execution ability.
-- No VICTORY_END/DEFEAT_END for this character: the renderer falls back to
-- the looping VICTORY/DEFEAT pose. Re-runnable thanks to ON CONFLICT.

INSERT INTO public.fate_or_fortune_animations (character, action, clip_data) VALUES
  ('assassin', 'IDLE',                 '{"url":"assets/fof/assassin/idle.gif",                 "loop":true,  "notes":"phantom v3"}'::jsonb),
  ('assassin', 'HIT',                  '{"url":"assets/fof/assassin/hit.gif",                  "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'CRITICAL_HIT',         '{"url":"assets/fof/assassin/critical_hit.gif",         "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'TAKE_DAMAGE',          '{"url":"assets/fof/assassin/take_damage.gif",          "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'TAKE_CRITICAL_DAMAGE', '{"url":"assets/fof/assassin/take_critical_damage.gif", "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'DODGE',                '{"url":"assets/fof/assassin/dodge.gif",                "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'MISS',                 '{"url":"assets/fof/assassin/miss.gif",                 "loop":false, "notes":"phantom v3"}'::jsonb),
  ('assassin', 'VICTORY',              '{"url":"assets/fof/assassin/victory.gif",              "loop":true,  "notes":"phantom v3 looping finale pose"}'::jsonb),
  ('assassin', 'DEFEAT',               '{"url":"assets/fof/assassin/defeat.gif",               "loop":true,  "notes":"phantom v3 looping finale pose"}'::jsonb),
  ('assassin', 'SPECIAL',              '{"url":"assets/fof/assassin/special.gif",              "loop":false, "notes":"phantom v3 execution - instant kill"}'::jsonb)
ON CONFLICT (character, action) DO UPDATE
  SET clip_data  = EXCLUDED.clip_data,
      updated_at = NOW();
