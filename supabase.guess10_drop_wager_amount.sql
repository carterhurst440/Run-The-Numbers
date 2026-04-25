update public.guess10_live_hands
set total_wager = coalesce(total_wager, wager_amount, 0)
where total_wager is null
   or total_wager = 0;

alter table public.guess10_live_hands
  drop column if exists wager_amount;
