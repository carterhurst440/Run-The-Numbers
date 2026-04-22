-- Secure prize redemption and purchase record protection.
--
-- This migration makes prize redemption atomic and authoritative on the
-- server: the database verifies the live prize cost/currency, deducts the
-- appropriate balance, records the purchase, and marks the prize inactive in a
-- single transaction.

create or replace function public.is_rtn_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'carterwarrenhurst@gmail.com', false);
$$;

alter table public.prize_purchases enable row level security;

drop policy if exists "Users can view their own prize purchases" on public.prize_purchases;
create policy "Users can view their own prize purchases"
on public.prize_purchases
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update their own prize shipping details" on public.prize_purchases;
create policy "Users can update their own prize shipping details"
on public.prize_purchases
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Admin can manage prize purchases" on public.prize_purchases;
create policy "Admin can manage prize purchases"
on public.prize_purchases
for all
to authenticated
using (public.is_rtn_admin())
with check (public.is_rtn_admin());

create or replace function public.guard_prize_purchase_mutation()
returns trigger
language plpgsql
as $$
begin
  if public.is_rtn_admin() or current_setting('rtn.allow_prize_purchase_write', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Direct prize purchase inserts are not allowed.';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Direct prize purchase deletes are not allowed.';
  end if;

  if
    new.prize_id is distinct from old.prize_id or
    new.user_id is distinct from old.user_id or
    new.cost is distinct from old.cost or
    new.created_at is distinct from old.created_at
  then
    raise exception 'Only shipping details may be updated on a prize purchase.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_prize_purchase_mutation on public.prize_purchases;
create trigger guard_prize_purchase_mutation
before insert or update or delete on public.prize_purchases
for each row
execute function public.guard_prize_purchase_mutation();

drop function if exists public.redeem_prize_secure(uuid, text, text, text);

create or replace function public.redeem_prize_secure(
  _prize_id uuid,
  _shipping_address text,
  _shipping_phone text default null,
  _contact_email text default null
)
returns table (
  purchase_id uuid,
  prize_id uuid,
  user_id uuid,
  shipping_address text,
  shipping_phone text,
  contact_email text,
  cost integer,
  cost_currency text,
  remaining_credits numeric,
  remaining_carter_cash integer,
  remaining_carter_cash_progress numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize prizes%rowtype;
  v_profile profiles%rowtype;
  v_purchase prize_purchases%rowtype;
  v_cost integer := 0;
  v_currency text := 'units';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _prize_id is null then
    raise exception 'Prize id is required';
  end if;

  if nullif(trim(coalesce(_shipping_address, '')), '') is null then
    raise exception 'Shipping address is required';
  end if;

  if nullif(trim(coalesce(_contact_email, '')), '') is null then
    raise exception 'Contact email is required';
  end if;

  select *
  into v_prize
  from public.prizes
  where id = _prize_id
  for update;

  if not found then
    raise exception 'Prize not found';
  end if;

  if coalesce(v_prize.active, false) = false then
    raise exception 'This prize was just claimed by someone else.';
  end if;

  v_cost := greatest(coalesce(round(v_prize.cost), 0), 0);
  v_currency := lower(coalesce(v_prize.cost_currency, 'units'));

  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_currency = 'carter_cash' then
    if coalesce(v_profile.carter_cash, 0) < v_cost then
      raise exception 'Not enough Carter Cash to redeem this prize.';
    end if;
  else
    if coalesce(v_profile.credits, 0) < v_cost then
      raise exception 'Not enough units to redeem this prize.';
    end if;
  end if;

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  perform set_config('rtn.allow_prize_purchase_write', '1', true);

  if v_currency = 'carter_cash' then
    update public.profiles
    set carter_cash = greatest(0, coalesce(carter_cash, 0) - v_cost)
    where id = auth.uid()
    returning * into v_profile;
  else
    update public.profiles
    set credits = round(greatest(0, coalesce(credits, 0) - v_cost)::numeric, 2)
    where id = auth.uid()
    returning * into v_profile;
  end if;

  insert into public.prize_purchases (
    prize_id,
    user_id,
    shipping_address,
    shipping_phone,
    contact_email,
    cost
  )
  values (
    _prize_id,
    auth.uid(),
    trim(_shipping_address),
    nullif(trim(coalesce(_shipping_phone, '')), ''),
    trim(_contact_email),
    v_cost
  )
  returning * into v_purchase;

  update public.prizes
  set active = false
  where id = _prize_id;

  return query
  select
    v_purchase.id,
    v_purchase.prize_id,
    v_purchase.user_id,
    v_purchase.shipping_address,
    v_purchase.shipping_phone,
    v_purchase.contact_email,
    v_purchase.cost,
    v_currency,
    round(coalesce(v_profile.credits, 0)::numeric, 2),
    greatest(coalesce(v_profile.carter_cash, 0), 0),
    greatest(coalesce(v_profile.carter_cash_progress, 0), 0),
    v_purchase.created_at;
end;
$$;

grant execute on function public.redeem_prize_secure(uuid, text, text, text) to authenticated;
revoke execute on function public.purchase_prize(uuid, uuid, text, text, text) from anon;
