alter table public.game_hands
  alter column total_wager type numeric(12,2)
  using round(coalesce(total_wager, 0)::numeric, 2);

alter table public.game_hands
  alter column total_paid type numeric(12,2)
  using round(coalesce(total_paid, 0)::numeric, 2);

alter table public.game_hands
  alter column net type numeric(12,2)
  using round(coalesce(net, 0)::numeric, 2);

alter table public.game_runs
  alter column score type numeric(12,2)
  using round(coalesce(score, 0)::numeric, 2);
