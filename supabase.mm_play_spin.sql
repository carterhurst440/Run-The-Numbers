-- ============================================================
-- MONKEY MOONSHINE — authoritative server-side spin engine.
--
-- Faithful plpgsql port of the tuned client engine (labPlayRound /
-- labScore / pickSymbol / drawReplacement in games/monkey-moonshine.html,
-- validated to ~94-95% RTP). One call = one whole round, run server-side
-- so the board and payout can never be spoofed by the client.
--
-- Flow: validate bet + wild -> lock wallet (profiles.credits FOR UPDATE) ->
-- funds check -> draw the board (initial 15 row-major, coconut-row raid,
-- tiered extra-shake bonus rows) -> evaluate paylines -> settle
-- (credits := pre + net) -> insert mm_spins ledger row -> return the full
-- outcome (incl. the ordered picks/replacements draw streams) so the client
-- can replay the exact same board and settle its balance from
-- new_account_value.
--
-- The client supplies ONLY the wild + bet; everything else is decided here.
-- ============================================================


-- ── Weighted symbol draw: one pick from a deck jsonb {symbol -> weight}. ──
-- Distribution is order-independent, so we walk p_syms in canonical order.
create or replace function public.mm_draw_symbol(p_deck jsonb, p_syms text[])
returns text
language plpgsql
volatile
as $$
declare
  v_total numeric := 0;
  v_acc   numeric := 0;
  v_r     numeric;
  s       text;
  w       numeric;
begin
  foreach s in array p_syms loop
    v_total := v_total + coalesce((p_deck->>s)::numeric, 0);
  end loop;
  if v_total <= 0 then
    return p_syms[array_length(p_syms, 1)];
  end if;
  v_r := random() * v_total;
  foreach s in array p_syms loop
    w := coalesce((p_deck->>s)::numeric, 0);
    if w <= 0 then continue; end if;
    v_acc := v_acc + w;
    if v_r < v_acc then return s; end if;
  end loop;
  return p_syms[array_length(p_syms, 1)];
end;
$$;


-- ── Raid replacement draw: from the REPLACE deck; a 'coconut' result (the
--    slot that holds the monkey weight) comes back as a live 'monkey'. ──
create or replace function public.mm_draw_replacement(p_deck jsonb, p_syms text[])
returns text
language plpgsql
volatile
as $$
declare
  v text;
begin
  v := public.mm_draw_symbol(p_deck, p_syms);
  if v = 'coconut' then return 'monkey'; end if;
  return v;
end;
$$;


-- ── Evaluate ONE sequence (row / col / diagonal) of a board.
--    Mirrors runsForSeq()/evaluate(): for each fruit, find maximal
--    non-coconut runs (>=3) that contain that real fruit (a monkey counts
--    as the wild's own fruit), the wild multiplier applies once per line if
--    the actual wild fruit is present, then greedily keep the longest
--    non-overlapping runs. Returns { win_units, lines:[...] }. ──
create or replace function public.mm_eval_sequence(
  p_grid text[], p_seq int[], p_cols int,
  p_wild text, p_wild_mult int, p_fruits text[], p_bet int, p_kind text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  n         int := coalesce(array_length(p_seq, 1), 0);
  vals      text[] := '{}';
  fi int; i int; j int; k int;
  F         text;
  v         text;
  is_match  boolean;
  run_len   int;
  realF     boolean;
  hasW      boolean;
  ord       int := 0;
  cands     jsonb := '[]'::jsonb;
  cand      jsonb;
  win_units numeric := 0;
  lines     jsonb := '[]'::jsonb;
  used      boolean[];
  overlap   boolean;
  pay_units numeric;
  cells     jsonb;
  idx int; rr int; cc int;
begin
  if n < 3 then
    return jsonb_build_object('win_units', 0, 'lines', '[]'::jsonb);
  end if;

  for i in 1..n loop
    vals := array_append(vals, p_grid[p_seq[i]]);
  end loop;

  -- Collect candidate runs, one fruit at a time (canonical fruit order).
  for fi in 1..array_length(p_fruits, 1) loop
    F := p_fruits[fi];
    i := 1;
    while i <= n loop
      v := vals[i];
      is_match := (v is not null and v <> 'coconut' and (v = F or v = p_wild or v = 'monkey'));
      if is_match then
        j := i;
        while j <= n
          and vals[j] is not null and vals[j] <> 'coconut'
          and (vals[j] = F or vals[j] = p_wild or vals[j] = 'monkey') loop
          j := j + 1;
        end loop;
        run_len := j - i;
        if run_len >= 3 then
          realF := false; hasW := false;
          for k in i..j-1 loop
            if vals[k] = F then realF := true; end if;
            if F = p_wild and vals[k] = 'monkey' then realF := true; end if;
            if vals[k] = p_wild then hasW := true; end if;
          end loop;
          if realF then
            cands := cands || jsonb_build_object(
              'len', run_len,
              'mult', case when hasW then p_wild_mult else 1 end,
              'i', i, 'j', j, 'fruit', F, 'ord', ord
            );
            ord := ord + 1;
          end if;
        end if;
        i := j;
      else
        i := i + 1;
      end if;
    end loop;
  end loop;

  -- Greedy: longest first (then higher mult, then insertion order), skip overlaps.
  used := array_fill(false, array[n]);
  for cand in
    select value from jsonb_array_elements(cands)
    order by (value->>'len')::int desc, (value->>'mult')::int desc, (value->>'ord')::int asc
  loop
    overlap := false;
    for k in (cand->>'i')::int .. (cand->>'j')::int - 1 loop
      if used[k] then overlap := true; exit; end if;
    end loop;
    if overlap then continue; end if;
    for k in (cand->>'i')::int .. (cand->>'j')::int - 1 loop
      used[k] := true;
    end loop;

    run_len := (cand->>'len')::int;
    pay_units := (case
                    when least(run_len, 6) = 3 then 1
                    when least(run_len, 6) = 4 then 3
                    when least(run_len, 6) = 5 then 10
                    when least(run_len, 6) >= 6 then 50   -- vertical 6-in-a-row on a full raid board
                    else 0
                  end) * (cand->>'mult')::int;
    win_units := win_units + pay_units;

    cells := '[]'::jsonb;
    for k in (cand->>'i')::int .. (cand->>'j')::int - 1 loop
      idx := p_seq[k];
      rr := (idx - 1) / p_cols;
      cc := (idx - 1) % p_cols;
      cells := cells || jsonb_build_array(jsonb_build_array(rr, cc));
    end loop;

    lines := lines || jsonb_build_object(
      'fruit', cand->>'fruit',
      'len', run_len,
      'mult', (cand->>'mult')::int,
      'kind', p_kind,
      'cells', cells,
      'pay', pay_units * p_bet
    );
  end loop;

  return jsonb_build_object('win_units', win_units, 'lines', lines);
end;
$$;


-- ── Main RPC: play one authoritative round. ──
create or replace function public.mm_play_spin(
  p_wild text,
  p_bet integer,
  p_contest_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cols      constant int := 5;
  c_base_rows constant int := 3;
  c_fruits    constant text[] := array['cherry','apple','banana','lemon','peach','dragonfruit','mango','pineapple'];
  c_syms      constant text[] := array['cherry','apple','banana','lemon','peach','dragonfruit','mango','pineapple','coconut'];

  v_uid        uuid := auth.uid();
  v_deck       jsonb;
  v_replace    jsonb;
  v_wild_mult  int;

  v_pre        numeric(12,2);
  v_grid       text[] := '{}';
  v_picks      text[] := '{}';
  v_repl       text[] := '{}';
  v_nrows      int := c_base_rows;
  r int; c int; k int;
  v_sym        text;
  v_all_coco   boolean;
  v_raid_rows  int[] := '{}';
  v_moonshine  boolean := false;
  v_monkeys    int;
  v_monkeys_total int := 0;
  v_extra      int := 0;
  v_granted    int := 0;
  v_nt         int;
  v_bm         int;

  v_seq        int[];
  v_res        jsonb;
  v_win_units  numeric := 0;
  v_lines      jsonb := '[]'::jsonb;

  v_rows       jsonb;
  v_row        jsonb;
  v_board      jsonb;

  v_total_wagered  numeric(12,2);
  v_total_returned numeric(12,2);
  v_net        numeric(12,2);
  v_new        numeric(12,2);
  v_spin_id    uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_bet is null or p_bet < 1 then
    raise exception 'invalid_bet' using errcode = '22023', detail = 'bet must be a positive integer';
  end if;
  -- No fixed max: the funds check below caps the bet at the player's balance.

  select deck, replace_deck, coalesce(mult, 1)
    into v_deck, v_replace, v_wild_mult
  from public.mm_decks where wild = p_wild;
  if not found then
    raise exception 'invalid_wild' using errcode = '22023', detail = coalesce(p_wild, '(null)');
  end if;

  -- Allow the wallet write past guard_profile_sensitive_fields.
  perform set_config('rtn.allow_sensitive_balance_write', '1', true);

  -- Lock the wallet row → serialize concurrent spins, prevent double-spend.
  select credits into v_pre from public.profiles where id = v_uid for update;
  if v_pre is null then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  if v_pre < p_bet then
    raise exception 'insufficient_funds' using errcode = 'P0001',
      detail = format('have %s, need %s', v_pre, p_bet);
  end if;

  -- ── Initial board: 3×5, row-major (matches client pickSymbol order). ──
  for r in 0..c_base_rows-1 loop
    for c in 0..c_cols-1 loop
      v_sym := public.mm_draw_symbol(v_deck, c_syms);
      v_picks := array_append(v_picks, v_sym);
      v_grid  := array_append(v_grid, v_sym);
    end loop;
  end loop;

  -- Full coconut rows → raid.
  for r in 0..c_base_rows-1 loop
    v_all_coco := true;
    for c in 0..c_cols-1 loop
      if v_grid[r*c_cols + c + 1] <> 'coconut' then v_all_coco := false; exit; end if;
    end loop;
    if v_all_coco then v_raid_rows := array_append(v_raid_rows, r); end if;
  end loop;
  v_moonshine := coalesce(array_length(v_raid_rows, 1), 0) > 0;

  if v_moonshine then
    -- Swap every coconut in the raid rows (row-major, ascending rows).
    v_monkeys := 0;
    foreach r in array v_raid_rows loop
      for c in 0..c_cols-1 loop
        v_sym := public.mm_draw_replacement(v_replace, c_syms);
        v_repl := array_append(v_repl, v_sym);
        if v_sym = 'monkey' then v_monkeys := v_monkeys + 1; end if;
        v_grid[r*c_cols + c + 1] := v_sym;
      end loop;
    end loop;
    v_monkeys_total := v_monkeys_total + v_monkeys;
    v_nt := case when v_monkeys_total >= 6 then 3
                 when v_monkeys_total >= 3 then 2
                 when v_monkeys_total >= 1 then 1 else 0 end;
    if v_nt > v_granted then v_extra := v_extra + (v_nt - v_granted); v_granted := v_nt; end if;

    -- Tiered extra-shake bonus rows (1/3/6 cumulative monkeys → 1/2/3 rows).
    while v_extra > 0 loop
      v_extra := v_extra - 1;
      v_bm := 0;
      for c in 0..c_cols-1 loop
        v_sym := public.mm_draw_replacement(v_replace, c_syms);
        v_repl := array_append(v_repl, v_sym);
        v_grid := array_append(v_grid, v_sym);
        if v_sym = 'monkey' then v_bm := v_bm + 1; end if;
      end loop;
      v_nrows := v_nrows + 1;
      v_monkeys_total := v_monkeys_total + v_bm;
      v_nt := case when v_monkeys_total >= 6 then 3
                   when v_monkeys_total >= 3 then 2
                   when v_monkeys_total >= 1 then 1 else 0 end;
      if v_nt > v_granted then v_extra := v_extra + (v_nt - v_granted); v_granted := v_nt; end if;
    end loop;
  end if;

  -- ── Evaluate paylines over the expanded board. ──
  -- Rows
  for r in 0..v_nrows-1 loop
    v_seq := '{}';
    for c in 0..c_cols-1 loop v_seq := array_append(v_seq, r*c_cols + c + 1); end loop;
    v_res := public.mm_eval_sequence(v_grid, v_seq, c_cols, p_wild, v_wild_mult, c_fruits, p_bet, 'row');
    v_win_units := v_win_units + (v_res->>'win_units')::numeric;
    v_lines := v_lines || (v_res->'lines');
  end loop;
  -- Cols
  for c in 0..c_cols-1 loop
    v_seq := '{}';
    for r in 0..v_nrows-1 loop v_seq := array_append(v_seq, r*c_cols + c + 1); end loop;
    v_res := public.mm_eval_sequence(v_grid, v_seq, c_cols, p_wild, v_wild_mult, c_fruits, p_bet, 'col');
    v_win_units := v_win_units + (v_res->>'win_units')::numeric;
    v_lines := v_lines || (v_res->'lines');
  end loop;
  -- Diagonals ↘
  for k in -(v_nrows-1)..c_cols-1 loop
    v_seq := '{}';
    for r in 0..v_nrows-1 loop
      c := r + k;
      if c >= 0 and c < c_cols then v_seq := array_append(v_seq, r*c_cols + c + 1); end if;
    end loop;
    if coalesce(array_length(v_seq, 1), 0) >= 3 then
      v_res := public.mm_eval_sequence(v_grid, v_seq, c_cols, p_wild, v_wild_mult, c_fruits, p_bet, 'diag_dr');
      v_win_units := v_win_units + (v_res->>'win_units')::numeric;
      v_lines := v_lines || (v_res->'lines');
    end if;
  end loop;
  -- Diagonals ↙
  for k in 0..(v_nrows-1)+(c_cols-1) loop
    v_seq := '{}';
    for r in 0..v_nrows-1 loop
      c := k - r;
      if c >= 0 and c < c_cols then v_seq := array_append(v_seq, r*c_cols + c + 1); end if;
    end loop;
    if coalesce(array_length(v_seq, 1), 0) >= 3 then
      v_res := public.mm_eval_sequence(v_grid, v_seq, c_cols, p_wild, v_wild_mult, c_fruits, p_bet, 'diag_dl');
      v_win_units := v_win_units + (v_res->>'win_units')::numeric;
      v_lines := v_lines || (v_res->'lines');
    end if;
  end loop;

  -- ── Money. total_returned is gross (a 3-line at ×1 returns the stake). ──
  v_total_wagered  := p_bet;
  v_total_returned := round(v_win_units * p_bet, 2);
  v_net            := v_total_returned - v_total_wagered;
  v_new            := round(v_pre + v_net, 2);

  -- ── Board snapshot rows[][]. ──
  v_rows := '[]'::jsonb;
  for r in 0..v_nrows-1 loop
    v_row := '[]'::jsonb;
    for c in 0..c_cols-1 loop
      v_row := v_row || to_jsonb(v_grid[r*c_cols + c + 1]);
    end loop;
    v_rows := v_rows || jsonb_build_array(v_row);
  end loop;
  v_board := jsonb_build_object('wild', p_wild, 'wild_mult', v_wild_mult, 'cols', c_cols, 'rows', v_rows);

  -- ── Settle the wallet + write the ledger row (both under one lock). ──
  update public.profiles set credits = v_new where id = v_uid;

  insert into public.mm_spins(
    user_id, contest_id, status, wild, wild_mult, moonshine_triggered,
    monkeys_total, bonus_rows, board, winning_lines,
    total_wagered, total_returned, pre_hand_account_value, new_account_value
  ) values (
    v_uid, p_contest_id, 'resolved', p_wild, v_wild_mult, v_moonshine,
    v_monkeys_total, v_nrows - c_base_rows, v_board, v_lines,
    v_total_wagered, v_total_returned, v_pre, v_new
  ) returning id into v_spin_id;

  -- Count this spin toward the player's qualifying-events progress (game_006)
  -- and the profile spin counter / rank recompute. Mirrors the other games.
  perform public.increment_profile_hands_played(v_uid, 1, 'game_006');

  return jsonb_build_object(
    'spin_id', v_spin_id,
    'wild', p_wild, 'wild_mult', v_wild_mult, 'cols', c_cols, 'base_rows', c_base_rows,
    'picks', to_jsonb(v_picks),
    'replacements', to_jsonb(v_repl),
    'raid_rows', to_jsonb(v_raid_rows),
    'board', v_board,
    'winning_lines', v_lines,
    'moonshine', v_moonshine,
    'monkeys_total', v_monkeys_total,
    'bonus_rows', v_nrows - c_base_rows,
    'total_wagered', v_total_wagered,
    'total_returned', v_total_returned,
    'net_profit', v_net,
    'pre_hand_account_value', v_pre,
    'new_account_value', v_new
  );
end;
$$;


-- ── Grants. Only mm_play_spin is client-callable; helpers run as owner. ──
revoke execute on function public.mm_draw_symbol(jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.mm_draw_replacement(jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.mm_eval_sequence(text[], int[], int, text, int, text[], int, text) from public, anon, authenticated;
grant execute on function public.mm_play_spin(text, integer, uuid) to authenticated;
