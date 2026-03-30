-- Legacy helper retained for backwards compatibility.
-- In the account-mode contest model, deleting a contest should leave normal
-- profile balances untouched and only remove contest-specific rows.
create or replace function delete_contest_and_restore_balances(
  _contest_id uuid
)
returns boolean as $$
declare
  v_deleted boolean := false;
begin
  delete from public.contests
  where id = _contest_id;

  if found then
    v_deleted := true;
  end if;

  return v_deleted;
end;
$$ language plpgsql security definer;

grant execute on function delete_contest_and_restore_balances(uuid) to authenticated;
