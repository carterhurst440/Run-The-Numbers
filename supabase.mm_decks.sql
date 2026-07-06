-- MONKEY MOONSHINE — wild-fruit decks.
-- One row per wild fruit (the fruit the player charms becomes the wild).
--   deck          JSONB  regular board-draw weights (symbol -> raw draw count).
--   replace_deck  JSONB  raid coconut-swap weights; the "coconut" key holds the
--                        MONKEY weight (a coconut hit in a raid becomes a monkey).
--                        M = round( C*F / (3C + 4F) ), C=coconut wt, F=sum of fruit wts.
--
-- RETUNED 2026-07-06 via Monte-Carlo (in-game Deck Lab / offline sim): every deck now
-- lands ~94-95% RTP with ~8-11% Moonshine and ~5x avg return per Moonshine. Method:
-- coconut sets the Moonshine rate; the wild weight sets the RTP (cherry is mult x1 so
-- its RTP is coconut/Moonshine-driven). High-resolution weights for fine tuning. The
-- game loads these live from mm_decks on boot (see games/monkey-moonshine.html).

CREATE TABLE IF NOT EXISTS public.mm_decks (
  wild          TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  mult          INT  NOT NULL,
  deck          JSONB NOT NULL,
  replace_deck  JSONB NOT NULL,
  sort_order    INT  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mm_decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_mm_decks" ON public.mm_decks;
CREATE POLICY "auth_all_mm_decks" ON public.mm_decks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_mm_decks" ON public.mm_decks;
CREATE POLICY "anon_read_mm_decks" ON public.mm_decks
  FOR SELECT TO anon USING (true);

-- Seed all 8 decks (idempotent — re-running RESETS values to these seeds).
INSERT INTO public.mm_decks (wild, display_name, mult, deck, replace_deck, sort_order)
VALUES
  ('cherry', 'Cherry', 1,
   '{"coconut":4311,"cherry":780,"banana":708,"lemon":708,"apple":552,"peach":438,"dragonfruit":276,"mango":276,"pineapple":162}'::jsonb,
   '{"coconut":589,"cherry":780,"banana":708,"lemon":708,"apple":552,"peach":438,"dragonfruit":276,"mango":276,"pineapple":162}'::jsonb,
   1),
  ('apple', 'Apple', 2,
   '{"coconut":2164,"cherry":608,"banana":448,"lemon":448,"apple":223,"peach":224,"dragonfruit":128,"mango":128,"pineapple":32}'::jsonb,
   '{"coconut":314,"cherry":608,"banana":448,"lemon":448,"apple":223,"peach":224,"dragonfruit":128,"mango":128,"pineapple":32}'::jsonb,
   2),
  ('banana', 'Banana', 3,
   '{"coconut":3485,"cherry":980,"banana":232,"lemon":420,"apple":560,"peach":420,"dragonfruit":280,"mango":280,"pineapple":140}'::jsonb,
   '{"coconut":487,"cherry":980,"banana":232,"lemon":420,"apple":560,"peach":420,"dragonfruit":280,"mango":280,"pineapple":140}'::jsonb,
   3),
  ('lemon', 'Lemon', 3,
   '{"coconut":3485,"cherry":980,"banana":420,"lemon":232,"apple":560,"peach":420,"dragonfruit":280,"mango":280,"pineapple":140}'::jsonb,
   '{"coconut":487,"cherry":980,"banana":420,"lemon":232,"apple":560,"peach":420,"dragonfruit":280,"mango":280,"pineapple":140}'::jsonb,
   4),
  ('peach', 'Peach', 4,
   '{"coconut":4266,"cherry":1184,"banana":864,"lemon":864,"apple":608,"peach":218,"dragonfruit":224,"mango":224,"pineapple":64}'::jsonb,
   '{"coconut":608,"cherry":1184,"banana":864,"lemon":864,"apple":608,"peach":218,"dragonfruit":224,"mango":224,"pineapple":64}'::jsonb,
   5),
  ('dragonfruit', 'Dragonfruit', 5,
   '{"coconut":4997,"cherry":1330,"banana":950,"lemon":950,"apple":684,"peach":494,"dragonfruit":223,"mango":266,"pineapple":76}'::jsonb,
   '{"coconut":712,"cherry":1330,"banana":950,"lemon":950,"apple":684,"peach":494,"dragonfruit":223,"mango":266,"pineapple":76}'::jsonb,
   6),
  ('mango', 'Mango', 5,
   '{"coconut":4997,"cherry":1330,"banana":950,"lemon":950,"apple":684,"peach":494,"dragonfruit":266,"mango":223,"pineapple":76}'::jsonb,
   '{"coconut":712,"cherry":1330,"banana":950,"lemon":950,"apple":684,"peach":494,"dragonfruit":266,"mango":223,"pineapple":76}'::jsonb,
   7),
  ('pineapple', 'Pineapple', 10,
   '{"coconut":8854,"cherry":2312,"banana":1632,"lemon":1632,"apple":1224,"peach":884,"dragonfruit":476,"mango":476,"pineapple":221}'::jsonb,
   '{"coconut":1265,"cherry":2312,"banana":1632,"lemon":1632,"apple":1224,"peach":884,"dragonfruit":476,"mango":476,"pineapple":221}'::jsonb,
   8)
ON CONFLICT (wild) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  mult         = EXCLUDED.mult,
  deck         = EXCLUDED.deck,
  replace_deck = EXCLUDED.replace_deck,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
