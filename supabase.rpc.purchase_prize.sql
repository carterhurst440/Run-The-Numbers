-- Atomic purchase RPC for redeeming a prize
-- Usage: call via supabase.rpc('purchase_prize', { _prize_id, _user_id, _address, _phone, _email })
create or replace function purchase_prize(
  _prize_id uuid,
  _user_id uuid,
  _address text,
  _phone text,
  _email text
)
returns table (
  purchase_id uuid,
  prize_id uuid,
  user_id uuid,
  shipping_address text,
  shipping_phone text,
  contact_email text,
  created_at timestamptz
) as $$
begin
  -- Only allow purchase if prize is active
  if exists (select 1 from prizes where id = _prize_id and active = true) then
    -- Insert purchase record
    insert into prize_purchases (prize_id, user_id, shipping_address, shipping_phone, contact_email)
    values (_prize_id, _user_id, _address, _phone, _email)
    returning id, prize_id, user_id, shipping_address, shipping_phone, contact_email, created_at
    into purchase_id, prize_id, user_id, shipping_address, shipping_phone, contact_email, created_at;
    -- Mark prize as inactive (sold)
    update prizes set active = false where id = _prize_id;
    return next;
  end if;
end;
$$ language plpgsql security definer;
