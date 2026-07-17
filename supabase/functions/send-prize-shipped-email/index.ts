import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const MONO = `'JetBrains Mono', 'Courier New', monospace`;
const FG = `#0a0a09`;
const DIM = `#888878`;

function buildShippedEmailHtml(opts: {
  firstName: string;
  prizeName: string;
  quantity: number;
  shippingAddress: string;
  appBaseUrl: string;
}) {
  const { firstName, prizeName, quantity, shippingAddress, appBaseUrl } = opts;
  const logoMark = `<span style="font-family:${MONO};font-size:15px;font-weight:800;color:#0a0a09;margin-right:8px;">&#9632;</span>`;
  const qtyLabel = quantity && quantity > 1 ? `${quantity} × ` : "";
  const addressBlock = shippingAddress
    ? `<div style="margin:0 0 28px;">
        <p style="margin:0 0 6px;font-family:${MONO};font-size:9px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">SHIPPING TO</p>
        <div style="padding:14px 16px;border-left:2px solid #e0e0d8;">
          <p style="margin:0;font-family:${MONO};font-size:12px;color:${FG};line-height:1.7;white-space:pre-line;">${shippingAddress}</p>
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your item has shipped</title>
  <style> body { margin:0; padding:0; background-color:#ffffff; } a { color:inherit; } </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;">
    <tr>
      <td align="center" bgcolor="#ffffff" style="padding:0;background-color:#ffffff;">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0" bgcolor="#ffffff">

          <tr>
            <td bgcolor="#c8ff00" style="padding:14px 24px;background-color:#c8ff00;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    ${logoMark}<span style="font-family:${MONO};font-size:11px;font-weight:700;color:#0a0a09;letter-spacing:0.12em;text-transform:uppercase;">CARTER'S CASINO</span>
                  </td>
                  <td align="right" style="vertical-align:middle;white-space:nowrap;">
                    <span style="font-family:${MONO};font-size:10px;font-weight:700;color:#0a0a09;letter-spacing:0.14em;text-transform:uppercase;">SHIPPED</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:32px 24px 0;background-color:#ffffff;">

              <div style="margin:0 0 8px;font-family:${MONO};font-size:10px;font-weight:700;color:${DIM};letter-spacing:0.18em;text-transform:uppercase;">&#127881; CONGRATULATIONS ${firstName}</div>
              <div style="margin:0 0 24px;font-family:'Arial Black','Arial Bold',Arial,sans-serif;font-size:34px;font-weight:900;color:#0a0a09;line-height:1.1;">YOUR ITEM HAS SHIPPED</div>

              <div style="margin:0 0 28px;padding:20px 24px;background-color:#f5f5f0;">
                <p style="margin:0 0 4px;font-family:${MONO};font-size:9px;font-weight:700;color:${DIM};text-transform:uppercase;letter-spacing:0.16em;">YOUR PRIZE</p>
                <p style="margin:0;font-family:${MONO};font-size:16px;font-weight:700;color:${FG};">${qtyLabel}${prizeName}</p>
              </div>

              ${addressBlock}

              <p style="margin:0 0 28px;font-family:${MONO};font-size:12px;color:${DIM};line-height:1.75;">your prize is officially on its way. we&rsquo;ll be in touch if we need anything else &mdash; otherwise, keep an eye on your mailbox. thanks for playing at carter&rsquo;s casino.</p>

              <div style="margin:0 0 32px;">
                <a href="${appBaseUrl}" style="display:block;padding:16px 24px;background-color:#c8ff00;color:#0a0a09;font-family:${MONO};font-size:12px;font-weight:800;letter-spacing:0.16em;text-decoration:none;text-transform:uppercase;text-align:center;">BACK TO THE CASINO &#8594;</a>
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e8e0;">
                <tr>
                  <td style="padding:16px 0 24px;">
                    <p style="margin:0 0 4px;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.1em;"><a href="${appBaseUrl}" style="color:#0a0a09;text-decoration:none;text-transform:uppercase;">CARTERSCASINO.APP</a></p>
                    <p style="margin:0;font-family:${MONO};font-size:10px;color:${DIM};line-height:1.6;">you are receiving this because you redeemed a prize in the app.</p>
                  </td>
                </tr>
              </table>

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
    const emailFrom = Deno.env.get("PRIZE_EMAIL_FROM") || Deno.env.get("CONTEST_EMAIL_FROM");
    const adminEmail = (Deno.env.get("ADMIN_EMAIL") || "carterwarrenhurst@gmail.com").toLowerCase();
    const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://carterscasino.app").replace(/\/+$/, "");

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !emailFrom) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, or PRIZE_EMAIL_FROM/CONTEST_EMAIL_FROM.");
    }

    // Verify the caller is the admin.
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const callerEmail = (userData?.user?.email || "").toLowerCase();
    if (userError || callerEmail !== adminEmail) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { purchaseId } = await request.json();
    if (!purchaseId) {
      throw new Error("purchaseId is required.");
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from("prize_purchases")
      .select("id, user_id, contact_email, quantity, shipping_address, status, prizes(name)")
      .eq("id", purchaseId)
      .maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!purchase) throw new Error("Purchase not found.");

    const to = (purchase.contact_email || "").trim();
    if (!to) {
      return new Response(JSON.stringify({ sent: 0, reason: "no-contact-email" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let firstName = "there";
    if (purchase.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", purchase.user_id)
        .maybeSingle();
      firstName = (profile?.first_name || "there").trim() || "there";
    }

    const prizeRel = purchase.prizes as { name: string | null } | { name: string | null }[] | null;
    const prizeName = (Array.isArray(prizeRel) ? prizeRel[0]?.name : prizeRel?.name) || "your prize";
    const quantity = Math.max(1, Number(purchase.quantity ?? 1));
    const shippingAddress = (purchase.shipping_address || "").trim();

    const html = buildShippedEmailHtml({ firstName, prizeName: prizeName.trim(), quantity, shippingAddress, appBaseUrl });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom, to, subject: `Your prize has shipped: ${prizeName.trim()}`, html })
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("[send-prize-shipped-email] resend error", { status: resendResponse.status, errorText });
      return new Response(JSON.stringify({ sent: 0, error: errorText }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ sent: 1 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[send-prize-shipped-email] fatal", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
