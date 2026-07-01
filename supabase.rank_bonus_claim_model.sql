-- ============================================================================
-- RANK BONUS — CLAIM MODEL
--
-- Rank-up bonuses are no longer auto-credited. Players redeem them in the RANK
-- LADDER modal, and the rank_up_bonus account_events row (and its bankroll
-- point) is written ONLY on claim. profiles.highest_rewarded_tier now means the
-- highest tier the user has CLAIMED; claimable = tiers reached but not claimed.
--
-- Retroactive: since no rank bonus had ever been credited, existing pinned users
-- are reset to claimed_tier 1 so they can redeem what they already earned.
-- ============================================================================

-- Stop auto-crediting on tier-up.
drop trigger if exists award_rank_up_bonus_trigger on public.profiles;

create or replace function public.get_claimable_rank_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_claimed integer;
  v_current integer;
  v_amount numeric(12,2);
begin
  if v_user is null then
    return jsonb_build_object('amount', 0, 'claimed_tier', 1, 'current_tier', 1);
  end if;
  select greatest(coalesce(highest_rewarded_tier, 1), 1),
         greatest(coalesce(current_rank_tier, 1), 1)
    into v_claimed, v_current
  from public.profiles where id = v_user;
  select coalesce(sum(advancement_bonus_credits), 0)::numeric(12,2) into v_amount
  from public.ranks where tier > v_claimed and tier <= v_current;
  return jsonb_build_object(
    'amount', coalesce(v_amount, 0),
    'claimed_tier', coalesce(v_claimed, 1),
    'current_tier', coalesce(v_current, 1)
  );
end;
$$;
grant execute on function public.get_claimable_rank_bonus() to authenticated;

create or replace function public.claim_rank_bonus(_up_to_tier integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_from integer;
  v_current integer;
  v_to integer;
  v_bonus numeric(12,2);
  v_prev numeric(12,2);
  v_new numeric(12,2);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.profiles where id = v_user for update;
  v_from := greatest(coalesce(v_profile.highest_rewarded_tier, 1), 1);
  v_current := greatest(coalesce(v_profile.current_rank_tier, 1), 1);
  v_to := coalesce(_up_to_tier, v_current);
  if v_to > v_current then v_to := v_current; end if;
  if v_to <= v_from then
    return jsonb_build_object('claimed', false, 'reason', 'nothing_to_claim', 'amount', 0);
  end if;

  select coalesce(sum(advancement_bonus_credits), 0)::numeric(12,2) into v_bonus
  from public.ranks where tier > v_from and tier <= v_to;

  v_prev := coalesce(v_profile.credits, 0);
  v_new := round(v_prev + v_bonus, 2);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  update public.profiles
  set credits = v_new, highest_rewarded_tier = v_to
  where id = v_user;

  if v_bonus > 0 then
    insert into public.account_events (user_id, event_type, amount, previous_balance, new_balance, metadata, created_at)
    values (v_user, 'rank_up_bonus', v_bonus, v_prev, v_new,
      jsonb_build_object('from_tier', v_from, 'to_tier', v_to, 'source', 'claim_rank_bonus'),
      timezone('utc', now()));
  end if;

  return jsonb_build_object('claimed', true, 'amount', v_bonus, 'from_tier', v_from, 'to_tier', v_to, 'new_balance', v_new);
end;
$$;
grant execute on function public.claim_rank_bonus(integer) to authenticated;

-- Retroactive reset (one-time): let already-ranked players claim what they earned.
do $$
begin
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);
  update public.profiles p
  set highest_rewarded_tier = 1
  where coalesce(highest_rewarded_tier, 1) > 1
    and not exists (
      select 1 from public.account_events e
      where e.user_id = p.id and e.event_type = 'rank_up_bonus'
    );
end $$;
