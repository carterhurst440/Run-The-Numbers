const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type AssistantMessage = {
  role?: string;
  content?: string;
};

type BetCatalogEntry = {
  key: string;
  type?: string;
  label?: string;
  payout?: number | null;
  metadata?: Record<string, unknown>;
};

type AssistantState = {
  bankroll?: number;
  carterCash?: number;
  riskTolerance?: string;
  activePaytable?: {
    id?: string;
    name?: string;
    steps?: number[];
  };
  accountMode?: {
    label?: string;
    contest?: {
      id?: string;
      title?: string;
    } | null;
  };
  betting?: {
    canPlaceBets?: boolean;
    dealing?: boolean;
    outstandingUnits?: number;
    availableUnits?: number;
    totalExposureUnits?: number;
    currentBets?: Array<{
      key?: string;
      label?: string;
      units?: number;
      type?: string;
    }>;
  };
  stats?: {
    hands?: number;
    wagered?: number;
    paid?: number;
  };
  rulesSummary?: string;
  betCatalog?: BetCatalogEntry[];
};

type DraftBetPlanArgs = {
  summary?: string;
  risk_tolerance?: string;
  replace_existing?: boolean;
  bankroll_fraction?: number;
  follow_user_directive?: boolean;
  bets?: Array<{
    key?: string;
    units?: number;
  }>;
};

const DEFAULT_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

const SYSTEM_PROMPT = `
You are the Run the Numbers PLAY assistant.

Responsibilities:
- Explain the game's rules clearly and accurately.
- Give beginner-friendly strategy guidance.
- Use bankroll-aware bet sizing.
- Respect the player's requested or inferred risk tolerance: cautious, balanced, or aggressive.
- You may draft a bet layout, but you must never imply that you started a hand.
- If the user asks for specific bets or asks you to place/set bets, use the draft_bet_plan tool so the client can ask for consent.
- If the user gives an explicit betting directive, prioritize executing that directive exactly.
- For explicit directives, do not argue with the choice or substitute a "safer" recommendation. Only mention blockers if the request is impossible, and otherwise keep the reply to a concise confirmation plus a request for consent.

Game facts:
- The deck has 53 cards.
- Ace and number cards 2 through 10 keep the hand alive.
- Any Jack, Queen, King, or the Joker ends the hand immediately.
- Number bets can hit repeatedly before the stopper arrives.
- Specific-card bets win only on the exact card.
- Card-count bets include the final bust card.
- Beginner advice should usually focus on a small number of number bets rather than spreading chips too widely.

Bankroll guidance:
- Cautious beginners usually risk about 2% of bankroll on one hand.
- Balanced beginners usually risk about 4% of bankroll on one hand.
- Aggressive beginners usually risk about 7% of bankroll on one hand.
- Keep bet sizes in multiples of 5 units.

Behavior:
- Use get_table_context whenever rules, bankroll, table state, or current wagers matter.
- Ask at most one focused follow-up when necessary.
- Keep answers concise, practical, and confident.
- If risk tolerance is unknown and the player asks for strategy, you may provide a balanced default while inviting them to say cautious, balanced, or aggressive.
`.trim();

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRiskTolerance(value: unknown) {
  const risk = String(value || "").trim().toLowerCase();
  if (risk === "cautious" || risk === "balanced" || risk === "aggressive") {
    return risk;
  }
  return "balanced";
}

function clampToChipUnits(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(5, Math.floor(value / 5) * 5);
}

function normalizeBetPhrase(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUnits(value: unknown) {
  const raw = String(value || "").trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!raw) return NaN;
  const match = raw.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return NaN;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return NaN;
  const multiplier = match[2] === "m" ? 1000000 : match[2] === "k" ? 1000 : 1;
  return Math.round(base * multiplier);
}

function getRiskFraction(risk: string) {
  if (risk === "cautious") return 0.02;
  if (risk === "aggressive") return 0.07;
  return 0.04;
}

function resolveBetTarget(targetText: unknown, state: AssistantState) {
  const normalized = normalizeBetPhrase(targetText);
  const catalog = state.betCatalog || [];
  if (!normalized || !catalog.length) {
    return null;
  }

  for (const entry of catalog) {
    if (normalizeBetPhrase(entry.label || entry.key) === normalized) {
      return entry;
    }
  }

  const countPatterns = [
    { pattern: /\b(?:1|one)\s+card\b/, key: "count-1" },
    { pattern: /\b(?:2|two)\s+cards?\b/, key: "count-2" },
    { pattern: /\b(?:3|three)\s+cards?\b/, key: "count-3" },
    { pattern: /\b(?:4|four)\s+cards?\b/, key: "count-4" },
    { pattern: /\b(?:5|five)\s+cards?\b/, key: "count-5" },
    { pattern: /\b(?:6|six)\s+cards?\b/, key: "count-6" },
    { pattern: /\b(?:7|seven)\s+cards?\b/, key: "count-7" },
    {
      pattern:
        /\b(?:8|eight)\s*(?:plus|or more)\s*cards?\b|\b(?:8|eight)\s+cards?\s+(?:or more|plus)\b|\bat least\s+(?:8|eight)\s+cards?\b|\bover\s+7\s+cards?\b/,
      key: "count-8"
    }
  ];
  for (const { pattern, key } of countPatterns) {
    if (pattern.test(normalized)) {
      return catalog.find((entry) => entry.key === key) || null;
    }
  }

  const numberMatch = normalized.match(/\b(?:number\s+)?(ace|a|[2-9]|10)\b/);
  if (numberMatch) {
    const rank = numberMatch[1] === "ace" || numberMatch[1] === "a" ? "A" : numberMatch[1];
    return catalog.find((entry) => entry.key === `number-${rank}`) || null;
  }

  const specificCardMatch = normalized.match(
    /\b(ace|a|[2-9]|10|jack|queen|king)\s+of\s+(hearts|diamonds|clubs|spades)\b/
  );
  if (specificCardMatch) {
    const rawRank = specificCardMatch[1];
    const suitName = specificCardMatch[2];
    const rank =
      rawRank === "ace" || rawRank === "a"
        ? "A"
        : rawRank === "jack"
          ? "J"
          : rawRank === "queen"
            ? "Q"
            : rawRank === "king"
              ? "K"
              : rawRank;
    const suitMap: Record<string, string> = {
      hearts: "♥",
      diamonds: "♦",
      clubs: "♣",
      spades: "♠"
    };
    return catalog.find((entry) => entry.key === `card-${rank}${suitMap[suitName]}`) || null;
  }

  const bustSuitMatch = normalized.match(/\b(?:bust|stop(?:per)?|end)\s+(?:on\s+)?(hearts|diamonds|clubs|spades)\b/);
  if (bustSuitMatch) {
    return catalog.find((entry) => entry.key === `bust-${bustSuitMatch[1]}`) || null;
  }

  const bustRankMatch = normalized.match(/\b(?:bust|stop(?:per)?|end)\s+(jack|queen|king|joker)\b/);
  if (bustRankMatch) {
    const face = bustRankMatch[1];
    return catalog.find((entry) => entry.key === (face === "joker" ? "bust-joker" : `bust-${face}`)) || null;
  }

  if (/\b(?:8plus|8 plus)\s*cards?\b/.test(normalized)) {
    return catalog.find((entry) => entry.key === "count-8") || null;
  }

  return null;
}

function parseExplicitBetDirective(message: string, state: AssistantState) {
  const commandMatch = String(message || "").trim().match(
    /(?:^|\b)(?:play|place|bet|put|set|drop|stage)\s+\$?([\d,.]+(?:\.\d+)?\s*[km]?)\s*(?:units?)?\s+(?:on\s+)?(.+)$/i
  );
  if (!commandMatch) {
    return null;
  }

  const requestedUnits = parseUnits(commandMatch[1]);
  const targetText = String(commandMatch[2] || "")
    .replace(/\s+(?:please|pls|for me|thanks?)\s*$/i, "")
    .trim();
  const bet = resolveBetTarget(targetText, state);
  const availableUnits = Math.max(0, safeNumber(state.betting?.availableUnits, state.bankroll));

  return {
    requestedUnits,
    targetText,
    bet,
    availableUnits
  };
}

function sanitizeState(input: unknown): AssistantState {
  const raw = input && typeof input === "object" ? (input as AssistantState) : {};
  return {
    bankroll: Math.max(0, Math.round(safeNumber(raw.bankroll))),
    carterCash: Math.max(0, Math.round(safeNumber(raw.carterCash))),
    riskTolerance: normalizeRiskTolerance(raw.riskTolerance),
    activePaytable: {
      id: raw.activePaytable?.id || "paytable-1",
      name: raw.activePaytable?.name || "Paytable 1",
      steps: Array.isArray(raw.activePaytable?.steps)
        ? raw.activePaytable?.steps.map((step) => Math.max(0, Math.round(safeNumber(step))))
        : [3, 4, 15, 50]
    },
    accountMode: {
      label: raw.accountMode?.label || "Normal Mode",
      contest: raw.accountMode?.contest
        ? {
            id: raw.accountMode.contest.id || "",
            title: raw.accountMode.contest.title || "Contest Mode"
          }
        : null
    },
    betting: {
      canPlaceBets: Boolean(raw.betting?.canPlaceBets),
      dealing: Boolean(raw.betting?.dealing),
      outstandingUnits: Math.max(0, Math.round(safeNumber(raw.betting?.outstandingUnits))),
      availableUnits: Math.max(0, Math.round(safeNumber(raw.betting?.availableUnits))),
      totalExposureUnits: Math.max(0, Math.round(safeNumber(raw.betting?.totalExposureUnits))),
      currentBets: Array.isArray(raw.betting?.currentBets)
        ? raw.betting.currentBets.map((bet) => ({
            key: String(bet?.key || ""),
            label: String(bet?.label || bet?.key || ""),
            units: Math.max(0, Math.round(safeNumber(bet?.units))),
            type: String(bet?.type || "")
          }))
        : []
    },
    stats: {
      hands: Math.max(0, Math.round(safeNumber(raw.stats?.hands))),
      wagered: Math.max(0, Math.round(safeNumber(raw.stats?.wagered))),
      paid: Math.max(0, Math.round(safeNumber(raw.stats?.paid)))
    },
    rulesSummary: String(raw.rulesSummary || ""),
    betCatalog: Array.isArray(raw.betCatalog)
      ? raw.betCatalog.map((entry) => ({
          key: String(entry?.key || ""),
          type: String(entry?.type || ""),
          label: String(entry?.label || entry?.key || ""),
          payout: entry?.payout == null ? null : safeNumber(entry.payout),
          metadata: entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
        }))
      : []
  };
}

function buildDefaultBets(state: AssistantState, risk: string) {
  const catalogMap = new Map((state.betCatalog || []).map((entry) => [entry.key, entry]));
  const exposures = Math.max(0, safeNumber(state.betting?.totalExposureUnits));
  const bankrollBudget = clampToChipUnits(exposures * getRiskFraction(risk));
  const fallbackBudget = bankrollBudget || 10;
  const focus =
    risk === "cautious"
      ? ["number-A", "number-7"]
      : risk === "aggressive"
        ? ["number-A", "number-7", "count-4"]
        : ["number-A", "number-7", "number-8"];
  const unitsPerBet = clampToChipUnits(fallbackBudget / focus.length);

  return focus
    .map((key) => {
      const entry = catalogMap.get(key);
      if (!entry) return null;
      return {
        key,
        units: unitsPerBet || 5
      };
    })
    .filter(Boolean) as Array<{ key: string; units: number }>;
}

function draftBetPlan(args: DraftBetPlanArgs, state: AssistantState) {
  const risk = normalizeRiskTolerance(args.risk_tolerance || state.riskTolerance);
  const exposure = Math.max(0, safeNumber(state.betting?.totalExposureUnits));
  const availableUnits = Math.max(0, safeNumber(state.betting?.availableUnits, exposure));
  const followDirective = Boolean(args.follow_user_directive);
  const requestedFraction = safeNumber(args.bankroll_fraction, getRiskFraction(risk));
  const safeFraction = Math.min(Math.max(requestedFraction, 0.01), 0.12);
  const maxBudget = clampToChipUnits(exposure * safeFraction);
  const catalogMap = new Map((state.betCatalog || []).map((entry) => [entry.key, entry]));
  const sourceBets =
    Array.isArray(args.bets) && args.bets.length ? args.bets : buildDefaultBets(state, risk);

  const cleanedBets = sourceBets
    .map((bet) => {
      const rawKey = String(bet?.key || "").trim();
      const catalogEntry = catalogMap.get(rawKey) || resolveBetTarget(rawKey, state);
      const units = clampToChipUnits(safeNumber(bet?.units));
      if (!catalogEntry || units <= 0) {
        return null;
      }
      return {
        key: catalogEntry.key,
        label: catalogEntry.label || catalogEntry.key,
        units
      };
    })
    .filter(Boolean) as Array<{ key: string; label: string; units: number }>;

  if (!cleanedBets.length) {
    return {
      summary: followDirective
        ? "I could not match that directive to a valid bet on the table."
        : "No valid bet plan could be drafted from the current request.",
      replaceExisting: true,
      bets: [],
      totalUnits: 0,
      riskTolerance: risk
    };
  }

  let totalUnits = cleanedBets.reduce((sum, bet) => sum + bet.units, 0);
  if (followDirective && totalUnits > availableUnits) {
    return {
      summary: `That directive needs ${totalUnits} units, but only ${availableUnits} are currently available.`,
      replaceExisting: args.replace_existing !== false,
      bets: [],
      totalUnits: 0,
      riskTolerance: risk
    };
  }

  if (!followDirective && maxBudget > 0 && totalUnits > maxBudget) {
    const scale = maxBudget / totalUnits;
    cleanedBets.forEach((bet) => {
      bet.units = Math.max(5, clampToChipUnits(bet.units * scale));
    });
    totalUnits = cleanedBets.reduce((sum, bet) => sum + bet.units, 0);
  }

  return {
    summary:
      String(args.summary || "").trim() ||
      (followDirective
        ? "Direct instruction captured. Confirm and I will stage this exact layout on the felt."
        : `${risk[0].toUpperCase()}${risk.slice(1)} layout sized for about ${Math.round(
            safeFraction * 100
          )}% of bankroll.`),
    replaceExisting: args.replace_existing !== false,
    bets: cleanedBets,
    totalUnits,
    riskTolerance: risk
  };
}

function getTableContext(state: AssistantState) {
  return {
    bankroll: state.bankroll,
    carterCash: state.carterCash,
    riskTolerance: state.riskTolerance,
    accountMode: state.accountMode?.label || "Normal Mode",
    paytable: state.activePaytable,
    betting: state.betting,
    stats: state.stats,
    rulesSummary: state.rulesSummary,
    betCatalog: state.betCatalog
  };
}

function buildResponsesInput(messages: AssistantMessage[], latestMessage: string) {
  const history = Array.isArray(messages) ? messages.slice(-8) : [];
  const transcript = history
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const content = String(message.content || "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");

  if (!transcript) {
    return latestMessage;
  }

  return `${transcript}\nUser: ${latestMessage}`;
}

async function callResponsesApi(body: Record<string, unknown>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json();
}

function extractOutputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const textParts: string[] = [];
  output.forEach((item) => {
    if (item && typeof item === "object" && item.type === "message" && Array.isArray(item.content)) {
      item.content.forEach((contentItem: Record<string, unknown>) => {
        if (typeof contentItem?.text === "string") {
          textParts.push(contentItem.text);
        }
      });
    }
  });
  return textParts.join("\n").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const latestMessage = String(body?.message || "").trim();
    if (!latestMessage) {
      throw new Error("message is required.");
    }

    const state = sanitizeState(body?.state);
    const messages = Array.isArray(body?.messages) ? (body.messages as AssistantMessage[]) : [];
    console.info("[play-assistant] request", {
      latestMessage,
      priorMessageCount: messages.length,
      bankroll: state.bankroll,
      riskTolerance: state.riskTolerance,
      dealing: state.betting?.dealing ?? false,
      currentBetCount: state.betting?.currentBets?.length ?? 0
    });

    const explicitDirective = parseExplicitBetDirective(latestMessage, state);
    if (explicitDirective) {
      const { requestedUnits, targetText, bet, availableUnits } = explicitDirective;
      console.info("[play-assistant] explicit directive parse", explicitDirective);

      if (!bet) {
        return new Response(
          JSON.stringify({
            reply: `I couldn't map "${targetText}" to a live bet yet. Try a phrasing like "8+ cards", "Bust Hearts", "Ace", or "Ace of Spades", and I'll stage it.`,
            riskTolerance: state.riskTolerance,
            plan: null
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) {
        return new Response(
          JSON.stringify({
            reply: `I understood the bet target as ${bet.label}, but I couldn't read the wager amount. Try something like "place 500 on ${bet.label}".`,
            riskTolerance: state.riskTolerance,
            plan: null
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      if (requestedUnits % 5 !== 0) {
        return new Response(
          JSON.stringify({
            reply: `I understood that as ${bet.label}, but wagers need to be in multiples of 5 units. Want me to round ${requestedUnits} to the nearest valid amount?`,
            riskTolerance: state.riskTolerance,
            plan: null
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      if (requestedUnits > availableUnits) {
        return new Response(
          JSON.stringify({
            reply: `I can't place ${requestedUnits} units on ${bet.label} because only ${availableUnits} units are available right now.`,
            riskTolerance: state.riskTolerance,
            plan: null
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      const directPlan = draftBetPlan(
        {
          summary: "Direct instruction captured. Confirm and I will stage this exact layout on the felt.",
          follow_user_directive: true,
          replace_existing: true,
          bets: [{ key: bet.key, units: requestedUnits }]
        },
        state
      );

      return new Response(
        JSON.stringify({
          reply: `Understood. I drafted exactly ${requestedUnits} units on ${bet.label}. Confirm if you want me to place it on the felt.`,
          riskTolerance: directPlan.riskTolerance || state.riskTolerance,
          plan: directPlan
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    const input = buildResponsesInput(messages, latestMessage);
    const tools = [
      {
        type: "function",
        name: "get_table_context",
        description: "Read the current bankroll, rules, paytable, and live betting context for the player.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "draft_bet_plan",
        description: "Create a consent-gated betting layout in multiples of 5 units that the client can place on the felt.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            risk_tolerance: {
              type: "string",
              enum: ["cautious", "balanced", "aggressive"]
            },
            replace_existing: { type: "boolean" },
            bankroll_fraction: { type: "number" },
            follow_user_directive: { type: "boolean" },
            bets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  units: { type: "number" }
                },
                required: ["key", "units"],
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      }
    ];

    let draftedPlan: ReturnType<typeof draftBetPlan> | null = null;
    let response = await callResponsesApi({
      model: DEFAULT_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      tools
    });
    console.info("[play-assistant] initial response", {
      responseId: response?.id ?? null,
      outputCount: Array.isArray(response?.output) ? response.output.length : 0
    });

    for (let attempts = 0; attempts < 4; attempts += 1) {
      const output = Array.isArray(response.output) ? response.output : [];
      const functionCalls = output.filter(
        (item: Record<string, unknown>) => item?.type === "function_call"
      );
      console.info("[play-assistant] tool pass", {
        pass: attempts + 1,
        responseId: response?.id ?? null,
        functionCallCount: functionCalls.length,
        functionNames: functionCalls.map((item: Record<string, unknown>) => String(item?.name || ""))
      });

      if (!functionCalls.length) {
        break;
      }

      const toolOutputs = functionCalls.map((call: Record<string, unknown>) => {
        const name = String(call.name || "");
        let args: Record<string, unknown> = {};
        try {
          args = call.arguments ? JSON.parse(String(call.arguments)) : {};
        } catch {
          args = {};
        }
        console.info("[play-assistant] tool call", {
          name,
          callId: String(call.call_id || ""),
          args
        });
        let result: Record<string, unknown>;

        if (name === "get_table_context") {
          result = getTableContext(state);
        } else if (name === "draft_bet_plan") {
          draftedPlan = draftBetPlan(args as DraftBetPlanArgs, state);
          result = draftedPlan;
        } else {
          result = { error: `Unknown tool: ${name}` };
        }
        console.info("[play-assistant] tool result", {
          name,
          callId: String(call.call_id || ""),
          result
        });

        return {
          type: "function_call_output",
          call_id: String(call.call_id || ""),
          output: JSON.stringify(result)
        };
      });

      response = await callResponsesApi({
        model: DEFAULT_MODEL,
        instructions: SYSTEM_PROMPT,
        previous_response_id: response.id,
        input: toolOutputs,
        tools
      });
      console.info("[play-assistant] follow-up response", {
        pass: attempts + 1,
        responseId: response?.id ?? null,
        outputCount: Array.isArray(response?.output) ? response.output.length : 0
      });
    }

    const reply = extractOutputText(response) || "I can help with the rules, bankroll sizing, and a starter betting layout if you want one.";
    console.info("[play-assistant] final payload", {
      responseId: response?.id ?? null,
      reply,
      draftedPlan
    });
    return new Response(
      JSON.stringify({
        reply,
        riskTolerance: draftedPlan?.riskTolerance || state.riskTolerance,
        plan: draftedPlan
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("[play-assistant] fatal", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
