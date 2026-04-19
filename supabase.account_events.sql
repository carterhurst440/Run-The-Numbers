create table if not exists public.account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('daily_credit_refresh')),
  amount numeric(12,2) not null default 0,
  previous_balance numeric(12,2) not null default 0,
  new_balance numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_account_events_user_created_at
  on public.account_events (user_id, created_at desc);

alter table public.account_events enable row level security;

drop policy if exists "account_events_select_own" on public.account_events;
create policy "account_events_select_own"
on public.account_events
for select
to authenticated
using (user_id = auth.uid());
