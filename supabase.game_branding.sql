alter table public.games
  add column if not exists logo_url text,
  add column if not exists card_description text,
  add column if not exists card_background_color text,
  add column if not exists button_color text,
  add column if not exists button_text_color text;

update public.games
set
  logo_url = case id
    when 'game_001' then coalesce(logo_url, '/assets/game-logos/run-the-numbers.svg')
    when 'game_002' then coalesce(logo_url, '/assets/game-logos/guess-10.svg')
    when 'game_003' then coalesce(logo_url, '/assets/game-logos/shape-traders.svg')
    else logo_url
  end,
  card_description = case id
    when 'game_001' then coalesce(card_description, 'Build your wager board, fade the bust card, and press number hits across the active paytable.')
    when 'game_002' then coalesce(card_description, 'Predict by color, suit, or rank, multiply the live pot on every hit, and cash out before the deck turns on you.')
    when 'game_003' then coalesce(card_description, 'Trade Circles, Squares, and Triangles against a shared live card-driven market with timed data dumps and isolated game accounting.')
    else card_description
  end
where id in ('game_001', 'game_002', 'game_003');
