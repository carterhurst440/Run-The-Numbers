-- Prizes overhaul: combination cost (credits + Carter Cash), stock quantity,
-- saved profile shipping address, monthly redemption cap, and definitive
-- before/after balance recording on every purchase.
--
-- Applied as migrations:
--   prizes_combo_cost_quantity_and_address
--   redeem_prize_secure_combo_and_admin_purchases

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

-- Prizes: combination cost (credits + carter cash) and stock quantity
alter table public.prizes
  add column if not exists cost_credits integer not null default 0,
  add column if not exists cost_carter_cash integer not null default 0,
  add column if not exists quantity integer not null default 1;

-- keep legacy `cost` (NOT NULL) satisfiable for any old code path
alter table public.prizes alter column cost set default 0;

-- backfill split-cost columns from any legacy single-currency prize
update public.prizes
set cost_credits = case when lower(coalesce(cost_currency, 'units')) <> 'carter_cash' then coalesce(cost, 0) else 0 end,
    cost_carter_cash = case when lower(coalesce(cost_currency, 'units')) = 'carter_cash' then coalesce(cost, 0) else 0 end
where cost_credits = 0 and cost_carter_cash = 0 and coalesce(cost, 0) > 0;

-- Profiles: structured, editable shipping address + phone
alter table public.profiles
  add column if not exists shipping_address_line1 text,
  add column if not exists shipping_address_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text,
  add column if not exists shipping_phone text;

-- Prize purchases: quantity, split cost, and definitive before/after balances
alter table public.prize_purchases
  add column if not exists quantity integer not null default 1,
  add column if not exists cost_credits integer not null default 0,
  add column if not exists cost_carter_cash integer not null default 0,
  add column if not exists credits_before numeric,
  add column if not exists credits_after numeric,
  add column if not exists carter_cash_before integer,
  add column if not exists carter_cash_after integer;

-- The old model marked a prize inactive after a single purchase. With stock
-- quantities the RPC now controls active/quantity, so drop that trigger.
drop trigger if exists on_prize_purchase_mark_inactive on public.prize_purchases;

-- ---------------------------------------------------------------------------
-- Redemption RPC
-- ---------------------------------------------------------------------------

drop function if exists public.redeem_prize_secure(uuid, text, text, text);
drop function if exists public.redeem_prize_secure(uuid, integer, text);

-- Authoritative, atomic prize redemption.
--  * Charges BOTH credits and Carter Cash (combination cost) per the prize.
--  * Enforces a monthly cap on total units redeemed per user (starts at 10).
--  * Decrements stock; marks the prize inactive when it hits zero.
--  * Reads the shipping address from the user's profile (must be saved first).
--  * Records quantity, split cost, and definitive before/after balances.
create or replace function public.redeem_prize_secure(
  _prize_id uuid,
  _quantity integer default 1,
  _contact_email text default null
)
returns table (
  purchase_id uuid,
  prize_id uuid,
  user_id uuid,
  quantity integer,
  cost_credits integer,
  cost_carter_cash integer,
  credits_before numeric,
  credits_after numeric,
  carter_cash_before integer,
  carter_cash_after integer,
  shipping_address text,
  contact_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize public.prizes%rowtype;
  v_profile public.profiles%rowtype;
  v_purchase public.prize_purchases%rowtype;
  v_qty integer;
  v_cost_credits integer;
  v_cost_cc integer;
  v_credits_before numeric;
  v_cc_before integer;
  v_units_this_month integer;
  v_monthly_limit integer := 10;
  v_address text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if _prize_id is null then
    raise exception 'Prize id is required';
  end if;

  v_qty := greatest(coalesce(_quantity, 1), 1);

  if nullif(trim(coalesce(_contact_email, '')), '') is null then
    raise exception 'Contact email is required';
  end if;

  select * into v_prize from public.prizes where id = _prize_id for update;
  if not found then
    raise exception 'Prize not found';
  end if;
  if coalesce(v_prize.active, false) = false or coalesce(v_prize.quantity, 0) <= 0 then
    raise exception 'This prize is sold out.';
  end if;
  if coalesce(v_prize.quantity, 0) < v_qty then
    raise exception 'Only % left in stock.', coalesce(v_prize.quantity, 0);
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  -- Require a saved shipping address before any charge occurs.
  if nullif(trim(coalesce(v_profile.shipping_address_line1, '')), '') is null
     or nullif(trim(coalesce(v_profile.shipping_city, '')), '') is null
     or nullif(trim(coalesce(v_profile.shipping_postal_code, '')), '') is null
     or nullif(trim(coalesce(v_profile.shipping_country, '')), '') is null then
    raise exception 'A saved shipping address is required before redeeming.';
  end if;

  -- Monthly cap on total units redeemed (qualify columns to avoid clashing
  -- with this function's OUT parameter named "quantity").
  select coalesce(sum(pp.quantity), 0) into v_units_this_month
  from public.prize_purchases pp
  where pp.user_id = auth.uid()
    and pp.created_at >= date_trunc('month', now());

  if v_units_this_month + v_qty > v_monthly_limit then
    raise exception 'Monthly redemption limit reached. You have redeemed % of % units this month.',
      v_units_this_month, v_monthly_limit;
  end if;

  v_cost_credits := greatest(coalesce(v_prize.cost_credits, 0), 0) * v_qty;
  v_cost_cc := greatest(coalesce(v_prize.cost_carter_cash, 0), 0) * v_qty;

  if coalesce(v_profile.credits, 0) < v_cost_credits then
    raise exception 'Not enough credits to redeem this prize.';
  end if;
  if coalesce(v_profile.carter_cash, 0) < v_cost_cc then
    raise exception 'Not enough Carter Cash to redeem this prize.';
  end if;

  v_credits_before := round(coalesce(v_profile.credits, 0)::numeric, 2);
  v_cc_before := greatest(coalesce(v_profile.carter_cash, 0), 0);

  v_address := concat_ws(E'\n',
    nullif(trim(coalesce(v_profile.shipping_address_line1, '')), ''),
    nullif(trim(coalesce(v_profile.shipping_address_line2, '')), ''),
    nullif(trim(concat_ws(', ',
      nullif(trim(coalesce(v_profile.shipping_city, '')), ''),
      nullif(trim(coalesce(v_profile.shipping_state, '')), ''))), ''),
    nullif(trim(coalesce(v_profile.shipping_postal_code, '')), ''),
    nullif(trim(coalesce(v_profile.shipping_country, '')), '')
  );

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  perform set_config('rtn.allow_prize_purchase_write', '1', true);

  update public.profiles
  set credits = round(greatest(0, coalesce(credits, 0) - v_cost_credits)::numeric, 2),
      carter_cash = greatest(0, coalesce(carter_cash, 0) - v_cost_cc)
  where id = auth.uid()
  returning * into v_profile;

  insert into public.prize_purchases (
    prize_id, user_id, quantity, cost, cost_credits, cost_carter_cash,
    credits_before, credits_after, carter_cash_before, carter_cash_after,
    shipping_address, shipping_phone, contact_email
  )
  values (
    _prize_id, auth.uid(), v_qty, v_cost_credits, v_cost_credits, v_cost_cc,
    v_credits_before, round(coalesce(v_profile.credits, 0)::numeric, 2),
    v_cc_before, greatest(coalesce(v_profile.carter_cash, 0), 0),
    v_address, nullif(trim(coalesce(v_profile.shipping_phone, '')), ''), trim(_contact_email)
  )
  returning * into v_purchase;

  update public.prizes
  set quantity = greatest(0, coalesce(prizes.quantity, 0) - v_qty),
      active = case when coalesce(prizes.quantity, 0) - v_qty <= 0 then false else prizes.active end
  where id = _prize_id;

  return query
  select
    v_purchase.id, v_purchase.prize_id, v_purchase.user_id, v_purchase.quantity,
    v_purchase.cost_credits, v_purchase.cost_carter_cash,
    v_purchase.credits_before, v_purchase.credits_after,
    v_purchase.carter_cash_before, v_purchase.carter_cash_after,
    v_purchase.shipping_address, v_purchase.contact_email, v_purchase.created_at;
end;
$$;

grant execute on function public.redeem_prize_secure(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin purchases listing RPC
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_prize_purchases()
returns table (
  purchase_id uuid,
  created_at timestamptz,
  prize_id uuid,
  prize_name text,
  quantity integer,
  cost_credits integer,
  cost_carter_cash integer,
  credits_before numeric,
  credits_after numeric,
  carter_cash_before integer,
  carter_cash_after integer,
  user_id uuid,
  username text,
  first_name text,
  last_name text,
  contact_email text,
  shipping_address text,
  shipping_phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_rtn_admin() then
    raise exception 'Admin access required';
  end if;
  return query
  select
    pp.id, pp.created_at, pp.prize_id, pr.name, pp.quantity,
    pp.cost_credits, pp.cost_carter_cash,
    pp.credits_before, pp.credits_after,
    pp.carter_cash_before, pp.carter_cash_after,
    pp.user_id, pf.username, pf.first_name, pf.last_name,
    pp.contact_email, pp.shipping_address, pp.shipping_phone
  from public.prize_purchases pp
  left join public.prizes pr on pr.id = pp.prize_id
  left join public.profiles pf on pf.id = pp.user_id
  order by pp.created_at desc;
end;
$$;

grant execute on function public.admin_list_prize_purchases() to authenticated;
