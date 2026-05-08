-- ============================================================
-- Fix: contest_entries missing updated_at column
--
-- The save_contest_entry_snapshot RPC references updated_at
-- on contest_entries but the column doesn't exist, causing
-- contest credit saves to fail in contest mode.
--
-- This migration:
--   1. Adds updated_at column to contest_entries
--   2. Backfills existing rows with NOW()
--   3. Adds a trigger to keep it current automatically
-- ============================================================

-- 1. Add the column (safe if already exists)
alter table public.contest_entries
  add column if not exists updated_at timestamptz not null default now();

-- 2. Backfill existing rows
update public.contest_entries
  set updated_at = now()
  where updated_at is null;

-- 3. Auto-update trigger (reuse the standard pattern)
create or replace function public.set_contest_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contest_entries_updated_at on public.contest_entries;
create trigger trg_contest_entries_updated_at
  before update on public.contest_entries
  for each row execute function public.set_contest_entries_updated_at();
