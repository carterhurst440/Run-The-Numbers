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

function formatContestStartTime(value: string | null) {
  if (!value) {
    return null;
  }

  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) {
    return null;
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
  const contestantRequirement = Math.max(1, Number(recipient.contestant_starting_requirement ?? 1));
  const contestLengthHours = Math.max(1, Number(recipient.contest_length_hours ?? 1));
  const formattedStart = formatContestStartTime(recipient.starts_at);
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://carterscasino.app").replace(/\/+$/, "");
  const joinUrl = `${appBaseUrl}/#/contests?contest=${encodeURIComponent(contestId)}`;
  const introCopy = formattedStart
    ? `Hi ${firstName}, a new Run The Numbers contest has been published and is scheduled to begin ${formattedStart}. It will run for ${contestLengthHours} hour${contestLengthHours === 1 ? "" : "s"}.`
    : `Hi ${firstName}, a new Run The Numbers contest has been published. This one will stay in a pending state until ${contestantRequirement} contestants have joined, then it will start immediately and run for ${contestLengthHours} hour${contestLengthHours === 1 ? "" : "s"}.`;

  return `
    <div style="font-family: Arial, sans-serif; background: #071632; color: #ecf7ff; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #0b1d45; border: 1px solid rgba(63,240,255,0.2); border-radius: 16px; padding: 28px;">
        <p style="margin: 0 0 8px; color: #37f0ff; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;">Contest Alert</p>
        <h1 style="margin: 0 0 16px; font-size: 28px;">${recipient.contest_title} is open for entry</h1>
        <p style="margin: 0 0 18px; font-size: 16px; line-height: 1.6;">${introCopy}</p>
        ${recipient.contest_details?.trim()
          ? `<p style="margin: 0 0 18px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,0.04); color: rgba(236,247,255,0.88); font-size: 14px; line-height: 1.6;">${recipient.contest_details.trim()}</p>`
          : ""}
        <div style="margin: 0 0 18px;">
          <a href="${joinUrl}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: linear-gradient(135deg, #3ff0ff, #7f8dff); color: #03111f; font-size: 14px; font-weight: 700; letter-spacing: 0.14em; text-decoration: none; text-transform: uppercase;">View Contest</a>
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
