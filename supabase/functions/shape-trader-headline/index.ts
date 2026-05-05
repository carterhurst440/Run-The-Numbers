const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { assetLabel, kind, percentage } = body;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY.");
    }

    const direction = Number(percentage || 0) >= 0 ? "up" : "down";
    const pct = Math.abs(Number(percentage || 0)).toFixed(1);

    let moveDescription: string;
    if (kind === "macro") {
      moveDescription = `A macro event just moved the entire market ${direction} ${pct}%.`;
    } else {
      moveDescription = `${assetLabel} just moved ${direction} ${pct}%.`;
    }

    const prompt = `${moveDescription} Write exactly one sentence of punchy, absurd trading floor commentary. Max 12 words. No quotes. No period at the end unless it's a complete sentence. Examples: "Triangle longs are not having a good afternoon" or "Someone at the Square desk is very popular right now".`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 40,
        temperature: 0.95
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const headline = data.choices?.[0]?.message?.content?.trim() || moveDescription;

    return new Response(JSON.stringify({ headline }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
