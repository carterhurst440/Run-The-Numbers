import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shape-trader-cron-secret"
};

const GAME_ID = "game_003";
const SHAPE_TRADERS_EPOCH_MS = Date.parse("2026-04-16T00:00:00Z");
const SHAPE_TRADERS_DRAW_INTERVAL_MS = 15000;
const SHAPE_TRADERS_DUMP_CARDS = 5;
const SHAPE_TRADERS_DUMP_CARD_INTERVAL_MS = 2000;
const SHAPE_TRADERS_DUMP_ACTIVE_MS = SHAPE_TRADERS_DUMP_CARDS * SHAPE_TRADERS_DUMP_CARD_INTERVAL_MS;
const SHAPE_TRADERS_START_PRICE = 100;
const SHAPE_TRADERS_SPLIT_THRESHOLD = 1000;
const SHAPE_TRADERS_SPLIT_FACTOR = 10;
const SHAPE_TRADERS_MAX_BATCH_ROWS = 1000;

const SHAPE_TRADERS_ASSETS = [
  { id: "square", label: "Square" },
  { id: "triangle", label: "Triangle" },
  { id: "circle", label: "Circle" }
] as const;

const SHAPE_TRADERS_MOVEMENTS = [5, 10, 15, 20, 25, 30, 40, 50, 100, -5, -9, -13, -17, -20, -23, -30, -33, -50];
const SHAPE_TRADERS_MACRO_CARDS = [
  { label: "Macro +5%", percentage: 5 },
  { label: "Macro +10%", percentage: 10 },
  { label: "Macro +15%", percentage: 15 },
  { label: "Macro +20%", percentage: 20 },
  { label: "Macro +25%", percentage: 25 },
  { label: "Macro -5%", percentage: -5 },
  { label: "Macro -9%", percentage: -9 },
  { label: "Macro -13%", percentage: -13 },
  { label: "Macro -17%", percentage: -17 },
  { label: "Macro -20%", percentage: -20 },
  { label: "Animal Spirits +50%", percentage: 50 },
  { label: "Market Panic -33%", percentage: -33 }
].map((card) => ({
  ...card,
  kind: "macro" as const,
  assetId: null,
  assetLabel: "Macro"
}));

type DrawRow = {
  draw_id: number;
  window_index: number;
  sequence_in_window: number;
  is_data_dump: boolean;
  card_kind: "asset" | "macro";
  shape: "square" | "triangle" | "circle" | null;
  percentage: number;
  card_label: string;
  drawn_at: string;
  created_at?: string;
  previous_square_price?: number | null;
  previous_triangle_price?: number | null;
  previous_circle_price?: number | null;
  new_square_price?: number | null;
  new_triangle_price?: number | null;
  new_circle_price?: number | null;
  bankruptcy_split?: string[] | null;
};

type PriceState = Record<"square" | "triangle" | "circle", number>;

type ShapeTraderCard = {
  kind: "asset" | "macro";
  assetId: "square" | "triangle" | "circle" | null;
  assetLabel: string | null;
  percentage: number;
  label: string;
};

function roundCurrencyValue(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function hashShapeTraderSeed(input: string) {
  let hash = 1779033703 ^ String(input || "").length;
  for (let index = 0; index < String(input || "").length; index += 1) {
    hash = Math.imul(hash ^ String(input).charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

function shapeTraderRandom(seed: string) {
  let value = hashShapeTraderSeed(seed)();
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShapeTraderDeck(): ShapeTraderCard[] {
  const assetCards = SHAPE_TRADERS_ASSETS.flatMap((asset) =>
    SHAPE_TRADERS_MOVEMENTS.map((percentage) => ({
      kind: "asset" as const,
      assetId: asset.id,
      assetLabel: asset.label,
      percentage,
      label: `${asset.label} ${percentage > 0 ? "+" : ""}${percentage}%`
    }))
  );
  return [...assetCards, ...SHAPE_TRADERS_MACRO_CARDS];
}

function shuffleShapeTraderDeck(seed: string) {
  const deck = buildShapeTraderDeck().map((card) => ({ ...card }));
  const random = shapeTraderRandom(seed);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function isShapeTraderDataDumpWindow(windowIndex: number) {
  return (Math.max(0, Math.floor(Number(windowIndex) || 0)) + 1) % 10 === 0;
}

function getShapeTraderDumpRevealExtensionMs() {
  return SHAPE_TRADERS_DUMP_ACTIVE_MS - SHAPE_TRADERS_DRAW_INTERVAL_MS;
}

function getShapeTraderCompletedDumpCountBeforeWindow(windowIndex: number) {
  const safeWindowIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
  if (safeWindowIndex <= 0) return 0;
  return Math.floor(safeWindowIndex / 10);
}

function getShapeTraderWindowStartMs(windowIndex: number, epochMs: number) {
  const safeWindowIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
  return epochMs
    + safeWindowIndex * SHAPE_TRADERS_DRAW_INTERVAL_MS
    + getShapeTraderCompletedDumpCountBeforeWindow(safeWindowIndex) * getShapeTraderDumpRevealExtensionMs();
}

function getShapeTraderWindowEndMs(windowIndex: number, epochMs: number) {
  const safeWindowIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
  const baseDuration = SHAPE_TRADERS_DRAW_INTERVAL_MS;
  const dumpExtension = isShapeTraderDataDumpWindow(safeWindowIndex) ? getShapeTraderDumpRevealExtensionMs() : 0;
  return getShapeTraderWindowStartMs(safeWindowIndex, epochMs) + baseDuration + dumpExtension;
}

function getShapeTraderCurrentWindowIndex(nowMs: number, epochMs: number) {
  if (nowMs < epochMs) {
    return -1;
  }
  let windowIndex = 0;
  while (nowMs >= getShapeTraderWindowEndMs(windowIndex, epochMs)) {
    windowIndex += 1;
    if (windowIndex > 100000) {
      break;
    }
  }
  return windowIndex;
}

function getShapeTraderWindowState(windowIndex: number, nowMs: number, epochMs: number) {
  const numericWindowIndex = Math.floor(Number(windowIndex));
  const safeWindowIndex = Number.isFinite(numericWindowIndex) ? numericWindowIndex : 0;
  if (safeWindowIndex < 0 || nowMs < epochMs) {
    return {
      windowIndex: -1,
      isDataDump: false,
      cards: [] as ShapeTraderCard[],
      visibleCount: 0
    };
  }
  const windowStart = getShapeTraderWindowStartMs(safeWindowIndex, epochMs);
  const elapsedInWindow = Math.max(0, nowMs - windowStart);
  const isDataDump = isShapeTraderDataDumpWindow(safeWindowIndex);
  const deck = shuffleShapeTraderDeck(`shape-traders:${safeWindowIndex}`);
  const cards = isDataDump ? deck.slice(0, SHAPE_TRADERS_DUMP_CARDS) : deck.slice(0, 1);
  const visibleCount = isDataDump
    ? Math.min(cards.length, Math.max(0, Math.floor(elapsedInWindow / SHAPE_TRADERS_DUMP_CARD_INTERVAL_MS) + 1))
    : cards.length;
  return {
    windowIndex: safeWindowIndex,
    isDataDump,
    cards,
    visibleCount
  };
}

function getShapeTraderTimelineEpochFromRow(row: Pick<DrawRow, "drawn_at" | "window_index" | "sequence_in_window" | "is_data_dump">) {
  if (!row?.drawn_at) return SHAPE_TRADERS_EPOCH_MS;
  const windowIndex = Math.max(0, Math.floor(Number(row.window_index || 0)));
  const sequenceInWindow = Math.max(1, Math.floor(Number(row.sequence_in_window || 1)));
  const sequenceOffsetMs = row.is_data_dump ? (sequenceInWindow - 1) * SHAPE_TRADERS_DUMP_CARD_INTERVAL_MS : 0;
  const drawnAtMs = Date.parse(row.drawn_at);
  if (!Number.isFinite(drawnAtMs)) return SHAPE_TRADERS_EPOCH_MS;
  return drawnAtMs
    - (windowIndex * SHAPE_TRADERS_DRAW_INTERVAL_MS)
    - (getShapeTraderCompletedDumpCountBeforeWindow(windowIndex) * getShapeTraderDumpRevealExtensionMs())
    - sequenceOffsetMs;
}

function createInitialPrices(): PriceState {
  return {
    square: SHAPE_TRADERS_START_PRICE,
    triangle: SHAPE_TRADERS_START_PRICE,
    circle: SHAPE_TRADERS_START_PRICE
  };
}

function getPricesFromRow(row: DrawRow | null): PriceState {
  if (!row) {
    return createInitialPrices();
  }
  const nextPrices = {
    square: Number(row.new_square_price),
    triangle: Number(row.new_triangle_price),
    circle: Number(row.new_circle_price)
  };
  if (Object.values(nextPrices).every((value) => Number.isFinite(value))) {
    return {
      square: roundCurrencyValue(nextPrices.square),
      triangle: roundCurrencyValue(nextPrices.triangle),
      circle: roundCurrencyValue(nextPrices.circle)
    };
  }
  return createInitialPrices();
}

function shapeTraderPriceImpact(currentPrice: number, percentage: number) {
  return roundCurrencyValue(Number(currentPrice || 0) * (1 + Number(percentage || 0) / 100));
}

function applyShapeTraderCard(card: ShapeTraderCard, prices: PriceState) {
  const nextPrices: PriceState = { ...prices };
  const affectedAssets = card.kind === "asset"
    ? [card.assetId as "square" | "triangle" | "circle"]
    : SHAPE_TRADERS_ASSETS.map((asset) => asset.id);
  const eventTags: string[] = [];

  affectedAssets.forEach((assetId) => {
    const previousPrice = roundCurrencyValue(Number(nextPrices[assetId] || SHAPE_TRADERS_START_PRICE));
    const candidatePrice = shapeTraderPriceImpact(previousPrice, card.percentage);
    if (candidatePrice >= SHAPE_TRADERS_SPLIT_THRESHOLD) {
      nextPrices[assetId] = roundCurrencyValue(candidatePrice / SHAPE_TRADERS_SPLIT_FACTOR);
      eventTags.push(`${assetId}_split`);
      return;
    }
    if (candidatePrice < 1) {
      nextPrices[assetId] = SHAPE_TRADERS_START_PRICE;
      eventTags.push(`${assetId}_bankruptcy`);
      return;
    }
    nextPrices[assetId] = roundCurrencyValue(candidatePrice);
  });

  return {
    nextPrices,
    eventTags
  };
}

function buildDrawRow(windowIndex: number, sequenceInWindow: number, epochMs: number, previousPrices: PriceState) {
  const windowState = getShapeTraderWindowState(windowIndex, getShapeTraderWindowStartMs(windowIndex, epochMs), epochMs);
  const card = windowState.cards[sequenceInWindow - 1] || null;
  if (!card) return null;
  const windowStart = getShapeTraderWindowStartMs(windowIndex, epochMs);
  const sequenceOffsetMs = isShapeTraderDataDumpWindow(windowIndex)
    ? (sequenceInWindow - 1) * SHAPE_TRADERS_DUMP_CARD_INTERVAL_MS
    : 0;
  return {
    draw_id: windowIndex * 10 + sequenceInWindow,
    game_id: GAME_ID,
    window_index: windowIndex,
    sequence_in_window: sequenceInWindow,
    is_data_dump: isShapeTraderDataDumpWindow(windowIndex),
    card_kind: card.kind,
    shape: card.assetId,
    percentage: Number(card.percentage || 0),
    card_label: card.label,
    drawn_at: new Date(windowStart + sequenceOffsetMs).toISOString(),
    previous_square_price: roundCurrencyValue(previousPrices.square),
    previous_triangle_price: roundCurrencyValue(previousPrices.triangle),
    previous_circle_price: roundCurrencyValue(previousPrices.circle),
    new_square_price: roundCurrencyValue(previousPrices.square),
    new_triangle_price: roundCurrencyValue(previousPrices.triangle),
    new_circle_price: roundCurrencyValue(previousPrices.circle),
    bankruptcy_split: [] as string[]
  };
}

function buildDueDrawRows(latestRow: DrawRow | null, nowMs: number) {
  const epochMs = latestRow ? getShapeTraderTimelineEpochFromRow(latestRow) : SHAPE_TRADERS_EPOCH_MS;
  const currentWindowIndex = getShapeTraderCurrentWindowIndex(nowMs, epochMs);
  if (currentWindowIndex < 0) {
    return { rows: [] as DrawRow[], epochMs };
  }

  let prices = getPricesFromRow(latestRow);
  let processedWindowIndex = latestRow ? Math.max(0, Math.floor(Number(latestRow.window_index || 0))) : -1;
  let processedVisibleCount = latestRow ? Math.max(0, Math.floor(Number(latestRow.sequence_in_window || 0))) : 0;
  const rows: DrawRow[] = [];

  for (let windowIndex = Math.max(0, processedWindowIndex); windowIndex <= currentWindowIndex; windowIndex += 1) {
    const windowState = getShapeTraderWindowState(windowIndex, nowMs, epochMs);
    const targetCount = windowIndex < currentWindowIndex ? windowState.cards.length : windowState.visibleCount;
    const startSequence = windowIndex === processedWindowIndex ? processedVisibleCount + 1 : 1;
    for (let sequenceInWindow = startSequence; sequenceInWindow <= targetCount; sequenceInWindow += 1) {
      const row = buildDrawRow(windowIndex, sequenceInWindow, epochMs, prices);
      if (!row) continue;
      const card: ShapeTraderCard = {
        kind: row.card_kind,
        assetId: row.shape,
        assetLabel: row.shape ? SHAPE_TRADERS_ASSETS.find((asset) => asset.id === row.shape)?.label || row.shape : "Macro",
        percentage: Number(row.percentage || 0),
        label: row.card_label
      };
      const outcome = applyShapeTraderCard(card, prices);
      prices = outcome.nextPrices;
      row.new_square_price = prices.square;
      row.new_triangle_price = prices.triangle;
      row.new_circle_price = prices.circle;
      row.bankruptcy_split = outcome.eventTags;
      rows.push(row);
      processedWindowIndex = windowIndex;
      processedVisibleCount = sequenceInWindow;
    }
  }

  return { rows, epochMs };
}

function chunkRows<T>(rows: T[], chunkSize = SHAPE_TRADERS_MAX_BATCH_ROWS) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("SHAPE_TRADER_CRON_SECRET") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }

    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const requestCronSecret = request.headers.get("x-shape-trader-cron-secret") || "";
    const isCronRequest = Boolean(cronSecret) && requestCronSecret === cronSecret;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    if (!isCronRequest) {
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError) throw authError;
      if (!authData.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const targetNow = typeof body?.targetNow === "string" ? Date.parse(body.targetNow) : Date.now();
    const nowMs = Number.isFinite(targetNow) ? targetNow : Date.now();

    const { data: latestRows, error: latestError } = await supabase
      .from("shape_trader_draws")
      .select("*")
      .order("draw_id", { ascending: false })
      .limit(1);

    if (latestError) throw latestError;
    const latestRow = Array.isArray(latestRows) && latestRows.length ? latestRows[0] as DrawRow : null;
    const { rows, epochMs } = buildDueDrawRows(latestRow, nowMs);

    for (const batch of chunkRows(rows)) {
      const { error } = await supabase
        .from("shape_trader_draws")
        .upsert(batch, { onConflict: "draw_id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: rows.length,
      latestDrawId: rows.length ? rows[rows.length - 1].draw_id : latestRow?.draw_id || null,
      epochMs,
      reason: body?.reason || null
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("[shape-trader-engine] fatal", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
