-- Trigger to automatically mark a prize as inactive when purchased
-- This bypasses RLS policies since it runs at the database level

-- Create the trigger function
create or replace function mark_prize_inactive_on_purchase()
returns trigger as $$
begin
  -- Mark the prize as inactive (sold)
  update prizes 
  set active = false 
  where id = NEW.prize_id;
  
  return NEW;
end;
$$ language plpgsql security definer;

-- Drop the trigger if it exists
drop trigger if exists on_prize_purchase_mark_inactive on prize_purchases;

-- Create the trigger
create trigger on_prize_purchase_mark_inactive
  after insert on prize_purchases
  for each row
  execute function mark_prize_inactive_on_purchase();
