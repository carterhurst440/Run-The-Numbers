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

function getPeriodStart(period: string) {
  const now = Date.now();
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

    if (!action || !userId) {
      throw new Error("action and userId are required.");
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
      let runningBalance = 1000;
      const points = runsInPeriod
        .filter((run) => isNormalModeRun(run))
        .map((run, index) => {
          const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
          const endingBankroll = Number(metadata?.ending_bankroll);
          if (Number.isFinite(endingBankroll)) {
            runningBalance = Math.round(endingBankroll);
          } else {
            const scoreDelta = Number(run?.score ?? 0);
            if (Number.isFinite(scoreDelta)) {
              runningBalance += Math.round(scoreDelta);
            }
          }

          return {
            value: runningBalance,
            created_at: run?.created_at || null,
            fallbackIndex: index
          };
        });

      return new Response(JSON.stringify({ points }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    if (action === "player_mode_breakdown") {
      const contestIds = Array.from(
        new Set(
          runsInPeriod
            .map((run) => getContestIdFromRun(run))
            .filter(Boolean)
        )
      ) as string[];

      let contestTitleMap = new Map<string, string>();
      if (contestIds.length) {
        const { data: contests, error: contestError } = await supabase
          .from("contests")
          .select("id, title")
          .in("id", contestIds);
        if (contestError) throw contestError;
        contestTitleMap = new Map(
          (Array.isArray(contests) ? contests : []).map((contest) => [String(contest.id), String(contest.title || "Contest Mode")])
        );
      }

      const counts = new Map<string, { label: string; handsPlayed: number }>();
      runsInPeriod.forEach((run) => {
        const modeKey = getRunModeKey(run);
        if (modeKey === "normal") {
          const current = counts.get(modeKey) || { label: "Normal Mode", handsPlayed: 0 };
          current.handsPlayed += 1;
          counts.set(modeKey, current);
          return;
        }

        const contestId = getContestIdFromRun(run);
        const label = contestId
          ? `Contest: ${contestTitleMap.get(contestId) || "Contest Mode"}`
          : "Contest Mode";
        const current = counts.get(modeKey) || { label, handsPlayed: 0 };
        current.handsPlayed += 1;
        counts.set(modeKey, current);
      });

      const rows = Array.from(counts.entries())
        .map(([key, value]) => ({
          key,
          label: value.label,
          handsPlayed: value.handsPlayed
        }))
        .sort((a, b) => b.handsPlayed - a.handsPlayed || a.label.localeCompare(b.label));

      return new Response(JSON.stringify({ rows, totalHands: rows.reduce((sum, row) => sum + row.handsPlayed, 0) }), {
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
