-- Cascade delete RPC for deleting a prize and its associated purchases
-- Usage: call via supabase.rpc('delete_prize_cascade', { _prize_id })
create or replace function delete_prize_cascade(
  _prize_id uuid
)
returns boolean as $$
declare
  v_deleted boolean := false;
begin
  -- First delete all associated purchase records
  delete from prize_purchases where prize_id = _prize_id;
  
  -- Then delete the prize
  delete from prizes where id = _prize_id;
  
  -- Check if the prize was deleted
  if found then
    v_deleted := true;
  end if;
  
  return v_deleted;
end;
$$ language plpgsql security definer;

-- Grant execute permissions to authenticated users
grant execute on function delete_prize_cascade(uuid) to authenticated;
