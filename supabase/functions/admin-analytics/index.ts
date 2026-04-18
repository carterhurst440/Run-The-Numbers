import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "carterwarrenhurst@gmail.com";

type RunRow = {
  score?: number | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type HandRow = {
  user_id?: string | null;
  created_at?: string | null;
  game_id?: string | null;
  net?: number | null;
  mode_type?: string | null;
  contest_id?: string | null;
};

type TradeRow = {
  user_id?: string | null;
  executed_at?: string | null;
  trade_side?: string | null;
  net_profit?: number | null;
  contest_id?: string | null;
};

type DailyProfitLossRow = {
  profit_date?: string | null;
  pnl_total?: number | null;
  pnl_rtn?: number | null;
  pnl_g10?: number | null;
  pnl_shape_traders?: number | null;
};

const GAME_IDS = {
  RUN_THE_NUMBERS: "game_001",
  GUESS_10: "game_002",
  SHAPE_TRADERS: "game_003"
} as const;

const GAME_LABELS: Record<string, string> = {
  [GAME_IDS.RUN_THE_NUMBERS]: "Run the Numbers",
  [GAME_IDS.GUESS_10]: "Guess 10",
  [GAME_IDS.SHAPE_TRADERS]: "Shape Traders"
};
const ANALYTICS_TIME_ZONE = "America/Denver";

function getPeriodStart(period: string) {
  const now = Date.now();
  if (period === "hour") return new Date(now - 60 * 60 * 1000);
  if (period === "day") return new Date(now - 24 * 60 * 60 * 1000);
  if (period === "week") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === "month") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (period === "90days") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now - 365 * 24 * 60 * 60 * 1000);
  return null;
}

function isNormalModeRun(run: RunRow) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const accountMode = String(metadata?.account_mode || "").trim().toLowerCase();
  const contestId = metadata?.contest_id;
  const hasExplicitContestMode = accountMode === "contest";
  const isContestLinked = Boolean(contestId);
  const isNormalOrLegacyRun = !accountMode || accountMode === "normal";
  return isNormalOrLegacyRun && !isContestLinked && !hasExplicitContestMode;
}

function getRunModeKey(run: RunRow) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const accountMode = String(metadata?.account_mode || "").trim().toLowerCase();
  const contestId = String(metadata?.contest_id || "").trim();
  if (contestId || accountMode === "contest") {
    return contestId ? `contest:${contestId}` : "contest:unknown";
  }
  return "normal";
}

function getContestIdFromRun(run: RunRow) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const contestId = String(metadata?.contest_id || "").trim();
  return contestId || null;
}

function getRunResolvedAt(run: RunRow) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const resolvedAt = typeof metadata?.resolved_at === "string" ? metadata.resolved_at : null;
  return resolvedAt || run?.created_at || null;
}

function compareRunsByResolvedAt(a: RunRow, b: RunRow) {
  const aResolvedAt = getRunResolvedAt(a);
  const bResolvedAt = getRunResolvedAt(b);
  const aTime = aResolvedAt ? new Date(aResolvedAt).getTime() : Number.NaN;
  const bTime = bResolvedAt ? new Date(bResolvedAt).getTime() : Number.NaN;
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);
  if (aHasTime && bHasTime && aTime !== bTime) {
    return aTime - bTime;
  }
  if (aHasTime !== bHasTime) {
    return aHasTime ? -1 : 1;
  }
  const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : Number.NaN;
  const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : Number.NaN;
  if (Number.isFinite(aCreatedAt) && Number.isFinite(bCreatedAt) && aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt;
  }
  return 0;
}

function formatBucketLabel(date: Date, bucketMinutes: number) {
  return date.toLocaleTimeString("en-US", {
    timeZone: ANALYTICS_TIME_ZONE,
    hour: "numeric",
    minute: bucketMinutes < 60 ? "2-digit" : undefined
  });
}

function formatDayBucketLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: ANALYTICS_TIME_ZONE,
    month: "short",
    day: "numeric"
  });
}

function getModeLabel(run: RunRow) {
  return getRunModeKey(run) === "normal" ? "Normal Mode" : "Contest Mode";
}

function getAnalyticsDayKey(dateInput: string | Date | null | undefined) {
  const date = dateInput instanceof Date ? dateInput : new Date(String(dateInput || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

function roundCurrencyValue(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getAnalyticsDayRange(dateInput: string | Date | null | undefined) {
  const dayKey = getAnalyticsDayKey(dateInput);
  if (!dayKey) {
    const now = new Date();
    return {
      dayKey: getAnalyticsDayKey(now),
      start: now,
      end: now
    };
  }

  const start = new Date(`${dayKey}T00:00:00-06:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    dayKey,
    start,
    end
  };
}

function normalizeGameId(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === GAME_IDS.SHAPE_TRADERS ||
    normalized === "shape-traders" ||
    normalized === "shape_traders" ||
    normalized === "shapetraders"
  ) {
    return GAME_IDS.SHAPE_TRADERS;
  }
  if (
    normalized === GAME_IDS.GUESS_10 ||
    normalized === "guess-10" ||
    normalized === "red-black" ||
    normalized === "red_black" ||
    normalized === "guess10"
  ) {
    return GAME_IDS.GUESS_10;
  }
  if (
    normalized === GAME_IDS.RUN_THE_NUMBERS ||
    normalized === "run-the-numbers" ||
    normalized === "run_the_numbers"
  ) {
    return GAME_IDS.RUN_THE_NUMBERS;
  }
  return GAME_IDS.RUN_THE_NUMBERS;
}

async function loadHands(
  supabase: ReturnType<typeof createClient>,
  {
    startAt,
    endAt,
    userIds,
    selectFields = ["created_at", "game_id"]
  }: {
    startAt: Date | null;
    endAt: Date;
    userIds: string[];
    selectFields?: string[];
  }
) {
  const allHands: HandRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;
  let includeGameId = selectFields.includes("game_id");

  while (hasMore) {
    const fields = selectFields.filter((field) => field !== "game_id" || includeGameId).join(", ");
    let query = supabase
      .from("game_hands")
      .select(fields)
      .lte("created_at", endAt.toISOString())
      .order("created_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (startAt) {
      query = query.gte("created_at", startAt.toISOString());
    }

    if (userIds.length) {
      query = query.in("user_id", userIds);
    }

    const { data, error } = await query;
    if (error) {
      const message = String(error?.message || error?.details || "");
      if (includeGameId && message.includes("game_id") && message.includes("does not exist")) {
        includeGameId = false;
        page = 0;
        hasMore = true;
        allHands.length = 0;
        continue;
      }
      throw error;
    }

    const batch = Array.isArray(data) ? data : [];
    batch.forEach((row) => {
      allHands.push({
        ...row,
        user_id: row.user_id,
        created_at: row.created_at,
        game_id: includeGameId ? normalizeGameId(row.game_id) : GAME_IDS.RUN_THE_NUMBERS
      });
    });
    hasMore = batch.length === pageSize;
    page += 1;
  }

  return allHands;
}

async function loadTrades(
  supabase: ReturnType<typeof createClient>,
  {
    startAt,
    endAt,
    userIds,
    selectFields = ["executed_at", "trade_side", "net_profit", "contest_id", "user_id"]
  }: {
    startAt: Date | null;
    endAt: Date;
    userIds: string[];
    selectFields?: string[];
  }
) {
  const allTrades: TradeRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("shape_trader_trades")
      .select(selectFields.join(", "))
      .lte("executed_at", endAt.toISOString())
      .order("executed_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (startAt) {
      query = query.gte("executed_at", startAt.toISOString());
    }

    if (userIds.length) {
      query = query.in("user_id", userIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    batch.forEach((row) => {
      allTrades.push({
        ...row,
        user_id: row.user_id,
        executed_at: row.executed_at
      });
    });

    hasMore = batch.length === pageSize;
    page += 1;
  }

  return allTrades;
}

async function loadDailyProfitLossRows(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const allRows: DailyProfitLossRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("daily_profit_loss")
      .select("profit_date, pnl_total, pnl_rtn, pnl_g10, pnl_shape_traders")
      .eq("user_id", userId)
      .order("profit_date", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    allRows.push(...batch);
    hasMore = batch.length === pageSize;
    page += 1;
  }

  return allRows;
}

async function loadRunsForUser(supabase: ReturnType<typeof createClient>, userId: string) {
  const allRuns: RunRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("game_runs")
      .select("score, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    if (Array.isArray(data) && data.length) {
      allRuns.push(...data);
      hasMore = data.length === pageSize;
      page += 1;
    } else {
      hasMore = false;
    }
  }

  return allRuns;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }
    if (!accessToken) {
      throw new Error("Missing bearer token.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError) throw authError;
    const requester = authData.user;
    if (!requester?.email || requester.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const body = await request.json();
    const action = String(body?.action || "").trim();
    const userId = String(body?.userId || "").trim();
    const period = String(body?.period || "all").trim();

    if (!action) {
      throw new Error("action is required.");
    }

    if (action === "hands_timeseries") {
      const now = body?.endAt ? new Date(String(body.endAt)) : new Date();
      const requestedStart = body?.startAt ? new Date(String(body.startAt)) : null;
      const periodStart = getPeriodStart(period);
      const startDate = requestedStart && !Number.isNaN(requestedStart.getTime())
        ? requestedStart
        : periodStart;
      const targetUserIds = Array.isArray(body?.targetUserIds)
        ? body.targetUserIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];

      const allRecords = await loadHands(supabase, {
        startAt: startDate,
        endAt: now,
        userIds: targetUserIds
      });
      const tradeRecords = await loadTrades(supabase, {
        startAt: startDate,
        endAt: now,
        userIds: targetUserIds,
        selectFields: ["executed_at", "user_id"]
      });

      const effectiveStartDate =
        startDate ||
        (allRecords.length > 0
          ? new Date(String(allRecords[0]?.created_at || now.toISOString()))
          : now);

      const bucketStarts: Date[] = [];
      if (period === "hour") {
        const current = new Date(effectiveStartDate);
        current.setSeconds(0, 0);
        current.setMinutes(Math.floor(current.getMinutes() / 5) * 5, 0, 0);
        while (current <= now) {
          bucketStarts.push(new Date(current));
          current.setMinutes(current.getMinutes() + 5);
        }
      } else if (period === "day") {
        const current = new Date(effectiveStartDate);
        current.setMinutes(0, 0, 0);
        while (current <= now) {
          bucketStarts.push(new Date(current));
          current.setHours(current.getHours() + 1);
        }
      } else {
        const current = new Date(effectiveStartDate);
        current.setHours(0, 0, 0, 0);
        const endDay = new Date(now);
        endDay.setHours(0, 0, 0, 0);
        while (current <= endDay) {
          bucketStarts.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }
      }

      const rows = bucketStarts.map((bucketStart) => {
        const bucketEnd = new Date(bucketStart);
        if (period === "hour") {
          bucketEnd.setMinutes(bucketEnd.getMinutes() + 5);
        } else if (period === "day") {
          bucketEnd.setHours(bucketEnd.getHours() + 1);
        } else {
          bucketEnd.setDate(bucketEnd.getDate() + 1);
        }
        const matchingHands = allRecords.filter((entry) => {
          const createdAt = entry?.created_at ? new Date(entry.created_at) : null;
          return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= bucketStart && createdAt < bucketEnd;
        });
        const matchingTrades = tradeRecords.filter((entry) => {
          const executedAt = entry?.executed_at ? new Date(entry.executed_at) : null;
          return executedAt && !Number.isNaN(executedAt.getTime()) && executedAt >= bucketStart && executedAt < bucketEnd;
        });
        const runTheNumbersHands = matchingHands.filter((entry) => normalizeGameId(entry.game_id) === GAME_IDS.RUN_THE_NUMBERS).length;
        const guess10Hands = matchingHands.filter((entry) => normalizeGameId(entry.game_id) === GAME_IDS.GUESS_10).length;
        const shapeTradersTrades = matchingTrades.length;
        return {
          label: period === "hour"
            ? formatBucketLabel(bucketStart, 5)
            : period === "day"
              ? formatBucketLabel(bucketStart, 60)
              : formatDayBucketLabel(bucketStart),
          handsPlayed: matchingHands.length,
          runTheNumbersHands,
          guess10Hands,
          shapeTradersTrades,
          totalEvents: runTheNumbersHands + guess10Hands + shapeTradersTrades
        };
      });

      return new Response(JSON.stringify({ rows }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    if (!userId) {
      throw new Error("userId is required.");
    }

    const allRuns = await loadRunsForUser(supabase, userId);
    const startDate = getPeriodStart(period);
    const runsInPeriod = startDate
      ? allRuns.filter((run) => {
          const createdAt = run?.created_at ? new Date(run.created_at) : null;
          return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= startDate;
        })
      : allRuns;

    if (action === "player_bankroll_history") {
      const points = runsInPeriod
        .filter((run) => isNormalModeRun(run))
        .sort(compareRunsByResolvedAt)
        .map((run, index) => {
          const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
          const endingBankroll = Number(metadata?.ending_bankroll);
          if (!Number.isFinite(endingBankroll)) {
            return null;
          }

          return {
            value: Number(endingBankroll.toFixed(2)),
            created_at: getRunResolvedAt(run),
            fallbackIndex: index
          };
        })
        .filter(Boolean);

      return new Response(JSON.stringify({ points }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    if (action === "player_pnl_history") {
      const now = new Date();
      const startDate = getPeriodStart(period);
      const todayRange = getAnalyticsDayRange(now);
      const snapshotRows = await loadDailyProfitLossRows(supabase, userId);
      const historicalRows = snapshotRows
        .filter((row) => String(row?.profit_date || "") !== todayRange.dayKey)
        .map((row, index) => ({
          dayKey: String(row?.profit_date || ""),
          created_at: `${row?.profit_date || todayRange.dayKey}T12:00:00`,
          pnlTotal: roundCurrencyValue(Number(row?.pnl_total || 0)),
          pnlRtn: roundCurrencyValue(Number(row?.pnl_rtn || 0)),
          pnlG10: roundCurrencyValue(Number(row?.pnl_g10 || 0)),
          pnlShapeTraders: roundCurrencyValue(Number(row?.pnl_shape_traders || 0)),
          fallbackIndex: index
        }))
        .filter((row) => row.dayKey);

      const [todayHands, todayTrades] = await Promise.all([
        loadHands(supabase, {
          startAt: todayRange.start,
          endAt: todayRange.end,
          userIds: [userId],
          selectFields: ["user_id", "created_at", "game_id", "net", "mode_type", "contest_id"]
        }),
        loadTrades(supabase, {
          startAt: todayRange.start,
          endAt: todayRange.end,
          userIds: [userId],
          selectFields: ["user_id", "executed_at", "trade_side", "net_profit", "contest_id"]
        })
      ]);

      const liveToday = {
        pnlTotal: 0,
        pnlRtn: 0,
        pnlG10: 0,
        pnlShapeTraders: 0
      };

      todayHands.forEach((hand) => {
        const dayKey = getAnalyticsDayKey(hand?.created_at);
        const modeType = String(hand?.mode_type || "").trim().toLowerCase();
        if (dayKey !== todayRange.dayKey || hand?.contest_id || (modeType && modeType !== "normal")) {
          return;
        }
        const net = roundCurrencyValue(Number(hand?.net || 0));
        const gameId = normalizeGameId(hand?.game_id);
        if (gameId === GAME_IDS.RUN_THE_NUMBERS) {
          liveToday.pnlRtn = roundCurrencyValue(liveToday.pnlRtn + net);
        } else if (gameId === GAME_IDS.GUESS_10) {
          liveToday.pnlG10 = roundCurrencyValue(liveToday.pnlG10 + net);
        }
      });

      todayTrades.forEach((trade) => {
        const dayKey = getAnalyticsDayKey(trade?.executed_at);
        const tradeSide = String(trade?.trade_side || "").trim().toLowerCase();
        if (dayKey !== todayRange.dayKey || trade?.contest_id || tradeSide !== "sell") {
          return;
        }
        liveToday.pnlShapeTraders = roundCurrencyValue(
          liveToday.pnlShapeTraders + roundCurrencyValue(Number(trade?.net_profit || 0))
        );
      });

      liveToday.pnlTotal = roundCurrencyValue(
        liveToday.pnlRtn + liveToday.pnlG10 + liveToday.pnlShapeTraders
      );

      const hasTodayActivity = Object.values(liveToday).some((value) => Math.abs(Number(value || 0)) > 0);
      const points = (hasTodayActivity
        ? [
            ...historicalRows,
            {
              dayKey: todayRange.dayKey,
              created_at: now.toISOString(),
              ...liveToday,
              fallbackIndex: historicalRows.length
            }
          ]
        : historicalRows)
        .filter((point) => {
          if (!startDate) return true;
          const pointDate = point?.created_at ? new Date(point.created_at) : null;
          return pointDate && !Number.isNaN(pointDate.getTime()) && pointDate >= startDate;
        })
        .sort((left, right) => String(left.dayKey).localeCompare(String(right.dayKey)));

      return new Response(JSON.stringify({ points }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    if (action === "player_mode_breakdown") {
      const hands = await loadHands(supabase, {
        startAt: getPeriodStart(period),
        endAt: new Date(),
        userIds: [userId],
        selectFields: ["user_id", "created_at", "game_id", "mode_type", "contest_id"]
      });
      const trades = await loadTrades(supabase, {
        startAt: getPeriodStart(period),
        endAt: new Date(),
        userIds: [userId],
        selectFields: ["executed_at", "trade_side", "contest_id"]
      });

      const modeCounts = new Map<string, number>([
        ["Normal Mode", 0],
        ["Contest Mode", 0]
      ]);
      hands.forEach((hand) => {
        const modeType = String(hand?.mode_type || "").trim().toLowerCase();
        const label = hand?.contest_id || modeType === "contest" ? "Contest Mode" : "Normal Mode";
        modeCounts.set(label, (modeCounts.get(label) || 0) + 1);
      });
      trades.forEach((trade) => {
        const label = trade?.contest_id ? "Contest Mode" : "Normal Mode";
        modeCounts.set(label, (modeCounts.get(label) || 0) + 1);
      });

      const counts = new Map<string, number>([
        [GAME_IDS.RUN_THE_NUMBERS, 0],
        [GAME_IDS.GUESS_10, 0],
        [GAME_IDS.SHAPE_TRADERS, 0]
      ]);

      hands.forEach((hand) => {
        const gameId = normalizeGameId(hand.game_id);
        counts.set(gameId, (counts.get(gameId) || 0) + 1);
      });
      counts.set(GAME_IDS.SHAPE_TRADERS, trades.length);

      const gameRows = Array.from(counts.entries())
        .map(([key, handsPlayed]) => ({
          key,
          label: GAME_LABELS[key] || "Unknown Game",
          handsPlayed
        }))
        .sort((a, b) => b.handsPlayed - a.handsPlayed || a.label.localeCompare(b.label));

      const modeRows = Array.from(modeCounts.entries())
        .map(([label, handsPlayed]) => ({
          label,
          handsPlayed
        }))
        .sort((a, b) => b.handsPlayed - a.handsPlayed || a.label.localeCompare(b.label));

      return new Response(JSON.stringify({
        modeRows,
        gameRows,
        modeTotalHands: modeRows.reduce((sum, row) => sum + row.handsPlayed, 0),
        gameTotalHands: gameRows.reduce((sum, row) => sum + row.handsPlayed, 0)
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (error) {
    console.error("[admin-analytics] fatal", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
