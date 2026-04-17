alter table public.shape_trader_accounts_current
  add column if not exists contest_id uuid references public.contests(id) on delete set null;

alter table public.shape_trader_accounts_current
  add column if not exists account_scope text not null default 'normal';

update public.shape_trader_accounts_current
set account_scope = coalesce(account_scope, case when contest_id is null then 'normal' else 'contest:' || contest_id::text end);

alter table public.shape_trader_accounts_current
  drop constraint if exists shape_trader_accounts_current_pkey;

alter table public.shape_trader_accounts_current
  add constraint shape_trader_accounts_current_pkey primary key (user_id, account_scope);

create index if not exists idx_shape_trader_accounts_current_contest_id
  on public.shape_trader_accounts_current (contest_id);

alter table public.shape_trader_positions_current
  add column if not exists contest_id uuid references public.contests(id) on delete set null;

alter table public.shape_trader_positions_current
  add column if not exists account_scope text not null default 'normal';

update public.shape_trader_positions_current
set account_scope = coalesce(account_scope, case when contest_id is null then 'normal' else 'contest:' || contest_id::text end);

alter table public.shape_trader_positions_current
  drop constraint if exists shape_trader_positions_current_pkey;

alter table public.shape_trader_positions_current
  add constraint shape_trader_positions_current_pkey primary key (user_id, account_scope, shape);

create index if not exists idx_shape_trader_positions_current_contest_id
  on public.shape_trader_positions_current (contest_id);
