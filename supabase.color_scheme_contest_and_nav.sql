-- ============================================================
-- Color Scheme: contest support + nav value tracking
--
-- Run AFTER supabase.color_scheme_profile_progress.sql
-- (which adds color_scheme_rounds_played_all_time to profiles)
--
-- This migration adds:
--   1. contest_id       → links CS rounds to a contest
--   2. new_account_value → bankroll snapshot after each round settles
--      (used by contest journey chart)
-- ============================================================

-- 1. Add contest_id (FK to contests, nullable)
alter table public.color_scheme_rounds
  add column if not exists contest_id uuid references public.contests (id) on delete set null;

create index if not exists idx_color_scheme_rounds_contest_id
  on public.color_scheme_rounds (contest_id)
  where contest_id is not null;

-- 2. Add new_account_value (bankroll snapshot after round settles)
alter table public.color_scheme_rounds
  add column if not exists new_account_value numeric(12,2);

-- 3. Grant select/update on new columns to authenticated role
-- (RLS policies already cover row-level access)
grant select, update (contest_id, new_account_value)
  on public.color_scheme_rounds to authenticated;

-- ============================================================
-- IMPORTANT: After running this migration you also need to
-- run supabase.color_scheme_profile_progress.sql if you
-- haven't already (adds the profile column and RPCs).
--
-- After BOTH migrations are applied, re-add
-- color_scheme_rounds_played_all_time to the profile SELECT
-- strings in script.js (search for "run_the_numbers_hands_played_all_time"
-- and add it back). The code is guarded with || 0 fallbacks
-- in the meantime.
-- ============================================================
