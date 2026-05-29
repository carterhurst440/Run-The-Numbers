-- BLOOM — replacement-sampling sanity check.
-- Runs the simulator N times for DESERT, tallies how many times each
-- card was drawn in the SINGLE round where it appeared most, and
-- compares against the card's count in the desert deck composition.
-- If the simulator is correctly drawing WITH replacement, you'll see
-- many cards drawn more times than they exist in the deck. If the
-- simulator is drawing WITHOUT replacement (the bug), every card's
-- max-in-one-round will be <= its deck count.

WITH sims AS (
  SELECT
    i AS sim_id,
    public.bloom_simulate_round('desert', NULL) AS result
  FROM generate_series(1, 50) AS i
),
sim_versions AS (
  SELECT DISTINCT result->>'simVersion' AS ver,
         (result->>'maxDraws')::INT     AS max_draws
  FROM sims
),
draws AS (
  SELECT
    sim_id,
    ev->>'card' AS card
  FROM sims, jsonb_array_elements(result->'events') AS ev
  WHERE ev->>'type' = 'DRAW'
),
per_sim_counts AS (
  SELECT sim_id, card, COUNT(*) AS times_drawn_in_sim
  FROM draws
  GROUP BY sim_id, card
),
deck AS (
  SELECT
    key            AS card,
    value::INT     AS deck_count
  FROM public.bloom_regions r, jsonb_each_text(r.deck_composition)
  WHERE r.region = 'desert'
)
SELECT
  d.card,
  d.deck_count                              AS in_deck,
  COALESCE(MAX(p.times_drawn_in_sim), 0)    AS max_in_one_round,
  CASE
    WHEN MAX(p.times_drawn_in_sim) > d.deck_count
      THEN '✓ DRAWN MORE TIMES THAN IN DECK — with-replacement confirmed'
    WHEN MAX(p.times_drawn_in_sim) IS NULL
      THEN '(card never drawn in 50 sims)'
    ELSE '— not exceeded yet (try more sims; rare cards may need >50)'
  END                                        AS verdict
FROM deck d
LEFT JOIN per_sim_counts p USING (card)
GROUP BY d.card, d.deck_count
ORDER BY max_in_one_round DESC;

-- Bonus: confirm which simulator version answered.
SELECT * FROM sim_versions;
