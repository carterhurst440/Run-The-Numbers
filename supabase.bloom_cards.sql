-- BLOOM — weather cards.
-- One row per weather card. effects is a JSONB object keyed by flower slug
-- (cactus_bloom, hibiscus, hydrangea, frost_lily, plumeria) with an INT delta
-- applied to the flower's growth score when this card is drawn. Negative
-- values are clamped at 0 during simulation (a flower can't lose growth).

CREATE TABLE IF NOT EXISTS public.bloom_cards (
  card          TEXT PRIMARY KEY,
  display_name  TEXT  NOT NULL,
  effects       JSONB NOT NULL,
  sort_order    INT   NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bloom_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_bloom_cards" ON public.bloom_cards;
CREATE POLICY "auth_all_bloom_cards"
  ON public.bloom_cards
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_bloom_cards" ON public.bloom_cards;
CREATE POLICY "anon_read_bloom_cards"
  ON public.bloom_cards
  FOR SELECT
  TO anon
  USING (true);

-- Seed all 15 weather cards (idempotent — re-running RESETS values).
INSERT INTO public.bloom_cards (card, display_name, effects, sort_order) VALUES
  ('sunny_day',          'Sunny Day',
    '{"cactus_bloom":13,"hibiscus":8,"hydrangea":2,"frost_lily":-4,"plumeria":11}'::jsonb,    1),
  ('gentle_rain',        'Gentle Rain',
    '{"cactus_bloom":0,"hibiscus":10,"hydrangea":13,"frost_lily":5,"plumeria":8}'::jsonb,     2),
  ('thunderstorm',       'Thunderstorm',
    '{"cactus_bloom":-3,"hibiscus":13,"hydrangea":8,"frost_lily":9,"plumeria":5}'::jsonb,     3),
  ('dry_heat',           'Dry Heat',
    '{"cactus_bloom":12,"hibiscus":2,"hydrangea":1,"frost_lily":0,"plumeria":8}'::jsonb,      4),
  ('flooding',           'Flooding',
    '{"cactus_bloom":-5,"hibiscus":8,"hydrangea":12,"frost_lily":0,"plumeria":6}'::jsonb,     5),
  ('late_freeze',        'Late Freeze',
    '{"cactus_bloom":-5,"hibiscus":-4,"hydrangea":0,"frost_lily":14,"plumeria":0}'::jsonb,    6),
  ('morning_dew',        'Morning Dew',
    '{"cactus_bloom":6,"hibiscus":8,"hydrangea":9,"frost_lily":7,"plumeria":13}'::jsonb,      7),
  ('overcast',           'Overcast',
    '{"cactus_bloom":1,"hibiscus":3,"hydrangea":12,"frost_lily":9,"plumeria":7}'::jsonb,      8),
  ('tropical_humidity',  'Tropical Humidity',
    '{"cactus_bloom":0,"hibiscus":14,"hydrangea":8,"frost_lily":-2,"plumeria":10}'::jsonb,    9),
  ('windstorm',          'Windstorm',
    '{"cactus_bloom":3,"hibiscus":6,"hydrangea":5,"frost_lily":13,"plumeria":6}'::jsonb,     10),
  ('perfect_conditions', 'Perfect Conditions',
    '{"cactus_bloom":10,"hibiscus":10,"hydrangea":10,"frost_lily":10,"plumeria":10}'::jsonb, 11),
  ('drought',            'Drought',
    '{"cactus_bloom":15,"hibiscus":-4,"hydrangea":-6,"frost_lily":-4,"plumeria":3}'::jsonb,  12),
  ('hailstorm',          'Hailstorm',
    '{"cactus_bloom":-3,"hibiscus":-2,"hydrangea":5,"frost_lily":14,"plumeria":3}'::jsonb,   13),
  ('cool_breeze',        'Cool Breeze',
    '{"cactus_bloom":4,"hibiscus":4,"hydrangea":12,"frost_lily":10,"plumeria":8}'::jsonb,    14),
  ('heat_wave',          'Heat Wave',
    '{"cactus_bloom":14,"hibiscus":-1,"hydrangea":-2,"frost_lily":-2,"plumeria":4}'::jsonb,  15)
ON CONFLICT (card) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  effects      = EXCLUDED.effects,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
