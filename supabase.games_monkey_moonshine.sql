-- Register Monkey Moonshine (game_006) in the games catalog so its branding
-- (logo, description, status, unlock_tier) is shared + admin-editable across users.
-- Status 'active' = Released (visible to everyone). Applied live via Supabase MCP.
insert into public.games (id, name, status, logo_url, card_description, unlock_tier)
values (
  'game_006',
  'Monkey Moonshine',
  'active',
  '/assets/game-logos/monkey-moonshine.svg',
  'Charm a wild fruit, shake the tree, and chase the coconut-row Monkey Moonshine raid for stacked wild multipliers and extra shakes.',
  null
)
on conflict (id) do update set
  name = excluded.name,
  status = excluded.status,
  logo_url = coalesce(public.games.logo_url, excluded.logo_url),
  card_description = coalesce(public.games.card_description, excluded.card_description);
