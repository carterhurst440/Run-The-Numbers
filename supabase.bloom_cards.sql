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
    '{"cactus_bloom":18,"hibiscus":12,"hydrangea":-4,"frost_lily":-8,"plumeria":16}'::jsonb,  1),
  ('gentle_rain',        'Gentle Rain',
    '{"cactus_bloom":-5,"hibiscus":14,"hydrangea":18,"frost_lily":8,"plumeria":12}'::jsonb,   2),
  ('thunderstorm',       'Thunderstorm',
    '{"cactus_bloom":-8,"hibiscus":18,"hydrangea":10,"frost_lily":12,"plumeria":6}'::jsonb,   3),
  ('dry_heat',           'Dry Heat',
    '{"cactus_bloom":20,"hibiscus":-4,"hydrangea":-8,"frost_lily":-10,"plumeria":10}'::jsonb, 4),
  ('flooding',           'Flooding',
    '{"cactus_bloom":-10,"hibiscus":10,"hydrangea":16,"frost_lily":-2,"plumeria":8}'::jsonb,  5),
  ('late_freeze',        'Late Freeze',
    '{"cactus_bloom":-10,"hibiscus":-8,"hydrangea":6,"frost_lily":20,"plumeria":4}'::jsonb,   6),
  ('morning_dew',        'Morning Dew',
    '{"cactus_bloom":8,"hibiscus":12,"hydrangea":12,"frost_lily":10,"plumeria":18}'::jsonb,   7),
  ('overcast',           'Overcast',
    '{"cactus_bloom":-2,"hibiscus":4,"hydrangea":16,"frost_lily":12,"plumeria":10}'::jsonb,   8),
  ('tropical_humidity',  'Tropical Humidity',
    '{"cactus_bloom":-4,"hibiscus":20,"hydrangea":10,"frost_lily":-4,"plumeria":14}'::jsonb,  9),
  ('windstorm',          'Windstorm',
    '{"cactus_bloom":2,"hibiscus":8,"hydrangea":6,"frost_lily":18,"plumeria":8}'::jsonb,     10),
  ('perfect_conditions', 'Perfect Conditions',
    '{"cactus_bloom":12,"hibiscus":12,"hydrangea":12,"frost_lily":12,"plumeria":20}'::jsonb, 11),
  ('drought',            'Drought',
    '{"cactus_bloom":22,"hibiscus":-6,"hydrangea":-10,"frost_lily":-6,"plumeria":6}'::jsonb, 12),
  ('hailstorm',          'Hailstorm',
    '{"cactus_bloom":-6,"hibiscus":-4,"hydrangea":6,"frost_lily":20,"plumeria":4}'::jsonb,   13),
  ('cool_breeze',        'Cool Breeze',
    '{"cactus_bloom":6,"hibiscus":6,"hydrangea":18,"frost_lily":16,"plumeria":14}'::jsonb,   14),
  ('heat_wave',          'Heat Wave',
    '{"cactus_bloom":24,"hibiscus":-8,"hydrangea":-12,"frost_lily":-14,"plumeria":8}'::jsonb, 15)
ON CONFLICT (card) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  effects      = EXCLUDED.effects,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
