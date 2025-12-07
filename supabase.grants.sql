-- Grant execute on the RPC to anon and authenticated roles so clients can call it
-- Run this in Supabase SQL editor after creating the function

grant execute on function purchase_prize(uuid, uuid, text, text, text) to anon;
grant execute on function purchase_prize(uuid, uuid, text, text, text) to authenticated;

-- Optional: if you want to restrict to only authenticated callers, revoke from anon
-- revoke execute on function purchase_prize(uuid, uuid, text, text, text) from anon;
