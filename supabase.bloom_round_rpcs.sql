-- ============================================================================
-- BLOOM round wallet brokering + resumable pending rounds
-- (applied as migrations: bloom_rounds_add_aborted_status, bloom_round_rpcs,
--  bloom_abort_stale_rounds — this file is the checked-in record)
-- ============================================================================

-- ── lifecycle: pending -> resolved | aborted ────────────────────────────────
alter table public.bloom_rounds drop constraint if exists bloom_rounds_status_check;
alter table public.bloom_rounds
  add constraint bloom_rounds_status_check
  check (status in ('pending', 'resolved', 'aborted'));
alter table public.bloom_rounds add column if not exists reels_revealed smallint not null default 0;
create index if not exists bloom_rounds_pending_idx
  on public.bloom_rounds (user_id) where status = 'pending';

-- ── cast: debit the stake, open a pending round (auto-aborts any dangling one) ─
create or replace function public.bloom_start_round(p_bet integer, p_round jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pre numeric; v_new numeric;
  v_pre_cc integer; v_pre_cc_prog integer;
  v_cc_total_prog integer; v_cc_earned integer; v_new_cc integer; v_new_cc_prog integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_bet is null or p_bet < 1 then raise exception 'invalid_bet' using errcode='22023'; end if;

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  update public.bloom_rounds set status = 'aborted'
   where user_id = v_uid and status = 'pending';

  select credits, greatest(coalesce(carter_cash,0),0), greatest(coalesce(carter_cash_progress,0),0)
    into v_pre, v_pre_cc, v_pre_cc_prog
  from public.profiles where id = v_uid for update;
  if v_pre is null then raise exception 'no_profile' using errcode='P0002'; end if;
  if v_pre < p_bet then raise exception 'insufficient_funds' using errcode='P0001',
      detail = format('have %s, need %s', v_pre, p_bet); end if;

  v_cc_total_prog := greatest(0, v_pre_cc_prog + greatest(round(p_bet)::integer, 0));
  v_cc_earned     := floor(v_cc_total_prog / 1000.0);
  v_new_cc        := greatest(0, v_pre_cc + v_cc_earned);
  v_new_cc_prog   := v_cc_total_prog - (v_cc_earned * 1000);

  v_new := round(v_pre - p_bet, 2);
  update public.profiles
     set credits = v_new, carter_cash = v_new_cc, carter_cash_progress = v_new_cc_prog
   where id = v_uid;

  insert into public.bloom_rounds(
    user_id, contest_id, status, round_number,
    satchel, outcomes, weather_patterns,
    board_mult, all_match, seeds_sprouted, living_count, bloom_count, super_count, wilt_count, pay_scale,
    reels_revealed, total_wagered, total_returned, pre_hand_account_value, new_account_value
  ) values (
    v_uid, nullif(p_round->>'contest_id','')::uuid, 'pending', (p_round->>'round_number')::int,
    coalesce(p_round->'satchel','[]'::jsonb), coalesce(p_round->'outcomes','[]'::jsonb),
    coalesce(p_round->'weather','{}'::jsonb),
    coalesce((p_round->>'board_mult')::int,1), coalesce((p_round->>'all_match')::boolean,false),
    coalesce((p_round->>'seeds_sprouted')::int,0), coalesce((p_round->>'living_count')::int,0),
    coalesce((p_round->>'bloom_count')::int,0), coalesce((p_round->>'super_count')::int,0),
    coalesce((p_round->>'wilt_count')::int,0), (p_round->>'pay_scale')::numeric,
    0, p_bet, 0, v_pre, v_new
  ) returning id into v_id;

  return jsonb_build_object(
    'round_id', v_id, 'new_account_value', v_new, 'pre_hand_account_value', v_pre,
    'carter_cash', v_new_cc, 'carter_cash_progress', v_new_cc_prog);
end $$;

-- ── settle: credit the win, resolve the round ───────────────────────────────
create or replace function public.bloom_settle_round(p_round_id uuid, p_return numeric, p_round jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pre numeric; v_new numeric; v_wager numeric; v_ret numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  v_ret := greatest(round(coalesce(p_return,0), 2), 0);

  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  select credits into v_pre from public.profiles where id = v_uid for update;
  if v_pre is null then raise exception 'no_profile' using errcode='P0002'; end if;

  select total_wagered into v_wager
  from public.bloom_rounds
  where id = p_round_id and user_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'round_not_pending' using errcode='P0002'; end if;

  v_new := round(v_pre + v_ret, 2);
  update public.profiles set credits = v_new where id = v_uid;

  update public.bloom_rounds set
    status = 'resolved', total_returned = v_ret, new_account_value = v_new,
    reels_revealed = coalesce((p_round->>'reels_revealed')::int, reels_revealed),
    outcomes = coalesce(p_round->'outcomes', outcomes),
    weather_patterns = coalesce(p_round->'weather', weather_patterns),
    board_mult = coalesce((p_round->>'board_mult')::int, board_mult),
    all_match = coalesce((p_round->>'all_match')::boolean, all_match),
    seeds_sprouted = coalesce((p_round->>'seeds_sprouted')::int, seeds_sprouted),
    living_count = coalesce((p_round->>'living_count')::int, living_count),
    bloom_count = coalesce((p_round->>'bloom_count')::int, bloom_count),
    super_count = coalesce((p_round->>'super_count')::int, super_count),
    wilt_count = coalesce((p_round->>'wilt_count')::int, wilt_count)
  where id = p_round_id;

  return jsonb_build_object('new_account_value', v_new, 'net', round(v_ret - v_wager, 2));
end $$;

-- ── abort: close an open round with 0 return (stake already forfeited) ───────
create or replace function public.bloom_abort_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  update public.bloom_rounds set status = 'aborted'
   where id = p_round_id and user_id = v_uid and status = 'pending';
  return jsonb_build_object('aborted', found);
end $$;

-- ── stale sweep: abandoned rounds -> aborted (cron every 30 min) ─────────────
create or replace function public.bloom_abort_stale_rounds(p_older_than interval default interval '6 hours')
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.bloom_rounds set status = 'aborted'
   where status = 'pending' and created_at < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.bloom_start_round(integer, jsonb) to authenticated;
grant execute on function public.bloom_settle_round(uuid, numeric, jsonb) to authenticated;
grant execute on function public.bloom_abort_round(uuid) to authenticated;

-- select cron.schedule('bloom-abort-stale', '*/30 * * * *', $$select public.bloom_abort_stale_rounds()$$);
