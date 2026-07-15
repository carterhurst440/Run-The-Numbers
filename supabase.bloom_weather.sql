-- BLOOM — weather patterns (the reel deck).
-- One row per weather card. The deck is exactly these 5, one card each; every
-- reel is an independent pull, so a 3-reel match is 1/25 = 4% and pays the whole
-- board ×5. These ids are the keys inside bloom_flowers.weather_odds and inside
-- bloom_rounds.weather_patterns, so this table is the canonical name/emoji/color
-- source for weather across the game.

CREATE TABLE IF NOT EXISTS public.bloom_weather (
  weather       TEXT PRIMARY KEY,          -- stable id (w_dew, w_frz, …)
  display_name  TEXT NOT NULL,
  icon          TEXT,
  accent_color  TEXT,
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

-- Seed the 5 patterns (idempotent — re-running RESETS values to these seeds).
INSERT INTO public.bloom_weather (weather, display_name, icon, accent_color, sort_order)
VALUES
  ('w_dew',  'Morning Dew', '💧', '#6fb7e0', 1),
  ('w_frz',  'Late Freeze', '❄️', '#a9d6ef', 2),
  ('w_heat', 'Summer Heat', '☀️', '#f4b23c', 3),
  ('w_rain', 'Spring Rain', '🌧️', '#7a9bd0', 4),
  ('w_wind', 'Autumn Wind', '🍂', '#d08a4a', 5)
ON CONFLICT (weather) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  icon         = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
