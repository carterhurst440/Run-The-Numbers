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
  created_at?: string | null;
  game_id?: string | null;
};

const GAME_IDS = {
  RUN_THE_NUMBERS: "game_001",
  GUESS_10: "game_002"
} as const;

const GAME_LABELS: Record<string, string> = {
  [GAME_IDS.RUN_THE_NUMBERS]: "Run the Numbers",
  [GAME_IDS.GUESS_10]: "Guess 10"
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

function normalizeGameId(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
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
    userIds
  }: {
    startAt: Date | null;
    endAt: Date;
    userIds: string[];
  }
) {
  const allHands: HandRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;
  let includeGameId = true;

  while (hasMore) {
    let query = supabase
      .from("game_hands")
      .select(includeGameId ? "created_at, game_id" : "created_at")
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
        created_at: row.created_at,
        game_id: includeGameId ? normalizeGameId(row.game_id) : GAME_IDS.RUN_THE_NUMBERS
      });
    });
    hasMore = batch.length === pageSize;
    page += 1;
  }

  return allHands;
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
        const runTheNumbersHands = matchingHands.filter((entry) => normalizeGameId(entry.game_id) === GAME_IDS.RUN_THE_NUMBERS).length;
        const guess10Hands = matchingHands.filter((entry) => normalizeGameId(entry.game_id) === GAME_IDS.GUESS_10).length;
        return {
          label: period === "hour"
            ? formatBucketLabel(bucketStart, 5)
            : period === "day"
              ? formatBucketLabel(bucketStart, 60)
              : formatDayBucketLabel(bucketStart),
          handsPlayed: matchingHands.length,
          runTheNumbersHands,
          guess10Hands
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

    if (action === "player_mode_breakdown") {
      const hands = await loadHands(supabase, {
        startAt: getPeriodStart(period),
        endAt: new Date(),
        userIds: [userId]
      });

      const modeCounts = new Map<string, number>([
        ["Normal Mode", 0],
        ["Contest Mode", 0]
      ]);
      runsInPeriod.forEach((run) => {
        const label = getModeLabel(run);
        modeCounts.set(label, (modeCounts.get(label) || 0) + 1);
      });

      const counts = new Map<string, number>([
        [GAME_IDS.RUN_THE_NUMBERS, 0],
        [GAME_IDS.GUESS_10, 0]
      ]);

      hands.forEach((hand) => {
        const gameId = normalizeGameId(hand.game_id);
        counts.set(gameId, (counts.get(gameId) || 0) + 1);
      });

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
