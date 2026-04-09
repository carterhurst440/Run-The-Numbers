alter table public.profiles
  alter column credits type numeric(12,2)
  using round(coalesce(credits, 0)::numeric, 2);

alter table public.profiles
  alter column credits set default 1000.00;

alter table public.contests
  alter column starting_credits type numeric(12,2)
  using round(coalesce(starting_credits, 0)::numeric, 2);

alter table public.contests
  alter column starting_credits set default 1000.00;

alter table public.contest_entries
  alter column pre_contest_credits type numeric(12,2)
  using round(coalesce(pre_contest_credits, 0)::numeric, 2);

alter table public.contest_entries
  alter column starting_credits type numeric(12,2)
  using round(coalesce(starting_credits, 0)::numeric, 2);

alter table public.contest_entries
  alter column current_credits type numeric(12,2)
  using round(coalesce(current_credits, 0)::numeric, 2);

alter table public.contest_entries
  alter column pre_contest_credits set default 1000.00;

alter table public.contest_entries
  alter column starting_credits set default 1000.00;

alter table public.contest_entries
  alter column current_credits set default 1000.00;
