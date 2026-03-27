-- Restore all participant balances from their contest snapshot, then delete the contest.
-- Usage: call via supabase.rpc('delete_contest_and_restore_balances', { _contest_id })
create or replace function delete_contest_and_restore_balances(
  _contest_id uuid
)
returns boolean as $$
declare
  v_deleted boolean := false;
begin
  update public.profiles p
  set
    credits = coalesce(e.pre_contest_credits, 1000),
    carter_cash = coalesce(e.pre_contest_carter_cash, 0),
    carter_cash_progress = coalesce(e.pre_contest_carter_cash_progress, 0)
  from public.contest_entries e
  where e.contest_id = _contest_id
    and e.user_id = p.id;

  delete from public.contests
  where id = _contest_id;

  if found then
    v_deleted := true;
  end if;

  return v_deleted;
end;
$$ language plpgsql security definer;

grant execute on function delete_contest_and_restore_balances(uuid) to authenticated;
