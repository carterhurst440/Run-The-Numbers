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

const MONO = `'JetBrains Mono', 'Courier New', monospace`;
const BG = `#0a0a09`;
const BG2 = `#111110`;
const FG = `#ddd5bc`;
const DIM = `#686850`;
const LIME = `#c8ff00`;
const LIME_DIM = `rgba(200,255,0,0.12)`;
const BORDER = `rgba(200,255,0,0.15)`;

function formatPrizeMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
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

function buildPotBlock(recipient: RecipientRow): { tickerStyles: string; html: string } {
  const baseAmount = Math.max(0, Number(recipient.prize_static_amount ?? 0));
  const unitAmount = Math.max(0, Number(recipient.prize_variable_unit_amount ?? 0));
  const isVariable = recipient.prize_mode === "variable" && recipient.prize_variable_basis !== "none" && unitAmount > 0;
  const basisLabel = recipient.prize_variable_basis === "qualifying_contestant" ? "qualifying player" : "player";

  const potNumStyle = `font-family:${MONO};font-size:52px;font-weight:800;color:${LIME};line-height:60px;letter-spacing:-0.02em;`;

  if (!isVariable) {
    const growthNote = `<p style="margin:6px 0 0;font-family:${MONO};font-size:11px;color:${DIM};text-transform:uppercase;letter-spacing:0.12em;">fixed pot</p>`;
    return {
      tickerStyles: "",
      html: `<div style="margin:0 0 28px;">
        <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">// pot</p>
        <div style="${potNumStyle}">${formatPrizeMoney(baseAmount)}</div>
        ${growthNote}
      </div>`
    };
  }

  // Build ticker frames: base → base + 5 increments
  const FRAME_COUNT = 6;
  const frames = Array.from({ length: FRAME_COUNT }, (_, i) => formatPrizeMoney(baseAmount + i * unitAmount));
  // translateY to show last frame: -((N-1)/N * 100)%
  const endPct = (((FRAME_COUNT - 1) / FRAME_COUNT) * 100).toFixed(4);
  const durationS = (FRAME_COUNT - 1) * 0.7;

  const growthNote = baseAmount > 0
    ? `starts at ${formatPrizeMoney(baseAmount)} · grows ${formatPrizeMoney(unitAmount)} per ${basisLabel}`
    : `grows ${formatPrizeMoney(unitAmount)} per ${basisLabel}`;

  return {
    tickerStyles: `
      @keyframes pot-tick {
        from { transform: translateY(0); }
        to   { transform: translateY(-${endPct}%); }
      }
      .pot-ticker {
        animation: pot-tick ${durationS}s steps(${FRAME_COUNT - 1}, end) infinite alternate;
      }`,
    html: `<div style="margin:0 0 28px;">
      <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">// pot</p>
      <div style="height:60px;overflow:hidden;">
        <div class="pot-ticker">
          ${frames.map(f => `<div style="${potNumStyle}">${f}</div>`).join("\n          ")}
        </div>
      </div>
      <p style="margin:6px 0 0;font-family:${MONO};font-size:11px;color:${DIM};letter-spacing:0.04em;">${growthNote}</p>
    </div>`
  };
}

function buildEmailHtml(recipient: RecipientRow, contestId: string) {
  const firstName = recipient.first_name?.trim() || "there";
  const startTime = new Date(recipient.starts_at);
  const endTime = new Date(recipient.ends_at);
  const durationMs = Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())
    ? 0
    : Math.max(0, endTime.getTime() - startTime.getTime());
  const totalMinutes = Math.round(durationMs / 60000);
  const durationHours = Math.floor(totalMinutes / 60);
  const durationMinutes = totalMinutes % 60;
  const durationParts: string[] = [];
  if (durationHours > 0) durationParts.push(`${durationHours}h`);
  if (durationMinutes > 0 || !durationParts.length) durationParts.push(`${durationMinutes}m`);
  const durationLabel = durationParts.join(" ");

  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://carterscasino.app").replace(/\/+$/, "");
  const joinUrl = `${appBaseUrl}/#/contests?contest=${encodeURIComponent(contestId)}`;
  const formattedStart = formatContestStartTime(recipient.starts_at);

  const { tickerStyles, html: potHtml } = buildPotBlock(recipient);

  const detailsBlock = recipient.contest_details?.trim()
    ? `<div style="margin:0 0 28px;padding:16px;background:rgba(255,255,255,0.03);border-left:2px solid ${BORDER};">
        <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">// details</p>
        <p style="margin:0;font-family:${MONO};font-size:13px;color:${FG};line-height:1.65;opacity:0.82;">${recipient.contest_details.trim()}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${recipient.contest_title} — contest is live</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
    ${tickerStyles}
    body { margin: 0; padding: 0; background: ${BG}; }
    a { color: inherit; }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="100%" style="max-width:540px;" cellpadding="0" cellspacing="0">

          <!-- HEADER -->
          <tr>
            <td style="padding:0 0 32px;">
              <p style="margin:0;font-family:${MONO};font-size:11px;font-weight:700;color:${LIME};letter-spacing:0.18em;text-transform:uppercase;">// carter's casino</p>
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td style="padding:0 0 32px;border-bottom:1px solid ${BORDER};">
              <p style="margin:0 0 10px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.2em;">// contest is now live</p>
              <h1 style="margin:0;font-family:${MONO};font-size:28px;font-weight:800;color:${FG};line-height:1.15;letter-spacing:-0.01em;">${recipient.contest_title}</h1>
            </td>
          </tr>

          <!-- POT -->
          <tr>
            <td style="padding:28px 0 0;">
              ${potHtml}
            </td>
          </tr>

          <!-- DETAILS -->
          ${detailsBlock ? `<tr><td>${detailsBlock}</td></tr>` : ""}

          <!-- WHEN / DURATION -->
          <tr>
            <td style="padding:0 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:32px;">
                    <p style="margin:0 0 4px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">// started</p>
                    <p style="margin:0;font-family:${MONO};font-size:13px;color:${FG};">${formattedStart}</p>
                  </td>
                  <td>
                    <p style="margin:0 0 4px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">// runs for</p>
                    <p style="margin:0;font-family:${MONO};font-size:13px;color:${FG};">${durationLabel}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY COPY -->
          <tr>
            <td style="padding:0 0 32px;">
              <p style="margin:0;font-family:${MONO};font-size:13px;color:${DIM};line-height:1.7;">hey ${firstName} — a new contest just started. switch to contest mode in the app to compete on the leaderboard.</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 0 40px;">
              <a href="${joinUrl}" style="display:inline-block;padding:13px 28px;background:${LIME};color:#0a0a09;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">play now →</a>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="border-top:1px solid rgba(104,104,80,0.25);padding:20px 0 0;">
              <p style="margin:0;font-family:${MONO};font-size:10px;color:${DIM};line-height:1.6;">to stop receiving contest emails, open the app &rsaquo; contests &rsaquo; notifications</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
