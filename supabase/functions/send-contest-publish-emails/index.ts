import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecipientRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  contest_title: string;
  contest_details: string | null;
  starts_at: string | null;
  contestant_starting_requirement: number | string | null;
  contest_length_hours: number | string | null;
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
        subject: `New contest published: ${recipient.contest_title}`,
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
    console.warn("[send-contest-publish-emails] resend rate limited; retrying", {
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
const FG = `#ddd5bc`;
const DIM = `#686850`;
const LIME = `#c8ff00`;

function formatContestStartTime(value: string | null) {
  if (!value) return null;
  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) return null;
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
  const contestantRequirement = Math.max(1, Number(recipient.contestant_starting_requirement ?? 1));
  const contestLengthHours = Math.max(1, Number(recipient.contest_length_hours ?? 1));
  const formattedStart = formatContestStartTime(recipient.starts_at);
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://carterscasino.app").replace(/\/+$/, "");
  const joinUrl = `${appBaseUrl}/#/contests?contest=${encodeURIComponent(contestId)}`;

  const logoMark = `<span style="font-family:'JetBrains Mono','Courier New',monospace;font-size:16px;font-weight:800;color:#c8ff00;margin-right:8px;">&#9632;</span>`;

  const startLabel = formattedStart ? "STARTS" : "STARTS WHEN";
  const startValue = formattedStart
    ? formattedStart
    : `${contestantRequirement} player${contestantRequirement === 1 ? "" : "s"} join`;

  const bodyCopy = formattedStart
    ? `hey ${firstName} — a new contest is scheduled. get in before it starts.`
    : `hey ${firstName} — a new contest is waiting. it starts as soon as ${contestantRequirement} player${contestantRequirement === 1 ? "" : "s"} join.`;

  const detailsRow = recipient.contest_details?.trim()
    ? `<tr>
        <td style="padding:0 0 36px;">
          <p style="margin:0 0 6px;font-family:${MONO};font-size:9px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">DETAILS</p>
          <div style="padding:14px 16px;border-left:2px solid rgba(200,255,0,0.25);">
            <p style="margin:0;font-family:${MONO};font-size:12px;color:${FG};line-height:1.7;opacity:0.82;">${recipient.contest_details.trim()}</p>
          </div>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${recipient.contest_title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap">
  <style>
    body, .body { margin:0; padding:0; background-color:#0a0a09 !important; }
    a { color:inherit; }
    .email-bg { background-color:#0a0a09 !important; }
    u + .body .email-bg { background-color:#0a0a09 !important; }
    u + .body .email-bg td { background-color:#0a0a09 !important; }
    u + .body .email-bg table { background-color:#0a0a09 !important; }
    #MessageViewBody .email-bg { background-color:#0a0a09 !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background-color:#0a0a09;">
  <div class="email-bg" style="background-color:#0a0a09;margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a09" style="background-color:#0a0a09;">
    <tr>
      <td align="center" bgcolor="#0a0a09" style="padding:28px 20px 40px;background-color:#0a0a09;">
        <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0" bgcolor="#0a0a09">

          <!-- TOP BAR -->
          <tr>
            <td bgcolor="#0a0a09" style="padding:0 0 20px;border-bottom:1px solid rgba(200,255,0,0.15);background-color:#0a0a09;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#0a0a09" style="vertical-align:middle;white-space:nowrap;background-color:#0a0a09;">
                    ${logoMark}<span style="font-family:'JetBrains Mono','Courier New',monospace;font-size:11px;font-weight:700;color:#c8ff00;letter-spacing:0.12em;text-transform:uppercase;">CARTER'S CASINO</span>
                  </td>
                  <td bgcolor="#0a0a09" align="right" style="vertical-align:middle;white-space:nowrap;background-color:#0a0a09;">
                    <span style="font-family:'JetBrains Mono','Courier New',monospace;font-size:10px;font-weight:700;color:#686850;letter-spacing:0.14em;text-transform:uppercase;">NEW CONTEST</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTEST TITLE -->
          <tr>
            <td bgcolor="#0a0a09" style="padding:28px 0 36px;background-color:#0a0a09;">
              <div style="margin:0;font-family:'Arial Black','Arial Bold',Arial,sans-serif;font-size:36px;font-weight:900;color:#ddd5bc;line-height:1.1;">${recipient.contest_title}</div>
            </td>
          </tr>

          <!-- START / DURATION -->
          <tr>
            <td bgcolor="#0a0a09" style="padding:0 0 36px;background-color:#0a0a09;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#0a0a09" style="padding-right:40px;background-color:#0a0a09;">
                    <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;color:#686850;text-transform:uppercase;letter-spacing:0.16em;">${startLabel}</p>
                    <p style="margin:0;font-family:${MONO};font-size:16px;font-weight:700;color:#ddd5bc;">${startValue}</p>
                  </td>
                  <td bgcolor="#0a0a09" style="background-color:#0a0a09;">
                    <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;color:#686850;text-transform:uppercase;letter-spacing:0.16em;">RUNS FOR</p>
                    <p style="margin:0;font-family:${MONO};font-size:16px;font-weight:700;color:#ddd5bc;">${contestLengthHours}h</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DETAILS (optional) -->
          ${detailsRow}

          <!-- BODY COPY -->
          <tr>
            <td bgcolor="#0a0a09" style="padding:0 0 32px;background-color:#0a0a09;">
              <p style="margin:0;font-family:${MONO};font-size:12px;color:#686850;line-height:1.75;">${bodyCopy}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td bgcolor="#0a0a09" style="padding:0 0 40px;background-color:#0a0a09;">
              <a href="${joinUrl}" style="display:block;padding:16px 24px;background:#c8ff00;color:#0a0a09;font-family:${MONO};font-size:12px;font-weight:800;letter-spacing:0.16em;text-decoration:none;text-transform:uppercase;text-align:center;">VIEW CONTEST &#8594;</a>
            </td>
          </tr>

          <!-- FOOTER BAR -->
          <tr>
            <td bgcolor="#0a0a09" style="border-top:1px solid rgba(104,104,80,0.2);padding:16px 0 0;background-color:#0a0a09;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a09">
                <tr>
                  <td bgcolor="#0a0a09" style="background-color:#0a0a09;"><p style="margin:0;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.1em;"><a href="${appBaseUrl}" style="color:#c8ff00;text-decoration:none;text-transform:uppercase;">CARTERSCASINO.APP</a></p></td>
                </tr>
                <tr>
                  <td bgcolor="#0a0a09" style="padding:10px 0 0;background-color:#0a0a09;">
                    <p style="margin:0;font-family:${MONO};font-size:10px;color:rgba(104,104,80,0.5);line-height:1.6;">to stop receiving contest emails, open the app &rsaquo; contests &rsaquo; notifications</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  </div>
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

    const { error: seedError } = await supabase.rpc("seed_contest_publish_notifications", {
      _contest_id: contestId
    });
    if (seedError) throw seedError;

    const { data, error } = await supabase.rpc("get_contest_publish_email_recipients", {
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
        console.error("[send-contest-publish-emails] resend error", {
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
        .from("contest_publish_notifications")
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
    console.error("[send-contest-publish-emails] fatal", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
