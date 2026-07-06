-- MONKEY MOONSHINE — wild-fruit decks.
-- One row per wild fruit (the fruit the player charms becomes the wild).
--
--   deck          JSONB  regular board-draw weights, keyed by symbol
--                        (the 8 fruits + "coconut"). Raw draw COUNTS, not %.
--   replace_deck  JSONB  raid coconut-swap weights (Deck Editor "replacement"
--                        column). Same fruit weights as `deck`, but the
--                        "coconut" key holds the MONKEY weight — at draw time a
--                        coconut hit in a raid becomes a live monkey scatter.
--
-- The replacement coconut/monkey weight M is derived so its RESULTING odds are a
-- quarter of the normal deck's coconut concentration:
--   M = round( C*F / (3C + 4F) )   where C = coconut wt, F = sum of fruit wts.
-- (Same formula the client uses to build CONFIG.REPLACE_DECKS.) Seeded explicitly
-- so the replacement deck stays independently editable, matching the in-game
-- Deck Editor.
--
-- NOTE: these are the CURRENT (prototype) weights. A Monte-Carlo pass (in-game
-- Deck Lab, or the offline sim) shows most decks are well outside the 93-96% RTP
-- band and need retuning — seeding them here just makes the live values the
-- single source of truth so a balance pass can edit rows instead of code.

CREATE TABLE IF NOT EXISTS public.mm_decks (
  wild          TEXT PRIMARY KEY,          -- fruit slug (also the wild symbol)
  display_name  TEXT NOT NULL,
  mult          INT  NOT NULL,             -- wild multiplier applied to a line the wild fruit completes
  deck          JSONB NOT NULL,            -- regular draw weights (symbol -> count)
  replace_deck  JSONB NOT NULL,            -- raid replacement weights (symbol -> count; "coconut" = monkey wt)
  sort_order    INT  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mm_decks ENABLE ROW LEVEL SECURITY;

-- Same access shape as the other admin games (bloom): authenticated may read/write
-- (admin gating is enforced client-side / by whatever RPC settles rounds), anon read-only.
DROP POLICY IF EXISTS "auth_all_mm_decks" ON public.mm_decks;
CREATE POLICY "auth_all_mm_decks"
  ON public.mm_decks
  FOR ALL
  TO authenticated
  USING  (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_mm_decks" ON public.mm_decks;
CREATE POLICY "anon_read_mm_decks"
  ON public.mm_decks
  FOR SELECT
  TO anon
  USING (true);

-- Seed all 8 decks (idempotent — re-running RESETS values to these seeds).
INSERT INTO public.mm_decks (wild, display_name, mult, deck, replace_deck, sort_order)
VALUES
  ('cherry', 'Cherry', 1,
   '{"coconut":870,"cherry":130,"banana":118,"lemon":118,"apple":92,"peach":73,"dragonfruit":46,"mango":46,"pineapple":27}'::jsonb,
   '{"coconut":109,"cherry":130,"banana":118,"lemon":118,"apple":92,"peach":73,"dragonfruit":46,"mango":46,"pineapple":27}'::jsonb,
   1),
  ('apple', 'Apple', 2,
   '{"coconut":132,"cherry":38,"banana":28,"lemon":28,"apple":10,"peach":14,"dragonfruit":8,"mango":8,"pineapple":2}'::jsonb,
   '{"coconut":19,"cherry":38,"banana":28,"lemon":28,"apple":10,"peach":14,"dragonfruit":8,"mango":8,"pineapple":2}'::jsonb,
   2),
  ('banana', 'Banana', 3,
   '{"coconut":498,"cherry":140,"banana":60,"lemon":60,"apple":80,"peach":60,"dragonfruit":40,"mango":40,"pineapple":20}'::jsonb,
   '{"coconut":71,"cherry":140,"banana":60,"lemon":60,"apple":80,"peach":60,"dragonfruit":40,"mango":40,"pineapple":20}'::jsonb,
   3),
  ('lemon', 'Lemon', 3,
   '{"coconut":498,"cherry":140,"banana":60,"lemon":60,"apple":80,"peach":60,"dragonfruit":40,"mango":40,"pineapple":20}'::jsonb,
   '{"coconut":71,"cherry":140,"banana":60,"lemon":60,"apple":80,"peach":60,"dragonfruit":40,"mango":40,"pineapple":20}'::jsonb,
   4),
  ('peach', 'Peach', 4,
   '{"coconut":130,"cherry":37,"banana":27,"lemon":27,"apple":19,"peach":8,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   '{"coconut":19,"cherry":37,"banana":27,"lemon":27,"apple":19,"peach":8,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   5),
  ('dragonfruit', 'Dragonfruit', 5,
   '{"coconut":122,"cherry":35,"banana":25,"lemon":25,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   '{"coconut":18,"cherry":35,"banana":25,"lemon":25,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   6),
  ('mango', 'Mango', 5,
   '{"coconut":122,"cherry":35,"banana":25,"lemon":25,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   '{"coconut":18,"cherry":35,"banana":25,"lemon":25,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":2}'::jsonb,
   7),
  ('pineapple', 'Pineapple', 10,
   '{"coconut":119,"cherry":34,"banana":24,"lemon":24,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":4}'::jsonb,
   '{"coconut":18,"cherry":34,"banana":24,"lemon":24,"apple":18,"peach":13,"dragonfruit":7,"mango":7,"pineapple":4}'::jsonb,
   8)
ON CONFLICT (wild) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  mult         = EXCLUDED.mult,
  deck         = EXCLUDED.deck,
  replace_deck = EXCLUDED.replace_deck,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
