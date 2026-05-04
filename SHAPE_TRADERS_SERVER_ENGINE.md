# Shape Traders Server-Side Draw Engine

This document describes the current Shape Traders backend architecture.

The important point is that the live draw engine is now database-driven. We do not use a Shape Traders edge function anymore. The engine runs inside Postgres and is triggered by cron.

## Overview

The Shape Traders market is powered by three main pieces:

1. Engine configuration stored in Postgres
2. A server-side Postgres function that computes due draws and writes rows
3. A `pg_cron` job that calls that function on a recurring schedule

The frontend does not generate market draws. It reads persisted draw and market data, then renders the live experience on top.

## Core Files

- [supabase.shape_trader_engine_config.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_engine_config.sql:1)
- [supabase.shape_trader_draws.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_draws.sql:1)
- [supabase.shape_trader_tick.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_tick.sql:1)
- [supabase.shape_trader_draw_retention.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_draw_retention.sql:1)

## Engine Config

The canonical engine settings live in `public.shape_trader_engine_config`.

That table defines:

- `epoch_at`
- `draw_interval_ms`
- `dump_every_windows`
- `dump_cards`
- `dump_card_interval_ms`
- `start_price`
- `split_threshold`
- `split_factor`
- `shuffle_version`

There is also a `public.shape_trader_deck_cards` table which stores the draw deck itself. That means the deck composition is data-driven, not buried inside the client.

## Persisted Draw Rows

Every resolved draw is written into `public.shape_trader_draws`.

Important fields include:

- `draw_id`
- `game_id`
- `window_index`
- `sequence_in_window`
- `is_data_dump`
- `card_kind`
- `shape`
- `percentage`
- `card_label`
- `drawn_at`

Additional engine SQL augments these rows with price snapshot fields so each draw captures the market transition it caused.

Because rows are persisted, the market is replayable and auditable. The client can refresh and reconstruct state from server data instead of trusting local timers.

## How The Tick Function Works

The engine logic lives in `public.shape_trader_tick()` in [supabase.shape_trader_tick.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_tick.sql:59).

That function:

1. Loads the single engine config row.
2. Reads the most recent persisted draw row.
3. Computes which draw window should exist right now based on the epoch and timing configuration.
4. Determines how many draws should exist in each due window.
5. Picks deck cards for any missing draws.
6. Applies the resulting percentage move to the relevant asset price.
7. Handles splits and bankruptcies when thresholds are crossed.
8. Writes the new draw row with the resulting prices.

It is designed to backfill missed draws. That means if the scheduler is delayed briefly, the next tick can catch up by writing all due rows rather than stalling the market.

The function is `security definer`, which is important when thinking about RLS and cron execution.

## Dump Windows

Not every window is a single draw.

The engine supports periodic "data dump" windows:

- most windows create one draw
- every `dump_every_windows` window becomes a dump
- a dump writes `dump_cards` rows
- those rows are spaced by `dump_card_interval_ms`

This is why the engine uses `window_index` plus `sequence_in_window` instead of relying on a flat fixed cadence alone.

## Cron Trigger

The engine is intended to be called by Postgres cron, not by a client and not by the deleted edge function.

The repo no longer keeps the old edge-function engine path. The current architecture is:

- `pg_cron` calls `public.shape_trader_tick()`
- `shape_trader_tick()` writes due rows into `shape_trader_draws`
- the client reads those persisted rows and market state

If you document or debug the engine, think "SQL function plus cron", not "edge function."

## Client Responsibilities

The frontend still does important work, but it does not own the market timeline.

The client is responsible for:

- loading persisted draw data
- rendering current prices and history
- showing countdowns and animations
- recording user trades
- syncing per-user current account state and positions

The client is not responsible for choosing the next market card.

## Trade Persistence

User trades are written to `public.shape_trader_trades`.

Those rows are separate from engine draw rows and contain account-specific activity such as:

- `user_id`
- `contest_id`
- `shape`
- `trade_side`
- `quantity`
- `shape_price`
- `total_value`
- `net_profit`
- `new_account_value`

This separation is intentional:

- draw rows describe the shared market
- trade rows describe user actions inside that market

## Current-State Tables

Shape Traders also uses current-state tables for convenience:

- `shape_trader_accounts_current`
- `shape_trader_positions_current`
- `shape_trader_market_current`
- `shape_trader_price_history`

These tables are helpful for fast reads and UI hydration, but the persisted draw stream is the core server-side engine output.

## Retention

Old draw rows are purged by an hourly cron-managed function in [supabase.shape_trader_draw_retention.sql](/Users/admin/Desktop/Run-The-Numbers/supabase.shape_trader_draw_retention.sql:1).

That retention job currently deletes draw rows older than 24 hours.

This keeps the high-frequency draw table from growing forever while still preserving enough recent history for UI use.

## RLS Implications

The move from edge function to Postgres function changes the RLS discussion.

Because the engine now runs inside Postgres as a `security definer` function:

- cron execution is not dependent on client auth
- enabling RLS does not automatically break the engine path

But shared engine tables still need careful policy design. RLS on user-owned tables is straightforward. RLS on shared market tables needs more care because the client still reads them broadly and some admin flows may still mutate them.

## Mental Model

If you want the shortest possible mental model, use this:

- config and deck live in Postgres
- cron triggers `shape_trader_tick()`
- `shape_trader_tick()` writes market draw rows
- the client reads those rows to render the live market
- user trades are stored separately from engine draws

That is the current Shape Traders server-side draw engine.
