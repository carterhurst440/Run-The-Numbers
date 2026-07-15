-- BLOOM — flower roster (the satchel-slot game).
-- One row per seed the player can pack into the 10-slot satchel. This is the
-- authoritative deck definition: the game should load these on boot (read-only
-- on the client) instead of trusting the iframe's localStorage, so a player who
-- opens the Deck Builder can't rewrite the odds.
--
-- Model (mirrors games/bloom.html):
--   take_pct     sprout chance — % the seed even germinates when cast.
--   bloom_pay    Bloom payout as a % of bet (one bloom-hit → this).
--   super_mult   Super Bloom = super_mult × bloom_pay (two bloom-hits, the ceiling).
--   weather_odds per-weather {b: bloom%, k: wilt%}, keyed by bloom_weather.weather.
--                Each living plant rolls once per revealed reel: roll < b → bloom a
--                step; roll < b+k → wilt (dead). A 3-reel match pays the whole board ×5.
--
-- Every bloom_pay was solved by exact enumeration of all 125 weather lines so each
-- of the 10 seeds returns ~9.9% of bet → 98.5% RTP. Changing a flower's odds OR its
-- super_mult requires re-solving that flower's bloom_pay (the in-game Deck Lab flags
-- drift). Treat these seeds as the tuned source of truth.

CREATE TABLE IF NOT EXISTS public.bloom_flowers (
  flower        TEXT PRIMARY KEY,                 -- stable species slug (lotus, orchid, …)
  display_name  TEXT NOT NULL,
  emoji         TEXT,
  accent_color  TEXT,
  archetype     TEXT CHECK (archetype IN ('specialist', 'balanced', 'pay_band')),
  take_pct      INTEGER NOT NULL DEFAULT 90,      -- sprout chance, 0..100
  bloom_pay     NUMERIC NOT NULL DEFAULT 0,       -- Bloom payout, % of bet
  super_mult    NUMERIC NOT NULL DEFAULT 2,       -- Super Bloom = super_mult × bloom_pay
  super_pay     NUMERIC GENERATED ALWAYS AS (bloom_pay * super_mult) STORED,
  weather_odds  JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bloom_flowers ENABLE ROW LEVEL SECURITY;

-- Admin writes; everyone (incl. the anon-key iframe) reads the deck.
DROP POLICY IF EXISTS "auth_all_bloom_flowers" ON public.bloom_flowers;
CREATE POLICY "auth_all_bloom_flowers" ON public.bloom_flowers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_flowers" ON public.bloom_flowers;
CREATE POLICY "anon_read_bloom_flowers" ON public.bloom_flowers
  FOR SELECT TO anon USING (true);

-- Seed Carter's ten (idempotent — re-running RESETS values to these seeds).
-- weather_odds order matches bloom_weather: w_dew, w_frz, w_heat, w_rain, w_wind.
INSERT INTO public.bloom_flowers
  (flower, display_name, emoji, accent_color, archetype, take_pct, bloom_pay, super_mult, weather_odds, sort_order)
VALUES
  ('lotus', 'Lotus', '🪷', '#ef8fbf', 'specialist', 85, 28, 2,
   '{"w_dew":{"b":0,"k":4},"w_frz":{"b":0,"k":36},"w_heat":{"b":0,"k":20},"w_rain":{"b":82,"k":0},"w_wind":{"b":0,"k":12}}'::jsonb, 1),
  ('cactus', 'Cactus', '🌵', '#e0348a', 'specialist', 92, 27, 2,
   '{"w_dew":{"b":0,"k":14},"w_frz":{"b":0,"k":32},"w_heat":{"b":82,"k":0},"w_rain":{"b":0,"k":34},"w_wind":{"b":0,"k":4}}'::jsonb, 2),
  ('hydrangea', 'Hydrangea', '🪻', '#7d9ae0', 'specialist', 90, 26, 2,
   '{"w_dew":{"b":80,"k":0},"w_frz":{"b":0,"k":18},"w_heat":{"b":0,"k":30},"w_rain":{"b":0,"k":6},"w_wind":{"b":0,"k":10}}'::jsonb, 3),
  ('snapdragon', 'Snapdragon', '🌷', '#f06ba0', 'specialist', 90, 26, 2,
   '{"w_dew":{"b":0,"k":6},"w_frz":{"b":78,"k":0},"w_heat":{"b":0,"k":26},"w_rain":{"b":0,"k":8},"w_wind":{"b":0,"k":10}}'::jsonb, 4),
  ('wisteria', 'Wisteria', '💜', '#8f7bd6', 'specialist', 88, 26, 2,
   '{"w_dew":{"b":0,"k":7},"w_frz":{"b":0,"k":24},"w_heat":{"b":0,"k":12},"w_rain":{"b":0,"k":8},"w_wind":{"b":80,"k":0}}'::jsonb, 5),
  ('tulip', 'Tulip', '🌷', '#e8508c', 'balanced', 90, 22, 2,
   '{"w_dew":{"b":18,"k":6},"w_frz":{"b":14,"k":10},"w_heat":{"b":16,"k":8},"w_rain":{"b":22,"k":5},"w_wind":{"b":16,"k":8}}'::jsonb, 6),
  ('daisy', 'Daisy', '🌼', '#f2e9c0', 'balanced', 95, 20, 1.5,
   '{"w_dew":{"b":20,"k":4},"w_frz":{"b":16,"k":7},"w_heat":{"b":20,"k":5},"w_rain":{"b":20,"k":5},"w_wind":{"b":18,"k":6}}'::jsonb, 7),
  ('sunflower', 'Sunflower', '🌻', '#ffb42e', 'pay_band', 95, 10, 1.5,
   '{"w_dew":{"b":40,"k":3},"w_frz":{"b":30,"k":6},"w_heat":{"b":48,"k":2},"w_rain":{"b":38,"k":3},"w_wind":{"b":40,"k":3}}'::jsonb, 8),
  ('poppy', 'Poppy', '🌺', '#e6382b', 'pay_band', 70, 76, 2.5,
   '{"w_dew":{"b":8,"k":10},"w_frz":{"b":3,"k":34},"w_heat":{"b":12,"k":8},"w_rain":{"b":7,"k":12},"w_wind":{"b":6,"k":14}}'::jsonb, 9),
  ('orchid', 'Orchid', '🌸', '#c05a9e', 'pay_band', 55, 192, 3,
   '{"w_dew":{"b":6,"k":10},"w_frz":{"b":2,"k":30},"w_heat":{"b":3,"k":22},"w_rain":{"b":5,"k":10},"w_wind":{"b":3,"k":16}}'::jsonb, 10)
ON CONFLICT (flower) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  emoji        = EXCLUDED.emoji,
  accent_color = EXCLUDED.accent_color,
  archetype    = EXCLUDED.archetype,
  take_pct     = EXCLUDED.take_pct,
  bloom_pay    = EXCLUDED.bloom_pay,
  super_mult   = EXCLUDED.super_mult,
  weather_odds = EXCLUDED.weather_odds,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
