create or replace function public.admin_reset_shape_traders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.shape_trader_price_history where true;
  delete from public.shape_trader_draws where true;
  delete from public.shape_trader_trades where true;
  delete from public.shape_trader_positions_current where true;
  delete from public.shape_trader_accounts_current where true;
  delete from public.shape_trader_structural_events_applied where true;

  insert into public.shape_trader_market_current (
    shape,
    game_id,
    current_price,
    last_draw_id,
    last_window_index,
    last_sequence_in_window,
    last_card_label,
    last_percentage,
    last_event_type,
    bankruptcy_triggered,
    updated_at
  )
  values
    ('circle', 'game_003', 100, null, null, null, null, null, null, false, timezone('utc', now())),
    ('square', 'game_003', 100, null, null, null, null, null, null, false, timezone('utc', now())),
    ('triangle', 'game_003', 100, null, null, null, null, null, null, false, timezone('utc', now()))
  on conflict (shape) do update
  set
    game_id = excluded.game_id,
    current_price = excluded.current_price,
    last_draw_id = excluded.last_draw_id,
    last_window_index = excluded.last_window_index,
    last_sequence_in_window = excluded.last_sequence_in_window,
    last_card_label = excluded.last_card_label,
    last_percentage = excluded.last_percentage,
    last_event_type = excluded.last_event_type,
    bankruptcy_triggered = excluded.bankruptcy_triggered,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.admin_reset_shape_traders() to authenticated;
