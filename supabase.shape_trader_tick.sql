create extension if not exists pgcrypto;

alter table public.shape_trader_draws
  add column if not exists deck_card_key text references public.shape_trader_deck_cards(card_key);

create index if not exists shape_trader_draws_window_sequence_idx
  on public.shape_trader_draws (window_index, sequence_in_window);

create or replace function public.shape_trader_window_is_dump(p_window_index integer)
returns boolean
language sql
stable
as $$
  select ((greatest(0, coalesce(p_window_index, 0)) + 1) % cfg.dump_every_windows) = 0
  from public.shape_trader_engine_config cfg
  where cfg.id = true
$$;

create or replace function public.shape_trader_completed_dumps_before_window(p_window_index integer)
returns integer
language sql
stable
as $$
  select
    case
      when greatest(0, coalesce(p_window_index, 0)) <= 0 then 0
      else floor(greatest(0, coalesce(p_window_index, 0))::numeric / cfg.dump_every_windows::numeric)::integer
    end
  from public.shape_trader_engine_config cfg
  where cfg.id = true
$$;

create or replace function public.shape_trader_window_start_ms(p_window_index integer)
returns bigint
language sql
stable
as $$
  select
    floor(extract(epoch from cfg.epoch_at) * 1000)::bigint
    + (greatest(0, coalesce(p_window_index, 0))::bigint * cfg.draw_interval_ms::bigint)
    + (public.shape_trader_completed_dumps_before_window(p_window_index)::bigint
      * (cfg.dump_cards * cfg.dump_card_interval_ms)::bigint)
  from public.shape_trader_engine_config cfg
  where cfg.id = true
$$;

create or replace function public.shape_trader_window_end_ms(p_window_index integer)
returns bigint
language sql
stable
as $$
  select
    public.shape_trader_window_start_ms(p_window_index)
    + cfg.draw_interval_ms::bigint
    + case
        when public.shape_trader_window_is_dump(p_window_index)
          then (cfg.dump_cards * cfg.dump_card_interval_ms)::bigint
        else 0
      end
  from public.shape_trader_engine_config cfg
  where cfg.id = true
$$;

create or replace function public.shape_trader_tick()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_cfg record;
  v_latest_row record;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_epoch_ms bigint;
  v_latest_window_index integer := -1;
  v_latest_sequence_in_window integer := 0;
  v_current_window_index integer := -1;
  v_window_index integer;
  v_window_start_ms bigint;
  v_elapsed_in_window bigint;
  v_target_count integer;
  v_start_sequence integer;
  v_sequence integer;
  v_is_dump boolean;
  v_used_card_keys text[];
  v_card record;
  v_processed_count integer := 0;
  v_latest_draw_id bigint := null;
  v_game_id text := 'game_003';
  v_square_price numeric(12,2);
  v_triangle_price numeric(12,2);
  v_circle_price numeric(12,2);
  v_prev_square numeric(12,2);
  v_prev_triangle numeric(12,2);
  v_prev_circle numeric(12,2);
  v_candidate numeric(12,2);
  v_event_tags text[];
begin
  select *
  into v_cfg
  from public.shape_trader_engine_config
  where id = true;

  if not found then
    raise exception 'shape_trader_engine_config is missing';
  end if;

  v_epoch_ms := floor(extract(epoch from v_cfg.epoch_at) * 1000)::bigint;

  select *
  into v_latest_row
  from public.shape_trader_draws
  order by draw_id desc
  limit 1;

  v_latest_window_index := coalesce(v_latest_row.window_index, -1);
  v_latest_sequence_in_window := coalesce(v_latest_row.sequence_in_window, 0);

  v_square_price := round(coalesce(v_latest_row.new_square_price, v_cfg.start_price)::numeric, 2);
  v_triangle_price := round(coalesce(v_latest_row.new_triangle_price, v_cfg.start_price)::numeric, 2);
  v_circle_price := round(coalesce(v_latest_row.new_circle_price, v_cfg.start_price)::numeric, 2);

  if v_now_ms < v_epoch_ms then
    return jsonb_build_object(
      'ok', true,
      'processed', 0,
      'latest_draw_id', coalesce(v_latest_row.draw_id, null),
      'reason', 'before_epoch'
    );
  end if;

  v_current_window_index := 0;
  while v_now_ms >= public.shape_trader_window_end_ms(v_current_window_index) loop
    v_current_window_index := v_current_window_index + 1;
    if v_current_window_index > 100000 then
      raise exception 'shape_trader_tick window scan exceeded safety limit';
    end if;
  end loop;

  for v_window_index in greatest(0, v_latest_window_index) .. v_current_window_index loop
    v_is_dump := public.shape_trader_window_is_dump(v_window_index);
    v_window_start_ms := public.shape_trader_window_start_ms(v_window_index);
    v_elapsed_in_window := greatest(0, v_now_ms - v_window_start_ms);

    if v_window_index < v_current_window_index then
      v_target_count := case when v_is_dump then v_cfg.dump_cards else 1 end;
    else
      v_target_count := case
        when v_is_dump then least(
          v_cfg.dump_cards,
          greatest(0, floor(v_elapsed_in_window::numeric / v_cfg.dump_card_interval_ms::numeric)::integer + 1)
        )
        else 1
      end;
    end if;

    v_start_sequence := case
      when v_latest_window_index >= 0 and v_window_index = v_latest_window_index
        then v_latest_sequence_in_window + 1
      else 1
    end;

    if v_start_sequence > v_target_count then
      continue;
    end if;

    select coalesce(array_agg(d.deck_card_key order by d.sequence_in_window), '{}'::text[])
    into v_used_card_keys
    from public.shape_trader_draws d
    where d.window_index = v_window_index
      and d.deck_card_key is not null;

    for v_sequence in v_start_sequence .. v_target_count loop
      select c.*
      into v_card
      from public.shape_trader_deck_cards c
      where c.enabled = true
        and not (c.card_key = any(coalesce(v_used_card_keys, '{}'::text[])))
        and not exists (
          select 1
          from public.shape_trader_draws d
          where d.window_index = v_window_index
            and (
              (d.deck_card_key is not null and d.deck_card_key = c.card_key)
              or (
                d.deck_card_key is null
                and d.card_kind = c.kind
                and coalesce(d.shape, '') = coalesce(c.shape, '')
                and d.percentage = c.percentage
                and d.card_label = c.label
              )
            )
        )
      order by gen_random_uuid()
      limit 1;

      if not found then
        raise exception 'No remaining deck card available for window % sequence %', v_window_index, v_sequence;
      end if;

      v_used_card_keys := array_append(coalesce(v_used_card_keys, '{}'::text[]), v_card.card_key);

      v_prev_square := v_square_price;
      v_prev_triangle := v_triangle_price;
      v_prev_circle := v_circle_price;
      v_event_tags := '{}'::text[];

      if v_card.kind = 'asset' then
        if v_card.shape = 'square' then
          v_candidate := round((v_square_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
          if v_candidate >= v_cfg.split_threshold then
            v_square_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'square_split');
          elsif v_candidate < 1 then
            v_square_price := round(v_cfg.start_price::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'square_bankruptcy');
          else
            v_square_price := v_candidate;
          end if;
        elsif v_card.shape = 'triangle' then
          v_candidate := round((v_triangle_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
          if v_candidate >= v_cfg.split_threshold then
            v_triangle_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'triangle_split');
          elsif v_candidate < 1 then
            v_triangle_price := round(v_cfg.start_price::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'triangle_bankruptcy');
          else
            v_triangle_price := v_candidate;
          end if;
        elsif v_card.shape = 'circle' then
          v_candidate := round((v_circle_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
          if v_candidate >= v_cfg.split_threshold then
            v_circle_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'circle_split');
          elsif v_candidate < 1 then
            v_circle_price := round(v_cfg.start_price::numeric, 2);
            v_event_tags := array_append(v_event_tags, 'circle_bankruptcy');
          else
            v_circle_price := v_candidate;
          end if;
        end if;
      else
        v_candidate := round((v_square_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
        if v_candidate >= v_cfg.split_threshold then
          v_square_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'square_split');
        elsif v_candidate < 1 then
          v_square_price := round(v_cfg.start_price::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'square_bankruptcy');
        else
          v_square_price := v_candidate;
        end if;

        v_candidate := round((v_triangle_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
        if v_candidate >= v_cfg.split_threshold then
          v_triangle_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'triangle_split');
        elsif v_candidate < 1 then
          v_triangle_price := round(v_cfg.start_price::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'triangle_bankruptcy');
        else
          v_triangle_price := v_candidate;
        end if;

        v_candidate := round((v_circle_price * (1 + (v_card.percentage / 100.0)))::numeric, 2);
        if v_candidate >= v_cfg.split_threshold then
          v_circle_price := round((v_candidate / v_cfg.split_factor)::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'circle_split');
        elsif v_candidate < 1 then
          v_circle_price := round(v_cfg.start_price::numeric, 2);
          v_event_tags := array_append(v_event_tags, 'circle_bankruptcy');
        else
          v_circle_price := v_candidate;
        end if;
      end if;

      insert into public.shape_trader_draws (
        draw_id,
        game_id,
        window_index,
        sequence_in_window,
        is_data_dump,
        card_kind,
        shape,
        percentage,
        card_label,
        drawn_at,
        deck_card_key,
        previous_square_price,
        previous_triangle_price,
        previous_circle_price,
        new_square_price,
        new_triangle_price,
        new_circle_price,
        bankruptcy_split
      )
      values (
        (v_window_index * 10) + v_sequence,
        v_game_id,
        v_window_index,
        v_sequence,
        v_is_dump,
        v_card.kind,
        v_card.shape,
        v_card.percentage,
        v_card.label,
        to_timestamp(
          (
            v_window_start_ms
            + case when v_is_dump then ((v_sequence - 1) * v_cfg.dump_card_interval_ms) else 0 end
          ) / 1000.0
        ),
        v_card.card_key,
        v_prev_square,
        v_prev_triangle,
        v_prev_circle,
        v_square_price,
        v_triangle_price,
        v_circle_price,
        to_jsonb(v_event_tags)
      )
      on conflict (draw_id) do nothing;

      v_processed_count := v_processed_count + 1;
      v_latest_draw_id := (v_window_index * 10) + v_sequence;
      v_latest_window_index := v_window_index;
      v_latest_sequence_in_window := v_sequence;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_processed_count,
    'latest_draw_id', coalesce(v_latest_draw_id, v_latest_row.draw_id),
    'current_window_index', v_current_window_index,
    'ran_at', now()
  );
end;
$$;
