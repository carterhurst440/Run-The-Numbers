-- BLOOM — weather patterns + deck composition (the reel deck).
-- One row per card. Each reel is an independent WEIGHTED pull from this deck:
-- deck_count is how many copies of the card sit in the deck, so 3× Spring Rain
-- is drawn three times as often as a 1× card. A 3-reel match pays the whole
-- board ×5. These ids are the keys inside bloom_flowers.weather_odds and inside
-- bloom_rounds.weather_patterns, so this table is the canonical name/emoji/color
-- source for weather across the game.
--
-- kind:
--   'weather'   a normal pattern; each living plant rolls its per-weather odds.
--   'butterfly' the WILD. A butterfly reel revives every wilted/dud plant back to
--               SEED (a second chance), rolls no flower odds, and counts as a wild
--               toward a 3-in-a-row — a butterfly-completed line DOUBLES the round
--               total (vs the ×5 a natural three-of-a-kind pays).

CREATE TABLE IF NOT EXISTS public.bloom_weather (
  weather       TEXT PRIMARY KEY,          -- stable id (w_dew, w_frz, …, butterfly)
  display_name  TEXT NOT NULL,
  icon          TEXT,
  accent_color  TEXT,
  kind          TEXT NOT NULL DEFAULT 'weather'
                  CHECK (kind IN ('weather', 'butterfly')),
  deck_count    INTEGER NOT NULL DEFAULT 1, -- copies in the reel deck (draw weight)
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bloom_weather ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bloom_weather" ON public.bloom_weather;
CREATE POLICY "auth_all_bloom_weather" ON public.bloom_weather
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_weather" ON public.bloom_weather;
CREATE POLICY "anon_read_bloom_weather" ON public.bloom_weather
  FOR SELECT TO anon USING (true);

-- Seed the 5 patterns + the butterfly wild (idempotent — re-running RESETS
-- name/icon/color/kind/sort to these seeds; deck_count is left alone on conflict
-- so admin composition edits are not clobbered by a re-seed).
INSERT INTO public.bloom_weather (weather, display_name, icon, accent_color, kind, deck_count, sort_order)
VALUES
  ('w_dew',     'Morning Dew', '💧', '#6fb7e0', 'weather',   1, 1),
  ('w_frz',     'Late Freeze', '❄️', '#a9d6ef', 'weather',   1, 2),
  ('w_heat',    'Summer Heat', '☀️', '#f4b23c', 'weather',   1, 3),
  ('w_rain',    'Spring Rain', '🌧️', '#7a9bd0', 'weather',   1, 4),
  ('w_wind',    'Autumn Wind', '🍂', '#d08a4a', 'weather',   1, 5),
  ('butterfly', 'Butterfly',   '🦋', '#f7c948', 'butterfly', 1, 6)
ON CONFLICT (weather) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  icon         = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color,
  kind         = EXCLUDED.kind,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
