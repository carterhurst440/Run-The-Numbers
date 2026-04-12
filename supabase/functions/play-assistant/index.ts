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
  payoutDisplay?: string | null;
  metadata?: Record<string, unknown>;
};

type GameReference = {
  deck?: {
    totalCards?: number;
    liveCards?: number;
    stopperCards?: number;
  };
  activePaytable?: {
    id?: string;
    name?: string;
    steps?: number[];
    numberBetHouseEdgePercent?: number | null;
  };
  paytables?: Array<{
    id?: string;
    name?: string;
    steps?: number[];
    numberBetHouseEdgePercent?: number | null;
  }>;
  bets?: Array<{
    key?: string;
    type?: string;
    label?: string;
    payout?: number | null;
    payoutDisplay?: string | null;
    metadata?: Record<string, unknown>;
    houseEdgePercent?: number | null;
    houseEdgeByPaytable?: Array<{
      id?: string;
      name?: string;
      houseEdgePercent?: number | null;
    }>;
  }>;
};

type HandHistorySummary = {
  handCount?: number;
  averageCards?: number;
  averageWager?: number;
  averageReturn?: number;
  averageNet?: number;
  over8CardsCount?: number;
  over8CardsPercent?: number;
  handLengthDistribution?: Record<string, number>;
  stopperBreakdown?: Record<string, number>;
};

type HandHistoryInsights = {
  allTime?: HandHistorySummary | null;
  last100?: HandHistorySummary | null;
  recentHands?: Array<{
    createdAt?: string | null;
    totalCards?: number;
    stopper?: string;
    totalWager?: number;
    totalPaid?: number;
    net?: number;
  }>;
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
  gameReference?: GameReference;
  handHistory?: HandHistoryInsights | null;
};

type DraftBetPlanArgs = {
  summary?: string;
  risk_tolerance?: string;
  replace_existing?: boolean;
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
- Answer the player's question using the game rules and current table context.
- Respect the player's requested or inferred risk tolerance: cautious, balanced, or aggressive.
- You may draft a bet layout, but you must never imply that you started a hand.
- If the user asks for specific bets or asks you to place/set bets, use the draft_bet_plan tool so the client can ask for consent.
- If the user gives an explicit betting directive, prioritize executing that directive exactly.
- For explicit directives, do not argue with the choice or substitute a "safer" recommendation. Only mention blockers if the request is impossible, and otherwise keep the reply to a concise confirmation plus a request for consent.
- If the user intent is operational but the phrasing is a little fuzzy, make a reasonable best guess and draft the layout anyway rather than refusing on the first try. Say what you inferred, then ask for consent.

Game facts:
- The deck has 53 cards.
- Ace and number cards 2 through 10 keep the hand alive.
- Any Jack, Queen, King, or the Joker ends the hand immediately.
- Number bets can hit repeatedly before the stopper arrives.
- Specific-card bets win only on the exact card.
- Suit bets can target whether a suit never appears, appears at least once, or is the very first suit drawn.
- Card-count bets include the final bust card.
- Keep draft_bet_plan wagers as whole-number units.

Behavior:
- Use get_table_context whenever rules, bankroll, table state, or current wagers matter.
- When get_table_context includes RTN payout and house-edge reference data, use it for bet math questions instead of guessing.
- When get_table_context includes player hand-history summaries, use those summaries to answer player-specific trend questions such as average hand length or counts in the last 100 hands.
- If the supplied context is missing the exact figure needed, say what is available and do not invent unsupported house-edge or player-history numbers.
- Ask at most one focused follow-up when necessary.
- Keep answers concise, practical, and confident.
- Do not invent a default playbook or preset betting pattern when the user has not asked for one.
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

function clampToWholeUnits(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value));
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

function normalizeCatalogType(type: unknown) {
  const raw = String(type || "").trim().toLowerCase();
  if (raw === "specific-card") return "card";
  if (raw === "bust-suit" || raw === "bust-rank" || raw === "bust-joker") return "bust";
  if (raw === "suit-pattern") return "suit";
  return raw;
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

function resolveBetTarget(targetText: unknown, state: AssistantState) {
  const normalized = normalizeBetPhrase(targetText);
  const catalog = (state.betCatalog || []).map((entry) => ({ ...entry, type: normalizeCatalogType(entry.type) }));
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

  const suitPatternChecks = [
    { pattern: /\b(?:no|none)\s+(hearts|diamonds|clubs|spades)\b|\b(hearts|diamonds|clubs|spades)\s+(?:none|never)\b/, keyPrefix: "suit-none-" },
    { pattern: /\bany\s+(hearts|diamonds|clubs|spades)\b|\b(hearts|diamonds|clubs|spades)\s+any\b/, keyPrefix: "suit-any-" },
    { pattern: /\bfirst\s+(hearts|diamonds|clubs|spades)\b|\b(hearts|diamonds|clubs|spades)\s+first\b/, keyPrefix: "suit-first-" }
  ];
  for (const { pattern, keyPrefix } of suitPatternChecks) {
    const match = normalized.match(pattern);
    const suitName = match?.[1] || match?.[2];
    if (suitName) {
      return catalog.find((entry) => entry.key === `${keyPrefix}${suitName}`) || null;
    }
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

function resolveBetTargets(targetText: unknown, state: AssistantState) {
  const normalized = normalizeBetPhrase(targetText);
  const catalog = (state.betCatalog || []).map((entry) => ({ ...entry, type: normalizeCatalogType(entry.type) }));
  if (!normalized || !catalog.length) {
    return [];
  }

  const categoryMatchers = [
    {
      pattern: /\b(?:every|all|each)\s+(?:number|rank)\s+bets?\b|\b(?:every|all|each)\s+numbers?\b|\ball\s+ten\s+numbers?\b/,
      filter: (entry: BetCatalogEntry) => entry.type === "number"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:count|card count)\s+bets?\b|\b(?:every|all|each)\s+counts?\b/,
      filter: (entry: BetCatalogEntry) => entry.type === "count"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:specific\s+card|card)\s+bets?\b|\b(?:every|all|each)\s+specific\s+cards?\b/,
      filter: (entry: BetCatalogEntry) => entry.type === "card"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:bust|stopper|end)\s+bets?\b|\b(?:every|all|each)\s+busts?\b/,
      filter: (entry: BetCatalogEntry) => entry.type === "bust"
    },
    {
      pattern: /\b(?:every|all|each)\s+suit\s+bets?\b|\b(?:every|all|each)\s+suits?\b/,
      filter: (entry: BetCatalogEntry) => entry.type === "suit"
    }
  ];

  for (const matcher of categoryMatchers) {
    if (matcher.pattern.test(normalized)) {
      return catalog.filter(matcher.filter);
    }
  }

  const single = resolveBetTarget(targetText, state);
  return single ? [single] : [];
}

function shuffleEntries<T>(entries: T[]) {
  const copy = [...entries];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function parseRandomSpreadDirective(message: string, state: AssistantState) {
  const raw = String(message || "").trim();
  const normalized = normalizeBetPhrase(raw);
  if (!raw || !normalized.includes("random")) {
    return null;
  }
  if (!/\b(?:play|place|bet|put|set|drop|stage|choose|pick)\b/.test(normalized)) {
    return null;
  }

  const countMatch = raw.match(/(?:play|place|bet|put|set|drop|stage|choose|pick)\s+(\d+)/i);
  const perBetMatch = raw.match(/(\d+|one)\s+(?:unit|units|credit|credits)\s+bets?/i);
  const maxPerBetMatch = raw.match(/no more than\s+(\d+|one)\s+(?:unit|units|credit|credits)\s+(?:on|in)\s+any\s+one\s+bet/i);
  const betCount = countMatch ? Math.max(1, Math.round(parseUnits(countMatch[1]) || 0)) : 0;
  const perBetUnits = perBetMatch
    ? Math.max(1, Math.round(parseUnits(perBetMatch[1]) || (String(perBetMatch[1]).toLowerCase() === "one" ? 1 : 0)))
    : 1;
  const maxPerBet = maxPerBetMatch
    ? Math.max(1, Math.round(parseUnits(maxPerBetMatch[1]) || (String(maxPerBetMatch[1]).toLowerCase() === "one" ? 1 : 0)))
    : perBetUnits;

  if (!betCount || !perBetUnits) {
    return null;
  }

  const catalog = Array.isArray(state.betCatalog)
    ? state.betCatalog.map((entry) => ({ ...entry, type: normalizeCatalogType(entry.type) }))
    : [];
  if (!catalog.length) {
    return null;
  }

  let pool = catalog;
  if (/\bnumber\b/.test(normalized)) {
    pool = pool.filter((entry) => entry.type === "number");
  } else if (/\bcount\b/.test(normalized)) {
    pool = pool.filter((entry) => entry.type === "count");
  } else if (/\bbust|stopper|end\b/.test(normalized)) {
    pool = pool.filter((entry) => entry.type === "bust");
  } else if (/\bcard\b/.test(normalized)) {
    pool = pool.filter((entry) => entry.type === "card");
  } else if (/\bsuit\b|\b(?:no|none|any|first)\s+(?:hearts|diamonds|clubs|spades)\b/.test(normalized)) {
    pool = pool.filter((entry) => entry.type === "suit");
  }

  if (!pool.length) {
    return null;
  }

  const availableUnits = Math.max(0, safeNumber(state.betting?.availableUnits, state.bankroll));
  const cappedPerBetUnits = Math.max(1, Math.min(perBetUnits, maxPerBet));
  const affordableCount = Math.max(0, Math.floor(availableUnits / cappedPerBetUnits));
  const selectedCount = Math.min(betCount, pool.length, affordableCount);
  if (!selectedCount) {
    return {
      requestedCount: betCount,
      selectedCount: 0,
      perBetUnits: cappedPerBetUnits,
      availableUnits,
      bets: []
    };
  }

  const bets = shuffleEntries(pool)
    .slice(0, selectedCount)
    .map((entry) => ({
      key: entry.key,
      label: entry.label || entry.key,
      units: cappedPerBetUnits
    }));

  return {
    requestedCount: betCount,
    selectedCount,
    perBetUnits: cappedPerBetUnits,
    availableUnits,
    bets
  };
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
  const bets = resolveBetTargets(targetText, state);
  const availableUnits = Math.max(0, safeNumber(state.betting?.availableUnits, state.bankroll));

  return {
    requestedUnits,
    targetText,
    bets,
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
          payoutDisplay: entry?.payoutDisplay == null ? null : String(entry.payoutDisplay),
          metadata: entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
        }))
      : [],
    gameReference: raw.gameReference && typeof raw.gameReference === "object"
      ? {
          deck: raw.gameReference.deck && typeof raw.gameReference.deck === "object"
            ? {
                totalCards: Math.max(0, Math.round(safeNumber(raw.gameReference.deck.totalCards))),
                liveCards: Math.max(0, Math.round(safeNumber(raw.gameReference.deck.liveCards))),
                stopperCards: Math.max(0, Math.round(safeNumber(raw.gameReference.deck.stopperCards)))
              }
            : undefined,
          activePaytable: raw.gameReference.activePaytable && typeof raw.gameReference.activePaytable === "object"
            ? {
                id: String(raw.gameReference.activePaytable.id || ""),
                name: String(raw.gameReference.activePaytable.name || ""),
                steps: Array.isArray(raw.gameReference.activePaytable.steps)
                  ? raw.gameReference.activePaytable.steps.map((step) => Math.max(0, Math.round(safeNumber(step))))
                  : [],
                numberBetHouseEdgePercent:
                  raw.gameReference.activePaytable.numberBetHouseEdgePercent == null
                    ? null
                    : safeNumber(raw.gameReference.activePaytable.numberBetHouseEdgePercent)
              }
            : undefined,
          paytables: Array.isArray(raw.gameReference.paytables)
            ? raw.gameReference.paytables.map((paytable) => ({
                id: String(paytable?.id || ""),
                name: String(paytable?.name || ""),
                steps: Array.isArray(paytable?.steps)
                  ? paytable.steps.map((step) => Math.max(0, Math.round(safeNumber(step))))
                  : [],
                numberBetHouseEdgePercent:
                  paytable?.numberBetHouseEdgePercent == null ? null : safeNumber(paytable.numberBetHouseEdgePercent)
              }))
            : [],
          bets: Array.isArray(raw.gameReference.bets)
            ? raw.gameReference.bets.map((bet) => ({
                key: String(bet?.key || ""),
                type: String(bet?.type || ""),
                label: String(bet?.label || bet?.key || ""),
                payout: bet?.payout == null ? null : safeNumber(bet.payout),
                payoutDisplay: bet?.payoutDisplay == null ? null : String(bet.payoutDisplay),
                metadata: bet?.metadata && typeof bet.metadata === "object" ? bet.metadata : {},
                houseEdgePercent: bet?.houseEdgePercent == null ? null : safeNumber(bet.houseEdgePercent),
                houseEdgeByPaytable: Array.isArray(bet?.houseEdgeByPaytable)
                  ? bet.houseEdgeByPaytable.map((entry) => ({
                      id: String(entry?.id || ""),
                      name: String(entry?.name || ""),
                      houseEdgePercent: entry?.houseEdgePercent == null ? null : safeNumber(entry.houseEdgePercent)
                    }))
                  : []
              }))
            : []
        }
      : undefined,
    handHistory: raw.handHistory && typeof raw.handHistory === "object"
      ? {
          allTime: raw.handHistory.allTime && typeof raw.handHistory.allTime === "object"
            ? {
                handCount: Math.max(0, Math.round(safeNumber(raw.handHistory.allTime.handCount))),
                averageCards: safeNumber(raw.handHistory.allTime.averageCards),
                averageWager: safeNumber(raw.handHistory.allTime.averageWager),
                averageReturn: safeNumber(raw.handHistory.allTime.averageReturn),
                averageNet: safeNumber(raw.handHistory.allTime.averageNet),
                over8CardsCount: Math.max(0, Math.round(safeNumber(raw.handHistory.allTime.over8CardsCount))),
                over8CardsPercent: safeNumber(raw.handHistory.allTime.over8CardsPercent),
                handLengthDistribution:
                  raw.handHistory.allTime.handLengthDistribution &&
                  typeof raw.handHistory.allTime.handLengthDistribution === "object"
                    ? Object.fromEntries(
                        Object.entries(raw.handHistory.allTime.handLengthDistribution).map(([key, value]) => [
                          String(key),
                          Math.max(0, Math.round(safeNumber(value)))
                        ])
                      )
                    : {},
                stopperBreakdown:
                  raw.handHistory.allTime.stopperBreakdown &&
                  typeof raw.handHistory.allTime.stopperBreakdown === "object"
                    ? Object.fromEntries(
                        Object.entries(raw.handHistory.allTime.stopperBreakdown).map(([key, value]) => [
                          String(key),
                          Math.max(0, Math.round(safeNumber(value)))
                        ])
                      )
                    : {}
              }
            : null,
          last100: raw.handHistory.last100 && typeof raw.handHistory.last100 === "object"
            ? {
                handCount: Math.max(0, Math.round(safeNumber(raw.handHistory.last100.handCount))),
                averageCards: safeNumber(raw.handHistory.last100.averageCards),
                averageWager: safeNumber(raw.handHistory.last100.averageWager),
                averageReturn: safeNumber(raw.handHistory.last100.averageReturn),
                averageNet: safeNumber(raw.handHistory.last100.averageNet),
                over8CardsCount: Math.max(0, Math.round(safeNumber(raw.handHistory.last100.over8CardsCount))),
                over8CardsPercent: safeNumber(raw.handHistory.last100.over8CardsPercent),
                handLengthDistribution:
                  raw.handHistory.last100.handLengthDistribution &&
                  typeof raw.handHistory.last100.handLengthDistribution === "object"
                    ? Object.fromEntries(
                        Object.entries(raw.handHistory.last100.handLengthDistribution).map(([key, value]) => [
                          String(key),
                          Math.max(0, Math.round(safeNumber(value)))
                        ])
                      )
                    : {},
                stopperBreakdown:
                  raw.handHistory.last100.stopperBreakdown &&
                  typeof raw.handHistory.last100.stopperBreakdown === "object"
                    ? Object.fromEntries(
                        Object.entries(raw.handHistory.last100.stopperBreakdown).map(([key, value]) => [
                          String(key),
                          Math.max(0, Math.round(safeNumber(value)))
                        ])
                      )
                    : {}
              }
            : null,
          recentHands: Array.isArray(raw.handHistory.recentHands)
            ? raw.handHistory.recentHands.map((hand) => ({
                createdAt: hand?.createdAt == null ? null : String(hand.createdAt),
                totalCards: Math.max(0, Math.round(safeNumber(hand?.totalCards))),
                stopper: String(hand?.stopper || ""),
                totalWager: safeNumber(hand?.totalWager),
                totalPaid: safeNumber(hand?.totalPaid),
                net: safeNumber(hand?.net)
              }))
            : []
        }
      : null
  };
}

function draftBetPlan(args: DraftBetPlanArgs, state: AssistantState) {
  const risk = normalizeRiskTolerance(args.risk_tolerance || state.riskTolerance);
  const availableUnits = Math.max(0, safeNumber(state.betting?.availableUnits, state.bankroll));
  const followDirective = Boolean(args.follow_user_directive);
  const catalogMap = new Map((state.betCatalog || []).map((entry) => [entry.key, entry]));
  const sourceBets = Array.isArray(args.bets) ? args.bets : [];

  const cleanedBets = sourceBets
    .map((bet) => {
      const rawKey = String(bet?.key || "").trim();
      const catalogEntry = catalogMap.get(rawKey) || resolveBetTarget(rawKey, state);
      const units = clampToWholeUnits(safeNumber(bet?.units));
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
        : "No valid bet plan could be drafted from the model response.",
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

  return {
    summary:
      String(args.summary || "").trim() ||
      (followDirective
        ? "Direct instruction captured. Confirm and I will stage this exact layout on the felt."
        : "Suggested betting layout ready for your review."),
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
    betCatalog: state.betCatalog,
    gameReference: state.gameReference,
    handHistory: state.handHistory
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

    const randomSpreadDirective = parseRandomSpreadDirective(latestMessage, state);
    if (randomSpreadDirective) {
      const totalRequestedUnits = randomSpreadDirective.selectedCount * randomSpreadDirective.perBetUnits;
      if (!randomSpreadDirective.bets.length) {
        return new Response(
          JSON.stringify({
            reply: `I couldn't stage that random layout because only ${randomSpreadDirective.availableUnits} units are available right now.`,
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

      const randomPlan = draftBetPlan(
        {
          summary: "Best-guess random layout captured. Confirm and I will stage it on the felt.",
          follow_user_directive: true,
          replace_existing: true,
          bets: randomSpreadDirective.bets.map((bet) => ({ key: bet.key, units: bet.units }))
        },
        state
      );

      const adjustedCopy =
        randomSpreadDirective.selectedCount < randomSpreadDirective.requestedCount
          ? ` I could fit ${randomSpreadDirective.selectedCount} bets within your current bankroll and the one-per-bet limit.`
          : "";

      return new Response(
        JSON.stringify({
          reply: `Understood. I made a best-guess random draft of ${randomSpreadDirective.selectedCount} bet${randomSpreadDirective.selectedCount === 1 ? "" : "s"} at ${randomSpreadDirective.perBetUnits} unit${randomSpreadDirective.perBetUnits === 1 ? "" : "s"} each for ${totalRequestedUnits} total units.${adjustedCopy} Confirm if you want me to place it on the felt.`,
          riskTolerance: randomPlan.riskTolerance || state.riskTolerance,
          plan: randomPlan
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

    const explicitDirective = parseExplicitBetDirective(latestMessage, state);
    if (explicitDirective) {
      const { requestedUnits, targetText, bets, availableUnits } = explicitDirective;
      const totalRequestedUnits =
        Array.isArray(bets) && bets.length > 0 ? requestedUnits * bets.length : requestedUnits;
      console.info("[play-assistant] explicit directive parse", explicitDirective);

      if (bets?.length && (!Number.isFinite(requestedUnits) || requestedUnits <= 0)) {
        const targetLabel = bets[0]?.label || targetText;
        return new Response(
          JSON.stringify({
            reply: `I understood the bet target as ${targetLabel}, but I couldn't read the wager amount. Try something like "place 500 on ${targetLabel}".`,
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

      if (bets?.length && totalRequestedUnits > availableUnits) {
        const targetLabel =
          bets.length === 1 ? bets[0].label : targetText.replace(/\s+/g, " ").trim() || "that layout";
        return new Response(
          JSON.stringify({
            reply:
              bets.length === 1
                ? `I can't place ${requestedUnits} units on ${targetLabel} because only ${availableUnits} units are available right now.`
                : `I can't place ${requestedUnits} units on each target in ${targetLabel} because that needs ${totalRequestedUnits} units and only ${availableUnits} are available right now.`,
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

      if (bets?.length) {
        const directPlan = draftBetPlan(
          {
            summary:
              bets.length === 1
                ? "Direct instruction captured. Confirm and I will stage this exact layout on the felt."
                : "Best-guess instruction captured. Confirm and I will stage this layout on the felt.",
            follow_user_directive: true,
            replace_existing: true,
            bets: bets.map((bet) => ({ key: bet.key, units: requestedUnits }))
          },
          state
        );

        return new Response(
          JSON.stringify({
            reply:
              bets.length === 1
                ? `Understood. I drafted exactly ${requestedUnits} units on ${bets[0].label}. Confirm if you want me to place it on the felt.`
                : `Understood. I made a best-guess draft of ${requestedUnits} units on each target in ${targetText} for ${totalRequestedUnits} units total. Confirm if you want me to place it on the felt.`,
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
        description: "Create a consent-gated betting layout in whole-number units that the client can place on the felt.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            risk_tolerance: {
              type: "string",
              enum: ["cautious", "balanced", "aggressive"]
            },
            replace_existing: { type: "boolean" },
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

    const reply =
      extractOutputText(response) ||
      "I can explain the rules, talk through the table state, and draft a layout if you want one.";
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
