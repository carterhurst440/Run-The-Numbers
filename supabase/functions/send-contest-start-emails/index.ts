import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecipientRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  contest_title: string;
  contest_details: string | null;
  starts_at: string;
  ends_at: string;
  prize_mode: "static" | "variable" | string;
  prize_static_amount: number | string | null;
  prize_variable_basis: "none" | "contestant" | "qualifying_contestant" | string | null;
  prize_variable_unit_amount: number | string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const CONTEST_EMAIL_TIME_ZONE = "America/Denver";
const RESEND_MIN_INTERVAL_MS = 250;
const RESEND_MAX_ATTEMPTS = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(retryAfterHeader: string | null, attempt: number) {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }

  return RESEND_MIN_INTERVAL_MS * Math.max(1, attempt + 1);
}

async function sendEmailWithRetry(
  resendApiKey: string,
  emailFrom: string,
  recipient: RecipientRow,
  contestId: string
) {
  for (let attempt = 0; attempt < RESEND_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(RESEND_MIN_INTERVAL_MS);
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: emailFrom,
        to: recipient.email,
        subject: `New contest live: ${recipient.contest_title}`,
        html: buildEmailHtml(recipient, contestId)
      })
    });

    if (resendResponse.ok) {
      return { ok: true as const };
    }

    const errorText = await resendResponse.text();
    if (resendResponse.status !== 429 || attempt === RESEND_MAX_ATTEMPTS - 1) {
      return {
        ok: false as const,
        status: resendResponse.status,
        errorText
      };
    }

    const delayMs = getRetryDelayMs(resendResponse.headers.get("retry-after"), attempt);
    console.warn("[send-contest-start-emails] resend rate limited; retrying", {
      email: recipient.email,
      attempt: attempt + 1,
      delayMs
    });
    await sleep(delayMs);
  }

  return {
    ok: false as const,
    status: 429,
    errorText: "Exceeded retry attempts."
  };
}

function formatPrizeMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function getPrizeGrowthCopy(recipient: RecipientRow) {
  const baseAmount = Math.max(0, Number(recipient.prize_static_amount ?? 0));
  const unitAmount = Math.max(0, Number(recipient.prize_variable_unit_amount ?? 0));
  if (recipient.prize_mode !== "variable" || recipient.prize_variable_basis === "none") {
    return `Static prize pot of ${formatPrizeMoney(baseAmount)}.`;
  }
  const basisLabel = recipient.prize_variable_basis === "qualifying_contestant"
    ? "qualifying contestant"
    : "contestant";
  if (baseAmount > 0) {
    return `Starts at ${formatPrizeMoney(baseAmount)} and grows by ${formatPrizeMoney(unitAmount)} per ${basisLabel}.`;
  }
  return `Grows by ${formatPrizeMoney(unitAmount)} per ${basisLabel}.`;
}

function formatContestStartTime(value: string) {
  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) {
    return "right now";
  }

  return startTime.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CONTEST_EMAIL_TIME_ZONE,
    timeZoneName: "short"
  });
}

function buildEmailHtml(recipient: RecipientRow, contestId: string) {
  const firstName = recipient.first_name?.trim() || "there";
  const startTime = new Date(recipient.starts_at);
  const formattedStart = formatContestStartTime(recipient.starts_at);
  const endTime = new Date(recipient.ends_at);
  const durationMs = Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())
    ? 0
    : Math.max(0, endTime.getTime() - startTime.getTime());
  const totalMinutes = Math.round(durationMs / 60000);
  const durationHours = Math.floor(totalMinutes / 60);
  const durationMinutes = totalMinutes % 60;
  const durationParts = [];
  if (durationHours > 0) {
    durationParts.push(`${durationHours} hour${durationHours === 1 ? "" : "s"}`);
  }
  if (durationMinutes > 0 || !durationParts.length) {
    durationParts.push(`${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`);
  }
  const durationLabel = durationParts.join(" and ");
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://carterscasino.app").replace(/\/+$/, "");
  const joinUrl = `${appBaseUrl}/#/contests?contest=${encodeURIComponent(contestId)}`;
  const startingPrizePot = formatPrizeMoney(Math.max(0, Number(recipient.prize_static_amount ?? 0)));
  const growthCopy = getPrizeGrowthCopy(recipient);

  return `
    <div style="font-family: Arial, sans-serif; background: #071632; color: #ecf7ff; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #0b1d45; border: 1px solid rgba(63,240,255,0.2); border-radius: 16px; padding: 28px;">
        <p style="margin: 0 0 8px; color: #37f0ff; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;">Contest Alert</p>
        <h1 style="margin: 0 0 16px; font-size: 28px;">${recipient.contest_title} is live</h1>
        <div style="margin: 0 0 18px; padding: 14px 16px; border-radius: 14px; background: rgba(63, 240, 255, 0.08); border: 1px solid rgba(255, 217, 119, 0.24);">
          <p style="margin: 0 0 6px; color: #ffd977; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">Prize Pot ${startingPrizePot}</p>
          <p style="margin: 0; color: rgba(236,247,255,0.82); font-size: 14px; line-height: 1.55;">${growthCopy}</p>
        </div>
        ${recipient.contest_details?.trim()
          ? `<p style="margin: 0 0 18px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,0.04); color: rgba(236,247,255,0.88); font-size: 14px; line-height: 1.6;">${recipient.contest_details.trim()}</p>`
          : ""}
        <p style="margin: 0 0 18px; font-size: 16px; line-height: 1.6;">Hi ${firstName}, a new Run The Numbers contest began ${formattedStart}. Jump into the app to view the prize pot, leaderboard, and join the contest mode. The contest will be open for ${durationLabel}. <strong>GOOD LUCK!</strong></p>
        <div style="margin: 0 0 18px;">
          <a href="${joinUrl}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: linear-gradient(135deg, #3ff0ff, #7f8dff); color: #03111f; font-size: 14px; font-weight: 700; letter-spacing: 0.14em; text-decoration: none; text-transform: uppercase;">Join Contest</a>
        </div>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: rgba(236,247,255,0.78);">If you no longer want these emails, open the Contests page in the app and turn off contest notification emails.</p>
      </div>
    </div>
  `;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("CONTEST_EMAIL_FROM");

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !emailFrom) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, or CONTEST_EMAIL_FROM.");
    }

    const { contestId } = await request.json();
    if (!contestId) {
      throw new Error("contestId is required.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabase.rpc("get_contest_start_email_recipients", {
      _contest_id: contestId
    });
    if (error) throw error;

    const recipients = (Array.isArray(data) ? data : []) as RecipientRow[];
    if (!recipients.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const sentUserIds: string[] = [];
    let failedCount = 0;

    for (const recipient of recipients) {
      const result = await sendEmailWithRetry(resendApiKey, emailFrom, recipient, contestId);
      if (!result.ok) {
        failedCount += 1;
        console.error("[send-contest-start-emails] resend error", {
          email: recipient.email,
          status: result.status,
          errorText: result.errorText
        });
        continue;
      }

      sentUserIds.push(recipient.user_id);
      await sleep(RESEND_MIN_INTERVAL_MS);
    }

    if (sentUserIds.length) {
      const { error: updateError } = await supabase
        .from("contest_start_notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("contest_id", contestId)
        .in("user_id", sentUserIds);
      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ sent: sentUserIds.length, failed: failedCount }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("[send-contest-start-emails] fatal", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
