-- BLOOM — atomically delete a card AND remove it from every region's deck.
-- A plain DELETE on bloom_cards would leave dangling slugs inside
-- bloom_regions.deck_composition JSONB, which the simulator would then
-- treat as an unknown card and raise on.  This function fixes both rows
-- inside a single transaction.

CREATE OR REPLACE FUNCTION public.bloom_delete_card(p_card TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strip the card from every region's deck composition (jsonb - key).
  UPDATE public.bloom_regions
  SET deck_composition = deck_composition - p_card,
      updated_at       = NOW()
  WHERE deck_composition ? p_card;

  -- Now delete the card row.
  DELETE FROM public.bloom_cards WHERE card = p_card;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bloom_delete_card(TEXT) TO authenticated;
