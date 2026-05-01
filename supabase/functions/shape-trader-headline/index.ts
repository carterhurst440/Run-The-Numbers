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

    const prompt = `${moveDescription} Write one short, punchy, whimsical or absurd commentary line about this market move as if announcing it to traders on the floor. Be specific to the shape or shapes involved (Square, Triangle, Circle are the assets). One sentence only. No quotes around it.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
        temperature: 1.1
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
