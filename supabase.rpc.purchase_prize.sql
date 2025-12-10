-- Atomic purchase RPC for redeeming a prize
-- Drop existing function first to avoid type conflicts
drop function if exists purchase_prize(uuid, uuid, text, text, text);

-- Recreate function with correct signature
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
  purchased_prize_id uuid,
  purchased_user_id uuid,
  shipping_address text,
  shipping_phone text,
  contact_email text,
  created_at timestamptz
) as $$
declare
  v_purchase_id uuid;
  v_prize_id uuid;
  v_user_id uuid;
  v_address text;
  v_phone text;
  v_email text;
  v_created_at timestamptz;
begin
  -- Only allow purchase if prize is active
  if exists (select 1 from prizes where id = _prize_id and active = true) then
    -- Insert purchase record
    insert into prize_purchases (prize_id, user_id, shipping_address, shipping_phone, contact_email)
    values (_prize_id, _user_id, _address, _phone, _email)
    returning id, prize_id, user_id, shipping_address, shipping_phone, contact_email, created_at
    into v_purchase_id, v_prize_id, v_user_id, v_address, v_phone, v_email, v_created_at;
    
    -- Mark prize as inactive (sold)
    update prizes set active = false where id = _prize_id;
    
    -- Return the purchase details
    purchase_id := v_purchase_id;
    purchased_prize_id := v_prize_id;
    purchased_user_id := v_user_id;
    shipping_address := v_address;
    shipping_phone := v_phone;
    contact_email := v_email;
    created_at := v_created_at;
    
    return next;
  end if;
end;
$$ language plpgsql security definer;
