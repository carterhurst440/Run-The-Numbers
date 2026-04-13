import { supabase } from "./supabaseClient.js";

console.info("[RTN] main script loaded");

if (typeof document !== "undefined" && document.body) {
  document.body.dataset.appState = "loading";
  console.info("[RTN] body dataset appState set to \"loading\" on script load");
}

let appReady = false;
let authBootstrapFallbackShown = false;

const GAME_KEYS = {
  RUN_THE_NUMBERS: "game_001",
  GUESS_10: "game_002"
};

const GAME_LABELS = {
  [GAME_KEYS.RUN_THE_NUMBERS]: "Run the Numbers",
  [GAME_KEYS.GUESS_10]: "Guess 10"
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeGameKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === GAME_KEYS.RUN_THE_NUMBERS ||
    normalized === "run-the-numbers" ||
    normalized === "run_the_numbers"
  ) {
    return GAME_KEYS.RUN_THE_NUMBERS;
  }
  if (
    normalized === GAME_KEYS.GUESS_10 ||
    normalized === "guess-10" ||
    normalized === "red-black" ||
    normalized === "red_black" ||
    normalized === "guess10"
  ) {
    return GAME_KEYS.GUESS_10;
  }
  return null;
}

function resolveGameKey(value) {
  return normalizeGameKey(value) || GAME_KEYS.RUN_THE_NUMBERS;
}

function getGameLabel(value) {
  return GAME_LABELS[resolveGameKey(value)] || "Run the Numbers";
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || error?.details || error?.hint || "");
  return message.includes(columnName) && message.includes("does not exist");
}

function normalizeContestAllowedGameIds(value) {
  const values = Array.isArray(value) ? value : [];
  const normalized = values
    .map((entry) => normalizeGameKey(entry))
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : Object.values(GAME_KEYS);
}

function contestAllowsGame(contest, gameKey) {
  const allowed = normalizeContestAllowedGameIds(contest?.allowed_game_ids);
  return allowed.includes(resolveGameKey(gameKey));
}

function getContestGamesLabel(contest) {
  const allowed = normalizeContestAllowedGameIds(contest?.allowed_game_ids);
  if (allowed.length === Object.values(GAME_KEYS).length) {
    return "All games";
  }
  return allowed.map((gameId) => getGameLabel(gameId)).join(" • ");
}

function getGameKeyForRoute(route) {
  if (route === "run-the-numbers") return GAME_KEYS.RUN_THE_NUMBERS;
  if (route === "red-black") return GAME_KEYS.GUESS_10;
  return null;
}

function canUseCurrentFundsForGame(gameKey) {
  if (!isContestAccountMode(currentAccountMode)) {
    return true;
  }
  const contest = getModeContest(currentAccountMode);
  return !contest || contestAllowsGame(contest, gameKey);
}

function startStopwatch(label) {
  const startedAt = Date.now();
  console.info(`[RTN] ${label} started`);
  return (details = "") => {
    const duration = Date.now() - startedAt;
    const suffix = details ? ` ${details}` : "";
    console.info(`[RTN] ${label} finished in ${duration}ms${suffix}`);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const detail = event?.error ?? event?.message ?? "Unknown error";
    console.error("[RTN] Global error", detail);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason ?? "Unknown promise rejection";
    console.error("[RTN] Unhandled rejection", reason);
  });
}

function stripSupabaseRedirectHash() {
  // DISABLED: This was stripping auth tokens from URL before Supabase could process them
  // Supabase's detectSessionInUrl will handle cleaning up tokens after processing
  // DO NOT strip tokens manually - let Supabase do it
  return;
  
  /* OLD CODE - KEPT FOR REFERENCE BUT DISABLED
  if (typeof window === "undefined") {
    return;
  }

  const rawHash = window.location.hash || "";
  const search = window.location.search || "";
  const hashContainsTokens = rawHash.startsWith("#access_token=");
  const searchContainsTokens = search.includes("access_token=");
  
  if (hashContainsTokens || searchContainsTokens) {
    const cleanedHash = hashContainsTokens ? "" : rawHash;
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${cleanedHash}`
    );
  }
  */
}

function isRecoveryRedirectUrl() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes("type=recovery") || search.includes("type=recovery");
}

function markAppReady() {
  if (typeof document === "undefined") {
    return;
  }

  if (appReady) {
    console.info("[RTN] markAppReady called but app is already ready");
    return;
  }

  const { body } = document;
  if (body) {
    body.dataset.appState = "ready";
    console.info("[RTN] markAppReady called; UI now visible");
    appReady = true;
  }
}

const PAYTABLES = [
  {
    id: "paytable-1",
    name: "Paytable 1",
    steps: [3, 4, 15, 50]
  },
  {
    id: "paytable-2",
    name: "Paytable 2",
    steps: [2, 6, 36, 100]
  },
  {
    id: "paytable-3",
    name: "Paytable 3",
    steps: [1, 10, 40, 200]
  }
];
const NUMBER_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const DEFAULT_CHIP_DENOMINATIONS = [5, 10, 25, 100];
const CHIP_DENOMINATIONS_STORAGE_KEY = "run-the-numbers-chip-denominations";
const ASSISTANT_SHADOW_DENOMINATION = 1;
const INITIAL_BANKROLL = 1000;
const ADMIN_EMAIL = "carterwarrenhurst@gmail.com";
const DEFAULT_RANK_LADDER = [
  {
    tier: 1,
    name: "Accountant",
    welcome_phrase: "Welcome, Accountant {name}. We have work to do, these numbers won't run themselves.",
    required_hands_played: 0,
    required_contest_wins: 0,
    icon_url: "",
    theme_key: "blue"
  },
  {
    tier: 2,
    name: "Analyst",
    welcome_phrase: "Analyst {name}, you're on. Review the numbers and report your position.",
    required_hands_played: 1000,
    required_contest_wins: 0,
    icon_url: "",
    theme_key: "blue"
  },
  {
    tier: 3,
    name: "Senior Analyst",
    welcome_phrase: "Senior Analyst {name}, expectations are higher now. Don't fall behind the numbers.",
    required_hands_played: 2000,
    required_contest_wins: 1,
    icon_url: "",
    theme_key: "pink"
  },
  {
    tier: 4,
    name: "Auditor",
    welcome_phrase: "Auditor {name}, let's review the numbers together. Something feels... off.",
    required_hands_played: 10000,
    required_contest_wins: 1,
    icon_url: "",
    theme_key: "orange"
  },
  {
    tier: 5,
    name: "Controller",
    welcome_phrase: "Controller {name}, we're seeing movement. Let's keep this operation in balance.",
    required_hands_played: 20000,
    required_contest_wins: 2,
    icon_url: "",
    theme_key: "steel-black"
  },
  {
    tier: 6,
    name: "Auditor General",
    welcome_phrase: "Auditor General... the system is ready. Run the numbers, {name}.",
    required_hands_played: 100000,
    required_contest_wins: 5,
    icon_url: "",
    theme_key: "angelic"
  },
  {
    tier: 7,
    name: "The Ledger",
    welcome_phrase: "You are The Ledger. All numbers resolve through you. What is the next move, {name}?",
    required_hands_played: 200000,
    required_contest_wins: 10,
    icon_url: "",
    theme_key: "pastel"
  }
];
const PRIZE_CURRENCIES = {
  units: {
    key: "units",
    label: "Units"
  },
  carter_cash: {
    key: "carter_cash",
    label: "Carter Cash"
  }
};
const PRIZE_IMAGE_BUCKET = "prize-images";
const DEAL_DELAY = 420;
const DEAL_DELAY_STEP = 40;
const PROFILE_FETCH_ROUNDS = 2;
const PROFILE_RETRY_DELAY_MS = 1200;
const PROFILE_ATTEMPT_MAX = 5;
const PROFILE_FETCH_TIMEOUT_MS = 10000;
const BOOTSTRAP_TIMEOUT_MS = 12000;
const AUTH_FALLBACK_DELAY_MS = 2000;
const SUITS = [
  { symbol: "♠", color: "black", name: "Spades" },
  { symbol: "♥", color: "red", name: "Hearts" },
  { symbol: "♦", color: "red", name: "Diamonds" },
  { symbol: "♣", color: "black", name: "Clubs" }
];
const RANK_LABELS = {
  A: "Ace"
};

function describeRank(rank) {
  return RANK_LABELS[rank] ?? String(rank);
}

function isAdmin(user = currentUser) {
  if (!user?.email) return false;
  return user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function showToast(message, tone = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3200);
}

function showProfileRetryPrompt(message) {
  if (!profileRetryBanner) {
    return;
  }

  if (message && profileRetryMessage) {
    profileRetryMessage.textContent = message;
  }

  profileRetryBanner.hidden = false;
  profileRetryBanner.setAttribute("data-visible", "true");
}

function hideProfileRetryPrompt() {
  if (!profileRetryBanner) {
    return;
  }

  profileRetryBanner.hidden = true;
  profileRetryBanner.removeAttribute("data-visible");

  if (profileRetryButton) {
    profileRetryButton.disabled = false;
    profileRetryButton.textContent = profileRetryButtonDefaultLabel;
  }
}

function setProfileRetryLoading(isLoading) {
  if (!profileRetryButton) {
    return;
  }

  if (isLoading) {
    profileRetryButton.disabled = true;
    profileRetryButton.textContent = "Retrying…";
  } else {
    profileRetryButton.disabled = false;
    profileRetryButton.textContent = profileRetryButtonDefaultLabel;
  }
}

function createPrizeImagePath(originalName = "image") {
  const baseName = typeof originalName === "string" ? originalName : "image";
  const extensionMatch = baseName.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  const stem = baseName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeStem = stem || "prize";
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomPart}-${safeStem}${extension}`;
}

async function uploadPrizeImage(file) {
  if (!file) {
    throw new Error("No file selected");
  }
  if (!PRIZE_IMAGE_BUCKET) {
    throw new Error("Storage bucket is not configured.");
  }

  const path = createPrizeImagePath(file.name);
  const { error } = await supabase.storage
    .from(PRIZE_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (error) {
    throw error;
  }

  const { data: publicData, error: publicError } = supabase.storage
    .from(PRIZE_IMAGE_BUCKET)
    .getPublicUrl(path);

  if (publicError) {
    throw publicError;
  }

  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    throw new Error("Unable to resolve uploaded image URL");
  }

  return publicUrl;
}

async function uploadRankIcon(file) {
  return uploadPrizeImage(file);
}

function slugifyThemeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function clampThemeSetting(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeThemePalette(palette = {}) {
  return {
    accent: String(palette.accent || DEFAULT_CUSTOM_THEME_PALETTE.accent),
    accentSecondary: String(palette.accentSecondary || DEFAULT_CUSTOM_THEME_PALETTE.accentSecondary),
    accentTertiary: String(palette.accentTertiary || DEFAULT_CUSTOM_THEME_PALETTE.accentTertiary),
    heroButton: String(palette.heroButton || DEFAULT_CUSTOM_THEME_PALETTE.heroButton),
    primaryButton: String(palette.primaryButton || DEFAULT_CUSTOM_THEME_PALETTE.primaryButton),
    primaryButtonDisabled: String(palette.primaryButtonDisabled || DEFAULT_CUSTOM_THEME_PALETTE.primaryButtonDisabled),
    secondaryButton: String(palette.secondaryButton || DEFAULT_CUSTOM_THEME_PALETTE.secondaryButton),
    secondaryButtonDisabled: String(
      palette.secondaryButtonDisabled || DEFAULT_CUSTOM_THEME_PALETTE.secondaryButtonDisabled
    ),
    progressStart: String(palette.progressStart || DEFAULT_CUSTOM_THEME_PALETTE.progressStart),
    progressEnd: String(palette.progressEnd || DEFAULT_CUSTOM_THEME_PALETTE.progressEnd),
    gold: String(palette.gold || DEFAULT_CUSTOM_THEME_PALETTE.gold),
    muted: String(palette.muted || DEFAULT_CUSTOM_THEME_PALETTE.muted),
    success: String(palette.success || DEFAULT_CUSTOM_THEME_PALETTE.success),
    danger: String(palette.danger || DEFAULT_CUSTOM_THEME_PALETTE.danger),
    bgStart: String(palette.bgStart || DEFAULT_CUSTOM_THEME_PALETTE.bgStart),
    bgEnd: String(palette.bgEnd || DEFAULT_CUSTOM_THEME_PALETTE.bgEnd),
    panelStart: String(palette.panelStart || DEFAULT_CUSTOM_THEME_PALETTE.panelStart),
    panelEnd: String(palette.panelEnd || DEFAULT_CUSTOM_THEME_PALETTE.panelEnd),
    headerStart: String(palette.headerStart || DEFAULT_CUSTOM_THEME_PALETTE.headerStart),
    headerEnd: String(palette.headerEnd || DEFAULT_CUSTOM_THEME_PALETTE.headerEnd)
  };
}

function normalizeThemeSettings(settings = {}) {
  return {
    glowStrength: clampThemeSetting(settings.glowStrength, DEFAULT_CUSTOM_THEME_SETTINGS.glowStrength),
    surfaceContrast: clampThemeSetting(settings.surfaceContrast, DEFAULT_CUSTOM_THEME_SETTINGS.surfaceContrast),
    radiusScale: clampThemeSetting(settings.radiusScale, DEFAULT_CUSTOM_THEME_SETTINGS.radiusScale),
    flatSurfaces: Boolean(settings.flatSurfaces)
  };
}

function hasThemeOverrides(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function humanizeThemeKey(themeKey) {
  return String(themeKey || "blue")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getEmergencyThemeRecord(themeKey = "blue") {
  return normalizeThemeRecord({
    key: slugifyThemeKey(themeKey || "blue") || "blue",
    name: humanizeThemeKey(themeKey || "blue"),
    base_theme: THEME_CLASS_MAP[themeKey] ? themeKey : "blue",
    palette: DEFAULT_CUSTOM_THEME_PALETTE,
    settings: DEFAULT_CUSTOM_THEME_SETTINGS
  });
}

function normalizeThemeRecord(theme = {}) {
  const source = theme && typeof theme === "object" ? theme : {};
  const key = slugifyThemeKey(source.key || source.name || source.base_theme || "blue") || "blue";
  const baseThemeCandidate = String(source.base_theme || key || "blue").trim();
  const baseTheme = THEME_CLASS_MAP[baseThemeCandidate] ? baseThemeCandidate : "blue";
  return {
    id: source.id || null,
    key,
    name: String(source.name || humanizeThemeKey(key)).trim() || humanizeThemeKey(key),
    base_theme: baseTheme,
    palette: normalizeThemePalette(source.palette || {}),
    settings: normalizeThemeSettings(source.settings || {}),
    is_builtin: false
  };
}

function getThemeLibrary() {
  return themeLibraryCache;
}

function getThemeRecord(themeKey) {
  if (themeKey && typeof themeKey === "object") {
    return normalizeThemeRecord(themeKey);
  }
  const key = slugifyThemeKey(themeKey || "blue") || "blue";
  return getThemeLibrary().find((theme) => theme.key === key) || getThemeLibrary()[0] || getEmergencyThemeRecord(key);
}

async function loadThemeLibrary(force = false) {
  if (!force && themeLibraryHydrated) {
    return themeLibraryCache;
  }

  if (!supabase) {
    return themeLibraryCache.length ? themeLibraryCache : [getEmergencyThemeRecord("blue")];
  }

  try {
    const queryPromise = supabase.from("themes").select("*").order("name", { ascending: true });
    const timeoutPromise = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("Theme library request timed out.")), 8000);
    });
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error) throw error;
    themeLibraryCache = (Array.isArray(data) ? data : [])
      .map((theme) => normalizeThemeRecord(theme))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (!themeLibraryCache.length) {
      themeLibraryCache = [getEmergencyThemeRecord("blue")];
    }
    themeLibraryHydrated = true;
  } catch (error) {
    console.warn("[RTN] loadThemeLibrary failed", error);
    if (!themeLibraryCache.length) {
      themeLibraryCache = [getEmergencyThemeRecord("blue")];
    }
  }

  refreshAdminThemeOverrideThemeFromLibrary();

  return themeLibraryCache;
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "").trim();
  if (![3, 6].includes(value.length)) return null;
  const expanded = value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
  const numeric = Number.parseInt(expanded, 16);
  if (!Number.isFinite(numeric)) return null;
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

function rgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, Number(alpha)) || 0)})`;
}

function colorMix(color, amount = 0.5, fallback = "#000000") {
  const source = hexToRgb(color);
  const target = hexToRgb(fallback);
  if (!source || !target) return color;
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
  const r = Math.round(source.r * (1 - ratio) + target.r * ratio);
  const g = Math.round(source.g * (1 - ratio) + target.g * ratio);
  const b = Math.round(source.b * (1 - ratio) + target.b * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function getThemeCssVariables(theme) {
  const record = normalizeThemeRecord(theme);
  const palette = normalizeThemePalette(record.palette);
  const settings = normalizeThemeSettings(record.settings);
  const glow = settings.glowStrength / 100;
  const contrast = settings.surfaceContrast / 100;
  const flatSurfaces = settings.flatSurfaces;
  const menuSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, Math.max(0, 0.14 - contrast * 0.05), "#000000"), 0.96)
    : `linear-gradient(135deg, ${colorMix(palette.panelStart, Math.max(0, 0.18 - contrast * 0.1), "#ffffff")}, ${colorMix(palette.panelEnd, Math.max(0, 0.08 - contrast * 0.04), "#000000")})`;
  const statSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, Math.max(0, 0.08 - contrast * 0.04), "#000000"), 0.94)
    : `linear-gradient(135deg, ${rgba(palette.panelStart, 0.82 + contrast * 0.14)}, ${rgba(palette.panelEnd, 0.86 + contrast * 0.12)})`;
  const tableSurface = flatSurfaces
    ? rgba(colorMix(palette.panelEnd, 0.16, "#000000"), 0.97)
    : `linear-gradient(170deg, ${rgba(palette.panelStart, 0.97)} 0%, ${rgba(palette.panelEnd, 0.98)} 58%, ${rgba(colorMix(palette.panelEnd, 0.3, "#000000"), 0.98)} 100%)`;
  const paytableSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, 0.12, "#000000"), 0.9)
    : `linear-gradient(160deg, ${rgba(colorMix(palette.headerStart, 0.12, "#ffffff"), 0.9)}, ${rgba(palette.panelStart, 0.84)})`;
  const activePaytableSurface = flatSurfaces
    ? rgba(colorMix(palette.headerStart, 0.16, "#000000"), 0.9)
    : `linear-gradient(135deg, ${rgba(colorMix(palette.headerStart, 0.14, "#ffffff"), 0.92)}, ${rgba(palette.panelEnd, 0.88)})`;
  const bettingPanelSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, 0.16, "#000000"), 0.95)
    : `linear-gradient(160deg, ${rgba(palette.panelStart, 0.84 + contrast * 0.14)}, ${rgba(palette.panelEnd, 0.88 + contrast * 0.1)})`;
  const betSpotSurface = flatSurfaces
    ? rgba(colorMix(palette.panelEnd, 0.12, "#000000"), 0.97)
    : `linear-gradient(150deg, ${rgba(colorMix(palette.panelStart, 0.08, "#ffffff"), 0.96)}, ${rgba(palette.panelEnd, 0.98)})`;
  const chipBarSurface = flatSurfaces
    ? rgba(colorMix(palette.panelEnd, 0.08, "#000000"), 0.96)
    : `linear-gradient(135deg, ${rgba(palette.panelEnd, 0.96)}, ${rgba(palette.headerStart, 0.96)})`;
  const secondaryButtonSurface = flatSurfaces
    ? rgba(colorMix(palette.secondaryButton, 0.12, "#000000"), 0.96)
    : `linear-gradient(135deg, ${colorMix(palette.secondaryButton, 0.24, "#ffffff")}, ${colorMix(
        palette.secondaryButton,
        0.08,
        "#000000"
      )})`;
  const secondaryButtonDisabledSurface = flatSurfaces
    ? rgba(colorMix(palette.secondaryButtonDisabled, 0.12, "#000000"), 0.94)
    : `linear-gradient(135deg, ${colorMix(palette.secondaryButtonDisabled, 0.18, "#ffffff")}, ${colorMix(
        palette.secondaryButtonDisabled,
        0.1,
        "#000000"
      )})`;
  const primaryButtonSurface = flatSurfaces
    ? rgba(colorMix(palette.primaryButton, 0.1, "#000000"), 0.97)
    : `linear-gradient(135deg, ${colorMix(palette.primaryButton, 0.38, "#ffffff")}, ${colorMix(
        palette.primaryButton,
        0.12,
        palette.accentTertiary
      )})`;
  const primaryButtonDisabledSurface = flatSurfaces
    ? rgba(colorMix(palette.primaryButtonDisabled, 0.12, "#000000"), 0.94)
    : `linear-gradient(135deg, ${colorMix(palette.primaryButtonDisabled, 0.22, "#ffffff")}, ${colorMix(
        palette.primaryButtonDisabled,
        0.1,
        "#000000"
      )})`;
  const assistantFabSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, 0.08, "#000000"), 0.98)
    : `linear-gradient(135deg, ${rgba(colorMix(palette.headerStart, 0.08, "#ffffff"), 0.96)}, ${rgba(palette.panelEnd, 0.98)})`;
  const heroButtonSurface = flatSurfaces
    ? `linear-gradient(135deg, ${colorMix(palette.heroButton, 0.2, "#ffffff")}, ${colorMix(palette.heroButton, 0.08, "#000000")})`
    : `linear-gradient(135deg, ${colorMix(palette.heroButton, 0.52, "#ffffff")} 0%, ${colorMix(palette.heroButton, 0.22, "#ffffff")} 52%, ${colorMix(palette.heroButton, 0.08, palette.gold)} 100%)`;
  const drawerSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, 0.14, "#000000"), 0.95)
    : `linear-gradient(145deg, ${rgba(palette.panelStart, 0.96)}, ${rgba(palette.panelEnd, 0.94)})`;
  const analyticsSurface = flatSurfaces
    ? rgba(colorMix(palette.panelStart, 0.1, "#000000"), 0.94)
    : `linear-gradient(135deg, ${rgba(palette.panelStart, 0.92)}, ${rgba(palette.panelEnd, 0.94)})`;
  return {
    "--neon-cyan": palette.accent,
    "--neon-magenta": palette.accentSecondary,
    "--neon-violet": palette.accentTertiary,
    "--gold": palette.gold,
    "--muted": palette.muted,
    "--success": palette.success,
    "--danger": palette.danger,
    "--text-light": "#f7fbff",
    "--body-bg": `linear-gradient(${rgba(palette.accent, 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(palette.accentSecondary, 0.08)} 1px, transparent 1px), linear-gradient(180deg, ${palette.bgStart} 0%, ${colorMix(palette.bgStart, 0.22, palette.panelStart)} 48%, ${palette.bgEnd} 100%)`,
    "--body-bg-size": "72px 72px, 72px 72px, 100% 100%",
    "--body-bg-position": "0 0, 0 0, center",
    "--app-overlay": `radial-gradient(circle at 18% 12%, ${rgba(palette.accent, 0.24 * glow + 0.04)}, transparent 54%), radial-gradient(circle at 82% 18%, ${rgba(palette.accentSecondary, 0.18 * glow + 0.04)}, transparent 58%), radial-gradient(circle at 50% 120%, ${rgba(palette.accentTertiary, 0.2 * glow + 0.04)}, transparent 70%)`,
    "--header-gradient": `linear-gradient(135deg, ${palette.headerStart}, ${palette.headerEnd})`,
    "--header-border-color": rgba(palette.accent, 0.42),
    "--icon-button-bg": `linear-gradient(135deg, ${colorMix(palette.headerStart, 0.16, "#ffffff")}, ${palette.headerEnd})`,
    "--icon-button-border-color": rgba(palette.accent, 0.4),
    "--icon-button-border-hover": rgba(palette.gold, 0.78),
    "--icon-button-shadow-hover": `0 12px 26px ${rgba(palette.accent, 0.22)}`,
    "--icon-graph-gradient": `linear-gradient(135deg, ${palette.accent}, ${palette.accentSecondary})`,
    "--reset-border-color": rgba(palette.accentSecondary, 0.44),
    "--reset-bg": `linear-gradient(135deg, ${rgba(palette.gold, 0.2)}, ${rgba(palette.accentSecondary, 0.18)})`,
    "--reset-border-hover": rgba(palette.gold, 0.78),
    "--reset-bg-hover": `linear-gradient(135deg, ${rgba(palette.gold, 0.28)}, ${rgba(palette.accentSecondary, 0.26)})`,
    "--reset-shadow-hover": `0 16px 32px ${rgba(palette.accentSecondary, 0.22)}`,
    "--menu-bg": menuSurface,
    "--menu-border-color": rgba(palette.accent, 0.3),
    "--menu-shadow": `0 18px 38px ${rgba("#000000", 0.64)}`,
    "--menu-border-hover": rgba(palette.gold, 0.7),
    "--menu-shadow-hover": `0 26px 42px ${rgba("#000000", 0.7)}`,
    "--stat-bg": statSurface,
    "--stat-border": rgba(palette.accent, 0.28),
    "--stat-shadow": `inset 0 0 24px ${rgba(palette.accent, 0.14)}`,
    "--table-panel-bg": tableSurface,
    "--table-panel-shadow": `0 42px 92px ${rgba("#000000", 0.74)}, inset 0 0 120px ${rgba(palette.accent, 0.14 + glow * 0.1)}`,
    "--paytable-panel-bg": paytableSurface,
    "--paytable-panel-border": rgba(palette.accent, 0.36),
    "--paytable-panel-shadow": `inset 0 0 26px ${rgba(palette.accent, 0.16)}`,
    "--paytable-option-bg": rgba(palette.panelStart, 0.64 + contrast * 0.22),
    "--paytable-option-border": rgba(palette.accent, 0.36),
    "--paytable-option-shadow": `inset 0 0 20px ${rgba(palette.accent, 0.12)}`,
    "--paytable-option-border-hover": rgba(palette.gold, 0.72),
    "--paytable-option-shadow-hover": `inset 0 0 24px ${rgba(palette.accent, 0.18)}`,
    "--paytable-option-border-selected": rgba(palette.gold, 0.84),
    "--paytable-option-shadow-selected": `inset 0 0 32px ${rgba(palette.accent, 0.22)}, 0 14px 26px ${rgba("#000000", 0.44)}`,
    "--paytable-option-name-color": "#f7fbff",
    "--paytable-option-steps-color": rgba(palette.gold, 0.9),
    "--active-paytable-bg": activePaytableSurface,
    "--active-paytable-border": rgba(palette.accent, 0.4),
    "--active-paytable-shadow": `inset 0 0 26px ${rgba(palette.accent, 0.18)}`,
    "--active-paytable-label-color": rgba(palette.muted, 0.9),
    "--active-paytable-steps-color": rgba(palette.gold, 0.92),
    "--change-paytable-bg": `linear-gradient(135deg, ${rgba(palette.gold, 0.24)}, ${rgba(palette.accentSecondary, 0.16)})`,
    "--change-paytable-border": rgba(palette.accent, 0.42),
    "--change-paytable-border-hover": rgba(palette.gold, 0.82),
    "--change-paytable-shadow": `0 14px 32px ${rgba(palette.accentSecondary, 0.2)}`,
    "--betting-panel-bg": bettingPanelSurface,
    "--betting-panel-border": rgba(palette.accent, 0.34),
    "--betting-panel-shadow": `0 28px 68px ${rgba("#000000", 0.72)}, inset 0 0 56px ${rgba(palette.accent, 0.14 + glow * 0.08)}`,
    "--bet-spot-bg": betSpotSurface,
    "--bet-spot-border": rgba(palette.accent, 0.5),
    "--bet-spot-border-hover": rgba(palette.gold, 0.84),
    "--bet-spot-border-active": rgba("#ffffff", 0.86),
    "--bet-spot-shadow": `inset 0 0 14px ${rgba("#000000", 0.52)}, 0 12px 28px ${rgba("#000000", 0.46)}`,
    "--bet-spot-active-shadow": `0 0 34px ${rgba(palette.accent, 0.24 + glow * 0.2)}, inset 0 0 30px ${rgba(palette.accentSecondary, 0.14 + glow * 0.12)}`,
    "--bet-total-color": rgba("#f7fbff", 0.82),
    "--bet-total-active-color": palette.accent,
    "--bet-total-glow": rgba(palette.accent, 0.28),
    "--bet-total-active-glow": rgba(palette.accentSecondary, 0.26),
    "--status-text-color": rgba("#f7fbff", 0.94),
    "--table-callout-color": rgba(palette.muted, 0.9),
    "--table-callout-shadow": rgba(palette.accent, 0.22),
    "--chip-5-bg": `radial-gradient(circle at 35% 28%, ${colorMix(palette.accent, 0.18, "#ffffff")}, ${colorMix(palette.accent, 0.38, "#000000")} 70%)`,
    "--chip-10-bg": `radial-gradient(circle at 35% 28%, ${colorMix(palette.accentSecondary, 0.18, "#ffffff")}, ${colorMix(palette.accentSecondary, 0.38, "#000000")} 70%)`,
    "--chip-25-bg": `radial-gradient(circle at 35% 28%, ${colorMix(palette.accentTertiary, 0.18, "#ffffff")}, ${colorMix(palette.accentTertiary, 0.38, "#000000")} 70%)`,
    "--chip-100-bg": `radial-gradient(circle at 35% 28%, ${colorMix(palette.gold, 0.16, "#ffffff")}, ${colorMix(palette.gold, 0.38, "#000000")} 70%)`,
    "--chip-choice-bg": `radial-gradient(circle at 32% 32%, ${colorMix(palette.accent, 0.26, "#ffffff")}, ${rgba(palette.panelEnd, 0.96)})`,
    "--chip-choice-border": rgba(palette.accent, 0.48),
    "--chip-choice-shadow": `0 16px 32px ${rgba("#000000", 0.56)}`,
    "--chip-choice-shadow-hover": `0 0 0 3px ${rgba(palette.accent, 0.24)}, 0 20px 32px ${rgba(palette.accentSecondary, 0.18)}`,
    "--chip-choice-active-bg": `radial-gradient(circle at 35% 30%, ${colorMix(palette.gold, 0.18, "#ffffff")}, ${rgba(palette.panelEnd, 0.98)})`,
    "--chip-choice-active-shadow": `0 22px 36px ${rgba(palette.accent, 0.18)}`,
    "--chip-bar-bg": chipBarSurface,
    "--chip-bar-border": rgba(palette.accent, 0.32),
    "--chip-bar-shadow": `0 -26px 48px ${rgba("#000000", 0.72)}`,
    "--primary-button-bg": primaryButtonSurface,
    "--primary-button-border": rgba(colorMix(palette.primaryButton, 0.24, "#ffffff"), 0.92),
    "--primary-button-shadow": `0 18px 34px ${rgba(colorMix(palette.primaryButton, 0.28, "#000000"), 0.3)}`,
    "--primary-button-shadow-hover": `0 24px 40px ${rgba(colorMix(palette.primaryButton, 0.34, "#000000"), 0.38)}`,
    "--primary-button-text": "#f7fbff",
    "--primary-button-disabled-bg": primaryButtonDisabledSurface,
    "--primary-button-disabled-border": rgba(colorMix(palette.primaryButtonDisabled, 0.22, "#ffffff"), 0.8),
    "--primary-button-disabled-shadow": `0 12px 24px ${rgba(colorMix(palette.primaryButtonDisabled, 0.2, "#000000"), 0.18)}`,
    "--primary-button-disabled-text": rgba("#f7fbff", 0.9),
    "--secondary-button-bg": secondaryButtonSurface,
    "--secondary-button-border": rgba(colorMix(palette.secondaryButton, 0.24, "#ffffff"), 0.88),
    "--secondary-button-shadow": `0 12px 28px ${rgba(colorMix(palette.secondaryButton, 0.28, "#000000"), 0.24)}`,
    "--secondary-button-shadow-hover": `0 14px 26px ${rgba(colorMix(palette.secondaryButton, 0.34, "#000000"), 0.3)}`,
    "--secondary-button-text": "#f7fbff",
    "--secondary-button-disabled-bg": secondaryButtonDisabledSurface,
    "--secondary-button-disabled-border": rgba(colorMix(palette.secondaryButtonDisabled, 0.22, "#ffffff"), 0.78),
    "--secondary-button-disabled-shadow": `0 10px 22px ${rgba(colorMix(palette.secondaryButtonDisabled, 0.18, "#000000"), 0.16)}`,
    "--secondary-button-disabled-text": rgba("#f7fbff", 0.86),
    "--assistant-fab-bg": assistantFabSurface,
    "--assistant-fab-border": rgba(palette.accent, 0.52),
    "--assistant-fab-border-hover": rgba(palette.gold, 0.78),
    "--assistant-fab-shadow": `0 18px 34px ${rgba("#000000", 0.42)}, 0 0 0 1px ${rgba(palette.accent, 0.22)}, 0 0 24px ${rgba(palette.accent, 0.16 + glow * 0.08)}`,
    "--assistant-fab-shadow-hover": `0 24px 42px ${rgba("#000000", 0.48)}, 0 0 30px ${rgba(palette.accent, 0.22 + glow * 0.1)}`,
    "--assistant-panel-flat-bg": rgba(palette.panelStart, 0.98),
    "--assistant-response-bg": rgba(palette.panelEnd, 0.96),
    "--hero-button-bg": heroButtonSurface,
    "--hero-button-border": colorMix(palette.heroButton, 0.34, "#ffffff"),
    "--hero-button-shadow": `0 18px 36px ${rgba(colorMix(palette.heroButton, 0.34, "#000000"), 0.34)}, 0 0 0 1px ${rgba("#ffffff", 0.08)}, 0 0 28px ${rgba(palette.heroButton, 0.22 + glow * 0.08)}`,
    "--hero-button-shadow-hover": `0 24px 42px ${rgba(colorMix(palette.heroButton, 0.38, "#000000"), 0.4)}, 0 0 0 1px ${rgba("#ffffff", 0.12)}, 0 0 36px ${rgba(palette.heroButton, 0.28 + glow * 0.1)}`,
    "--deal-button-bg": primaryButtonSurface,
    "--deal-button-shadow": `0 22px 38px ${rgba(colorMix(palette.primaryButton, 0.3, "#000000"), 0.3)}`,
    "--deal-button-shadow-hover": `0 24px 42px ${rgba(colorMix(palette.primaryButton, 0.34, "#000000"), 0.36)}`,
    "--deal-button-text": "#f7fbff",
    "--progress-fill-start": palette.progressStart,
    "--progress-fill-end": palette.progressEnd,
    "--progress-fill-glow": rgba(palette.progressStart, 0.28),
    "--drawer-bg": drawerSurface,
    "--drawer-border": rgba(palette.accent, 0.28),
    "--drawer-shadow": `0 34px 92px ${rgba("#000000", 0.72)}`,
    "--modal-bg": rgba(palette.panelEnd, 0.95),
    "--modal-border": rgba(palette.accent, 0.32),
    "--modal-shadow": `0 34px 92px ${rgba("#000000", 0.76)}`,
    "--scrim-bg": rgba("#050913", 0.74),
    "--analytics-bg": analyticsSurface,
    "--analytics-border": rgba(palette.accent, 0.24),
    "--analytics-shadow": `inset 0 0 24px ${rgba(palette.accent, 0.12)}`,
    "--chart-background": rgba(palette.panelEnd, 0.94),
    "--chart-axis-color": rgba(palette.muted, 0.84),
    "--chart-grid-color": rgba(palette.accent, 0.18),
    "--chart-line-color": palette.accent,
    "--chart-line-shadow": rgba(palette.accent, 0.34),
    "--chart-fill-color": rgba(palette.accent, 0.18),
    "--chart-fill-fade": rgba(palette.accent, 0),
    "--chart-background-gradient-start": rgba(palette.accent, 0.14),
    "--chart-background-gradient-end": rgba(palette.accentSecondary, 0.1),
    "--chart-marker-color": palette.gold,
    "--chart-marker-stroke": rgba("#ffffff", 0.88),
    "--chart-marker-shadow": rgba(palette.accent, 0.32),
    "--chart-base-line": rgba(palette.accent, 0.22),
    "--chart-scroll-track": rgba(palette.panelEnd, 0.8),
    "--chart-scroll-thumb": rgba(palette.accent, 0.28),
    "--carter-green": palette.success,
    "--carter-green-glow": rgba(palette.success, 0.34),
    "--bust-bet-bg": rgba(palette.panelStart, 0.84),
    "--bust-bet-border": rgba(palette.accent, 0.4),
    "--bust-bet-shadow": `inset 0 0 20px ${rgba(palette.accent, 0.16)}`,
    "--count-bet-start-base": rgba(palette.accentTertiary, 0.34),
    "--count-bet-end-base": rgba(palette.accentSecondary, 0.3)
  };
}

function clearThemeVariables(target = document.body) {
  if (!target?.style) return;
  CUSTOM_THEME_VARIABLE_KEYS.forEach((key) => target.style.removeProperty(key));
}

function applyThemeVariables(theme, target = document.body) {
  if (!target?.style) return;
  clearThemeVariables(target);
  const variables = getThemeCssVariables(theme);
  Object.entries(variables).forEach(([key, value]) => {
    target.style.setProperty(key, value);
  });
}

function normalizeRankRecord(rank = {}) {
  const themeKey = slugifyThemeKey(rank.theme_key || "blue") || "blue";
  return {
    id: rank.id || null,
    tier: Math.max(1, Number(rank.tier || 1)),
    name: String(rank.name || "Rank").trim(),
    welcome_phrase: String(rank.welcome_phrase || "").trim(),
    required_hands_played: Math.max(0, Math.round(Number(rank.required_hands_played || 0))),
    required_contest_wins: Math.max(0, Math.round(Number(rank.required_contest_wins || 0))),
    icon_url: typeof rank.icon_url === "string" ? rank.icon_url.trim() : "",
    theme_key: themeKey
  };
}

function getFallbackRankLadder() {
  return DEFAULT_RANK_LADDER.map((rank) => normalizeRankRecord(rank));
}

function getRankLadder() {
  return rankLadderCache.length ? rankLadderCache : getFallbackRankLadder();
}

function getRankProgressPercent(currentValue, requiredValue) {
  const current = Math.max(0, Number(currentValue || 0));
  const required = Math.max(0, Number(requiredValue || 0));
  if (required <= 0) return 100;
  return Math.max(0, Math.min(100, (current / required) * 100));
}

function formatRankRequirementValue(value) {
  return Math.max(0, Math.round(Number(value || 0))).toLocaleString();
}

function getRankDisplayName(profile = currentProfile) {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile?.first_name || profile?.username || "Player";
}

function interpolateRankWelcome(rank, profile = currentProfile) {
  const playerName = getRankDisplayName(profile);
  return String(rank?.welcome_phrase || "").replace(/\{name\}/g, playerName);
}

function resolveRankState(handsPlayed = 0, contestWins = 0, ladder = getRankLadder()) {
  const sorted = [...ladder].sort((a, b) => a.tier - b.tier);
  const progressHands = Math.max(0, Math.round(Number(handsPlayed || 0)));
  const progressWins = Math.max(0, Math.round(Number(contestWins || 0)));
  let currentRank = sorted[0] || normalizeRankRecord(DEFAULT_RANK_LADDER[0]);

  sorted.forEach((rank) => {
    if (
      progressHands >= rank.required_hands_played &&
      progressWins >= rank.required_contest_wins
    ) {
      currentRank = rank;
    }
  });

  const nextRank = sorted.find((rank) => rank.tier > currentRank.tier) || null;
  return {
    ladder: sorted,
    currentRank,
    nextRank,
    handsPlayed: progressHands,
    contestWins: progressWins
  };
}

async function loadRankLadder(force = false) {
  if (!force && rankLadderCache.length) {
    return rankLadderCache;
  }

  await loadThemeLibrary(force);

  if (!supabase) {
    rankLadderCache = getFallbackRankLadder();
    return rankLadderCache;
  }

  try {
    const { data, error } = await supabase
      .from("ranks")
      .select("*")
      .order("tier", { ascending: true });
    if (error) throw error;
    rankLadderCache = Array.isArray(data) && data.length
      ? data.map((rank) => normalizeRankRecord(rank))
      : getFallbackRankLadder();
  } catch (error) {
    console.error("[RTN] loadRankLadder error", error);
    rankLadderCache = getFallbackRankLadder();
  }

  return rankLadderCache;
}

async function fetchHandsPlayedCount(userId) {
  if (!userId || !supabase) return 0;
  try {
    const { count, error } = await supabase
      .from("game_hands")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return Math.max(0, Number(count || 0));
  } catch (error) {
    console.error("[RTN] fetchHandsPlayedCount error", error);
    return 0;
  }
}

async function incrementProfileHandProgress(handIncrement = 1) {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("increment_profile_hands_played", {
      target_user_id: currentUser.id,
      hand_increment: handIncrement
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && currentProfile) {
      currentProfile.hands_played_all_time = Math.max(
        0,
        Math.round(Number(row.hands_played_all_time || currentProfile.hands_played_all_time || 0))
      );
      currentProfile.current_rank_tier = Math.max(
        1,
        Math.round(Number(row.current_rank_tier || currentProfile.current_rank_tier || 1))
      );
      currentProfile.current_rank_id = row.current_rank_id || currentProfile.current_rank_id || null;
      currentProfile.updated_at = row.updated_at || currentProfile.updated_at || null;
    }
    return row || null;
  } catch (error) {
    console.error("[RTN] incrementProfileHandProgress error", error);
    return null;
  }
}

async function reconcileProfileHandProgress({ force = false } = {}) {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id || !supabase) {
    return null;
  }
  if (!force && reconciledHandsPlayedUserId === currentUser.id) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("reconcile_profile_hands_played", {
      target_user_id: currentUser.id
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && currentProfile) {
      currentProfile.hands_played_all_time = Math.max(
        0,
        Math.round(Number(row.hands_played_all_time || currentProfile.hands_played_all_time || 0))
      );
      currentProfile.current_rank_tier = Math.max(
        1,
        Math.round(Number(row.current_rank_tier || currentProfile.current_rank_tier || 1))
      );
      currentProfile.current_rank_id = row.current_rank_id || currentProfile.current_rank_id || null;
      currentProfile.updated_at = row.updated_at || currentProfile.updated_at || null;
    }
    reconciledHandsPlayedUserId = currentUser.id;
    return row || null;
  } catch (error) {
    console.error("[RTN] reconcileProfileHandProgress error", error);
    return null;
  }
}

async function refreshCurrentRankState({ force = false } = {}) {
  const previousTier = currentRankState?.currentRank?.tier || null;
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    currentRankState = null;
    reconciledHandsPlayedUserId = null;
    applyResolvedTheme();
    renderDrawerRankSummary(null);
    typeHomeRankWelcome("");
    renderHomeRankPanel();
    return null;
  }

  const ladder = await loadRankLadder(force);
  await reconcileProfileHandProgress({ force });
  const storedHandsPlayed = Number(currentProfile?.hands_played_all_time);
  const handsPlayed = Number.isFinite(storedHandsPlayed)
    ? Math.max(0, Math.round(storedHandsPlayed))
    : await fetchHandsPlayedCount(currentUser.id);
  const contestWins = Math.max(0, Math.round(Number(currentProfile?.contest_wins || 0)));
  currentRankState = resolveRankState(handsPlayed, contestWins, ladder);
  applyResolvedTheme();
  renderDrawerRankSummary(currentRankState.currentRank);
  typeHomeRankWelcome(interpolateRankWelcome(currentRankState.currentRank));
  renderHomeRankPanel();
  void renderRankLadderModal();
  await renderHomeContestPromos();
  if (playerLiveContestListEl && playerEndedContestListEl) {
    await loadPlayerContestList(false);
  }

  const nextTier = currentRankState.currentRank?.tier || 1;
  const announcedTier = getStoredAnnouncedRankTier(currentUser.id);
  if (previousTier && nextTier > previousTier) {
    openRankUpModal(currentRankState.currentRank);
  }
  if (announcedTier == null || nextTier > announcedTier) {
    setStoredAnnouncedRankTier(nextTier, currentUser.id);
  }
  return currentRankState;
}

function renderHomeRankPanel() {
  if (!homeRankPanelEl) return;

  if (!currentRankState?.currentRank || !currentUser?.id || currentUser.id === GUEST_USER.id) {
    homeRankPanelEl.hidden = true;
    return;
  }

  const { currentRank, nextRank, handsPlayed, contestWins } = currentRankState;
  const handsRequirement = nextRank ? nextRank.required_hands_played : currentRank.required_hands_played;
  const winsRequirement = nextRank ? nextRank.required_contest_wins : currentRank.required_contest_wins;

  homeRankPanelEl.hidden = false;
  if (homeRankTitleEl) {
    homeRankTitleEl.textContent = `${currentRank.name} · Tier ${currentRank.tier}`;
  }
  if (homeRankHandsProgressTextEl) {
    homeRankHandsProgressTextEl.textContent = nextRank
      ? `${formatRankRequirementValue(handsPlayed)} / ${formatRankRequirementValue(handsRequirement)}`
      : `${formatRankRequirementValue(handsPlayed)} all time`;
  }
  if (homeRankWinsProgressTextEl) {
    homeRankWinsProgressTextEl.textContent = nextRank
      ? `${formatRankRequirementValue(contestWins)} / ${formatRankRequirementValue(winsRequirement)}`
      : `${formatRankRequirementValue(contestWins)} all time`;
  }
  if (homeRankHandsProgressBarEl) {
    homeRankHandsProgressBarEl.style.width = `${getRankProgressPercent(handsPlayed, nextRank ? handsRequirement : Math.max(handsPlayed, 1))}%`;
  }
  if (homeRankWinsProgressBarEl) {
    homeRankWinsProgressBarEl.style.width = `${getRankProgressPercent(contestWins, nextRank ? winsRequirement : Math.max(contestWins, 1))}%`;
  }

  if (homeRankIconEl && homeRankIconFallbackEl) {
    if (currentRank.icon_url) {
      homeRankIconEl.src = currentRank.icon_url;
      homeRankIconEl.alt = `${currentRank.name} icon`;
      homeRankIconEl.hidden = false;
      homeRankIconFallbackEl.hidden = true;
    } else {
      homeRankIconEl.hidden = true;
      homeRankIconFallbackEl.hidden = false;
      homeRankIconFallbackEl.textContent = String(currentRank.tier);
    }
  }
}

function buildRankRequirementsCopy(rank) {
  const requirements = [];
  if (rank.required_hands_played > 0) {
    requirements.push(`${formatRankRequirementValue(rank.required_hands_played)} hands played`);
  }
  if (rank.required_contest_wins > 0) {
    requirements.push(`${formatRankRequirementValue(rank.required_contest_wins)} contest victories`);
  }
  return requirements.length ? requirements.join(" • ") : "No thresholds";
}

function getRankByTier(tier, ladder = getRankLadder()) {
  const targetTier = Math.max(1, Math.round(Number(tier || 1)));
  return ladder.find((rank) => rank.tier === targetTier) || null;
}

function getRankThemeLabel(themeKey) {
  return getThemeRecord(themeKey)?.name || humanizeThemeKey(themeKey);
}

function renderThemeSelectOptions(selectEl, selectedKey = "blue") {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const themes = getThemeLibrary();
  const selected = getThemeRecord(selectedKey)?.key || selectedKey;
  selectEl.innerHTML = "";
  themes.forEach((theme) => {
    const option = document.createElement("option");
    option.value = theme.key;
    option.textContent = theme.name;
    option.selected = theme.key === selected;
    selectEl.appendChild(option);
  });
}

function populateAdminThemeBaseOptions(selectedKey = "blue") {
  if (!(adminThemeBaseSelect instanceof HTMLSelectElement)) return;
  adminThemeBaseSelect.innerHTML = "";
  Object.keys(THEME_CLASS_MAP).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = humanizeThemeKey(key);
    option.selected = key === selectedKey;
    adminThemeBaseSelect.appendChild(option);
  });
}

function populateAdminRankThemeOptions(selectedKey = "blue") {
  renderThemeSelectOptions(adminRankThemeSelect, selectedKey);
}

function getThemeFormState() {
  if (!adminThemeForm) {
    return normalizeThemeRecord({
      name: "Untitled Theme",
      key: "untitled-theme",
      base_theme: "blue",
      palette: DEFAULT_CUSTOM_THEME_PALETTE,
      settings: DEFAULT_CUSTOM_THEME_SETTINGS
    });
  }
  const formData = new FormData(adminThemeForm);
  const name = String(formData.get("themeName") || "").trim() || "Untitled Theme";
  const manualKey = String(formData.get("themeKey") || "").trim();
  return normalizeThemeRecord({
    id: String(formData.get("themeId") || "").trim() || null,
    name,
    key: manualKey || slugifyThemeKey(name),
    base_theme: String(formData.get("baseTheme") || "blue").trim(),
    palette: {
      accent: formData.get("accentColor"),
      accentSecondary: formData.get("accentSecondaryColor"),
      accentTertiary: formData.get("accentTertiaryColor"),
      heroButton: formData.get("heroButtonColor"),
      primaryButton: formData.get("primaryButtonColor"),
      primaryButtonDisabled: formData.get("primaryButtonDisabledColor"),
      secondaryButton: formData.get("secondaryButtonColor"),
      secondaryButtonDisabled: formData.get("secondaryButtonDisabledColor"),
      progressStart: formData.get("progressStartColor"),
      progressEnd: formData.get("progressEndColor"),
      gold: formData.get("goldColor"),
      muted: formData.get("mutedColor"),
      success: formData.get("successColor"),
      danger: formData.get("dangerColor"),
      bgStart: formData.get("bgStartColor"),
      bgEnd: formData.get("bgEndColor"),
      panelStart: formData.get("panelStartColor"),
      panelEnd: formData.get("panelEndColor"),
      headerStart: formData.get("headerStartColor"),
      headerEnd: formData.get("headerEndColor")
    },
    settings: {
      glowStrength: formData.get("glowStrength"),
      surfaceContrast: formData.get("surfaceContrast"),
      radiusScale: formData.get("radiusScale"),
      flatSurfaces: formData.get("flatSurfaces") === "on"
    }
  });
}

function getAdminThemePreviewMarkup(page = adminThemePreviewPage) {
  if (page === "rtn") {
    return `
      <div class="design-theme-live-preview app">
        <header class="header design-theme-preview-header-shell" role="presentation">
          <div class="header-bar">
            <div class="header-metrics">
              <div class="bankroll">
                <div class="bankroll-main">
                  <span class="bankroll-label">Bank:</span>
                  <span class="bankroll-value">500</span>
                  <span class="bankroll-units">units</span>
                </div>
              </div>
              <div class="carter-cash">
                <span class="carter-label">CC:</span>
                <span class="carter-value">0</span>
              </div>
            </div>
            <div class="header-actions">
              <div class="header-mode-select-wrap">
                <span class="header-mode-select design-theme-preview-mode-label">Normal Mode</span>
              </div>
              <button type="button" class="icon-button notification-toggle" aria-hidden="true" tabindex="-1"></button>
              <button type="button" class="menu-toggle" aria-hidden="true" tabindex="-1">
                <span class="menu-icon" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </header>
        <section class="app-page play-view design-theme-preview-page">
          <main class="layout">
            <div class="panels">
              <section class="panel table-panel" aria-label="Table play area">
                <section class="dealer-zone">
                  <div class="dealer-header">
                    <div class="dealer-title-group">
                      <p class="dealer-game-tag">Run the Numbers</p>
                      <h2 class="draws-title">Cards Dealt</h2>
                    </div>
                    <label class="advanced-toggle deal-mode-toggle is-active">
                      <span class="toggle-label">Auto Deal</span>
                      <span class="toggle-visual" aria-hidden="true"><span class="toggle-thumb"></span></span>
                    </label>
                  </div>
                  <div class="draws" aria-label="Cards dealt this hand">
                    <div class="card">
                      <div class="card-face">7</div>
                    </div>
                    <div class="card">
                      <div class="card-face">A</div>
                    </div>
                    <div class="card">
                      <div class="card-face">4</div>
                    </div>
                  </div>
                </section>
              </section>
              <section class="panel betting-panel" aria-label="Betting regions">
                <div class="status">Select a chip and place your bets in the betting panel.</div>
                <div class="betting-scroll">
                  <section class="number-bets">
                    <div class="bets-heading-row">
                      <div class="bets-heading-main">
                        <h2 class="bets-heading">Number Bets</h2>
                      </div>
                      <p class="bets-subheading">Lock before dealing</p>
                    </div>
                    <div class="active-paytable active-paytable-inline">
                      <div class="active-paytable-info">
                        <div class="active-paytable-inline-row">
                          <span class="active-paytable-name">Paytable 1</span>
                          <button type="button" class="change-paytable">Change</button>
                        </div>
                        <span class="active-paytable-steps">3x, 4x, 15x, 50x</span>
                      </div>
                    </div>
                    <div class="playmat" role="group" aria-label="Number bet spots">
                      <button class="bet-spot" type="button"><span class="bet-label">A</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">2</span><span class="bet-total">0</span></button>
                      <button class="bet-spot has-bet" type="button"><span class="bet-label">3</span><span class="bet-total">25</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">4</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">5</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">6</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">7</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">8</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">9</span><span class="bet-total">0</span></button>
                      <button class="bet-spot" type="button"><span class="bet-label">10</span><span class="bet-total">0</span></button>
                    </div>
                  </section>
                </div>
              </section>
            </div>
          </main>
          <div class="chip-bar" aria-label="RTN chip rack">
            <div class="chip-selector-row">
              <div class="chip-selector">
                <button type="button" class="chip-choice active" data-tone="0">5</button>
                <button type="button" class="chip-choice" data-tone="1">10</button>
                <button type="button" class="chip-choice" data-tone="2">25</button>
                <button type="button" class="chip-choice" data-tone="3">100</button>
              </div>
            </div>
            <div class="chip-actions">
              <button type="button" class="secondary">Clear</button>
              <button type="button" class="deal">Deal Hand</button>
            </div>
          </div>
          <button type="button" class="play-assistant-fab" aria-hidden="true" tabindex="-1">
            <span class="play-assistant-fab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 3.5c4.97 0 9 3.58 9 8 0 2.19-.99 4.18-2.6 5.62-.34.31-.55.75-.57 1.21l-.08 1.95c-.03.78-.85 1.28-1.55.94l-2.2-1.06c-.34-.16-.73-.2-1.09-.11-.61.15-1.25.23-1.91.23-4.97 0-9-3.58-9-8s4.03-8 9-8Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"></path>
                <path d="M8.5 11.6h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"></path>
                <path d="M8.5 8.8h4.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"></path>
              </svg>
            </span>
            <span class="play-assistant-fab-label">AI</span>
          </button>
        </section>
      </div>
    `;
  }

  if (page === "guess10") {
    return `
      <div class="design-theme-live-preview app">
        <header class="header design-theme-preview-header-shell" role="presentation">
          <div class="header-bar">
            <div class="header-metrics">
              <div class="bankroll">
                <div class="bankroll-main">
                  <span class="bankroll-label">Bank:</span>
                  <span class="bankroll-value">500</span>
                  <span class="bankroll-units">units</span>
                </div>
              </div>
              <div class="carter-cash">
                <span class="carter-label">CC:</span>
                <span class="carter-value">0</span>
              </div>
            </div>
            <div class="header-actions">
              <div class="header-mode-select-wrap">
                <span class="header-mode-select design-theme-preview-mode-label">Normal Mode</span>
              </div>
              <button type="button" class="icon-button notification-toggle" aria-hidden="true" tabindex="-1"></button>
              <button type="button" class="menu-toggle" aria-hidden="true" tabindex="-1">
                <span class="menu-icon" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </header>
        <section class="app-page beta-game-view design-theme-preview-page">
          <div class="beta-game-shell">
            <div class="beta-table-layout beta-table-layout-split">
              <section class="beta-game-panel beta-table-panel beta-draw-panel">
                <div class="beta-table-header">
                  <div class="beta-draw-title-group">
                    <div class="beta-draw-brand-row">
                      <p class="beta-game-panel-kicker">Guess 10</p>
                      <span class="game-beta-pill beta-draw-beta-pill">Beta</span>
                    </div>
                    <h2>Cards Dealt</h2>
                  </div>
                </div>
                <div class="beta-ladder-sticky-rail beta-ladder-sticky-rail-inline">
                  <p class="beta-ladder-sticky-title">Commission Ladder</p>
                  <div class="beta-ladder-sticky-track">
                    <span class="beta-ladder-sticky-step"><span class="beta-ladder-sticky-fill"></span><span class="beta-ladder-sticky-label">10%</span></span>
                    <span class="beta-ladder-sticky-step"><span class="beta-ladder-sticky-fill"></span><span class="beta-ladder-sticky-label">9%</span></span>
                    <span class="beta-ladder-sticky-step"><span class="beta-ladder-sticky-fill"></span><span class="beta-ladder-sticky-label">8%</span></span>
                    <span class="beta-ladder-sticky-step"><span class="beta-ladder-sticky-fill"></span><span class="beta-ladder-sticky-label">7%</span></span>
                  </div>
                </div>
                <div class="draws beta-draws">
                  <div class="card"><div class="card-face">Q</div></div>
                  <div class="card"><div class="card-face">6</div></div>
                  <div class="card"><div class="card-face">A</div></div>
                </div>
              </section>
              <section class="beta-game-panel beta-table-panel beta-control-panel">
                <div class="beta-table-header">
                  <div class="beta-control-heading">
                    <h2>Wager &amp; Pot</h2>
                    <div class="beta-action-group beta-action-group-wager">
                      <div class="beta-wager-primary">
                        <p class="beta-control-label">Wager</p>
                        <div class="beta-bet-spot-wrap">
                          <div class="beta-bet-spot beta-bet-spot-circle is-empty">
                            <span class="beta-bet-empty-label">Place Bets Here</span>
                          </div>
                        </div>
                      </div>
                      <div class="beta-wager-secondary-row">
                        <div class="beta-wager-secondary-item">
                          <p class="beta-control-label">Current Pot</p>
                        <div class="beta-bet-spot beta-bet-spot-circle beta-pot-spot">
                          <span class="beta-bet-spot-total">0</span>
                          <span class="beta-pot-commission-preview">(-0)</span>
                        </div>
                        </div>
                        <div class="beta-wager-secondary-item">
                          <p class="beta-control-label">Next Pot</p>
                        <div class="beta-bet-spot beta-bet-spot-circle beta-pot-spot beta-next-pot-spot">
                          <span class="beta-bet-spot-total">0</span>
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="beta-prediction-panel">
                  <div class="beta-prediction-heading">
                    <div class="beta-prediction-title-row">
                      <h3 class="beta-prediction-title">Prediction</h3>
                      <span class="beta-control-multiplier">Multiplier 2X</span>
                    </div>
                  </div>
                  <div class="beta-action-group">
                    <p class="beta-control-label">Category</p>
                    <div class="beta-category-row">
                      <button type="button" class="secondary beta-category-button active">Color</button>
                      <button type="button" class="secondary beta-category-button">Suit</button>
                      <button type="button" class="secondary beta-category-button">Rank</button>
                    </div>
                  </div>
                  <div class="beta-action-group">
                    <p class="beta-control-label">Selection</p>
                    <div class="beta-selection-meta">
                      <span class="beta-selection-hint">Pick exactly 1 color.</span>
                      <span class="beta-selection-summary">1 selected</span>
                    </div>
                    <div class="beta-value-grid">
                      <button type="button" class="secondary beta-value-button active">Red</button>
                      <button type="button" class="secondary beta-value-button">Black</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div class="chip-bar beta-chip-bar" aria-label="Guess 10 chip rack">
            <div class="chip-selector-row beta-chip-selector-row">
              <div class="chip-selector">
                <button type="button" class="chip-choice active" data-tone="0">5</button>
                <button type="button" class="chip-choice" data-tone="1">10</button>
                <button type="button" class="chip-choice" data-tone="2">25</button>
                <button type="button" class="chip-choice" data-tone="3">100</button>
              </div>
            </div>
            <div class="chip-actions beta-chip-actions">
              <button type="button" class="primary">Rebet</button>
              <button type="button" class="primary">Draw</button>
              <button type="button" class="primary">Cash Out</button>
            </div>
          </div>
          <button type="button" class="play-assistant-fab" aria-hidden="true" tabindex="-1">
            <span class="play-assistant-fab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 3.5c4.97 0 9 3.58 9 8 0 2.19-.99 4.18-2.6 5.62-.34.31-.55.75-.57 1.21l-.08 1.95c-.03.78-.85 1.28-1.55.94l-2.2-1.06c-.34-.16-.73-.2-1.09-.11-.61.15-1.25.23-1.91.23-4.97 0-9-3.58-9-8s4.03-8 9-8Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"></path>
                <path d="M8.5 11.6h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"></path>
                <path d="M8.5 8.8h4.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"></path>
              </svg>
            </span>
            <span class="play-assistant-fab-label">AI</span>
          </button>
        </section>
      </div>
    `;
  }

  if (page === "play") {
    return `
      <div class="design-theme-live-preview app">
        <header class="header design-theme-preview-header-shell" role="presentation">
          <div class="header-bar">
            <div class="header-metrics">
              <div class="bankroll">
                <div class="bankroll-main">
                  <span class="bankroll-label">Bank:</span>
                  <span class="bankroll-value">500</span>
                  <span class="bankroll-units">units</span>
                </div>
              </div>
              <div class="carter-cash">
                <span class="carter-label">CC:</span>
                <span class="carter-value">0</span>
              </div>
            </div>
            <div class="header-actions">
              <div class="header-mode-select-wrap">
                <span class="header-mode-select design-theme-preview-mode-label">Normal Mode</span>
              </div>
              <button type="button" class="icon-button notification-toggle" aria-hidden="true" tabindex="-1"></button>
              <button type="button" class="menu-toggle" aria-hidden="true" tabindex="-1">
                <span class="menu-icon" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </header>
        <main class="app-main design-theme-preview-main">
          <section class="app-page home-view play-hub-view design-theme-preview-page">
            <div class="home-hero play-hub-hero">
              <h1 class="home-title">PLAY</h1>
              <p class="home-subtitle">Choose a game to jump straight to the table.</p>
              <section class="home-games" aria-label="Available games">
                <article class="game-card game-card-primary">
                  <div class="game-card-head">
                    <p class="game-card-kicker">Original Game</p>
                    <h2 class="game-card-title">RUN THE NUMBERS</h2>
                  </div>
                  <p class="game-card-copy">Build your wager board, fade the bust card, and press number hits across the active paytable.</p>
                  <button type="button" class="home-button home-cta-button">Play Run the Numbers</button>
                </article>
                <article class="game-card game-card-beta">
                  <div class="game-card-head">
                    <p class="game-card-kicker">New Beta Game</p>
                    <div class="game-card-title-row">
                      <h2 class="game-card-title">GUESS 10</h2>
                      <span class="game-beta-pill">Beta</span>
                    </div>
                  </div>
                  <p class="game-card-copy">Predict by color, suit, or rank, multiply the live pot on every hit, and cash out before the deck turns on you.</p>
                  <button type="button" class="home-button home-cta-button">Play GUESS 10</button>
                </article>
              </section>
            </div>
          </section>
        </main>
      </div>
    `;
  }

  return `
    <div class="design-theme-live-preview app">
      <header class="header design-theme-preview-header-shell" role="presentation">
        <div class="header-bar">
          <div class="header-metrics">
            <div class="bankroll">
              <div class="bankroll-main">
                <span class="bankroll-label">Bank:</span>
                <span class="bankroll-value">500</span>
                <span class="bankroll-units">units</span>
              </div>
            </div>
            <div class="carter-cash">
              <span class="carter-label">CC:</span>
              <span class="carter-value">0</span>
            </div>
          </div>
          <div class="header-actions">
            <div class="header-mode-select-wrap">
              <span class="header-mode-select design-theme-preview-mode-label">Normal Mode</span>
            </div>
            <button type="button" class="icon-button notification-toggle" aria-hidden="true" tabindex="-1"></button>
            <button type="button" class="menu-toggle" aria-hidden="true" tabindex="-1">
              <span class="menu-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </header>
      <main class="app-main design-theme-preview-main">
        <section class="app-page home-view design-theme-preview-page design-theme-preview-home-page">
          <div class="home-hero">
            <h1 class="home-title">Welcome to the Casino Floor</h1>
            <p class="home-subtitle">Track your rank, jump into live contests, and head to Play when you're ready to pick a table.</p>
            <div class="home-actions">
              <button type="button" class="home-button home-primary home-cta-button home-hero-play-button">Play</button>
            </div>
            <p class="home-rank-typing">Analyst Carter Hurst, you're on. Review the numbers and report your position.</p>
            <section class="home-rank-panel" aria-label="Current rank">
              <div class="home-rank-header">
                <div>
                  <p class="home-rank-eyebrow">Current Rank</p>
                  <div class="home-rank-title-row">
                    <div class="home-rank-icon-wrap home-rank-icon-inline">
                      <div class="home-rank-icon-fallback" aria-hidden="true">2</div>
                    </div>
                    <h2 class="home-rank-title">Analyst · Tier 2</h2>
                  </div>
                </div>
                <button type="button" class="link-button">Rank Ladder</button>
              </div>
              <div class="home-rank-progress-grid">
                <div class="rank-progress-card">
                  <div class="rank-progress-label-row">
                    <span>Hands Played</span>
                    <span>4,775 / 2,000</span>
                  </div>
                  <div class="rank-progress-track" aria-hidden="true">
                    <div class="rank-progress-fill" style="width: 100%"></div>
                  </div>
                </div>
                <div class="rank-progress-card">
                  <div class="rank-progress-label-row">
                    <span>Contest Victories</span>
                    <span>0 / 1</span>
                  </div>
                  <div class="rank-progress-track" aria-hidden="true">
                    <div class="rank-progress-fill" style="width: 0%"></div>
                  </div>
                </div>
              </div>
            </section>
            <section class="home-contests-panel" aria-label="Contest spotlight">
              <div class="home-contests-header">
                <div>
                  <h2 class="home-contests-title">Contest Spotlight</h2>
                </div>
                <button type="button" class="home-contests-link">See All Contests</button>
              </div>
              <ul class="home-live-contest-list">
                <li class="home-contest-card">
                  <div class="home-contest-card-top">
                    <div class="home-contest-title-wrap">
                      <div class="home-contest-title-row">
                        <h3 class="home-contest-card-title">Weekly Bankroll Sprint</h3>
                        <span class="contest-entry-fee-badge">25 Units</span>
                      </div>
                      <p class="home-contest-card-window">Ends Sunday at 10 PM</p>
                    </div>
                  </div>
                  <p class="home-contest-card-prize">$250 Prize Pool</p>
                  <div class="contest-threshold-progress contest-threshold-progress-home">
                    <p class="contest-threshold-progress-title">Boost unlock at 50 players</p>
                    <div class="contest-threshold-progress-bar">
                      <span class="contest-threshold-progress-fill" style="width: 68%"></span>
                    </div>
                    <p class="contest-threshold-progress-meta">34 / 50 players entered</p>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderAdminThemePreview(page = adminThemePreviewPage) {
  if (!(adminThemePreviewEl instanceof HTMLElement)) return;
  adminThemePreviewPage = page;
  adminThemePreviewEl.innerHTML = getAdminThemePreviewMarkup(page);
}

function applyPreviewTheme(theme, target = adminThemePreviewEl) {
  if (!(target instanceof HTMLElement)) return;
  const record = normalizeThemeRecord(theme);
  applyThemeVariables(record, target);
  const palette = normalizeThemePalette(record.palette);
  const settings = normalizeThemeSettings(record.settings);
  target.style.setProperty("--preview-accent", palette.accent);
  target.style.setProperty("--preview-secondary", palette.accentSecondary);
  target.style.setProperty("--preview-tertiary", palette.accentTertiary);
  target.style.setProperty("--preview-hero-button", palette.heroButton);
  target.style.setProperty("--preview-primary-button", palette.primaryButton);
  target.style.setProperty("--preview-secondary-button", palette.secondaryButton);
  target.style.setProperty("--preview-progress-start", palette.progressStart);
  target.style.setProperty("--preview-progress-end", palette.progressEnd);
  target.style.setProperty("--preview-gold", palette.gold);
  target.style.setProperty("--preview-muted", palette.muted);
  target.style.setProperty("--preview-success", palette.success);
  target.style.setProperty("--preview-danger", palette.danger);
  target.style.setProperty("--preview-bg-start", palette.bgStart);
  target.style.setProperty("--preview-bg-end", palette.bgEnd);
  target.style.setProperty("--preview-panel-start", palette.panelStart);
  target.style.setProperty("--preview-panel-end", palette.panelEnd);
  target.style.setProperty("--preview-header-start", palette.headerStart);
  target.style.setProperty("--preview-header-end", palette.headerEnd);
  target.style.setProperty("--preview-glow", String(settings.glowStrength / 100));
  target.style.setProperty("--preview-contrast", String(settings.surfaceContrast / 100));
  target.style.setProperty("--preview-radius", `${8 + Math.round((settings.radiusScale / 100) * 18)}px`);
  target.dataset.previewFlat = settings.flatSurfaces ? "true" : "false";
}

function resetAdminThemeForm(theme = null) {
  if (!adminThemeForm) return;
  const record = normalizeThemeRecord(
    theme || {
      name: "",
      key: "",
      base_theme: "blue",
      palette: DEFAULT_CUSTOM_THEME_PALETTE,
      settings: DEFAULT_CUSTOM_THEME_SETTINGS
    }
  );
  adminEditingThemeId = record.id;
  adminEditingThemeSourceKey = theme?.key || null;
  adminEditingThemeSourceBuiltin = false;
  const setValue = (name, value) => {
    const field = adminThemeForm.elements.namedItem(name);
    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
      field.value = value ?? "";
    }
  };
  setValue("themeId", record.id || "");
  setValue("themeSourceKey", theme?.key || "");
  setValue("themeSourceBuiltin", "0");
  setValue("themeName", theme?.name || "");
  setValue("themeKey", theme?.key || "");
  populateAdminThemeBaseOptions(record.base_theme || "blue");
  setValue("baseTheme", record.base_theme || "blue");
  setValue("accentColor", record.palette.accent);
  setValue("accentSecondaryColor", record.palette.accentSecondary);
  setValue("accentTertiaryColor", record.palette.accentTertiary);
  setValue("heroButtonColor", record.palette.heroButton);
  setValue("primaryButtonColor", record.palette.primaryButton);
  setValue("primaryButtonDisabledColor", record.palette.primaryButtonDisabled);
  setValue("secondaryButtonColor", record.palette.secondaryButton);
  setValue("secondaryButtonDisabledColor", record.palette.secondaryButtonDisabled);
  setValue("progressStartColor", record.palette.progressStart);
  setValue("progressEndColor", record.palette.progressEnd);
  setValue("goldColor", record.palette.gold);
  setValue("mutedColor", record.palette.muted);
  setValue("successColor", record.palette.success);
  setValue("dangerColor", record.palette.danger);
  setValue("bgStartColor", record.palette.bgStart);
  setValue("bgEndColor", record.palette.bgEnd);
  setValue("panelStartColor", record.palette.panelStart);
  setValue("panelEndColor", record.palette.panelEnd);
  setValue("headerStartColor", record.palette.headerStart);
  setValue("headerEndColor", record.palette.headerEnd);
  setValue("glowStrength", String(record.settings.glowStrength));
  setValue("surfaceContrast", String(record.settings.surfaceContrast));
  setValue("radiusScale", String(record.settings.radiusScale));
  setValue("flatSurfaces", record.settings.flatSurfaces);
  if (adminThemeMessage) {
    adminThemeMessage.textContent = "";
  }
  if (adminThemeSaveButton) {
    adminThemeSaveButton.textContent = "Save theme";
  }
  if (adminThemeModalTitle) {
    adminThemeModalTitle.textContent = theme ? "Edit theme" : "Create theme";
  }
  if (adminThemePreviewPageSelect instanceof HTMLSelectElement) {
    adminThemePreviewPageSelect.value = adminThemePreviewPage;
  }
  renderAdminThemePreview(adminThemePreviewPage);
  applyPreviewTheme(record);
  updateAdminThemeOverrideUI();
}

function openAdminThemeModal(theme = null) {
  if (!adminThemeModal) return;
  resetAdminThemeForm(theme);
  adminThemeModal.hidden = false;
  document.body.classList.add("modal-open");
  const nameField = adminThemeForm?.elements.namedItem("themeName");
  if (nameField instanceof HTMLInputElement) {
    window.setTimeout(() => nameField.focus(), 0);
  }
}

function closeAdminThemeModal() {
  if (!adminThemeModal) return;
  adminThemeModal.hidden = true;
  document.body.classList.remove("modal-open");
  resetAdminThemeForm();
}

function buildThemeCardPreviewMarkup(theme) {
  const palette = normalizeThemePalette(theme.palette);
  const swatches = [palette.accent, palette.heroButton, palette.gold, palette.panelEnd]
    .map((color) => `<span class="admin-theme-preview-color" style="background:${escapeAssistantHtml(color)}"></span>`)
    .join("");
  return swatches;
}

function createDuplicateThemeDraft(theme) {
  const source = normalizeThemeRecord(theme);
  const existingNames = new Set(
    getThemeLibrary().map((entry) => String(entry.name || "").trim().toLowerCase())
  );
  const baseName = `${source.name} Copy`;
  let nextName = baseName;
  let counter = 2;
  while (existingNames.has(nextName.trim().toLowerCase())) {
    nextName = `${baseName} ${counter}`;
    counter += 1;
  }
  return {
    ...source,
    id: null,
    key: "",
    name: nextName,
    is_builtin: false
  };
}

function renderAdminThemeRow(theme) {
  const item = document.createElement("li");
  item.className = "admin-theme-card";
  item.innerHTML = `
    <div class="admin-theme-card-header">
      <div>
        <h3>${escapeAssistantHtml(theme.name)}</h3>
        <p class="admin-theme-meta">${escapeAssistantHtml(theme.key)} · Base ${escapeAssistantHtml(getRankThemeLabel(theme.base_theme))}</p>
      </div>
      <span class="rank-theme-pill">Theme</span>
    </div>
    <div class="admin-theme-preview-swatch">${buildThemeCardPreviewMarkup(theme)}</div>
    <div class="admin-theme-actions">
      <button type="button" class="secondary">Edit Theme</button>
      <button type="button" class="secondary">Duplicate</button>
      <button type="button" class="secondary" data-admin-theme-try-on-key="${escapeAssistantHtml(theme.key)}">Try On</button>
      <button type="button" class="secondary">Delete Theme</button>
    </div>
  `;
  applyPreviewTheme(theme, item.querySelector(".admin-theme-preview-swatch"));
  const buttons = item.querySelectorAll("button");
  buttons[0]?.addEventListener("click", () => openAdminThemeModal(theme));
  buttons[1]?.addEventListener("click", () => {
    openAdminThemeModal(createDuplicateThemeDraft(theme));
  });
  buttons[2]?.addEventListener("click", () => {
    setAdminThemeOverride(theme, { persist: true });
  });
  buttons[3]?.addEventListener("click", () => {
    void handleAdminThemeDelete(theme);
  });
  return item;
}

async function loadAdminThemes(force = false) {
  if (!isAdmin()) {
    if (adminThemeListEl) adminThemeListEl.innerHTML = "";
    return;
  }
  if (adminThemesLoaded && !force) return;
  adminThemesLoaded = true;
  await loadThemeLibrary(force);
  populateAdminThemeBaseOptions(adminThemeBaseSelect?.value || "blue");
  populateAdminRankThemeOptions(adminRankThemeSelect?.value || "blue");
  if (!adminThemeListEl) return;
  adminThemeListEl.innerHTML = "";
  const themes = getThemeLibrary();
  if (!themes.length) {
    adminThemeListEl.innerHTML = '<li class="admin-prize-empty">No themes available.</li>';
    return;
  }
  themes.forEach((theme) => {
    adminThemeListEl.appendChild(renderAdminThemeRow(theme));
  });
  updateAdminThemeOverrideUI();
}

async function handleAdminThemeDelete(theme) {
  if (!theme?.id || !isAdmin()) return;
  const ladder = await loadRankLadder(true);
  if (ladder.some((rank) => rank.theme_key === theme.key)) {
    showToast("This theme is in use by a rank. Reassign the rank before deleting it.", "error");
    return;
  }
  if (!window.confirm(`Delete theme "${theme.name}"?`)) return;
  try {
    const { error } = await supabase.from("themes").delete().eq("id", theme.id);
    if (error) throw error;
    showToast("Theme deleted", "success");
    themeLibraryCache = [];
    themeLibraryHydrated = false;
    adminThemesLoaded = false;
    await loadThemeLibrary(true);
    refreshAdminThemeOverrideThemeFromLibrary();
    await loadAdminThemes(true);
    await loadAdminRanks(true);
    await refreshCurrentRankState({ force: true });
    closeAdminThemeModal();
    updateAdminThemeOverrideUI();
  } catch (error) {
    console.error("[RTN] handleAdminThemeDelete error", error);
    showToast(error?.message || "Unable to delete theme", "error");
  }
}

async function handleAdminThemeSubmit(event) {
  event.preventDefault();
  if (!adminThemeForm || !isAdmin()) return;
  const theme = getThemeFormState();
  let themeId = theme.id;
  let themeKey = theme.key;
  if (!theme.name) {
    if (adminThemeMessage) {
      adminThemeMessage.textContent = "Please add a theme name.";
    }
    return;
  }

  const existing = getThemeLibrary().find((entry) => {
    if (entry.key !== themeKey) return false;
    return entry.id !== themeId;
  });
  if (existing) {
    if (adminThemeMessage) {
      adminThemeMessage.textContent = "That theme key already exists.";
    }
    return;
  }
  const normalizedName = theme.name.trim().toLowerCase();
  const existingName = getThemeLibrary().find(
    (entry) => {
      if (String(entry.name || "").trim().toLowerCase() !== normalizedName) return false;
      return entry.id !== themeId;
    }
  );
  if (existingName) {
    if (adminThemeMessage) {
      adminThemeMessage.textContent = "That theme name already exists. Please choose a unique name.";
    }
    return;
  }

  const payload = {
    key: themeKey,
    name: theme.name,
    base_theme: theme.base_theme,
    palette: theme.palette,
    settings: theme.settings,
    is_builtin: false
  };

  try {
    const query = themeId
      ? supabase.from("themes").update(payload).eq("id", themeId)
      : supabase.from("themes").insert(payload);
    const { error } = await query;
    if (error) throw error;
    showToast(themeId ? "Theme updated" : "Theme created", "success");
    themeLibraryCache = [];
    themeLibraryHydrated = false;
    adminThemesLoaded = false;
    await loadThemeLibrary(true);
    refreshAdminThemeOverrideThemeFromLibrary();
    await loadAdminThemes(true);
    populateAdminRankThemeOptions(themeKey);
    await loadAdminRanks(true);
    await refreshCurrentRankState({ force: true });
    closeAdminThemeModal();
    updateAdminThemeOverrideUI();
  } catch (error) {
    console.error("[RTN] handleAdminThemeSubmit error", error);
    if (adminThemeMessage) {
      adminThemeMessage.textContent = error?.message || "Unable to save theme.";
    }
  }
}

function stopHomeRankTyping() {
  rankWelcomeTypingToken += 1;
  if (rankWelcomeTypingTimer) {
    clearTimeout(rankWelcomeTypingTimer);
    rankWelcomeTypingTimer = null;
  }
}

function typeHomeRankWelcome(copy = "") {
  if (!homeRankTypingEl) return;
  stopHomeRankTyping();
  const nextCopy = String(copy || "").trim();
  if (!nextCopy) {
    homeRankTypingEl.hidden = true;
    homeRankTypingEl.textContent = "";
    return;
  }

  const token = rankWelcomeTypingToken;
  homeRankTypingEl.hidden = false;
  homeRankTypingEl.textContent = "";
  let index = 0;

  const tick = () => {
    if (token !== rankWelcomeTypingToken) return;
    index += 1;
    homeRankTypingEl.textContent = nextCopy.slice(0, index);
    if (index < nextCopy.length) {
      rankWelcomeTypingTimer = setTimeout(tick, index < 8 ? 18 : 24);
    } else {
      rankWelcomeTypingTimer = null;
    }
  };

  tick();
}

function renderDrawerRankSummary(rank) {
  if (!drawerRankSummaryEl || !drawerRankNameEl || !drawerRankIconEl || !drawerRankIconFallbackEl) return;
  if (!rank || !currentUser?.id || currentUser.id === GUEST_USER.id) {
    drawerRankSummaryEl.hidden = true;
    return;
  }

  drawerRankSummaryEl.hidden = false;
  drawerRankNameEl.textContent = `${rank.name} · Tier ${rank.tier}`;
  if (rank.icon_url) {
    drawerRankIconEl.src = rank.icon_url;
    drawerRankIconEl.alt = `${rank.name} icon`;
    drawerRankIconEl.hidden = false;
    drawerRankIconFallbackEl.hidden = true;
  } else {
    drawerRankIconEl.hidden = true;
    drawerRankIconFallbackEl.hidden = false;
    drawerRankIconFallbackEl.textContent = String(rank.tier);
  }
}

function getStoredAnnouncedRankTier(userId = currentUser?.id) {
  if (!userId) return null;
  try {
    const stored = window.localStorage.getItem(`rtn-announced-rank:${userId}`);
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function setStoredAnnouncedRankTier(tier, userId = currentUser?.id) {
  if (!userId) return;
  try {
    window.localStorage.setItem(`rtn-announced-rank:${userId}`, String(Math.max(1, Math.round(Number(tier || 1)))));
  } catch (_error) {
    // ignore storage failures
  }
}

function openRankUpModal(rank) {
  if (!rankUpModal || !rank) return;
  if (rankUpTitleEl) {
    rankUpTitleEl.textContent = "CONGRADULATIONS";
  }
  if (rankUpCopyEl) {
    rankUpCopyEl.textContent = `You have advanced to become ${rank.name}. Continue to Run the Numbers and advance up the rank ladder!`;
  }
  if (rankUpIconEl && rankUpIconFallbackEl) {
    if (rank.icon_url) {
      rankUpIconEl.src = rank.icon_url;
      rankUpIconEl.alt = `${rank.name} icon`;
      rankUpIconEl.hidden = false;
      rankUpIconFallbackEl.hidden = true;
    } else {
      rankUpIconEl.hidden = true;
      rankUpIconFallbackEl.hidden = false;
      rankUpIconFallbackEl.textContent = String(rank.tier);
    }
  }
  rankUpModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeRankUpModal() {
  if (!rankUpModal) return;
  rankUpModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function renderRankLadderModal() {
  if (!rankLadderListEl) return;
  await loadThemeLibrary(true);
  const ladder = await loadRankLadder(true);
  let playerCounts = new Map();

  try {
    const players = await loadAdminRankPlayerSummaries();
    playerCounts = players.reduce((map, player) => {
      const playerRankState = resolveRankState(player.handsPlayed, player.contestWins, ladder);
      const rankId = playerRankState.currentRank?.id || `tier-${playerRankState.currentRank?.tier || 1}`;
      map.set(rankId, (map.get(rankId) || 0) + 1);
      return map;
    }, new Map());
  } catch (error) {
    console.warn("[RTN] unable to load rank ladder player counts", error);
  }

  rankLadderListEl.innerHTML = "";
  ladder.forEach((rank) => {
    const rankKey = rank.id || `tier-${rank.tier}`;
    const playerCount = playerCounts.get(rankKey) || 0;
    const item = document.createElement("li");
    item.className = "rank-ladder-item";
    item.dataset.theme = rank.theme_key || "blue";
    item.innerHTML = `
      <div class="rank-ladder-tier">Tier ${rank.tier}</div>
      <div class="rank-ladder-body">
        <div class="rank-ladder-title-row">
          <h3>${rank.name}</h3>
          <span class="rank-theme-pill">${getRankThemeLabel(rank.theme_key)}</span>
        </div>
        <p class="rank-ladder-requirements">${buildRankRequirementsCopy(rank)}</p>
        <p class="rank-ladder-player-count">${playerCount} player${playerCount === 1 ? "" : "s"} in this rank</p>
      </div>
    `;
    const scopedThemeVariables = getThemeCssVariables(getThemeRecord(rank.theme_key || "blue"));
    Object.entries(scopedThemeVariables).forEach(([key, value]) => {
      item.style.setProperty(key, value);
    });
    rankLadderListEl.appendChild(item);
  });
}

async function openRankLadderModal() {
  if (!rankLadderModal) return;
  await renderRankLadderModal();
  rankLadderModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeRankLadderModal() {
  if (!rankLadderModal) return;
  rankLadderModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function updateAdminRankIconPreview(url) {
  if (!adminRankIconPreview || !adminRankIconPlaceholder) return;
  const nextUrl = typeof url === "string" ? url.trim() : "";
  if (nextUrl) {
    adminRankIconPreview.src = nextUrl;
    adminRankIconPreview.hidden = false;
    adminRankIconPlaceholder.hidden = true;
  } else {
    adminRankIconPreview.hidden = true;
    adminRankIconPlaceholder.hidden = false;
  }
}

function closeAdminRankModal({ restoreFocus = true, resetFields = false } = {}) {
  if (!adminRankModal) return;
  adminRankModal.hidden = true;
  document.body.classList.remove("modal-open");
  if (resetFields && adminRankForm) {
    adminRankForm.reset();
    updateAdminRankIconPreview("");
    adminEditingRankId = null;
  }
  if (adminRankMessage) {
    adminRankMessage.textContent = "";
  }
  if (restoreFocus && adminAddRankButton) {
    adminAddRankButton.focus();
  }
}

function openAdminRankModal(rank = null) {
  if (!adminRankModal || !adminRankForm) return;
  adminEditingRankId = rank?.id || null;
  adminRankForm.reset();
  updateAdminRankIconPreview(rank?.icon_url || "");
  if (adminRankMessage) {
    adminRankMessage.textContent = "";
  }
  if (adminRankModal.querySelector("#admin-rank-modal-title")) {
    adminRankModal.querySelector("#admin-rank-modal-title").textContent = rank ? "Edit rank" : "Add rank";
  }
  if (adminRankSaveButton) {
    adminRankSaveButton.textContent = rank ? "Save rank" : "Create rank";
  }

  const setValue = (name, value) => {
    const field = adminRankForm.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = value ?? "";
    }
  };

  populateAdminRankThemeOptions(rank?.theme_key || "blue");
  setValue("name", rank?.name || "");
  setValue("tier", String(rank?.tier || getRankLadder().length + 1));
  setValue("welcomePhrase", rank?.welcome_phrase || "");
  setValue("requiredHandsPlayed", String(rank?.required_hands_played || 0));
  setValue("requiredContestWins", String(rank?.required_contest_wins || 0));
  setValue("themeKey", rank?.theme_key || "blue");
  setValue("iconUrl", rank?.icon_url || "");

  adminRankModal.hidden = false;
  document.body.classList.add("modal-open");
}

async function loadAdminRankPlayerSummaries() {
  if (!supabase) return [];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, first_name, last_name, contest_wins, hands_played_all_time, current_rank_tier");
  if (profileError) throw profileError;

  const profileList = Array.isArray(profiles) ? profiles : [];
  return profileList.map((profile) => ({
    ...profile,
    displayName: getContestDisplayName(profile, profile.id),
    handsPlayed: Math.max(0, Math.round(Number(profile.hands_played_all_time || 0))),
    contestWins: Math.max(0, Math.round(Number(profile.contest_wins || 0)))
  }));
}

function renderAdminRankRow(rank, players = []) {
  const item = document.createElement("li");
  item.className = "admin-rank-card";
  item.dataset.theme = rank.theme_key || "blue";

  const playersMarkup = players.length
    ? players
        .map(
          (player) =>
            `<li><span>${player.displayName}</span><span>${formatRankRequirementValue(player.handsPlayed)} hands • ${formatRankRequirementValue(player.contestWins)} wins</span></li>`
        )
        .join("")
    : '<li class="admin-rank-player-empty">No players currently in this rank.</li>';

  item.innerHTML = `
    <div class="admin-rank-header">
      <div class="admin-rank-heading">
        <div class="admin-rank-thumb">
          ${
            rank.icon_url
              ? `<img src="${rank.icon_url}" alt="${rank.name} icon" />`
              : `<span>${rank.tier}</span>`
          }
        </div>
        <div>
          <p class="admin-rank-tier">Tier ${rank.tier}</p>
          <h3>${rank.name}</h3>
        </div>
      </div>
      <span class="rank-theme-pill">${escapeAssistantHtml(getRankThemeLabel(rank.theme_key))}</span>
    </div>
    <p class="admin-rank-welcome">${interpolateRankWelcome(rank, currentProfile)}</p>
    <p class="admin-rank-requirements">${buildRankRequirementsCopy(rank)}</p>
    <div class="admin-rank-player-block">
      <p class="admin-rank-player-heading">Players in this rank</p>
      <ul class="admin-rank-player-list">${playersMarkup}</ul>
    </div>
    <div class="contest-actions">
      <button type="button" class="primary">Edit Rank</button>
      <button type="button" class="secondary">Delete Rank</button>
    </div>
  `;

  const [editButton, deleteButton] = item.querySelectorAll("button");
  editButton?.addEventListener("click", () => openAdminRankModal(rank));
  deleteButton?.addEventListener("click", () => {
    void handleAdminRankDelete(rank);
  });
  const scopedThemeVariables = getThemeCssVariables(getThemeRecord(rank.theme_key || "blue"));
  Object.entries(scopedThemeVariables).forEach(([key, value]) => {
    item.style.setProperty(key, value);
  });
  return item;
}

async function loadAdminRanks(force = false) {
  if (!isAdmin()) {
    if (adminRankListEl) adminRankListEl.innerHTML = "";
    return;
  }
  if (adminRanksLoaded && !force) return;
  if (!adminRankListEl) return;

  adminRanksLoaded = true;
  adminRankListEl.innerHTML = '<li class="admin-prize-empty">Loading ranks...</li>';

  try {
    await loadThemeLibrary(force);
    populateAdminRankThemeOptions(adminRankThemeSelect?.value || "blue");
    const ladder = await loadRankLadder(force);
    const players = await loadAdminRankPlayerSummaries();
    const groupedPlayers = new Map();

    players.forEach((player) => {
      const playerRankState = resolveRankState(player.handsPlayed, player.contestWins, ladder);
      const rankId = playerRankState.currentRank?.id || `tier-${playerRankState.currentRank?.tier || 1}`;
      const existing = groupedPlayers.get(rankId) || [];
      existing.push(player);
      groupedPlayers.set(rankId, existing);
    });

    adminRankListEl.innerHTML = "";
    ladder.forEach((rank) => {
      const rankKey = rank.id || `tier-${rank.tier}`;
      adminRankListEl.appendChild(renderAdminRankRow(rank, groupedPlayers.get(rankKey) || []));
    });
  } catch (error) {
    console.error("[RTN] loadAdminRanks error", error);
    adminRanksLoaded = false;
    adminRankListEl.innerHTML = '<li class="admin-prize-empty">Unable to load ranks.</li>';
  }
}

async function handleAdminRankDelete(rank) {
  if (!rank?.id || !isAdmin()) return;
  if (!window.confirm(`Delete ${rank.name}?`)) return;

  try {
    const { error } = await supabase.from("ranks").delete().eq("id", rank.id);
    if (error) throw error;
    showToast("Rank deleted", "success");
    rankLadderCache = [];
    adminRanksLoaded = false;
    await supabase.rpc("recompute_all_profile_ranks");
    await loadRankLadder(true);
    await loadAdminRanks(true);
    await refreshCurrentRankState({ force: true });
  } catch (error) {
    console.error("[RTN] handleAdminRankDelete error", error);
    showToast(error?.message || "Unable to delete rank", "error");
  }
}

async function handleAdminRankSubmit(event) {
  event.preventDefault();
  if (!adminRankForm || !isAdmin()) return;

  const formData = new FormData(adminRankForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    tier: Math.max(1, Math.round(Number(formData.get("tier") || 1))),
    welcome_phrase: String(formData.get("welcomePhrase") || "").trim(),
    required_hands_played: Math.max(0, Math.round(Number(formData.get("requiredHandsPlayed") || 0))),
    required_contest_wins: Math.max(0, Math.round(Number(formData.get("requiredContestWins") || 0))),
    theme_key: slugifyThemeKey(String(formData.get("themeKey") || "blue").trim()) || "blue",
    icon_url: String(formData.get("iconUrl") || "").trim()
  };

  if (!payload.name || !payload.welcome_phrase) {
    if (adminRankMessage) adminRankMessage.textContent = "Please complete the rank name and welcome phrase.";
    return;
  }

  const iconFile = adminRankIconFileInput?.files?.[0] || null;
  if (iconFile) {
    payload.icon_url = await uploadRankIcon(iconFile);
  }

  try {
    const query = adminEditingRankId
      ? supabase.from("ranks").update(payload).eq("id", adminEditingRankId)
      : supabase.from("ranks").insert(payload);
    const { error } = await query;
    if (error) throw error;
    showToast(adminEditingRankId ? "Rank updated" : "Rank created", "success");
    rankLadderCache = [];
    adminRanksLoaded = false;
    await supabase.rpc("recompute_all_profile_ranks");
    await loadRankLadder(true);
    await loadAdminRanks(true);
    await refreshCurrentRankState({ force: true });
    closeAdminRankModal({ resetFields: true });
  } catch (error) {
    console.error("[RTN] handleAdminRankSubmit error", error);
    if (adminRankMessage) {
      adminRankMessage.textContent = error?.message || "Unable to save rank.";
    }
  }
}

function showHandOutcomeToast(delta) {
  if (!handToastContainer) return;

  const value = Math.abs(delta);
  const tone = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
  const prefix = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const message = `Hand Total ${prefix}${formatCurrency(value)}`;

  handToastContainer.querySelectorAll(".hand-toast").forEach((node) => node.remove());

  const toast = document.createElement("div");
  toast.className = `hand-toast hand-toast-${tone}`;
  toast.textContent = message;
  handToastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  const timeout = typeof window !== "undefined" ? window.setTimeout : setTimeout;
  timeout(() => {
    toast.classList.remove("visible");
    timeout(() => {
      toast.remove();
    }, 260);
  }, 2000);
}

function setViewVisibility(view, visible) {
  if (!view) return;
  if (visible) {
    view.classList.add("active");
    view.removeAttribute("hidden");
  } else {
    view.classList.remove("active");
    view.setAttribute("hidden", "");
  }
}

function hideAllRoutes() {
  Object.values(routeViews).forEach((view) => setViewVisibility(view, false));
}

function updateAdminVisibility(user = currentUser) {
  if (!adminNavButton) return;
  if (isAdmin(user)) {
    adminNavButton.removeAttribute("hidden");
  } else {
    adminNavButton.setAttribute("hidden", "");
  }
}

function updateResetButtonVisibility(user = currentUser) {
  if (!resetAccountButton) return;
  if (isAdmin(user)) {
    resetAccountButton.removeAttribute("hidden");
  } else {
    resetAccountButton.setAttribute("hidden", "");
  }
}

function showAuthCallbackView() {
  console.info("[RTN] showAuthCallbackView called");
  console.info(`[RTN] Current URL: ${window.location.href}`);
  console.info(`[RTN] Hash: ${window.location.hash}`);
  console.info(`[RTN] Search: ${window.location.search}`);
  hideAllRoutes();
  if (appShell) {
    appShell.setAttribute("data-hidden", "true");
  }
  const authCallbackView = document.getElementById("auth-callback-view");
  if (authCallbackView) {
    setViewVisibility(authCallbackView, true);
  }
}

function showAuthView(mode = "login") {
  console.info(`[RTN] showAuthView called with mode: ${mode}`);
  hideAllRoutes();
  if (appShell) {
    appShell.setAttribute("data-hidden", "true");
  }
  const authCallbackView = document.getElementById("auth-callback-view");
  if (authCallbackView) {
    setViewVisibility(authCallbackView, false);
  }
  if (authView) {
    setViewVisibility(authView, mode === "login");
  }
  if (signupView) {
    setViewVisibility(signupView, mode === "signup");
  }
  if (forgotPasswordView) {
    setViewVisibility(forgotPasswordView, mode === "forgot-password");
  }
  const resetPasswordView = document.getElementById("reset-password-view");
  if (resetPasswordView) {
    setViewVisibility(resetPasswordView, mode === "reset-password");
  }
  if (mode === "login") {
    if (authErrorEl) {
      authErrorEl.hidden = true;
      authErrorEl.textContent = "";
    }
    if (authSubmitButton) {
      authSubmitButton.disabled = false;
    }
  } else if (mode === "signup") {
    if (signupErrorEl) {
      signupErrorEl.hidden = true;
      signupErrorEl.textContent = "";
    }
    if (signupSubmitButton) {
      signupSubmitButton.disabled = false;
    }
  } else if (mode === "forgot-password") {
    const forgotErrorEl = document.getElementById("forgot-error");
    const forgotSuccessEl = document.getElementById("forgot-success");
    const forgotSubmitButton = document.getElementById("forgot-submit");
    if (forgotErrorEl) {
      forgotErrorEl.hidden = true;
      forgotErrorEl.textContent = "";
    }
    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = true;
      forgotSuccessEl.textContent = "";
    }
    if (forgotSubmitButton) {
      forgotSubmitButton.disabled = false;
    }
  } else if (mode === "reset-password") {
    const resetPasswordForm = document.getElementById("reset-password-form");
    const resetPasswordErrorEl = document.getElementById("reset-password-error");
    const resetPasswordSuccessEl = document.getElementById("reset-password-success");
    const resetPasswordSubmitButton = document.getElementById("reset-password-submit");
    if (resetPasswordForm) {
      resetPasswordForm.reset();
    }
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = true;
      resetPasswordErrorEl.textContent = "";
    }
    if (resetPasswordSuccessEl) {
      resetPasswordSuccessEl.hidden = true;
      resetPasswordSuccessEl.textContent = "";
    }
    if (resetPasswordSubmitButton) {
      resetPasswordSubmitButton.disabled = false;
    }
  }
}

function updateHash(route, { replace = false, preserveQuery = false } = {}) {
  if (typeof window === "undefined") return;
  let hash = `#/${route}`;
  
  // Preserve query parameters if requested (important for auth callbacks)
  if (preserveQuery && window.location.search) {
    // Query params stay in the URL, we just update the hash
    console.info(`[RTN] updateHash preserving query params: ${window.location.search}`);
  }
  
  suppressHash = true;
  if (replace && typeof history !== "undefined" && history.replaceState) {
    history.replaceState(null, "", hash + (preserveQuery ? window.location.search : ""));
  } else {
    window.location.hash = hash;
  }
  setTimeout(() => {
    suppressHash = false;
  }, 0);
}

async function setRoute(route, { replaceHash = false } = {}) {
  let nextRoute = route ?? "home";
  const isAuthRoute = AUTH_ROUTES.has(nextRoute);
  const isPublicAuthRoute = nextRoute === "auth" || nextRoute === "signup" || 
                           nextRoute === "forgot-password" || nextRoute === "reset-password" || nextRoute === "auth/callback";

  if (!routeViews[nextRoute] && !isAuthRoute && !isPublicAuthRoute) {
    nextRoute = "home";
  }

  if (!currentUser) {
    currentUser = { ...GUEST_USER };
  }

  // Skip all auth-related updates for public auth pages
  const isPublicAuthPage = nextRoute === "forgot-password" || nextRoute === "reset-password" || nextRoute === "auth" || nextRoute === "signup" || nextRoute === "auth/callback";
  
  if (!isPublicAuthPage) {
    updateAdminVisibility(currentUser);
    updateResetButtonVisibility(currentUser);
    await ensureProfileSynced({ force: !currentProfile });
    await syncContestState({ force: !contestCache.length });
  }

  if (!isAuthRoute && nextRoute === "admin" && !isAdmin()) {
    showToast("Admin access only", "error");
    nextRoute = "home";
  }

  const requestedGameKey = getGameKeyForRoute(nextRoute);
  if (requestedGameKey && isContestAccountMode(currentAccountMode)) {
    const modeContest = getModeContest(currentAccountMode);
    if (modeContest && !contestAllowsGame(modeContest, requestedGameKey)) {
      showToast(`This contest bankroll can only be used for ${getContestGamesLabel(modeContest)}.`, "error");
      nextRoute = "play";
    }
  }

  hideAllRoutes();
  if (authView) {
    setViewVisibility(authView, false);
  }
  if (signupView) {
    setViewVisibility(signupView, false);
  }
  if (forgotPasswordView) {
    setViewVisibility(forgotPasswordView, false);
  }
  if (resetPasswordView) {
    setViewVisibility(resetPasswordView, false);
  }
  const authCallbackView = document.getElementById("auth-callback-view");
  if (authCallbackView) {
    setViewVisibility(authCallbackView, false);
  }

  let resolvedRoute = (isAuthRoute && !isPublicAuthRoute) ? "home" : nextRoute;
  if (!routeViews[resolvedRoute] && !isPublicAuthRoute) {
    resolvedRoute = "home";
  }

  const shouldShowAppShell = TABLE_ROUTES.has(resolvedRoute);
  if (appShell) {
    if (shouldShowAppShell) {
      appShell.removeAttribute("data-hidden");
    } else {
      appShell.setAttribute("data-hidden", "true");
    }
  }

  const targetView = routeViews[resolvedRoute];
  if (targetView) {
    setViewVisibility(targetView, true);
  }

  if (redBlackChipBarEl) {
    redBlackChipBarEl.hidden = resolvedRoute !== "red-black";
  }

  if (resolvedRoute === "red-black") {
    updateRedBlackMultiplierChip();
    renderRedBlackSummary();
    updateRedBlackActionState();
    updateRedBlackPaytableHighlight();
  }

  if (resolvedRoute === "run-the-numbers") {
    schedulePlayAreaHeightUpdate();
  } else {
    clearPlayAreaHeight();
  }

  currentRoute = resolvedRoute;
  updatePlayAssistantVisibility();

  if (resolvedRoute === "contests") {
    await loadPlayerContestList(true);
  }

  if (isAuthRoute || isPublicAuthRoute) {
    // Show the specific auth view
    if (nextRoute === "signup") {
      showAuthView("signup");
    } else if (nextRoute === "forgot-password") {
      showAuthView("forgot-password");
    } else if (nextRoute === "reset-password") {
      showAuthView("reset-password");
    } else if (nextRoute === "auth/callback") {
      showAuthCallbackView();
    } else {
      showAuthView("login");
    }
    updateHash(nextRoute, { replace: true });
  } else if (!replaceHash) {
    updateHash(resolvedRoute);
  }

  if (resolvedRoute === "home") {
    await loadDashboard();
  } else if (resolvedRoute === "store") {
    await loadPrizeShop();
  } else if (resolvedRoute === "admin") {
    closeAdminForm({ resetFields: true, restoreFocus: false });
    await loadAdminPrizeList(true);
  } else if (resolvedRoute === "profile") {
    await loadProfile();
  }
}

function getRouteFromHash() {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  
  console.info(`[RTN] getRouteFromHash - full URL: ${window.location.href}`);
  console.info(`[RTN] getRouteFromHash - hash: "${hash}"`);
  console.info(`[RTN] getRouteFromHash - search: "${search}"`);
  
  // Check if hash OR search params contain Supabase auth tokens (magic link, OAuth, PKCE code)
  // PKCE flow uses ?code= parameter, implicit flow uses #access_token=
  if (hash.includes("access_token=") || hash.includes("refresh_token=") ||
      search.includes("access_token=") || search.includes("refresh_token=") ||
      search.includes("code=")) {  // PKCE flow detection
    console.info(`[RTN] getRouteFromHash - detected auth tokens/code, returning auth/callback`);
    return "auth/callback";
  }
  
  // Handle auth/callback route explicitly
  if (hash.includes("#/auth/callback")) {
    console.info(`[RTN] getRouteFromHash - detected #/auth/callback in hash`);
    return "auth/callback";
  }
  
  const match = hash.match(/#\/([\w-/]+)/);
  const route = match ? match[1] : "home";
  console.info(`[RTN] getRouteFromHash - returning route: "${route}"`);
  return route;
}

function getContestIdFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return null;
  const query = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  const contestId = params.get("contest");
  return contestId ? contestId.trim() : null;
}

function buildContestShareUrl(contestId) {
  if (!contestId || typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}#/contests?contest=${encodeURIComponent(contestId)}`;
}

async function shareContestLink(contest) {
  if (!contest?.id) return;
  const url = buildContestShareUrl(contest.id);
  const shareTitle = contest.title || "Run The Numbers Contest";
  try {
    if (navigator.share) {
      await navigator.share({
        title: shareTitle,
        text: `Join me in ${shareTitle} on Run The Numbers.`,
        url
      });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Contest link copied", "success");
    } else {
      throw new Error("Clipboard unavailable");
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("[RTN] shareContestLink error", error);
    showToast("Unable to share contest link", "error");
  }
}

function isUsingContestMode(contestId) {
  const activeContest = getModeContest();
  return Boolean(activeContest?.id) && String(activeContest.id) === String(contestId || "");
}

function isContestVisibleToCurrentUser(contest) {
  if (!contest) return false;
  return !contest.is_test || isAdmin();
}

function handleHashChange() {
  if (suppressHash) return;
  
  // CRITICAL: Don't process hash changes if we have auth tokens in URL
  // The tokens need to stay in the URL for Supabase to process them
  const hasAuthTokens = window.location.search.includes("code=") || 
                        window.location.search.includes("access_token=") ||
                        window.location.hash.includes("access_token=");
  if (hasAuthTokens) {
    console.info("[RTN] handleHashChange: ignoring hash change due to auth tokens in URL");
    return;
  }
  
  const route = getRouteFromHash();
  setRoute(route, { replaceHash: true });
}

async function refreshCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[RTN] refreshCurrentUser getUser error", error);
      forceAuth("refresh-user-error", {
        message: "Session error. Please sign in again.",
        tone: "warning"
      });
      return null;
    }

    const nextUser = data?.user ?? null;
    if (!nextUser) {
      forceAuth("refresh-user-missing", {
        message: "Please sign in to continue.",
        tone: "warning"
      });
      return null;
    }

    currentUser = nextUser;
    return currentUser;
  } catch (error) {
    console.error("[RTN] refreshCurrentUser exception", error);
    forceAuth("refresh-user-exception", {
      message: "Authentication failed. Please sign in again.",
      tone: "error"
    });
    return null;
  }
}

async function fetchProfileWithRetries(
  userId,
  {
    attempts = PROFILE_FETCH_ROUNDS * PROFILE_ATTEMPT_MAX,
    delayMs = PROFILE_RETRY_DELAY_MS,
    timeoutMs = PROFILE_FETCH_TIMEOUT_MS
  } = {}
) {
  if (!userId) {
    console.warn("[RTN] fetchProfileWithRetries called without user id");
    return null;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      const fetchPromise = supabase
        .from("profiles")
        .select("id, username, credits, carter_cash, carter_cash_progress, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, receive_contest_start_emails, updated_at")
        .eq("id", userId)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timeout")), Math.max(100, timeoutMs))
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        lastError = error;
        console.warn(`[RTN] fetchProfileWithRetries attempt ${attempt} error`, error);
      } else if (data) {
        return data;
      } else {
        // no profile found
        return null;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[RTN] fetchProfileWithRetries attempt ${attempt} exception`, err);
    }

    // delay before retrying
    if (attempt < attempts) {
      await delay(delayMs);
    }
  }

  console.error("[RTN] fetchProfileWithRetries failed after attempts", lastError);
  return null;
}
function deriveProfileSeedFromUser(user) {
  const metadata = (user && typeof user === "object" ? user.user_metadata : null) || {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const firstName = (metadata.first_name ?? (fullName ? fullName.split(/\s+/)[0] : "")) || "";
  let lastName = metadata.last_name ?? "";

  if (!lastName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      lastName = parts.slice(1).join(" ");
    }
  }

  const emailValue =
    user && typeof user === "object" && typeof user.email === "string"
      ? user.email
      : "";
  const emailPrefix = emailValue ? emailValue.split("@")[0] : null;

  const usernameCandidates = [
    metadata.username,
    metadata.preferred_username,
    typeof metadata.full_name === "string"
      ? metadata.full_name.replace(/\s+/g, "").toLowerCase()
      : null,
    emailPrefix
  ];

  const fallbackUsername = `player-${(user?.id || "").slice(0, 8)}`;
  const sanitizeUsername = (value) => {
    if (!value) return "";
    const normalized = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized.slice(0, 32);
  };

  let username = "";
  for (const candidate of usernameCandidates) {
    const sanitized = sanitizeUsername(candidate);
    if (sanitized) {
      username = sanitized;
      break;
    }
  }
  if (!username) {
    username = sanitizeUsername(fallbackUsername) || `player-${Date.now().toString(36)}`;
  }

  const normalizeName = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed.slice(0, 120) : null;
  };

  return {
    username,
    first_name: normalizeName(firstName),
    last_name: normalizeName(lastName)
  };
}

function getProfileUpdatedAtMs(profile) {
  if (!profile?.updated_at) return null;
  const parsed = new Date(profile.updated_at).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function isIncomingProfileStale(profile) {
  if (!profile || !currentProfile || profile.id !== currentProfile.id) return false;
  const incomingMs = getProfileUpdatedAtMs(profile);
  const currentMs = getProfileUpdatedAtMs(currentProfile);
  return incomingMs !== null && currentMs !== null && incomingMs < currentMs;
}

async function provisionProfileForUser(user) {
  if (!user?.id) {
    console.warn("[RTN] provisionProfileForUser called without valid user");
    return null;
  }

  const seed = deriveProfileSeedFromUser(user);
  const profileInsert = {
    id: user.id,
    credits: INITIAL_BANKROLL,
    carter_cash: 0,
    carter_cash_progress: 0,
    username: seed.username,
    first_name: seed.first_name,
    last_name: seed.last_name
  };

  const provisionStopwatch = startStopwatch(
    `provisionProfileForUser insert for ${user.id}`
  );

  try {
    const { data, error } = await supabase
      .from("profiles")
      .insert([profileInsert])
      .select(
        "id, username, credits, carter_cash, carter_cash_progress, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, receive_contest_start_emails, updated_at"
      )
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        provisionStopwatch("(duplicate)");
        console.warn(
          `[RTN] provisionProfileForUser detected existing profile for ${user.id}; refetching`
        );
        return await fetchProfileWithRetries(user.id, {
          attempts: PROFILE_ATTEMPT_MAX,
          delayMs: PROFILE_RETRY_DELAY_MS,
          timeoutMs: PROFILE_FETCH_TIMEOUT_MS
        });
      }
      provisionStopwatch("(error)");
      console.error("[RTN] provisionProfileForUser insert error", error);
      return null;
    }

    provisionStopwatch("(inserted)");
    return data ?? null;
  } catch (error) {
    provisionStopwatch("(exception)");
    console.error("[RTN] provisionProfileForUser exception", error);
    return null;
  }
}

async function ensureProfileSynced({ force = false } = {}) {
  // Skip profile sync on public auth pages
  if (currentRoute === "auth/callback" || currentRoute === "forgot-password" || currentRoute === "reset-password" || currentRoute === "auth" || currentRoute === "signup") {
    return currentProfile || { ...GUEST_PROFILE };
  }
  
  if (!currentUser) {
    currentUser = { ...GUEST_USER };
  }
  const now = Date.now();
  const currentUserId = currentUser?.id || GUEST_USER.id;
  const profileUserId = currentProfile?.id || null;
  const currentProfileMatchesUser =
    currentUserId === GUEST_USER.id
      ? profileUserId === GUEST_USER.id || profileUserId == null
      : profileUserId === currentUserId;
  if (!force && currentProfile && currentProfileMatchesUser && now - lastProfileSync < PROFILE_SYNC_INTERVAL) {
    return currentProfile;
  }

  // Always fetch the profile for a real user
  let resolvedProfile = null;
  if (currentUser && currentUser.id && currentUser.id !== GUEST_USER.id) {
    resolvedProfile = await fetchProfileWithRetries(currentUser.id, {
      attempts: PROFILE_FETCH_ROUNDS * PROFILE_ATTEMPT_MAX,
      delayMs: PROFILE_RETRY_DELAY_MS,
      timeoutMs: PROFILE_FETCH_TIMEOUT_MS
    });
    if (!resolvedProfile) {
      // Create a profile if none exists yet
      resolvedProfile = await provisionProfileForUser(currentUser);
    }
  }

  if (resolvedProfile && resolvedProfile.credits !== undefined) {
    if (isIncomingProfileStale(resolvedProfile)) {
      lastProfileSync = Date.now();
      return currentProfile;
    }
    currentProfile = resolvedProfile;
    const applied = applyProfileCredits(resolvedProfile, { resetHistory: !bankrollInitialized });
    void loadPersistentBankrollHistory({ force });
    lastProfileSync = Date.now();
    await refreshCurrentRankState({ force });
    return applied;
  }

  // fallback to guest profile only if not logged in or fetch fails
  currentProfile = { ...GUEST_PROFILE, id: currentUser.id || GUEST_USER.id };
  const appliedFallback = applyProfileCredits(currentProfile, { resetHistory: !bankrollInitialized });
  persistentBankrollHistory = [];
  persistentBankrollUserId = null;
  updateBankrollChartFilterUI();
  lastProfileSync = Date.now();
  currentRankState = null;
  renderHomeRankPanel();
  return appliedFallback;
}

async function handleAuthFormSubmit(event) {
  event.preventDefault();
  event.stopPropagation();
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : authForm;
  if (!form) return;

  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    if (authErrorEl) {
      authErrorEl.hidden = false;
      authErrorEl.textContent = "Please enter your email and password.";
    }
    hideAuthResendAction();
    return;
  }

  if (authSubmitButton) {
    authSubmitButton.disabled = true;
  }
  if (authErrorEl) {
    authErrorEl.hidden = true;
    authErrorEl.textContent = "";
  }
  hideAuthResendAction();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const normalizedMessage = String(error.message || "").toLowerCase();

      if (normalizedMessage.includes("email not confirmed")) {
        const message = "Email not confirmed. Please check your inbox, then sign in again.";
        showToast(message, "info");
        if (authErrorEl) {
          authErrorEl.hidden = false;
          authErrorEl.textContent = message;
        }
        if (authResendWrapEl) {
          authResendWrapEl.hidden = false;
        }
        return;
      }

      if (
        error?.status === 400 ||
        normalizedMessage.includes("invalid login credentials") ||
        normalizedMessage.includes("invalid login")
      ) {
        const message = "Invalid email or password. Please try again.";
        showToast(message, "error");
        if (authErrorEl) {
          authErrorEl.hidden = false;
          authErrorEl.textContent = message;
        }
        return;
      }

      throw error;
    }

    if (data?.user) {
      currentUser = data.user;
    } else {
      const { data: userResponse, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        console.error("[RTN] handleAuthFormSubmit getUser error", getUserError);
      }
      const fetchedUser = userResponse?.user ?? null;
      if (fetchedUser) {
        currentUser = fetchedUser;
      }
    }

    if (!currentUser) {
      const message = "Signed in, but unable to load your session. Please try again.";
      showToast(message, "error");
      if (authErrorEl) {
        authErrorEl.hidden = false;
        authErrorEl.textContent = message;
      }
      return;
    }

    // Ensure we fetch and apply the authoritative profile from the backend
    // immediately after sign-in so header balances reflect stored values.
    try {
      await ensureProfileSynced({ force: true });
    } catch (err) {
      console.warn("[RTN] post-signin profile sync failed", err);
    }

    showToast("Signed in", "success");
    await setRoute("home");
  } catch (error) {
    console.error(error);
    const message = error?.message || "Authentication failed";
    showToast(message, "error");
    if (authErrorEl) {
      authErrorEl.hidden = false;
      authErrorEl.textContent = message;
    }
  } finally {
    if (authSubmitButton) {
      authSubmitButton.disabled = false;
    }
  }
}

async function handleSignUpFormSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : signupForm;
  if (!form || !signupSubmitButton) {
    return;
  }

  const formData = new FormData(form);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    const message = "Please complete all fields.";
    if (signupErrorEl) {
      signupErrorEl.hidden = false;
      signupErrorEl.textContent = message;
    }
    return;
  }

  if (password !== confirmPassword) {
    const message = "Passwords do not match.";
    if (signupErrorEl) {
      signupErrorEl.hidden = false;
      signupErrorEl.textContent = message;
    }
    return;
  }

  signupSubmitButton.disabled = true;
  if (signupErrorEl) {
    signupErrorEl.hidden = true;
    signupErrorEl.textContent = "";
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`
        }
      }
    });

    if (error) {
      throw error;
    }

    showToast("Account created. Check your email to confirm, then sign in.", "info");
    if (signupForm) {
      signupForm.reset();
    }
    if (authEmailInput) {
      authEmailInput.value = email;
    }
    displayAuthScreen({ replaceHash: true });
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to create account";
    showToast(message, "error");
    if (signupErrorEl) {
      signupErrorEl.hidden = false;
      signupErrorEl.textContent = message;
    }
  } finally {
    signupSubmitButton.disabled = false;
  }
}

async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const form = event.currentTarget;
  if (!form) return;

  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();

  const forgotErrorEl = document.getElementById("forgot-error");
  const forgotSuccessEl = document.getElementById("forgot-success");
  const forgotSubmitButton = document.getElementById("forgot-submit");

  if (!email) {
    if (forgotErrorEl) {
      forgotErrorEl.hidden = false;
      forgotErrorEl.textContent = "Please enter your email address.";
    }
    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = true;
    }
    return;
  }

  if (forgotSubmitButton) {
    forgotSubmitButton.disabled = true;
  }
  if (forgotErrorEl) {
    forgotErrorEl.hidden = true;
    forgotErrorEl.textContent = "";
  }
  if (forgotSuccessEl) {
    forgotSuccessEl.hidden = true;
    forgotSuccessEl.textContent = "";
  }

  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      throw error;
    }

    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = false;
      forgotSuccessEl.textContent = "Check your email for a password reset link.";
    }
    showToast("Password reset link sent", "success");
    
    // Clear form
    form.reset();
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to send reset link";
    showToast(message, "error");
    if (forgotErrorEl) {
      forgotErrorEl.hidden = false;
      forgotErrorEl.textContent = message;
    }
  } finally {
    if (forgotSubmitButton) {
      forgotSubmitButton.disabled = false;
    }
  }
}

async function handleProfilePasswordResetRequest() {
  if (!currentUser?.email) {
    if (profileMessage) {
      profileMessage.textContent = "We couldn't find an email address for this account.";
      profileMessage.className = "profile-status-message error";
    }
    showToast("Unable to send reset email", "error");
    return;
  }

  const triggerButton = document.getElementById("profile-reset-password-button");
  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    if (profileMessage) {
      profileMessage.textContent = "Sending password reset email...";
      profileMessage.className = "profile-status-message";
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, {
      redirectTo
    });

    if (error) {
      throw error;
    }

    if (profileMessage) {
      profileMessage.textContent = `Password reset email sent to ${currentUser.email}.`;
      profileMessage.className = "profile-status-message success";
    }
    showToast("Password reset email sent", "success");
  } catch (error) {
    console.error("[RTN] handleProfilePasswordResetRequest error", error);
    if (profileMessage) {
      profileMessage.textContent = error?.message || "Unable to send password reset email.";
      profileMessage.className = "profile-status-message error";
    }
    showToast("Unable to send password reset email", "error");
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

async function handleResetPasswordSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
  const resetPasswordErrorEl = document.getElementById("reset-password-error");
  const resetPasswordSuccessEl = document.getElementById("reset-password-success");
  const resetPasswordSubmitButton = document.getElementById("reset-password-submit");
  if (!form) return;

  const formData = new FormData(form);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (resetPasswordErrorEl) {
    resetPasswordErrorEl.hidden = true;
    resetPasswordErrorEl.textContent = "";
  }
  if (resetPasswordSuccessEl) {
    resetPasswordSuccessEl.hidden = true;
    resetPasswordSuccessEl.textContent = "";
  }

  if (password.length < 6) {
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = "Password must be at least 6 characters.";
    }
    return;
  }

  if (password !== confirmPassword) {
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = "Passwords do not match.";
    }
    return;
  }

  try {
    if (resetPasswordSubmitButton) {
      resetPasswordSubmitButton.disabled = true;
    }

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      throw error;
    }

    if (resetPasswordSuccessEl) {
      resetPasswordSuccessEl.hidden = false;
      resetPasswordSuccessEl.textContent = "Password updated successfully.";
    }
    showToast("Password updated", "success");
    form.reset();
    await setRoute("home");
  } catch (error) {
    console.error("[RTN] handleResetPasswordSubmit error", error);
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = error?.message || "Unable to update password.";
    }
    showToast("Unable to update password", "error");
  } finally {
    if (resetPasswordSubmitButton) {
      resetPasswordSubmitButton.disabled = false;
    }
  }
}

async function resolvePurchaseRecord(prize, rpcResult) {
  if (!currentUser) {
    return null;
  }

  const unwrap = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value;
  };

  const candidate = unwrap(rpcResult);
  if (candidate && typeof candidate === "object") {
    if (candidate.id) {
      return candidate;
    }
    if (candidate.purchase_id) {
      return { ...candidate, id: candidate.purchase_id };
    }
  }

  try {
    const { data, error } = await supabase
      .from("prize_purchases")
      .select("id, prize_id, user_id, shipping_address, shipping_phone, created_at")
      .eq("user_id", currentUser.id)
      .eq("prize_id", prize.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Unable to resolve purchase record", error);
      return null;
    }

    return data ?? null;
  } catch (error) {
    console.error("Unable to resolve purchase record", error);
    return null;
  }
}

function openShippingModalForPurchase(purchase, prize) {
  if (!shippingModal || !purchase?.id) {
    return;
  }

  activeShippingPurchase = {
    id: purchase.id,
    prize,
    record: purchase
  };

  const currencyKey = (prize?.cost_currency ?? "units").toLowerCase();
  const currencyDetails = PRIZE_CURRENCIES[currencyKey] ?? PRIZE_CURRENCIES.units;
  const formattedCost = formatCurrency(Math.max(0, Math.round(Number(prize?.cost ?? 0))));

  if (shippingSummaryEl) {
    shippingSummaryEl.textContent = `${prize?.name ?? "Prize"} · ${formattedCost} ${currencyDetails.label}`;
  }

  if (shippingForm) {
    shippingForm.reset();
  }

  shippingModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  shippingModal.hidden = false;
  shippingModal.classList.add("is-open");
  shippingModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (shippingPhoneInput) {
    shippingPhoneInput.focus();
  }
}

function closeShippingModal({ restoreFocus = false } = {}) {
  if (!shippingModal) {
    return;
  }

  shippingModal.classList.remove("is-open");
  shippingModal.setAttribute("aria-hidden", "true");
  shippingModal.hidden = true;
  activeShippingPurchase = null;

  if (
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }

  if (restoreFocus && shippingModalTrigger instanceof HTMLElement) {
    shippingModalTrigger.focus();
  }
  shippingModalTrigger = null;
}

function openPrizeImageModal(prize) {
  if (!prizeImageModal || !prizeImagePreview) {
    return;
  }

  const imageUrl = typeof prize?.image_url === "string" ? prize.image_url.trim() : "";
  if (!imageUrl) {
    return;
  }

  const name = prize?.name ? String(prize.name).trim() : "Prize image";
  prizeImageTrigger =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  prizeImagePreview.src = imageUrl;
  prizeImagePreview.alt = `${name} preview`;
  if (prizeImageCaption) {
    const costValue = Math.max(0, Math.round(Number(prize?.cost ?? 0)));
    const currencyKey = (prize?.cost_currency ?? "units").toString().toLowerCase();
    const currencyDetails = PRIZE_CURRENCIES[currencyKey] ?? PRIZE_CURRENCIES.units;
    const details = [];
    if (name) {
      details.push(name);
    }
    if (costValue > 0) {
      details.push(`${formatCurrency(costValue)} ${currencyDetails.label}`);
    }
    if (prize?.description) {
      details.push(String(prize.description));
    }
    prizeImageCaption.textContent = details.join(" · ");
  }

  prizeImageModal.hidden = false;
  prizeImageModal.classList.add("is-open");
  prizeImageModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  prizeImageCloseButton?.focus();
}

function closePrizeImageModal({ restoreFocus = false } = {}) {
  if (!prizeImageModal) {
    return;
  }

  prizeImageModal.classList.remove("is-open");
  prizeImageModal.setAttribute("aria-hidden", "true");
  prizeImageModal.hidden = true;
  if (prizeImagePreview) {
    prizeImagePreview.src = "";
    prizeImagePreview.alt = "";
  }
  if (prizeImageCaption) {
    prizeImageCaption.textContent = "";
  }

  if (
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }

  const focusTarget =
    restoreFocus && prizeImageTrigger instanceof HTMLElement ? prizeImageTrigger : null;
  prizeImageTrigger = null;
  focusTarget?.focus();
}

function openNumberBetsModal() {
  if (!numberBetsModal) {
    return;
  }

  numberBetsModal.hidden = false;
  numberBetsModal.classList.add("is-open");
  numberBetsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  
  const okButton = numberBetsModal.querySelector("#number-bets-modal-ok");
  if (okButton) {
    okButton.focus();
  }
}

function closeNumberBetsModal({ restoreFocus = true } = {}) {
  if (!numberBetsModal) {
    return;
  }

  numberBetsModal.classList.remove("is-open");
  numberBetsModal.setAttribute("aria-hidden", "true");
  numberBetsModal.hidden = true;

  if (
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }

  if (restoreFocus && numberBetsInfoButton) {
    numberBetsInfoButton.focus();
  }
}

function openBetAnalyticsModal() {
  if (!betAnalyticsModal) {
    return;
  }

  betAnalyticsModal.hidden = false;
  betAnalyticsModal.classList.add("is-open");
  betAnalyticsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  
  const okButton = betAnalyticsModal.querySelector("#bet-analytics-ok");
  if (okButton) {
    okButton.focus();
  }
}

function closeBetAnalyticsModal() {
  if (!betAnalyticsModal) {
    return;
  }

  betAnalyticsModal.classList.remove("is-open");
  betAnalyticsModal.setAttribute("aria-hidden", "true");
  betAnalyticsModal.hidden = true;

  if (
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!numberBetsModal || numberBetsModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function loadBetAnalytics(betKey, betLabel) {
  if (!supabase) {
    console.warn("[RTN] Cannot load bet analytics: Supabase client not initialized");
    return;
  }

  console.info(`[RTN] Loading analytics for bet: ${betKey}`);

  // Store bet key globally for chart filter buttons
  window.currentAnalyticsBetKey = betKey;

  // Update modal title
  const modalTitle = document.getElementById("bet-analytics-title");
  if (modalTitle) {
    modalTitle.textContent = `${betLabel} Analytics`;
  }

  // Query bet_plays table with pagination (handle more than 1000 records)
  const allData = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("bet_plays")
      .select("amount_wagered, amount_paid, net")
      .eq("bet_key", betKey)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    // Apply player filter if selected
    if (selectedPlayerIds && selectedPlayerIds.length > 0) {
      query = query.in("user_id", selectedPlayerIds);
    }
    
    const { data, error } = await query;

    if (error) {
      console.error("[RTN] Error loading bet analytics:", error);
      
      document.getElementById("analytics-total-bets").textContent = "0";
      document.getElementById("analytics-total-wagered").textContent = "$0";
      document.getElementById("analytics-net-return").textContent = "$0";
      document.getElementById("analytics-house-edge").textContent = "0.00%";
      openBetAnalyticsModal();
      return;
    }

    if (data && data.length > 0) {
      allData.push(...data);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  console.info(`[RTN] Loaded ${allData.length} bet plays for ${betKey}`);

  // Calculate statistics using correct column names
  const totalBets = allData.length;
  const totalWagered = allData.reduce((sum, play) => sum + (play.amount_wagered || 0), 0);
  const totalPaidOut = allData.reduce((sum, play) => sum + (play.amount_paid || 0), 0);
  const netReturn = totalPaidOut; // Net player return is total amount paid to players
  const houseEdge = totalWagered > 0 ? (((totalWagered - totalPaidOut) / totalWagered) * 100).toFixed(2) : "0.00";

  // Update modal content
  document.getElementById("analytics-total-bets").textContent = totalBets.toLocaleString();
  document.getElementById("analytics-total-wagered").textContent = `$${totalWagered.toLocaleString()}`;
  document.getElementById("analytics-net-return").textContent = `$${netReturn.toLocaleString()}`;
  document.getElementById("analytics-house-edge").textContent = `${houseEdge}%`;

  // Reset filter buttons to "all" active state
  document.querySelectorAll(".analytics-modal .chart-filter-btn[data-period]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.period === "all");
  });

  // Render chart with default "all" time period
  await renderBetVolumeChart(betKey, "all");

  openBetAnalyticsModal();
}

// Global variable to store chart instance
let betVolumeChartInstance = null;

async function renderBetVolumeChart(betKey, period) {
  if (!supabase) {
    console.warn("[RTN] Cannot render chart: Supabase client not initialized");
    return;
  }

  console.info(`[RTN] Rendering bet volume chart for ${betKey} with period: ${period}`);

  // Calculate date range based on period
  const now = new Date();
  let startDate = null;

  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90days":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "year":
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      startDate = null; // No date filter
      break;
  }

  // Build query with pagination
  const allPlays = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("bet_plays")
      .select("id, placed_at")
      .eq("bet_key", betKey)
      .order("placed_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (startDate) {
      query = query.gte("placed_at", startDate.toISOString());
    }
    
    // Apply player filter if selected
    if (selectedPlayerIds && selectedPlayerIds.length > 0) {
      query = query.in("user_id", selectedPlayerIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[RTN] Error loading chart data:", error);
      return;
    }

    if (data && data.length > 0) {
      allPlays.push(...data);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  console.info(`[RTN] Loaded ${allPlays.length} plays for chart`);

  // Determine the date range to fill
  const effectiveStartDate = startDate || (allPlays.length > 0 ? new Date(allPlays[0].placed_at) : new Date());
  const endDate = new Date();
  
  // Fill all dates in range
  const allDates = [];
  const currentDate = new Date(effectiveStartDate);
  currentDate.setHours(0, 0, 0, 0);
  
  while (currentDate <= endDate) {
    allDates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Group by date and count unique IDs
  const countsByDate = {};
  allDates.forEach(date => {
    countsByDate[date] = 0;
  });
  
  // Count each record (each has unique ID)
  allPlays.forEach(play => {
    const date = new Date(play.placed_at).toISOString().split("T")[0];
    if (countsByDate.hasOwnProperty(date)) {
      countsByDate[date]++;
    }
  });

  // Convert to arrays for Chart.js
  const dates = allDates;
  const counts = dates.map(date => countsByDate[date]);

  // Get canvas context
  const canvas = document.getElementById("bet-analytics-chart");
  if (!canvas) {
    console.warn("[RTN] Chart canvas not found");
    return;
  }

  const ctx = canvas.getContext("2d");

  // Destroy existing chart if it exists
  if (betVolumeChartInstance) {
    betVolumeChartInstance.destroy();
  }

  // Create new chart
  betVolumeChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "Bet Plays",
        data: counts,
        borderColor: "rgba(53, 255, 234, 1)",
        backgroundColor: "rgba(53, 255, 234, 0.2)",
        borderWidth: 2,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(9, 18, 32, 0.95)",
          titleColor: "rgba(53, 255, 234, 1)",
          bodyColor: "rgba(226, 248, 255, 0.9)",
          borderColor: "rgba(53, 255, 234, 0.5)",
          borderWidth: 1,
          padding: 12,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            precision: 0
          }
        }
      }
    }
  });

  console.info("[RTN] Chart rendered successfully");
}

// Global variable for overview chart
let overviewChartInstance = null;
let activeUsersChartInstance = null;

async function renderOverviewChart(period = "year") {
  if (!supabase) {
    console.warn("[RTN] Cannot render overview chart: Supabase client not initialized");
    return;
  }

  // Show loading state
  const loadingOverlay = document.querySelector(".overview-chart-loading");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }
  
  // Disable filter buttons during load
  document.querySelectorAll(".overview-filters .chart-filter-btn").forEach(btn => {
    btn.disabled = true;
  });

  console.info(`[RTN] Rendering overview chart with period: ${period}`);

  const now = new Date();
  const startDate = getAnalyticsPeriodStart(period);

  const renderChart = (labels, seriesEntries) => {
    const canvas = document.getElementById("overview-analytics-chart");
    if (!canvas) {
      console.warn("[RTN] Overview chart canvas not found");
      return;
    }

    const ctx = canvas.getContext("2d");

    if (overviewChartInstance) {
      overviewChartInstance.destroy();
    }

    overviewChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: (Array.isArray(seriesEntries) ? seriesEntries : []).map((entry, index) => {
          const palette = [
            {
              borderColor: "rgba(255, 209, 102, 1)",
              backgroundColor: "rgba(255, 209, 102, 0.18)"
            },
            {
              borderColor: "rgba(255, 127, 216, 1)",
              backgroundColor: "rgba(255, 127, 216, 0.16)"
            }
          ];
          const colors = palette[index] || palette[0];
          return {
            label: entry.label,
            data: entry.values,
            borderColor: colors.borderColor,
            backgroundColor: colors.backgroundColor,
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: entry.values.length > 1 ? 0 : 4,
            pointHoverRadius: 4
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: "rgba(226, 248, 255, 0.85)",
              boxWidth: 14,
              boxHeight: 14
            }
          },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(9, 18, 32, 0.95)",
            titleColor: "rgba(255, 105, 180, 1)",
            bodyColor: "rgba(226, 248, 255, 0.9)",
            borderColor: "rgba(255, 105, 180, 0.5)",
            borderWidth: 1,
            padding: 12,
            displayColors: true
          }
        },
        scales: {
          x: {
            grid: {
              color: "rgba(53, 255, 234, 0.1)"
            },
            ticks: {
              color: "rgba(173, 225, 247, 0.75)",
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(53, 255, 234, 0.1)"
            },
            ticks: {
              color: "rgba(173, 225, 247, 0.75)",
              precision: 0
            },
            title: {
              display: true,
              text: "Hands Played",
              color: "rgba(173, 225, 247, 0.75)"
            }
          }
        }
      }
    });
  };

  const finalizeOverviewLoad = () => {
    console.info("[RTN] Overview chart rendered successfully");
    if (loadingOverlay) {
      loadingOverlay.style.display = "none";
    }
    document.querySelectorAll(".overview-filters .chart-filter-btn").forEach((btn) => {
      btn.disabled = false;
    });
  };

  if (period === "hour" || period === "day") {
    try {
      const series = await buildHandsByGameSeries(period, {
        startAt: startDate,
        endAt: now,
        userIds: selectedPlayerIds && selectedPlayerIds.length > 0 ? selectedPlayerIds : null
      });
      renderChart(series.labels, series.datasets);
      finalizeOverviewLoad();
      return;
    } catch (error) {
      console.error("[RTN] Error loading short-window overview hands data:", error);
      if (loadingOverlay) loadingOverlay.style.display = "none";
      document.querySelectorAll(".overview-filters .chart-filter-btn").forEach((btn) => {
        btn.disabled = false;
      });
      return;
    }
  }

  // Determine date range for chart
  let chartStartDate;
  if (startDate) {
    chartStartDate = startDate;
  } else {
    chartStartDate = new Date(now);
    chartStartDate.setDate(chartStartDate.getDate() - 29);
  }

  // Generate all dates from start to today
  const toLocalDateKey = (value) => formatAnalyticsDateKey(value);

  const dates = [];
  const current = new Date(chartStartDate);
  current.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  while (current <= today) {
    dates.push(toLocalDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  try {
    const series = await buildHandsByGameSeries(period, {
      startAt: startDate,
      endAt: now,
      userIds: selectedPlayerIds && selectedPlayerIds.length > 0 ? selectedPlayerIds : null
    });
    renderChart(series.labels.length ? series.labels : dates, series.datasets);
    finalizeOverviewLoad();
  } catch (error) {
    console.error("[RTN] Error loading overview hands data:", error);
    if (loadingOverlay) loadingOverlay.style.display = "none";
    document.querySelectorAll(".overview-filters .chart-filter-btn").forEach((btn) => {
      btn.disabled = false;
    });
    return;
  }
}

function updateActiveUsersChartFilterUI() {
  activeUsersFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.activeUsersPeriod === activeUsersChartPeriod);
  });

  if (!activeUsersSubheadEl) return;

  const labels = {
    week: "Daily snapshots of DAU, WAU, and MAU for the last week based on users who played at least one hand. This chart reflects overall app usage.",
    month: "Daily snapshots of DAU, WAU, and MAU for the last month based on users who played at least one hand. This chart reflects overall app usage.",
    "90days": "Daily snapshots of DAU, WAU, and MAU for the last 90 days based on users who played at least one hand. This chart reflects overall app usage.",
    year: "Daily snapshots of DAU, WAU, and MAU for the last year based on users who played at least one hand. This chart reflects overall app usage.",
    all: "Daily snapshots of DAU, WAU, and MAU across all time based on users who played at least one hand. This chart reflects overall app usage."
  };

  activeUsersSubheadEl.textContent = labels[activeUsersChartPeriod] || labels.all;
}

async function renderActiveUsersChart(period = "year") {
  if (!supabase) {
    console.warn("[RTN] Cannot render active users chart: Supabase client not initialized");
    return;
  }

  activeUsersChartPeriod = period;
  updateActiveUsersChartFilterUI();

  const loadingOverlay = document.querySelector(".active-users-chart-loading");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }

  activeUsersFilterButtons.forEach((btn) => {
    btn.disabled = true;
  });

  const now = new Date();
  const startDate = getAnalyticsPeriodStart(period);

  const toLocalDateKey = (value) => formatAnalyticsDateKey(value);

  const { data, error } = await supabase.rpc("get_admin_app_activity_snapshot_timeseries", {
    start_at: startDate ? startDate.toISOString() : null,
    end_at: now.toISOString()
  });

  if (error) {
    console.error("[RTN] Error loading active users snapshots:", error);
    if (loadingOverlay) loadingOverlay.style.display = "none";
    activeUsersFilterButtons.forEach((btn) => {
      btn.disabled = false;
    });
    return;
  }

  let chartStartDate = startDate;
  if (!chartStartDate) {
    const firstSnapshotDate = Array.isArray(data) && data.length ? new Date(data[0].snapshot_date) : null;
    if (firstSnapshotDate && !Number.isNaN(firstSnapshotDate.getTime())) {
      chartStartDate = firstSnapshotDate;
    } else {
      chartStartDate = new Date(now);
      chartStartDate.setDate(chartStartDate.getDate() - 29);
    }
  }

  const dates = [];
  const current = new Date(chartStartDate);
  current.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  while (current <= today) {
    dates.push(toLocalDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  const snapshotMap = {};
  dates.forEach((date) => {
    snapshotMap[date] = {
      dau: 0,
      wau: 0,
      mau: 0
    };
  });

  (data || []).forEach((row) => {
    const dateStr = typeof row.snapshot_date === "string" ? row.snapshot_date : toLocalDateKey(row.snapshot_date);
    if (Object.prototype.hasOwnProperty.call(snapshotMap, dateStr)) {
      snapshotMap[dateStr] = {
        dau: Number(row.daily_active_users || 0),
        wau: Number(row.weekly_active_users || 0),
        mau: Number(row.monthly_active_users || 0)
      };
    }
  });

  const canvas = document.getElementById("active-users-analytics-chart");
  if (!canvas) {
    console.warn("[RTN] Active users chart canvas not found");
    return;
  }

  const ctx = canvas.getContext("2d");

  if (activeUsersChartInstance) {
    activeUsersChartInstance.destroy();
  }

  activeUsersChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "DAU",
          data: dates.map((date) => snapshotMap[date].dau),
          borderColor: "rgba(53, 255, 234, 1)",
          backgroundColor: "rgba(53, 255, 234, 0.12)",
          borderWidth: 2,
          fill: false,
          tension: 0.3
        },
        {
          label: "WAU",
          data: dates.map((date) => snapshotMap[date].wau),
          borderColor: "rgba(255, 105, 180, 1)",
          backgroundColor: "rgba(255, 105, 180, 0.12)",
          borderWidth: 2,
          fill: false,
          tension: 0.3
        },
        {
          label: "MAU",
          data: dates.map((date) => snapshotMap[date].mau),
          borderColor: "rgba(255, 190, 92, 1)",
          backgroundColor: "rgba(255, 190, 92, 0.12)",
          borderWidth: 2,
          fill: false,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "rgba(226, 248, 255, 0.85)",
            boxWidth: 14,
            boxHeight: 14
          }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(9, 18, 32, 0.95)",
          titleColor: "rgba(255, 105, 180, 1)",
          bodyColor: "rgba(226, 248, 255, 0.9)",
          borderColor: "rgba(255, 105, 180, 0.5)",
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            precision: 0
          },
          title: {
            display: true,
            text: "Active Users",
            color: "rgba(173, 225, 247, 0.75)"
          }
        }
      }
    }
  });

  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }

  activeUsersFilterButtons.forEach((btn) => {
    btn.disabled = false;
  });
}

// Load badge count for individual bet - uses EXACT same query as modal
async function loadBetBadgeCount(betKey) {
  if (!supabase) return 0;

  let query = supabase
    .from("bet_plays")
    .select("id", { count: "exact", head: true })
    .eq("bet_key", betKey);

  const startDate = getAnalyticsPeriodStart(analyticsBetBadgePeriod);
  if (startDate) {
    query = query.gte("placed_at", startDate.toISOString());
  }
  
  // Apply player filter if selected
  if (selectedPlayerIds && selectedPlayerIds.length > 0) {
    query = query.in("user_id", selectedPlayerIds);
  }
  
  const { count, error } = await query;

  if (error) {
    console.error(`[RTN] Error loading count for ${betKey}:`, error);
    return 0;
  }

  const exactCount = count ?? 0;
  console.info(`[RTN] Badge count for ${betKey} (${analyticsBetBadgePeriod}): ${exactCount}`);
  return exactCount;
}

async function notifyAdminPurchase({ purchase, prize, shipping }) {
  if (!currentUser) {
    return;
  }

  const payload = {
    adminEmail: ADMIN_EMAIL,
    user: {
      id: currentUser.id,
      email: currentUser.email,
      first_name: currentProfile?.first_name ?? null,
      last_name: currentProfile?.last_name ?? null
    },
    prize: {
      id: prize?.id ?? null,
      name: prize?.name ?? null,
      description: prize?.description ?? null,
      cost: prize?.cost ?? null,
      currency: prize?.cost_currency ?? "units"
    },
    purchase: {
      id: purchase?.id ?? null,
      user_id: purchase?.user_id ?? currentUser.id,
      created_at: purchase?.created_at ?? null
    },
    balances: {
      units: bankroll,
      carter_cash: carterCash
    },
    shipping
  };

  try {
    const { error } = await supabase.functions.invoke("send_admin_purchase_email", {
      body: payload
    });
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Unable to notify admin", error);
  }
}

async function handleShippingSubmit(event) {
  event.preventDefault();
  if (!shippingForm) return;

  if (!activeShippingPurchase?.id) {
    closeShippingModal({ restoreFocus: true });
    return;
  }

  const phone = shippingPhoneInput ? shippingPhoneInput.value.trim() : "";
  const address = shippingAddressInput ? shippingAddressInput.value.trim() : "";

  if (!phone || !address) {
    showToast("Please provide both a phone number and shipping address.", "error");
    return;
  }

  if (shippingSubmitButton) {
    shippingSubmitButton.disabled = true;
  }

  try {
    const { error } = await supabase
      .from("prize_purchases")
      .update({ shipping_phone: phone, shipping_address: address })
      .eq("id", activeShippingPurchase.id);

    if (error) {
      throw error;
    }

    const purchasePayload = activeShippingPurchase.record
      ? { ...activeShippingPurchase.record }
      : { id: activeShippingPurchase.id, user_id: currentUser?.id ?? null };

    await notifyAdminPurchase({
      purchase: purchasePayload,
      prize: activeShippingPurchase.prize,
      shipping: { phone, address }
    });

    showToast("Shipping details saved!", "success");
    closeShippingModal({ restoreFocus: true });
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Unable to save shipping details", "error");
  } finally {
    if (shippingSubmitButton) {
      shippingSubmitButton.disabled = false;
    }
  }
}

async function loadDashboard(force = false) {
  const { data: userResponse, error: dashboardUserError } = await supabase.auth.getUser();
  if (dashboardUserError) {
    console.error("[RTN] loadDashboard getUser error", dashboardUserError);
  }
  const sessionUser = userResponse?.user ?? null;
  if (!sessionUser) {
    forceAuth("dashboard-no-user", {
      message: "Session required. Please sign in again.",
      tone: "warning"
    });
    return;
  }
  currentUser = sessionUser;
  
  // Check if we have a real profile (not guest)
  const hasRealProfile = currentProfile && currentProfile.id && currentProfile.id !== GUEST_USER.id;
  
  if (dashboardLoaded && !force && hasRealProfile) {
    if (dashboardEmailEl) {
      dashboardEmailEl.textContent = currentUser.email || "";
    }
    if (currentProfile) {
      updateDashboardCreditsDisplay(currentProfile.credits ?? 0);
      updateDashboardCarterDisplay(currentProfile.carter_cash ?? 0);
    }
    return;
  }
  dashboardLoaded = true;
  if (dashboardEmailEl) {
    dashboardEmailEl.textContent = currentUser.email || "";
  }
  
  // Always fetch profile to ensure we have the latest data
  let resolvedProfile = await fetchProfileWithRetries(currentUser.id, {
    attempts: 5,
    delayMs: 1000,
    timeoutMs: 5000
  });

  if (resolvedProfile) {
    if (isIncomingProfileStale(resolvedProfile)) {
      return;
    }
    console.info(
      `[RTN] loadDashboard applying profile ${resolvedProfile.id} (credits=${resolvedProfile.credits}, carterCash=${resolvedProfile.carter_cash})`
    );
    const appliedProfile = applyProfileCredits(resolvedProfile, {
      resetHistory: !bankrollInitialized
    });
    const profileForDashboard = appliedProfile ?? resolvedProfile;
    currentProfile = profileForDashboard;
    lastProfileSync = Date.now();
    await refreshCurrentRankState({ force });
    if (dashboardProfileRetryTimer) {
      clearTimeout(dashboardProfileRetryTimer);
      dashboardProfileRetryTimer = null;
    }
    updateDashboardCreditsDisplay(profileForDashboard.credits ?? 0);
    updateDashboardCarterDisplay(profileForDashboard.carter_cash ?? 0);
  } else if (dashboardCreditsEl) {
    dashboardCreditsEl.textContent = "Setting up your account...";
    updateDashboardCarterDisplay("–");
    if (!dashboardProfileRetryTimer) {
      dashboardProfileRetryTimer = setTimeout(() => {
        dashboardProfileRetryTimer = null;
        loadDashboard(true);
      }, 1000);
    }
  }
  const { data: runs, error: runsError } = await supabase
    .from("game_runs")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (runsError) {
    console.error(runsError);
    showToast("Unable to load game runs", "error");
  } else if (dashboardRunsEl) {
    dashboardRunsEl.innerHTML = "";
    if (runs.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No game runs recorded yet.";
      dashboardRunsEl.appendChild(empty);
    } else {
      runs.forEach((run) => {
        const item = document.createElement("li");
        const date = run.created_at ? new Date(run.created_at).toLocaleString() : "";
        item.innerHTML = `<span class="run-score">Score: ${run.score}</span><span class="run-date">${date}</span>`;
        dashboardRunsEl.appendChild(item);
      });
    }
  }
}

function renderPrize(prize) {
  const item = document.createElement("li");
  item.className = "admin-prize-item store-prize-item";
  item.dataset.id = prize?.id ?? "";

  const main = document.createElement("div");
  main.className = "admin-prize-main";

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "admin-prize-thumb";
  const imageUrl = typeof prize?.image_url === "string" ? prize.image_url.trim() : "";
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = prize?.name ? `${prize.name} preview` : "Prize image";
    thumbWrap.appendChild(img);
    thumbWrap.setAttribute("role", "button");
    thumbWrap.setAttribute(
      "aria-label",
      prize?.name ? `View larger image of ${prize.name}` : "View larger prize image"
    );
    thumbWrap.tabIndex = 0;
    const handlePreview = () => openPrizeImageModal(prize);
    thumbWrap.addEventListener("click", handlePreview);
    thumbWrap.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlePreview();
      }
    });
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "admin-prize-thumb-placeholder";
    placeholder.textContent = "No image";
    thumbWrap.appendChild(placeholder);
  }

  const info = document.createElement("div");
  info.className = "admin-prize-info";

  const nameEl = document.createElement("h3");
  nameEl.className = "admin-prize-name";
  nameEl.textContent = prize?.name ?? "Prize";
  info.appendChild(nameEl);

  if (prize?.description) {
    const descEl = document.createElement("p");
    descEl.className = "admin-prize-description";
    descEl.textContent = prize.description;
    info.appendChild(descEl);
  }

  const currencyKey = (prize?.cost_currency ?? "units").toString().toLowerCase();
  const currencyDetails = PRIZE_CURRENCIES[currencyKey] ?? PRIZE_CURRENCIES.units;
  const costValue = Math.max(0, Math.round(Number(prize?.cost ?? 0)));
  const formattedCost = formatCurrency(costValue);

  const meta = document.createElement("div");
  meta.className = "admin-prize-meta store-prize-meta";
  meta.textContent = `${formattedCost} ${currencyDetails.label}`;
  info.appendChild(meta);

  main.append(thumbWrap, info);
  item.appendChild(main);

  const controls = document.createElement("div");
  controls.className = "store-prize-controls";

  const priceEl = document.createElement("span");
  priceEl.className = "store-prize-price";
  priceEl.textContent = `${formattedCost} ${currencyDetails.label}`;
  controls.appendChild(priceEl);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary store-prize-button";

  const isActive = prize?.active !== false;
  if (isActive) {
    button.textContent = "Redeem";
    button.addEventListener("click", () => handlePurchase(prize, button));
  } else {
    button.textContent = "Sold";
    button.disabled = true;
    item.classList.add("is-sold");
  }

  controls.appendChild(button);
  item.appendChild(controls);

  if (!isActive) {
    const soldBadge = document.createElement("span");
    soldBadge.className = "store-prize-badge";
    soldBadge.textContent = "Sold";
    item.appendChild(soldBadge);
  }

  return item;
}

async function loadPrizeShop(force = false) {
  const { data: userResponse, error: prizeShopUserError } = await supabase.auth.getUser();
  if (prizeShopUserError) {
    console.error("[RTN] loadPrizeShop getUser error", prizeShopUserError);
  }
  const sessionUser = userResponse?.user ?? null;
  if (!sessionUser) {
    forceAuth("prize-shop-no-user", {
      message: "Sign in to access the prize shop.",
      tone: "warning"
    });
    return;
  }
  currentUser = sessionUser;
  await ensureProfileSynced({ force: force || !currentProfile });
  if (prizesLoaded && !force) return;
  prizesLoaded = true;
  if (!prizeListEl) return;
  prizeListEl.innerHTML = "";
  const loadingItem = document.createElement("li");
  loadingItem.className = "admin-prize-empty";
  loadingItem.textContent = "Loading prizes...";
  prizeListEl.appendChild(loadingItem);
  const { data: prizes, error } = await supabase
    .from("prizes")
    .select("*")
    .order("active", { ascending: false })
    .order("cost", { ascending: true });
  if (error) {
    console.error(error);
    prizeListEl.innerHTML = "";
    const errorItem = document.createElement("li");
    errorItem.className = "admin-prize-empty";
    errorItem.textContent = "Unable to load prizes.";
    prizeListEl.appendChild(errorItem);
    showToast("Unable to load prizes", "error");
    return;
  }
  prizeListEl.innerHTML = "";
  if (!prizes || prizes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "admin-prize-empty";
    empty.textContent = "No prizes are available right now. Check back soon.";
    prizeListEl.appendChild(empty);
    return;
  }

  prizes.forEach((prize) => {
    prizeListEl.appendChild(renderPrize(prize));
  });
}

async function handlePurchase(prize, button) {
  if (!currentUser) {
    showToast("Please sign in first", "error");
    return;
  }
  if (!prize || !prize.id) {
    showToast("Unable to identify prize", "error");
    return;
  }

  const currencyKey = (prize.cost_currency ?? "units").toLowerCase();
  const currencyDetails = PRIZE_CURRENCIES[currencyKey] ?? PRIZE_CURRENCIES.units;
  const costValue = Math.max(0, Math.round(Number(prize.cost ?? 0)));
  const available = currencyDetails.key === "carter_cash" ? carterCash : bankroll;

  if (costValue > available) {
    showToast(
      `Not enough ${currencyDetails.label} to purchase ${prize.name}.`,
      "error"
    );
    return;
  }

  if (prize.active === false) {
    showToast("This prize has already been sold.", "error");
    return;
  }

  // Instead of performing the purchase immediately, prompt the user for
  // contact details. Credits aren't deducted until the user SUBMITs the
  // contact form.
  if (button) {
    // keep the original button reference so we can re-enable if needed
    button.disabled = false;
  }
  openRedeemModal(prize);
}

// -- Redeem modal flow -------------------------------------------------
let redeemModal = null;
let redeemAddressInput = null;
let redeemPhoneInput = null;
let redeemEmailInput = null;
let redeemSubmitButton = null;
let redeemCancelButton = null;
let redeemCurrentPrize = null;

function ensureRedeemModal() {
  if (redeemModal) return;
  const modal = document.createElement("div");
  modal.className = "redeem-modal modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel">
      <h2>Contact Details</h2>
      <form class="redeem-form">
        <label>Shipping Address<textarea name="address" required></textarea></label>
        <label>Contact Phone Number (optional)<input name="phone" type="tel" /></label>
        <label>Contact Email<input name="email" type="email" required /></label>
        <div class="modal-actions">
          <button type="button" class="secondary redeem-cancel">Cancel</button>
          <button type="submit" class="primary redeem-submit">Submit</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  redeemModal = modal;
  const form = modal.querySelector(".redeem-form");
  redeemAddressInput = form.querySelector('textarea[name="address"]');
  redeemPhoneInput = form.querySelector('input[name="phone"]');
  redeemEmailInput = form.querySelector('input[name="email"]');
  redeemSubmitButton = form.querySelector(".redeem-submit");
  redeemCancelButton = form.querySelector(".redeem-cancel");
  const backdrop = modal.querySelector(".modal-backdrop");

  redeemCancelButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.info("[RTN] Cancel button clicked");
    closeRedeemModal();
  });

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation();
      console.info("[RTN] Backdrop clicked");
      closeRedeemModal();
    });
  }

  // Prevent panel clicks from closing modal
  const panel = modal.querySelector(".modal-panel");
  if (panel) {
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  let redeemSubmitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (redeemSubmitting) return;
    if (!redeemCurrentPrize) return;
    const addr = (redeemAddressInput.value || "").trim();
    const phone = (redeemPhoneInput.value || "").trim();
    const email = (redeemEmailInput.value || "").trim();
    if (!addr || !email) {
      showToast("Please provide Shipping Address and Contact Email.", "error");
      return;
    }
    redeemSubmitting = true;
    redeemSubmitButton.disabled = true;
    const originalText = redeemSubmitButton.textContent;
    redeemSubmitButton.textContent = "Purchasing...";
    try {
      await submitRedeem(redeemCurrentPrize, { address: addr, phone, email });
      // Close the modal immediately after successful purchase and remove
      // it from the DOM to avoid lingering UI. Show a custom success
      // message so the user sees confirmation and next steps.
      closeRedeemModal();
      // remove the modal element to ensure no stale event listeners or
      // visual remnants remain; recreate later if needed
      setTimeout(() => {
        if (redeemModal && redeemModal.parentElement) {
          try {
            redeemModal.remove();
          } catch (e) {
            /* ignore */
          }
        }
        redeemModal = null;
      }, 180);
      showToast("Congrats — your item is on its way! We'll reach out via email with more information.", "success");
    } catch (err) {
      console.error("Redeem submit failed", err);
      showToast(err?.message || "Unable to complete purchase", "error");
    } finally {
      redeemSubmitButton.disabled = false;
      redeemSubmitButton.textContent = originalText;
      redeemSubmitting = false;
    }
  });
}

function openRedeemModal(prize) {
  ensureRedeemModal();
  redeemCurrentPrize = prize;
  if (redeemAddressInput) redeemAddressInput.value = "";
  if (redeemPhoneInput) redeemPhoneInput.value = "";
  if (redeemEmailInput) redeemEmailInput.value = currentUser?.email || "";
  redeemModal.classList.add("is-open");
  redeemModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  redeemAddressInput.focus();
}

function closeRedeemModal() {
  console.info("[RTN] closeRedeemModal called");
  if (!redeemModal) {
    console.warn("[RTN] closeRedeemModal: modal not found");
    return;
  }
  redeemModal.classList.remove("is-open");
  redeemModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  redeemCurrentPrize = null;
  console.info("[RTN] closeRedeemModal completed");
}

async function submitRedeem(prize, contact) {
  if (!currentUser || !prize) throw new Error("Missing user or prize");

  const currencyKey = (prize.cost_currency ?? "units").toLowerCase();
  const costValue = Math.max(0, Math.round(Number(prize.cost ?? 0)));

  try {
    // First: verify prize is still active before attempting purchase
    const { data: prizeCheck, error: checkError } = await supabase
      .from("prizes")
      .select("id, active")
      .eq("id", prize.id)
      .single();

    if (checkError || !prizeCheck || prizeCheck.active === false) {
      throw new Error("This prize was just claimed by someone else.");
    }

    // Second: insert purchase record with cost
    const { error: purchaseError } = await supabase
      .from("prize_purchases")
      .insert({
        prize_id: prize.id,
        user_id: currentUser.id,
        shipping_address: contact.address,
        shipping_phone: contact.phone || null,
        contact_email: contact.email || null,
        cost: costValue
      });

    if (purchaseError) {
      console.error("prize_purchases insert error", purchaseError);
      throw new Error("Failed to record purchase. Please try again.");
    }

    // Third: mark prize as sold (inactive)
    const { error: prizeUpdateError, data: updateData } = await supabase
      .from("prizes")
      .update({ active: false })
      .eq("id", prize.id)
      .select();

    if (prizeUpdateError) {
      console.error("Failed to mark prize sold", prizeUpdateError);
      // Don't throw - purchase already recorded, but warn user
      showToast("Purchase recorded but prize may still show as available. Please refresh.", "warning");
    }

    if (!updateData || updateData.length === 0) {
      console.warn("Prize update returned no data - prize may not have been marked inactive");
    } else {
      console.info("[RTN] Prize marked sold:", { prizeId: prize.id, updateData });
    }

    // Deduct cost locally and persist
    if (currencyKey === "carter_cash") {
      deductCarterCash(costValue);
    } else {
      bankroll = Math.max(0, bankroll - costValue);
      handleBankrollChanged();
    }
    await persistBankroll();
    await ensureProfileSynced({ force: true });

    showToast(`Purchased ${prize.name}!`, "success");
    
    // Force clear all caches to ensure fresh data
    prizesLoaded = false;
    dashboardLoaded = false;
    adminPrizesLoaded = false;

    // Small delay to ensure database trigger has completed
    await delay(500);

    // Refresh all views
    await loadDashboard(true);
    await loadPrizeShop(true);
    await loadAdminPrizeList(true);
  } catch (error) {
    console.error("submitRedeem error", error);
    throw error;
  }
}

async function handlePrizeImageSelection(event) {
  const input = event?.currentTarget;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const file = input.files?.[0];
  if (!file) {
    return;
  }

  if (!isAdmin()) {
    showToast("Admin access only", "error");
    input.value = "";
    return;
  }

  if (adminPrizeMessage) {
    adminPrizeMessage.textContent = "Uploading image...";
  }

  input.disabled = true;

  try {
    const publicUrl = await uploadPrizeImage(file);
    if (adminPrizeImageUrlInput) {
      adminPrizeImageUrlInput.value = publicUrl;
      adminPrizeImageUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    showToast("Image uploaded", "success");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = "Image uploaded. Review details and create the prize.";
    }
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to upload image";
    showToast(message, "error");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = `Image upload failed: ${message}`;
    }
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

async function handleAdminPrizeSubmit(event) {
  event.preventDefault();
  if (!adminPrizeForm) return;

  if (!isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }

  if (adminPrizeMessage) {
    adminPrizeMessage.textContent = "";
  }

  const formData = new FormData(adminPrizeForm);
  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = formData.get("description");
  const description = descriptionRaw ? String(descriptionRaw).trim() : null;
  const imageUrlRaw = formData.get("imageUrl");
  const imageUrl = imageUrlRaw ? String(imageUrlRaw).trim() : "";
  const costValue = Number(formData.get("cost"));
  const active = formData.get("active") === "on";
  const currencyRaw = formData.get("currency");
  const currencyKey = typeof currencyRaw === "string" ? currencyRaw.toLowerCase() : "units";
  const currencyDetails = PRIZE_CURRENCIES[currencyKey];
  const isEdit = Boolean(adminEditingPrizeId);

  if (!name) {
    showToast("Name is required", "error");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = "Please provide a name.";
    }
    return;
  }

  if (!Number.isFinite(costValue) || costValue < 0) {
    showToast("Enter a valid cost", "error");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = "Enter a non-negative cost.";
    }
    return;
  }

  if (!currencyDetails) {
    showToast("Select a valid currency", "error");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = "Choose a valid cost currency.";
    }
    return;
  }

  const payload = {
    name,
    description: description || null,
    cost: Math.round(costValue),
    active,
    cost_currency: currencyDetails.key,
    image_url: imageUrl ? imageUrl : null
  };

  const submitButton = adminSaveButton || adminPrizeForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    if (isEdit && !adminEditingPrizeId) {
      throw new Error("Missing prize identifier for edit");
    }

    if (isEdit) {
      const { error } = await supabase
        .from("prizes")
        .update(payload)
        .eq("id", adminEditingPrizeId);
      if (error) {
        throw error;
      }
      showToast("Prize updated", "success");
    } else {
      const { error } = await supabase.from("prizes").insert(payload);
      if (error) {
        throw error;
      }
      showToast("Prize created", "success");
    }

    adminPrizesLoaded = false;
    prizesLoaded = false;
    await loadAdminPrizeList(true);
    await loadPrizeShop(true);
    closeAdminForm({ resetFields: true, restoreFocus: true });
  } catch (error) {
    console.error(error);
    const fallbackMessage = isEdit ? "Unable to update prize" : "Unable to create prize";
    const message = error?.message || fallbackMessage;
    showToast(message, "error");
    if (adminPrizeMessage) {
      adminPrizeMessage.textContent = `Error: ${message}`;
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function applyAdminFormDefaults() {
  if (!adminPrizeForm) return;
  const activeInput = adminPrizeForm.querySelector('input[name="active"]');
  if (activeInput) {
    activeInput.checked = true;
  }
  const currencySelect = adminPrizeForm.querySelector('select[name="currency"]');
  if (currencySelect) {
    currencySelect.value = "units";
  }
  if (adminPrizeImageFileInput) {
    adminPrizeImageFileInput.value = "";
  }
}

function closeAdminForm({ resetFields = true, restoreFocus = false } = {}) {
  if (resetFields && adminPrizeForm) {
    adminPrizeForm.reset();
    applyAdminFormDefaults();
  }
  adminEditingPrizeId = null;
  if (adminPrizeMessage) {
    adminPrizeMessage.textContent = "";
  }
  if (adminSaveButton) {
    adminSaveButton.textContent = "Create listing";
  }
  if (adminModalTitle) {
    adminModalTitle.textContent = "Create listing";
  }
  if (adminPrizeModal) {
    adminPrizeModal.classList.remove("is-open");
    adminPrizeModal.setAttribute("aria-hidden", "true");
    adminPrizeModal.hidden = true;
  }
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  const focusTarget = restoreFocus
    ? adminModalTrigger instanceof HTMLElement
      ? adminModalTrigger
      : adminAddButton
    : null;
  adminModalTrigger = null;
  focusTarget?.focus();
}

function openAdminModal() {
  if (!adminPrizeModal) {
    return;
  }
  adminModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : adminAddButton;
  if (!adminPrizeModal.hidden) {
    return;
  }
  adminPrizeModal.hidden = false;
  adminPrizeModal.classList.add("is-open");
  adminPrizeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function openAdminCreateForm() {
  if (!isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }
  adminEditingPrizeId = null;
  if (adminPrizeForm) {
    adminPrizeForm.reset();
  }
  applyAdminFormDefaults();
  if (adminPrizeMessage) {
    adminPrizeMessage.textContent = "";
  }
  if (adminSaveButton) {
    adminSaveButton.textContent = "Create listing";
  }
  if (adminModalTitle) {
    adminModalTitle.textContent = "Create listing";
  }
  openAdminModal();
  const nameInput = adminPrizeForm?.querySelector('input[name="name"]');
  nameInput?.focus();
}

function openAdminEditForm(prize) {
  if (!isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }
  if (!prize || !prize.id) {
    showToast("Unable to edit prize", "error");
    return;
  }
  adminEditingPrizeId = prize.id;
  if (adminPrizeForm) {
    adminPrizeForm.reset();
  }
  const nameInput = adminPrizeForm?.querySelector('input[name="name"]');
  if (nameInput) {
    nameInput.value = prize.name ?? "";
  }
  const descriptionInput = adminPrizeForm?.querySelector('textarea[name="description"]');
  if (descriptionInput) {
    descriptionInput.value = prize.description ?? "";
  }
  const imageUrlInput = adminPrizeForm?.querySelector('input[name="imageUrl"]');
  if (imageUrlInput) {
    imageUrlInput.value = prize.image_url ?? "";
  }
  const costInput = adminPrizeForm?.querySelector('input[name="cost"]');
  if (costInput) {
    const numericCost = Number.isFinite(Number(prize.cost)) ? Math.round(Number(prize.cost)) : 0;
    costInput.value = String(numericCost);
  }
  const currencySelect = adminPrizeForm?.querySelector('select[name="currency"]');
  if (currencySelect) {
    const currencyValue = (prize.cost_currency ?? "units").toString().toLowerCase();
    currencySelect.value = PRIZE_CURRENCIES[currencyValue] ? currencyValue : "units";
  }
  const activeInput = adminPrizeForm?.querySelector('input[name="active"]');
  if (activeInput) {
    activeInput.checked = prize.active !== false;
  }
  if (adminPrizeMessage) {
    adminPrizeMessage.textContent = "";
  }
  if (adminSaveButton) {
    adminSaveButton.textContent = "Save changes";
  }
  if (adminModalTitle) {
    adminModalTitle.textContent = "Edit listing";
  }
  openAdminModal();
  nameInput?.focus();
}

function setAdminStatusLabel(label, active) {
  if (!label) return;
  label.textContent = active ? "Active" : "Inactive";
  label.classList.toggle("admin-status-label--inactive", !active);
}

async function handleAdminStatusChange(prize, toggle, label) {
  if (!prize?.id || !toggle) return;
  const desired = toggle.checked;
  toggle.disabled = true;
  try {
    const { error } = await supabase
      .from("prizes")
      .update({ active: desired })
      .eq("id", prize.id);
    if (error) {
      throw error;
    }
    setAdminStatusLabel(label, desired);
    const cached = adminPrizeCache.find((entry) => entry.id === prize.id);
    if (cached) {
      cached.active = desired;
    }
    showToast(
      desired ? `Marked ${prize.name || "prize"} active.` : `Marked ${prize.name || "prize"} inactive.`,
      "success"
    );
    prizesLoaded = false;
    await loadPrizeShop(true);
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to update prize status";
    showToast(message, "error");
    toggle.checked = !desired;
    setAdminStatusLabel(label, toggle.checked);
  } finally {
    toggle.disabled = false;
  }
}

async function handleAdminDelete(prize) {
  if (!isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }
  if (!prize?.id) {
    showToast("Unable to delete prize", "error");
    return;
  }
  
  try {
    // Check if prize has any purchase records
    const { data: purchases, error: purchaseError } = await supabase
      .from("prize_purchases")
      .select("id")
      .eq("prize_id", prize.id);
    
    if (purchaseError) {
      throw purchaseError;
    }
    
    const hasPurchases = purchases && purchases.length > 0;
    
    if (typeof window !== "undefined") {
      let confirmMessage = `Delete ${prize.name || "this prize"}?`;
      if (hasPurchases) {
        confirmMessage = `Delete ${prize.name || "this prize"}? This will also delete ${purchases.length} associated purchase record(s).`;
      }
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) {
        return;
      }
    }
    
    // Use RPC to cascade delete both purchase records and the prize
    const { data: deleted, error } = await supabase.rpc("delete_prize_cascade", {
      _prize_id: prize.id
    });
    
    if (error) {
      throw error;
    }
    
    if (!deleted) {
      throw new Error("Prize not found or could not be deleted");
    }
    
    showToast("Prize deleted", "success");
    adminPrizeCache = adminPrizeCache.filter((entry) => entry.id !== prize.id);
    if (adminEditingPrizeId === prize.id) {
      closeAdminForm({ resetFields: true, restoreFocus: false });
    }
    adminPrizesLoaded = false;
    prizesLoaded = false;
    await loadAdminPrizeList(true);
    await loadPrizeShop(true);
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to delete prize";
    showToast(message, "error");
  }
}

function renderAdminPrizeRow(prize) {
  const item = document.createElement("li");
  item.className = "admin-prize-item";
  item.dataset.id = prize?.id ?? "";

  const main = document.createElement("div");
  main.className = "admin-prize-main";

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "admin-prize-thumb";
  const imageUrl = typeof prize?.image_url === "string" ? prize.image_url.trim() : "";
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = prize?.name ? `${prize.name} preview` : "Prize image";
    thumbWrap.appendChild(img);
    thumbWrap.setAttribute("role", "button");
    thumbWrap.setAttribute(
      "aria-label",
      prize?.name ? `View larger image of ${prize.name}` : "View larger prize image"
    );
    thumbWrap.tabIndex = 0;
    const handlePreview = () => openPrizeImageModal(prize);
    thumbWrap.addEventListener("click", handlePreview);
    thumbWrap.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlePreview();
      }
    });
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "admin-prize-thumb-placeholder";
    placeholder.textContent = "No image";
    thumbWrap.appendChild(placeholder);
  }

  const info = document.createElement("div");
  info.className = "admin-prize-info";

  const nameEl = document.createElement("h3");
  nameEl.className = "admin-prize-name";
  nameEl.textContent = prize?.name ?? "Prize";
  info.appendChild(nameEl);

  if (prize?.description) {
    const descEl = document.createElement("p");
    descEl.className = "admin-prize-description";
    descEl.textContent = prize.description;
    info.appendChild(descEl);
  }

  const meta = document.createElement("div");
  meta.className = "admin-prize-meta";
  const costValue = Math.max(0, Math.round(Number(prize?.cost ?? 0)));
  const currencyKey = (prize?.cost_currency ?? "units").toString().toLowerCase();
  const currencyDetails = PRIZE_CURRENCIES[currencyKey] ?? PRIZE_CURRENCIES.units;
  const costEl = document.createElement("span");
  costEl.className = "admin-prize-cost";
  costEl.textContent = `${formatCurrency(costValue)} ${currencyDetails.label}`;
  meta.appendChild(costEl);
  info.appendChild(meta);

  main.append(thumbWrap, info);

  const controls = document.createElement("div");
  controls.className = "admin-prize-controls";

  const statusWrap = document.createElement("label");
  statusWrap.className = "admin-status-toggle";
  const statusInput = document.createElement("input");
  statusInput.type = "checkbox";
  statusInput.className = "admin-status-input";
  const isActive = prize?.active !== false;
  statusInput.checked = isActive;
  const statusLabel = document.createElement("span");
  statusLabel.className = "admin-status-label";
  setAdminStatusLabel(statusLabel, isActive);
  statusInput.addEventListener("change", () => handleAdminStatusChange(prize, statusInput, statusLabel));
  statusWrap.append(statusInput, statusLabel);

  const buttonRow = document.createElement("div");
  buttonRow.className = "admin-prize-buttons";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary admin-prize-edit";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openAdminEditForm(prize));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "primary danger admin-prize-delete";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => handleAdminDelete(prize));
  buttonRow.append(editButton, deleteButton);

  controls.append(statusWrap, buttonRow);

  // If this prize has purchase information (sold), render contact details
  if (prize && prize.purchase_info) {
    const purchase = prize.purchase_info;
    const purchaseSection = document.createElement("div");
    purchaseSection.className = "admin-prize-purchase";

    const soldLabel = document.createElement("div");
    soldLabel.className = "admin-prize-purchase-sold";
    soldLabel.textContent = "SOLD";
    purchaseSection.appendChild(soldLabel);

    const buyerLine = document.createElement("div");
    buyerLine.className = "admin-prize-purchase-buyer";
    const buyerEmail = purchase.contact_email ? ` (${String(purchase.contact_email)})` : "";
    buyerLine.textContent = `User: ${String(purchase.user_id)}${buyerEmail}`;
    purchaseSection.appendChild(buyerLine);

    const addrLine = document.createElement("div");
    addrLine.className = "admin-prize-purchase-address";
    addrLine.textContent = `Shipping Address: ${String(purchase.shipping_address || "")}`;
    purchaseSection.appendChild(addrLine);

    if (purchase.shipping_phone) {
      const phoneLine = document.createElement("div");
      phoneLine.className = "admin-prize-purchase-phone";
      phoneLine.textContent = `Phone: ${String(purchase.shipping_phone)}`;
      purchaseSection.appendChild(phoneLine);
    }

    controls.appendChild(purchaseSection);
  }

  item.append(main, controls);
  return item;
}

async function loadAdminPrizeList(force = false) {
  if (!isAdmin()) {
    adminPrizesLoaded = false;
    if (adminPrizeListEl) {
      adminPrizeListEl.innerHTML = "";
    }
    closeAdminForm({ resetFields: true, restoreFocus: false });
    return;
  }
  if (adminPrizesLoaded && !force) return;
  if (!adminPrizeListEl) return;
  adminPrizesLoaded = true;
  adminPrizeListEl.innerHTML = "";
  const loadingItem = document.createElement("li");
  loadingItem.className = "admin-prize-empty";
  loadingItem.textContent = "Loading listings...";
  adminPrizeListEl.appendChild(loadingItem);
  try {
    const { data: prizes, error } = await supabase
      .from("prizes")
      .select("*")
      .order("active", { ascending: false })
      .order("cost", { ascending: true });
    if (error) {
      throw error;
    }
    adminPrizeCache = Array.isArray(prizes) ? prizes.slice() : [];
    adminPrizeListEl.innerHTML = "";
    // For any prizes that are already sold (active=false), fetch the
    // latest purchase record so the admin view can display contact details.
    try {
      const soldIds = adminPrizeCache.filter((p) => p?.active === false).map((p) => p.id).filter(Boolean);
      if (soldIds.length > 0) {
        const { data: purchases, error: purchasesError } = await supabase
          .from("prize_purchases")
          .select("*")
          .in("prize_id", soldIds)
          .order("created_at", { ascending: false });
        if (!purchasesError && Array.isArray(purchases)) {
          const latestByPrize = new Map();
          purchases.forEach((rec) => {
            if (!latestByPrize.has(rec.prize_id)) {
              latestByPrize.set(rec.prize_id, rec);
            }
          });
          adminPrizeCache.forEach((p) => {
            if (p && p.active === false && latestByPrize.has(p.id)) {
              p.purchase_info = latestByPrize.get(p.id);
            }
          });
        }
      }
    } catch (err) {
      console.warn("Unable to fetch prize purchase info for admin view", err);
    }
    if (!adminPrizeCache.length) {
      const empty = document.createElement("li");
      empty.className = "admin-prize-empty";
      empty.textContent = "No prize listings yet.";
      adminPrizeListEl.appendChild(empty);
      return;
    }
    adminPrizeCache.forEach((prize) => {
      adminPrizeListEl.appendChild(renderAdminPrizeRow(prize));
    });
  } catch (error) {
    console.error(error);
    adminPrizesLoaded = false;
    adminPrizeListEl.innerHTML = "";
    const errorItem = document.createElement("li");
    errorItem.className = "admin-prize-empty";
    errorItem.textContent = "Unable to load prize listings.";
    adminPrizeListEl.appendChild(errorItem);
    showToast("Unable to load prize listings", "error");
  }
}

// ===========================
// Contest Management
// ===========================

const CONTEST_CRITERIA = {
  highest_bankroll: {
    label: "Highest credits total",
    scoreLabel: "Credits",
    score(entry) {
      return Number(entry?.credits ?? 0);
    }
  }
};

const ACCOUNT_MODE_NORMAL = "normal";

function createNormalAccountMode() {
  return {
    type: ACCOUNT_MODE_NORMAL,
    contestId: null
  };
}

function isContestAccountMode(mode = currentAccountMode) {
  return Boolean(mode && mode.type === "contest" && mode.contestId);
}

function getAccountModeValue(mode = currentAccountMode) {
  return isContestAccountMode(mode) ? `contest:${mode.contestId}` : ACCOUNT_MODE_NORMAL;
}

function parseAccountModeValue(value) {
  if (typeof value !== "string" || !value.startsWith("contest:")) {
    return createNormalAccountMode();
  }
  const contestId = value.slice("contest:".length).trim();
  return contestId
    ? { type: "contest", contestId }
    : createNormalAccountMode();
}

function getAccountModeStorageKey() {
  return `rtn:account-mode:${currentUser?.id || "guest"}`;
}

function saveAccountModeSelection(mode = currentAccountMode) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(getAccountModeStorageKey(), getAccountModeValue(mode));
}

function loadSavedAccountModeSelection() {
  if (typeof window === "undefined" || !window.localStorage) {
    return createNormalAccountMode();
  }
  return parseAccountModeValue(window.localStorage.getItem(getAccountModeStorageKey()) || "");
}

function getContestById(contestId) {
  return (contestCache || []).find((contest) => contest.id === contestId) || null;
}

function getContestEntryById(contestId) {
  return contestEntryMap.get(contestId) || null;
}

function getModeContestEntry(mode = currentAccountMode) {
  return isContestAccountMode(mode) ? getContestEntryById(mode.contestId) : null;
}

function getModeContest(mode = currentAccountMode) {
  return isContestAccountMode(mode) ? getContestById(mode.contestId) : null;
}

function getContestAccountSnapshot(entry) {
  if (!entry) return null;
  return {
    id: entry.user_id,
    credits: Number(entry.current_credits ?? entry.starting_credits ?? 0),
    carter_cash: Number(entry.current_carter_cash ?? entry.starting_carter_cash ?? 0),
    carter_cash_progress: Number(entry.current_carter_cash_progress ?? 0)
  };
}

function getCurrentAccountSnapshot(mode = currentAccountMode) {
  if (isContestAccountMode(mode)) {
    return getContestAccountSnapshot(getModeContestEntry(mode));
  }
  return currentProfile || GUEST_PROFILE;
}

function isContestModeAvailable(mode) {
  if (!isContestAccountMode(mode)) return true;
  const contest = getModeContest(mode);
  return Boolean(contest && getContestStatus(contest) === "live" && getModeContestEntry(mode));
}

function getAvailableContestModes() {
  return userContestEntries
    .map((entry) => ({
      mode: {
        type: "contest",
        contestId: entry.contest_id
      },
      contest: getContestById(entry.contest_id),
      entry
    }))
    .filter(({ contest }) => contest && getContestStatus(contest) === "live")
    .sort((a, b) => new Date(a.contest.ends_at) - new Date(b.contest.ends_at));
}

function getAccountModeLabel(mode = currentAccountMode) {
  if (!isContestAccountMode(mode)) return "Normal Mode";
  const contest = getModeContest(mode);
  return contest?.title ? `${contest.title} Mode` : "Contest Mode";
}

function updateModeSpecificModalCopy() {
  if (resetModalCopyEl) {
    if (isContestAccountMode()) {
      const contest = getModeContest();
      const entry = getModeContestEntry();
      resetModalCopyEl.textContent = contest && entry
        ? `Resetting this contest mode will restore the ${contest.title} balance back to its starting values of ${formatCurrency(entry.starting_credits ?? contest.starting_credits ?? 0)} credits and ${formatCurrency(entry.starting_carter_cash ?? contest.starting_carter_cash ?? 0)} CC. Your normal account will stay untouched.`
        : "Resetting this contest mode will restore its contest starting balance. Your normal account will stay untouched.";
    } else {
      resetModalCopyEl.textContent = "Resetting will restore 1,000 units to your account but will forfeit all Carter Cash you have earned and start your balance again at 0. Do you confirm?";
    }
  }

  if (outOfCreditsCopyEl) {
    outOfCreditsCopyEl.textContent = isContestAccountMode()
      ? "You are out of credits in this contest mode. Switch back to Normal Mode or reset this contest mode to its contest starting balance to keep playing."
      : "You are currently out of credits. 1,000 credits are restored to all players with less than 100 credits at the start of every day. Please come back tomorrow!";
  }
}

function syncCurrentModeShadowState() {
  if (isContestAccountMode()) {
    const entry = getModeContestEntry();
    if (!entry) return;
    const updatedEntry = {
      ...entry,
      current_credits: bankroll,
      current_carter_cash: carterCash,
      current_carter_cash_progress: carterCashProgress,
      display_name: getContestDisplayName(currentProfile, currentUser?.id),
      participant_email: currentUser?.email || ""
    };
    contestEntryMap.set(updatedEntry.contest_id, updatedEntry);
    userContestEntries = userContestEntries.map((candidate) =>
      candidate.contest_id === updatedEntry.contest_id ? updatedEntry : candidate
    );
    if (currentContest?.id === updatedEntry.contest_id) {
      currentContestEntry = updatedEntry;
    }
    return;
  }

  if (currentProfile) {
    currentProfile.credits = bankroll;
    currentProfile.carter_cash = carterCash;
    currentProfile.carter_cash_progress = carterCashProgress;
  }
}

function applyAccountSnapshot(snapshot, { resetHistory = false } = {}) {
  if (!snapshot) return;

  const numericCredits = Number(snapshot.credits);
  const nextBankroll = Number.isFinite(numericCredits) ? Number(numericCredits.toFixed(2)) : INITIAL_BANKROLL;
  const numericCarter = Number(snapshot.carter_cash);
  const nextCarterCash = Number.isFinite(numericCarter) ? Math.round(numericCarter) : 0;
  const numericProgress = Number(snapshot.carter_cash_progress);
  const nextProgress =
    Number.isFinite(numericProgress) && numericProgress >= 0 ? Number(numericProgress) : 0;

  bankroll = nextBankroll;
  lastSyncedBankroll = bankroll;
  stopBankrollAnimation();
  updateBankroll();
  updateDashboardCreditsDisplay(nextBankroll);

  carterCash = nextCarterCash;
  carterCashProgress = nextProgress;
  lastSyncedCarterCash = carterCash;
  lastSyncedCarterProgress = carterCashProgress;
  stopCarterCashAnimation();
  updateCarterCashDisplay();

  const shouldResetHistory = resetHistory || !bankrollInitialized;
  if (shouldResetHistory) {
    bankrollHistory = [bankroll];
  } else if (bankrollHistory.length > 0) {
    bankrollHistory[bankrollHistory.length - 1] = bankroll;
  } else {
    bankrollHistory = [bankroll];
  }
  drawBankrollChart();
  bankrollInitialized = true;
  updateModeSpecificModalCopy();
  updatePlayAssistantContext();
}

function renderAccountModeSelector() {
  if (!accountModeSelect) return;

  const options = [
    {
      value: ACCOUNT_MODE_NORMAL,
      label: "Normal Mode"
    },
    ...getAvailableContestModes().map(({ contest }) => ({
      value: `contest:${contest.id}`,
      label: contest.title || "Contest Mode"
    }))
  ];

  const selectedValue = getAccountModeValue();
  accountModeSelect.innerHTML = "";
  options.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    optionEl.selected = option.value === selectedValue;
    accountModeSelect.appendChild(optionEl);
  });

  if (accountModeSummaryEl) {
    accountModeSummaryEl.textContent = `${getAccountModeLabel()} is active.`;
  }
  updatePlayAssistantContext();
}

function syncActiveAccountMode({ forceApply = false, resetHistory = false } = {}) {
  const savedMode = loadSavedAccountModeSelection();
  const currentModeValid = isContestModeAvailable(currentAccountMode);
  const savedModeValid = isContestModeAvailable(savedMode);
  const nextMode = isContestAccountMode(currentAccountMode) && currentModeValid
    ? currentAccountMode
    : isContestAccountMode(savedMode) && savedModeValid
      ? savedMode
      : currentModeValid
        ? currentAccountMode
        : createNormalAccountMode();

  const modeChanged = getAccountModeValue(nextMode) !== getAccountModeValue(currentAccountMode);
  currentAccountMode = nextMode;
  renderAccountModeSelector();
  saveAccountModeSelection(currentAccountMode);

  if (modeChanged || forceApply) {
    applyAccountSnapshot(getCurrentAccountSnapshot(currentAccountMode), {
      resetHistory: resetHistory || modeChanged
    });
  } else {
    updateModeSpecificModalCopy();
  }
}

function formatContestDateTime(value) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function isThresholdContest(contest) {
  return String(contest?.start_mode || "").toLowerCase() === "threshold";
}

function getContestStartRequirement(contest) {
  return Math.max(1, Math.round(Number(contest?.contestant_starting_requirement ?? 1)));
}

function getContestLengthHours(contest) {
  return Math.max(1, Math.round(Number(contest?.contest_length_hours ?? 1)));
}

function getContestStatus(contest, now = Date.now()) {
  if (!contest) return "none";
  const explicitStatus = String(contest.status || "").toLowerCase();
  if (explicitStatus === "pending") {
    return "pending";
  }
  const startsAt = new Date(contest.starts_at).getTime();
  const endsAt = new Date(contest.ends_at).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    return explicitStatus === "live" ? "live" : explicitStatus === "ended" ? "ended" : "draft";
  }
  if (explicitStatus === "ended" || now > endsAt) return "ended";
  if (now < startsAt) return "upcoming";
  if (now >= startsAt && now <= endsAt) return "live";
  return "ended";
}

function getContestStatusLabel(status) {
  if (status === "pending") return "Pending";
  if (status === "live") return "Live";
  if (status === "upcoming") return "Upcoming";
  if (status === "ended") return "Ended";
  return "Draft";
}

function getContestCriteria(contest) {
  return CONTEST_CRITERIA[contest?.winning_criteria] || CONTEST_CRITERIA.highest_bankroll;
}

function getContestQualificationRequirement(contest) {
  return Math.max(0, Math.round(Number(contest?.qualification_carter_cash ?? 0)));
}

function getContestEntryFee(contest) {
  return Math.max(0, Math.round(Number(contest?.entry_fee_carter_cash ?? 0)));
}

function formatContestEntryFeeText(contest) {
  return `${formatCurrency(getContestEntryFee(contest))} CC`;
}

function formatContestEntryFeeLabelText(contest) {
  return `Entry: ${formatContestEntryFeeText(contest)}`;
}

function getContestRequiredRankTier(contest) {
  return Math.max(1, Math.round(Number(contest?.required_rank_tier ?? 1)));
}

function getCurrentPlayerRankTier() {
  const rankTier = Number(currentRankState?.currentRank?.tier ?? currentProfile?.current_rank_tier ?? 1);
  return Number.isFinite(rankTier) ? Math.max(1, Math.round(rankTier)) : 1;
}

function createContestRequiredRankTag(contest) {
  const requiredTier = getContestRequiredRankTier(contest);
  if (requiredTier <= 1) return null;
  const requiredRank = getRankByTier(requiredTier);
  if (!requiredRank) return null;

  const tag = document.createElement("span");
  tag.className = "contest-rank-tag";
  tag.title = `${requiredRank.name} or higher required`;

  const iconWrap = document.createElement("span");
  iconWrap.className = "contest-rank-tag-icon";
  if (requiredRank.icon_url) {
    const icon = document.createElement("img");
    icon.src = requiredRank.icon_url;
    icon.alt = "";
    iconWrap.append(icon);
  } else {
    iconWrap.textContent = String(requiredRank.tier);
  }

  const label = document.createElement("span");
  label.className = "contest-rank-tag-label";
  label.textContent = requiredRank.name;
  tag.append(iconWrap, label);
  return tag;
}

function formatPrizeMoney(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function normalizeContestPrizeStats(statsOrCount = 0) {
  if (typeof statsOrCount === "number") {
    return {
      participants: Math.max(0, Math.round(statsOrCount)),
      qualifying: 0
    };
  }
  return {
    participants: Math.max(0, Math.round(Number(statsOrCount?.participants ?? 0))),
    qualifying: Math.max(0, Math.round(Number(statsOrCount?.qualifying ?? 0)))
  };
}

function getContestPrizePotValue(contest, statsOrCount = 0) {
  const stats = normalizeContestPrizeStats(statsOrCount);
  const baseAmount = Math.max(0, Number(contest?.prize_static_amount ?? 0));
  const unitAmount = Math.max(0, Number(contest?.prize_variable_unit_amount ?? 0));
  if (contest?.prize_variable_basis === "none" || contest?.prize_mode !== "variable") {
    return baseAmount;
  }
  const multiplier = contest?.prize_variable_basis === "qualifying_contestant"
    ? stats.qualifying
    : stats.participants;
  return baseAmount + multiplier * unitAmount;
}

function getContestPrizeGrowthCopy(contest) {
  if (!contest) return "Prize amount not available.";
  const baseAmount = Math.max(0, Number(contest.prize_static_amount ?? 0));
  const unitAmount = Math.max(0, Number(contest.prize_variable_unit_amount ?? 0));
  if (contest.prize_variable_basis === "none" || contest.prize_mode !== "variable") {
    return `Static prize pot of ${formatPrizeMoney(baseAmount)}.`;
  }
  const basisLabel = contest.prize_variable_basis === "qualifying_contestant"
    ? "qualifying contestant"
    : "contestant";
  if (baseAmount > 0) {
    return `Starts at ${formatPrizeMoney(baseAmount)} and grows by ${formatPrizeMoney(unitAmount)} per ${basisLabel}.`;
  }
  return `Grows by ${formatPrizeMoney(unitAmount)} per ${basisLabel}.`;
}

function getContestPrizeHeadline(contest, statsOrCount = 0) {
  return formatPrizeMoney(getContestPrizePotValue(contest, statsOrCount));
}

function getContestLimit(contest) {
  return Math.max(1, Math.round(Number(contest?.contestant_limit ?? 100)));
}

function formatContestFill(contest, statsOrCount = 0) {
  const stats = normalizeContestPrizeStats(statsOrCount);
  return `${stats.participants}/${getContestLimit(contest)}`;
}

function normalizePrizeAllocations(allocations) {
  const source = Array.isArray(allocations) && allocations.length
    ? allocations
    : [{ place: 1, percentage: 100 }];
  return source
    .map((allocation, index) => ({
      place: Math.max(1, Math.round(Number(allocation?.place ?? index + 1))),
      percentage: Math.max(0, Number(allocation?.percentage ?? 0))
    }))
    .sort((a, b) => a.place - b.place)
    .map((allocation, index) => ({
      place: index + 1,
      percentage: allocation.percentage
    }));
}

function getOrdinalLabel(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function getContestPrizeDistributionCopy(contest, statsOrCount = 0) {
  const allocations = normalizePrizeAllocations(contest?.prize_allocations);
  const totalPot = getContestPrizePotValue(contest, statsOrCount);
  return allocations
    .map((allocation) => {
      const awardValue = totalPot * (allocation.percentage / 100);
      return `${getOrdinalLabel(allocation.place)} ${allocation.percentage}% (${formatPrizeMoney(awardValue)})`;
    })
    .join(" • ");
}

function getContestPrizeAward(entry, contest, statsOrCount = 0) {
  if (!entry?.qualifies) return 0;
  const allocations = normalizePrizeAllocations(contest?.prize_allocations);
  const allocation = allocations.find((candidate) => candidate.place === entry.qualifiedRank);
  if (!allocation) return 0;
  return getContestPrizePotValue(contest, statsOrCount) * (allocation.percentage / 100);
}

function buildContestPayoutTable(contest, statsOrCount = 0, className = "contest-payout-table") {
  const stats = normalizeContestPrizeStats(statsOrCount);
  const allocations = normalizePrizeAllocations(contest?.prize_allocations);
  const totalPot = getContestPrizePotValue(contest, stats);

  const table = document.createElement("div");
  table.className = className;

  allocations.forEach((allocation) => {
    const row = document.createElement("div");
    row.className = `${className}-row`;

    const place = document.createElement("span");
    place.className = `${className}-place`;
    place.textContent = getOrdinalLabel(allocation.place);

    const pct = document.createElement("span");
    pct.className = `${className}-percent`;
    pct.textContent = `${allocation.percentage}%`;

    const amount = document.createElement("span");
    amount.className = `${className}-amount`;
    amount.textContent = formatPrizeMoney(totalPot * (allocation.percentage / 100));

    row.append(place, pct, amount);
    table.appendChild(row);
  });

  return table;
}

function getContestStorageKey(contestId) {
  return `rtn:contest-results-seen:${contestId}:${currentUser?.id || "guest"}`;
}

function hasSeenContestResults(contestId) {
  if (typeof window === "undefined" || !window.localStorage || !contestId) return false;
  return window.localStorage.getItem(getContestStorageKey(contestId)) === "1";
}

async function markContestResultsSeen(contestId) {
  if (typeof window === "undefined" || !window.localStorage || !contestId) return;
  window.localStorage.setItem(getContestStorageKey(contestId), "1");

  const entry = getContestEntryById(contestId);
  if (!entry?.user_id || entry.user_id !== currentUser?.id || entry.results_seen_at) {
    return;
  }

  const seenAt = new Date().toISOString();
  try {
    const { error } = await supabase
      .from("contest_entries")
      .update({ results_seen_at: seenAt })
      .eq("contest_id", contestId)
      .eq("user_id", entry.user_id);
    if (error) throw error;

    const updatedEntry = {
      ...entry,
      results_seen_at: seenAt
    };
    contestEntryMap.set(updatedEntry.contest_id, updatedEntry);
    userContestEntries = userContestEntries.map((candidate) =>
      candidate.contest_id === updatedEntry.contest_id ? updatedEntry : candidate
    );
    if (currentContestEntry?.contest_id === updatedEntry.contest_id) {
      currentContestEntry = updatedEntry;
    }
  } catch (error) {
    console.error("[RTN] markContestResultsSeen error", error);
  } finally {
    refreshContestNotifications(contestCache);
  }
}

function hasSeenContestResultsForEntry(entry) {
  if (!entry?.contest_id) return true;
  return Boolean(entry.results_seen_at) || hasSeenContestResults(entry.contest_id);
}

function renderContestEmailPreference() {
  if (!contestEmailOptInInput) return;
  const enabled = currentProfile?.receive_contest_start_emails ?? true;
  contestEmailOptInInput.checked = Boolean(enabled);
}

function setContestEmailPreferenceMessage(message = "", tone = "") {
  if (!contestEmailSettingMessageEl) return;
  contestEmailSettingMessageEl.textContent = message;
  contestEmailSettingMessageEl.className = "contest-email-setting-message";
  if (tone === "success") {
    contestEmailSettingMessageEl.classList.add("is-success");
  } else if (tone === "error") {
    contestEmailSettingMessageEl.classList.add("is-error");
  }
}

async function handleContestEmailPreferenceChange(event) {
  const checked = Boolean(event?.target?.checked);
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    if (contestEmailOptInInput) {
      contestEmailOptInInput.checked = !checked;
    }
    showToast("Please sign in again.", "error");
    return;
  }

  if (contestEmailOptInInput) {
    contestEmailOptInInput.disabled = true;
  }
  setContestEmailPreferenceMessage("Saving your notification preference...");

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ receive_contest_start_emails: checked })
      .eq("id", currentUser.id);
    if (error) throw error;

    if (currentProfile && currentProfile.id === currentUser.id) {
      currentProfile.receive_contest_start_emails = checked;
    }
    setContestEmailPreferenceMessage("Contest email preference updated.", "success");
  } catch (error) {
    console.error("[RTN] handleContestEmailPreferenceChange error", error);
    if (contestEmailOptInInput) {
      contestEmailOptInInput.checked = !checked;
    }
    setContestEmailPreferenceMessage("Unable to update your contest email preference.", "error");
    showToast("Unable to update contest email preference", "error");
  } finally {
    if (contestEmailOptInInput) {
      contestEmailOptInInput.disabled = false;
    }
  }
}

async function markContestStartNotificationSeen(contestId) {
  if (!contestId || !currentUser?.id) return;
  const existing = contestStartNotifications.find(
    (notification) => String(notification.contest_id || "") === String(contestId)
  );
  if (!existing || existing.seen_at) return;

  const seenAt = new Date().toISOString();
  try {
    const { error } = await supabase
      .from("contest_start_notifications")
      .update({ seen_at: seenAt })
      .eq("contest_id", contestId)
      .eq("user_id", currentUser.id);
    if (error) throw error;
    contestStartNotifications = contestStartNotifications.map((notification) =>
      String(notification.contest_id || "") === String(contestId)
        ? { ...notification, seen_at: seenAt }
        : notification
    );
  } catch (error) {
    console.error("[RTN] markContestStartNotificationSeen error", error);
  }
}

async function markAllContestNotificationsSeen() {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    return;
  }

  const unreadResultEntries = userContestEntries.filter((entry) => !hasSeenContestResultsForEntry(entry));
  const unreadStartNotifications = contestStartNotifications.filter((notification) => !notification.seen_at);

  if (!unreadResultEntries.length && !unreadStartNotifications.length) {
    refreshContestNotifications(contestCache);
    return;
  }

  const seenAt = new Date().toISOString();
  if (notificationsClearAllButton) {
    notificationsClearAllButton.disabled = true;
    notificationsClearAllButton.textContent = "Clearing...";
  }

  try {
    if (unreadResultEntries.length) {
      const unreadResultContestIds = unreadResultEntries
        .map((entry) => entry.contest_id)
        .filter(Boolean);

      unreadResultContestIds.forEach((contestId) => {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(getContestStorageKey(contestId), "1");
        }
      });

      const { error: resultError } = await supabase
        .from("contest_entries")
        .update({ results_seen_at: seenAt })
        .eq("user_id", currentUser.id)
        .in("contest_id", unreadResultContestIds);
      if (resultError) throw resultError;

      const unreadResultIdSet = new Set(unreadResultContestIds.map((contestId) => String(contestId)));
      userContestEntries = userContestEntries.map((entry) =>
        unreadResultIdSet.has(String(entry.contest_id))
          ? { ...entry, results_seen_at: seenAt }
          : entry
      );
      userContestEntries.forEach((entry) => {
        contestEntryMap.set(entry.contest_id, entry);
      });
      if (currentContestEntry && unreadResultIdSet.has(String(currentContestEntry.contest_id))) {
        currentContestEntry = {
          ...currentContestEntry,
          results_seen_at: seenAt
        };
      }
    }

    if (unreadStartNotifications.length) {
      const unreadStartContestIds = unreadStartNotifications
        .map((notification) => notification.contest_id)
        .filter(Boolean);

      const { error: startError } = await supabase
        .from("contest_start_notifications")
        .update({ seen_at: seenAt })
        .eq("user_id", currentUser.id)
        .in("contest_id", unreadStartContestIds);
      if (startError) throw startError;

      const unreadStartIdSet = new Set(unreadStartContestIds.map((contestId) => String(contestId)));
      contestStartNotifications = contestStartNotifications.map((notification) =>
        unreadStartIdSet.has(String(notification.contest_id))
          ? { ...notification, seen_at: seenAt }
          : notification
      );
    }

    refreshContestNotifications(contestCache);
    showToast("Notifications cleared", "success");
  } catch (error) {
    console.error("[RTN] markAllContestNotificationsSeen error", error);
    showToast("Unable to clear notifications", "error");
  } finally {
    if (notificationsClearAllButton) {
      notificationsClearAllButton.disabled = false;
      notificationsClearAllButton.textContent = "Clear All";
    }
    refreshContestNotifications(contestCache);
  }
}

function formatContestNotificationTime(value) {
  if (!value) return "Recently finished";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently finished";
  return `Ended ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function formatContestStartNotificationTime(value) {
  if (!value) return "Live now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Live now";
  return `Started ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

async function loadContestStartNotifications() {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    contestStartNotifications = [];
    return;
  }

  const { data, error } = await supabase
    .from("contest_start_notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[RTN] loadContestStartNotifications error", error);
    contestStartNotifications = [];
    return;
  }

  contestStartNotifications = Array.isArray(data) ? data : [];
}

async function seedLiveContestNotifications() {
  if (!supabase || !currentUser?.id || currentUser.id === GUEST_USER.id) return [];

  try {
    const { data, error } = await supabase.rpc("seed_live_contest_notifications");
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[RTN] seedLiveContestNotifications error", error);
    return [];
  }
}

async function dispatchContestStartEmails(seedResults = []) {
  if (!Array.isArray(seedResults) || !seedResults.length || !supabase?.functions?.invoke) {
    return;
  }

  await Promise.all(
    seedResults
      .filter((item) => Number(item?.email_requested || 0) > 0)
      .map(async (item) => {
        try {
          const { error } = await supabase.functions.invoke("send-contest-start-emails", {
            body: { contestId: item.contest_id }
          });
          if (error) throw error;
        } catch (error) {
          console.warn("[RTN] dispatchContestStartEmails warning", error);
        }
      })
  );
}

async function sendContestPublishEmail(contestId) {
  if (!contestId || !supabase?.functions?.invoke) {
    return;
  }

  try {
    const { error } = await supabase.functions.invoke("send-contest-publish-emails", {
      body: { contestId }
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[RTN] sendContestPublishEmail warning", error);
  }
}

async function maybeActivatePendingContest(contestId) {
  if (!contestId) {
    return { activated: false };
  }

  const { data, error } = await supabase.rpc("maybe_activate_pending_contest", {
    _contest_id: contestId
  });
  if (error) throw error;

  if (Array.isArray(data) && data.length) {
    return data[0];
  }
  return data || { activated: false };
}

function updateNotificationBadge() {
  if (!notificationBadge || !notificationToggle) return;
  const unreadCount = contestNotifications.filter((item) => item.unread).length;
  notificationBadge.hidden = unreadCount <= 0;
  notificationBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
  notificationToggle.setAttribute(
    "aria-label",
    unreadCount > 0 ? `Open notifications, ${unreadCount} unread` : "Open notifications"
  );
  if (notificationsClearAllButton) {
    notificationsClearAllButton.disabled = unreadCount <= 0;
  }
}

function renderContestNotifications() {
  if (!notificationsListEl) return;
  notificationsListEl.innerHTML = "";

  if (!contestNotifications.length) {
    const empty = document.createElement("li");
    empty.className = "notification-item notification-item-empty";
    empty.textContent = "No contest notifications yet.";
    notificationsListEl.appendChild(empty);
    updateNotificationBadge();
    return;
  }

  contestNotifications.forEach((notification) => {
    const item = document.createElement("li");
    item.className = `notification-item${notification.unread ? " is-unread" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "notification-card";
    button.dataset.contestId = notification.contestId;
    button.dataset.notificationType = notification.type || "result";

    const topRow = document.createElement("div");
    topRow.className = "notification-card-top";

    const title = document.createElement("span");
    title.className = "notification-card-title";
    title.textContent = notification.title;

    const status = document.createElement("span");
    status.className = "notification-card-status";
    status.textContent = notification.unread ? "New" : "Viewed";

    topRow.append(title, status);

    const detail = document.createElement("p");
    detail.className = "notification-card-detail";
    detail.textContent = notification.message;

    const meta = document.createElement("div");
    meta.className = "notification-card-meta";
    meta.textContent = notification.type === "start"
      ? formatContestStartNotificationTime(notification.createdAt)
      : formatContestNotificationTime(notification.endedAt);

    button.append(topRow, detail, meta);
    item.appendChild(button);
    notificationsListEl.appendChild(item);
  });

  updateNotificationBadge();
}

function refreshContestNotifications(contests = contestCache) {
  const startItems = contestStartNotifications
    .map((notification) => {
      const contest = getContestById(notification.contest_id);
      if (!contest) return null;
      const countStats = normalizeContestPrizeStats(contestParticipantCounts[contest.id] || 0);
      return {
        type: "start",
        contestId: contest.id,
        title: contest.title || "Contest is live",
        createdAt: notification.created_at,
        unread: !notification.seen_at,
        message: `A new contest is live. ${getContestPrizeHeadline(contest, countStats)} Tap to view the details.`,
        sortAt: notification.created_at || contest.starts_at || contest.created_at || null
      };
    })
    .filter(Boolean);

  const endedContests = (contests || [])
    .filter((contest) => getContestStatus(contest) === "ended")
    .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));

  const resultItems = endedContests
    .map((contest) => {
      const entry = getContestEntryById(contest.id);
      if (!entry || entry.user_id !== currentUser?.id) return null;
      const qualificationRequirement = getContestQualificationRequirement(contest);
      return {
        type: "result",
        contestId: contest.id,
        title: contest.title || "Contest results",
        endedAt: contest.ends_at,
        unread: !hasSeenContestResultsForEntry(entry),
        message: `Results are ready. Qualification required ${formatCurrency(qualificationRequirement)} CC.`,
        entry,
        sortAt: contest.ends_at || null
      };
    })
    .filter(Boolean);

  contestNotifications = [...startItems, ...resultItems].sort((a, b) => {
    const aTime = a?.sortAt ? new Date(a.sortAt).getTime() : 0;
    const bTime = b?.sortAt ? new Date(b.sortAt).getTime() : 0;
    return bTime - aTime;
  });

  renderContestNotifications();
}

async function loadContestParticipantCounts(contests = contestCache) {
  const contestIds = Array.isArray(contests)
    ? contests.map((contest) => contest?.id).filter(Boolean)
    : [];
  if (!contestIds.length) {
    return {};
  }

  const { data: entries, error } = await supabase
    .from("contest_entries")
    .select("contest_id,current_carter_cash")
    .in("contest_id", contestIds);
  if (error) throw error;

  const contestMap = new Map((contests || []).map((contest) => [contest.id, contest]));
  const counts = {};
  contestIds.forEach((contestId) => {
    counts[contestId] = {
      participants: 0,
      qualifying: 0
    };
  });
  (entries || []).forEach((entry) => {
    if (!counts[entry.contest_id]) {
      counts[entry.contest_id] = {
        participants: 0,
        qualifying: 0
      };
    }
    counts[entry.contest_id].participants += 1;
    const contest = contestMap.get(entry.contest_id);
    const qualificationRequirement = getContestQualificationRequirement(contest);
    if (Number(entry.current_carter_cash ?? 0) >= qualificationRequirement) {
      counts[entry.contest_id].qualifying += 1;
    }
  });
  Object.entries(counts).forEach(([contestId, nextStats]) => {
    const previousStats = normalizeContestPrizeStats(contestParticipantCounts[contestId] || 0);
    if (previousStats.participants > 0 && nextStats.participants > previousStats.participants) {
      contestJoinBoosts.set(contestId, {
        entered: nextStats.participants,
        delta: nextStats.participants - previousStats.participants,
        expiresAt: Date.now() + 2200
      });
    }
  });
  contestParticipantCounts = {
    ...contestParticipantCounts,
    ...counts
  };
  return counts;
}

function incrementContestParticipantCount(contest, entry) {
  if (!contest?.id || !entry) return;
  const qualificationRequirement = getContestQualificationRequirement(contest);
  const currentStats = normalizeContestPrizeStats(contestParticipantCounts[contest.id] || 0);
  const nextParticipants = currentStats.participants + 1;
  contestParticipantCounts[contest.id] = {
    participants: nextParticipants,
    qualifying:
      currentStats.qualifying +
      (Number(entry.current_carter_cash ?? entry.starting_carter_cash ?? 0) >= qualificationRequirement ? 1 : 0)
  };
  contestJoinBoosts.set(contest.id, {
    entered: nextParticipants,
    delta: 1,
    expiresAt: Date.now() + 2200
  });
}

function getContestJoinBoost(contestId, entered) {
  if (!contestId || !contestJoinBoosts.has(contestId)) {
    return null;
  }

  const boost = contestJoinBoosts.get(contestId);
  if (!boost || boost.expiresAt <= Date.now()) {
    contestJoinBoosts.delete(contestId);
    return null;
  }

  if (Number(boost.entered) !== Number(entered)) {
    return null;
  }

  return boost;
}

function getContestDisplayName(profile, fallbackId = "") {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (!profile) {
    return fallbackId ? `Player ${fallbackId.slice(0, 8)}` : "Player";
  }
  return (
    fullName ||
    profile.username ||
    `Player ${String(profile.id || fallbackId).slice(0, 8)}`
  );
}

async function buildContestLeaderboard(contest) {
  if (!contest?.id) return [];
  const { data: entries, error: entryError } = await supabase
    .from("contest_entries")
    .select("*")
    .eq("contest_id", contest.id);
  if (entryError) throw entryError;

  const entryList = Array.isArray(entries) ? entries : [];
  if (!entryList.length) {
    return [];
  }

  const criteria = getContestCriteria(contest);
  const qualificationRequirement = getContestQualificationRequirement(contest);

  const ranked = entryList.map((entry) => {
    const contestEntry = {
      ...entry,
      credits: Number(entry.current_credits ?? entry.starting_credits ?? 0),
      carter_cash: Number(entry.current_carter_cash ?? entry.starting_carter_cash ?? 0)
    };
    return {
      ...contestEntry,
      displayName: entry.display_name || getContestDisplayName(null, entry.user_id),
      participantEmail: entry.participant_email || "",
      score: criteria.score(contestEntry),
      qualifies: Number(contestEntry.carter_cash ?? 0) >= qualificationRequirement
    };
  });

  ranked.sort((a, b) => {
    if (Number(b.qualifies) !== Number(a.qualifies)) return Number(b.qualifies) - Number(a.qualifies);
    if (b.score !== a.score) return b.score - a.score;
    if (b.carter_cash !== a.carter_cash) return b.carter_cash - a.carter_cash;
    return new Date(a.opted_in_at).getTime() - new Date(b.opted_in_at).getTime();
  });

  let qualifyingRank = 0;
  let nonQualifyingRank = 0;

  return ranked.map((entry, index) => {
    if (entry.qualifies) {
      qualifyingRank += 1;
    } else {
      nonQualifyingRank += 1;
    }
    return {
      ...entry,
      rank: index + 1,
      qualifiedRank: entry.qualifies ? qualifyingRank : null,
      nonQualifiedRank: entry.qualifies ? null : nonQualifyingRank
    };
  });
}

function splitContestParticipants(leaderboard = []) {
  return {
    qualifying: leaderboard.filter((entry) => entry.qualifies),
    nonQualifying: leaderboard.filter((entry) => !entry.qualifies)
  };
}

function buildContestHistory(baseHistory = [], creditsValue, label = "Checkpoint", createdAt = new Date().toISOString()) {
  const safeCredits = normalizeStoredCreditValue(creditsValue);
  const history = Array.isArray(baseHistory) ? [...baseHistory] : [];
  const nextPoint = {
    label,
    value: safeCredits,
    created_at: createdAt
  };
  const lastPoint = history[history.length - 1];
  if (!lastPoint) {
    return [nextPoint];
  }
  const lastValue = Number(lastPoint.value);
  if (Number.isFinite(lastValue) && lastValue === safeCredits) {
    history[history.length - 1] = {
      ...lastPoint,
      created_at: createdAt,
      label: lastPoint.label || label
    };
    return history;
  }
  history.push(nextPoint);
  return history;
}

function getRunResolvedAt(run) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const resolvedAt = typeof metadata?.resolved_at === "string" ? metadata.resolved_at : null;
  return resolvedAt || run?.created_at || null;
}

function compareRunsByResolvedAt(a, b) {
  const aResolvedAt = getRunResolvedAt(a);
  const bResolvedAt = getRunResolvedAt(b);
  const aTime = aResolvedAt ? new Date(aResolvedAt).getTime() : Number.NaN;
  const bTime = bResolvedAt ? new Date(bResolvedAt).getTime() : Number.NaN;
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);
  if (aHasTime && bHasTime && aTime !== bTime) {
    return aTime - bTime;
  }
  if (aHasTime !== bHasTime) {
    return aHasTime ? -1 : 1;
  }
  const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : Number.NaN;
  const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : Number.NaN;
  if (Number.isFinite(aCreatedAt) && Number.isFinite(bCreatedAt) && aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt;
  }
  return 0;
}

async function loadContestJourneyPoints(contest, entry) {
  if (!contest?.id || !entry?.user_id) return [];

  const startingValue = Number(entry.starting_credits ?? contest.starting_bankroll ?? 0);
  const normalizeJourneyValue = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Number(numericValue.toFixed(2)) : null;
  };
  const getContestHistoryHandPoints = (history = []) =>
    (Array.isArray(history) ? history : [])
      .filter((point) => {
        const label = String(point?.label || "").trim().toLowerCase();
        return Boolean(label) && label !== "start" && label !== "finish" && label !== "checkpoint";
      })
      .map((point, index) => {
        const endingBankroll = normalizeJourneyValue(point?.value);
        if (!Number.isFinite(endingBankroll)) return null;
        return {
          label: `Hand ${index + 1}`,
          value: endingBankroll,
          created_at: point?.created_at || null
        };
      })
      .filter(Boolean);
  const points = [{
    label: "Start",
    value: Number.isFinite(startingValue) ? Number(startingValue.toFixed(2)) : 0,
    created_at: contest.starts_at || entry.opted_in_at || null
  }];

  const sharedHistoryPoints = getContestHistoryHandPoints(entry.contest_history);
  if (sharedHistoryPoints.length) {
    points.push(...sharedHistoryPoints);
  } else if (entry.user_id === currentUser?.id) {
    const allRuns = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("game_runs")
        .select("created_at, metadata")
        .eq("user_id", entry.user_id)
        .contains("metadata", { contest_id: contest.id })
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

    allRuns.sort(compareRunsByResolvedAt).forEach((run, index) => {
      const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
      const endingBankroll = normalizeJourneyValue(metadata?.ending_bankroll);
      if (!Number.isFinite(endingBankroll)) return;
      points.push({
        label: `Hand ${index + 1}`,
        value: endingBankroll,
        created_at: getRunResolvedAt(run)
      });
    });
  }

  const endingValue = normalizeJourneyValue(entry.current_credits ?? entry.score ?? points[points.length - 1]?.value ?? 0);
  if (Number.isFinite(endingValue) && points[points.length - 1]?.value !== endingValue) {
    points.push({
      label: "Finish",
      value: endingValue,
      created_at: contest.ends_at || null
    });
  }

  return points;
}

function drawContestJourneyChart(points = []) {
  if (!contestJourneyChartEl) return;
  const ctx = contestJourneyChartEl.getContext("2d");
  if (!ctx) return;

  const width = contestJourneyChartEl.clientWidth || 720;
  const height = contestJourneyChartEl.clientHeight || 320;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  contestJourneyChartEl.width = Math.round(width * dpr);
  contestJourneyChartEl.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!points.length) {
    ctx.fillStyle = "rgba(173, 225, 247, 0.78)";
    ctx.font = "600 16px Play, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No contest bankroll history available yet.", width / 2, height / 2);
    return;
  }

  const padding = { top: 22, right: 18, bottom: 42, left: 72 };
  const chartWidth = Math.max(10, width - padding.left - padding.right);
  const chartHeight = Math.max(10, height - padding.top - padding.bottom);
  const values = points.map((point) => Number(point.value) || 0);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    minValue -= 10;
    maxValue += 10;
  }
  const range = Math.max(1, maxValue - minValue);

  ctx.strokeStyle = "rgba(53, 255, 234, 0.14)";
  ctx.lineWidth = 1;
  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (chartHeight / 4) * step;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(173, 225, 247, 0.74)";
  ctx.font = "600 12px Play, sans-serif";
  ctx.textAlign = "right";
  for (let step = 0; step <= 4; step += 1) {
    const value = Math.round(maxValue - (range / 4) * step);
    const y = padding.top + (chartHeight / 4) * step + 4;
    ctx.fillText(formatCurrency(value), padding.left - 10, y);
  }

  const coords = points.map((point, index) => {
    const x = padding.left + (points.length === 1 ? chartWidth / 2 : (chartWidth * index) / (points.length - 1));
    const y = padding.top + chartHeight - (((Number(point.value) || 0) - minValue) / range) * chartHeight;
    return { x, y, point };
  });

  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  gradient.addColorStop(0, "rgba(53, 255, 234, 0.34)");
  gradient.addColorStop(1, "rgba(53, 255, 234, 0)");

  ctx.beginPath();
  coords.forEach(({ x, y }, index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(coords[coords.length - 1].x, padding.top + chartHeight);
  ctx.lineTo(coords[0].x, padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  coords.forEach(({ x, y }, index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#35ffe2";
  ctx.lineWidth = 3;
  ctx.stroke();

  coords.forEach(({ x, y, point }) => {
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#35ffe2";
    ctx.fill();

    if (points.length <= 10) {
      ctx.fillStyle = "rgba(173, 225, 247, 0.82)";
      ctx.font = "600 11px Play, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(point.label, x, height - 14);
    }
  });
}

function updateContestPrizeModeFields() {
  const selectedBasis = adminContestForm?.querySelector('select[name="prizeVariableBasis"]')?.value || "none";
  const staticInput = adminContestForm?.querySelector('input[name="prizeStaticAmount"]');
  const variableBasisInput = adminContestForm?.querySelector('select[name="prizeVariableBasis"]');
  const variableUnitInput = adminContestForm?.querySelector('input[name="prizeVariableUnitAmount"]');
  const usesVariableGrowth = selectedBasis !== "none";

  if (staticInput) staticInput.required = true;
  if (variableBasisInput) variableBasisInput.required = true;
  if (variableUnitInput) {
    variableUnitInput.required = usesVariableGrowth;
    variableUnitInput.disabled = !usesVariableGrowth;
  }
}

function updateContestLaunchModeFields() {
  if (!adminContestForm) return;
  const useThresholdStart = Boolean(contestStartWhenRequirementReachedInput?.checked);
  const scheduledFields = Array.from(adminContestForm.querySelectorAll("[data-scheduled-contest-field]"));
  const thresholdFields = Array.from(adminContestForm.querySelectorAll("[data-threshold-contest-field]"));
  const startsAtInput = adminContestForm.querySelector('input[name="startsAt"]');
  const endsAtInput = adminContestForm.querySelector('input[name="endsAt"]');
  const contestantStartingRequirementInput = adminContestForm.querySelector('input[name="contestantStartingRequirement"]');
  const contestLengthHoursInput = adminContestForm.querySelector('input[name="contestLengthHours"]');

  scheduledFields.forEach((field) => {
    field.hidden = useThresholdStart;
  });
  thresholdFields.forEach((field) => {
    field.hidden = !useThresholdStart;
  });

  if (startsAtInput) {
    startsAtInput.disabled = useThresholdStart;
    startsAtInput.required = !useThresholdStart;
  }
  if (endsAtInput) {
    endsAtInput.disabled = useThresholdStart;
    endsAtInput.required = !useThresholdStart;
  }
  if (contestantStartingRequirementInput) {
    contestantStartingRequirementInput.disabled = !useThresholdStart;
    contestantStartingRequirementInput.required = useThresholdStart;
  }
  if (contestLengthHoursInput) {
    contestLengthHoursInput.disabled = !useThresholdStart;
    contestLengthHoursInput.required = useThresholdStart;
  }
}

function getDefaultPrizeAllocations() {
  return [{ place: 1, percentage: 100 }];
}

function getPrizeAllocationFields() {
  if (!adminContestForm) return [];
  return Array.from(adminContestForm.querySelectorAll("[data-prize-allocation-row]"));
}

function updatePrizeAllocationSummary() {
  const summaryEl = document.getElementById("contest-prize-allocation-summary");
  const total = getPrizeAllocationFields().reduce((sum, row) => {
    const input = row.querySelector('input[name="allocationPercentage"]');
    return sum + Number(input?.value || 0);
  }, 0);
  if (!summaryEl) return total;
  summaryEl.textContent = `Total allocation: ${total}%`;
  summaryEl.classList.toggle("is-invalid", Math.abs(total - 100) > 0.001);
  return total;
}

function renderPrizeAllocationRows(allocations = getDefaultPrizeAllocations()) {
  const list = document.getElementById("contest-prize-allocations");
  if (!list) return;
  list.innerHTML = "";
  normalizePrizeAllocations(allocations).forEach((allocation, index, normalized) => {
    const row = document.createElement("div");
    row.className = "contest-prize-allocation-row";
    row.dataset.prizeAllocationRow = "true";

    const label = document.createElement("span");
    label.className = "contest-prize-allocation-label";
    label.textContent = `${getOrdinalLabel(index + 1)} place`;

    const input = document.createElement("input");
    input.type = "number";
    input.name = "allocationPercentage";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(Math.round(Number(allocation.percentage)));
    input.addEventListener("input", () => {
      updatePrizeAllocationSummary();
    });

    const suffix = document.createElement("span");
    suffix.className = "contest-prize-allocation-suffix";
    suffix.textContent = "%";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary contest-prize-allocation-remove";
    removeButton.textContent = "Remove";
    removeButton.disabled = normalized.length === 1;
    removeButton.addEventListener("click", () => {
      if (getPrizeAllocationFields().length <= 1) return;
      row.remove();
      renderPrizeAllocationRows(getPrizeAllocationValues());
    });

    row.append(label, input, suffix, removeButton);
    list.appendChild(row);
  });
  updatePrizeAllocationSummary();
}

function getPrizeAllocationValues() {
  return getPrizeAllocationFields().map((row, index) => {
    const input = row.querySelector('input[name="allocationPercentage"]');
    return {
      place: index + 1,
      percentage: Math.max(0, Number(input?.value || 0))
    };
  });
}

function buildContestResultRow(entry, contest, { showEmail = false, rankLabel = "", prizeStats = 0 } = {}) {
  const item = document.createElement("li");
  item.className = "contest-result-row";

  const main = document.createElement("div");
  main.className = "contest-result-main";

  const title = document.createElement("strong");
  title.textContent = `${rankLabel}${entry.displayName}`;

  const detail = document.createElement("span");
  detail.className = "contest-result-detail";
  const award = getContestPrizeAward(entry, contest, prizeStats);
  const detailParts = [];
  if (showEmail) {
    const email = document.createElement("span");
    email.textContent = `${entry.participantEmail || "No email saved"} • `;
    detailParts.push(email);
  }
  const score = document.createElement("span");
  score.textContent = `${formatCurrency(entry.score)} credits • ${formatCurrency(entry.carter_cash)} Carter Cash`;
  detailParts.push(score);
  if (award > 0) {
    const awardEl = document.createElement("span");
    awardEl.className = "contest-result-award";
    awardEl.textContent = `Award ${formatPrizeMoney(award)}`;
    detailParts.push(awardEl);
  }
  detailParts.forEach((part, index) => {
    if (index > 0) {
      detail.append(document.createTextNode(" • "));
    }
    detail.append(part);
  });

  main.append(title, detail);

  const graphButton = document.createElement("button");
  graphButton.type = "button";
  graphButton.className = "secondary contest-graph-button";
  graphButton.textContent = "View Graph";
  graphButton.addEventListener("click", () => {
    void openContestJourneyModal(contest, entry);
  });

  item.append(main, graphButton);
  return item;
}

async function openContestJourneyModal(contest, entry) {
  if (!contestJourneyModal || !contestJourneySummaryEl || !contestJourneyChartEl) return;
  if (contestJourneyTitleEl) {
    contestJourneyTitleEl.textContent = `${entry.displayName} Journey`;
  }
  contestJourneySummaryEl.textContent = `Loading ${entry.displayName}'s bankroll path through ${contest.title}...`;
  contestJourneyModal.hidden = false;
  contestJourneyModal.classList.add("is-open");
  contestJourneyModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  contestJourneyModalOpen = true;
  drawContestJourneyChart([]);

  try {
    const points = await loadContestJourneyPoints(contest, entry);
    contestJourneySummaryEl.textContent = `${entry.displayName} finished with ${formatCurrency(entry.score)} credits and ${formatCurrency(entry.carter_cash)} Carter Cash in ${contest.title}.`;
    drawContestJourneyChart(points);
    if (contestJourneyResizeHandler) {
      window.removeEventListener("resize", contestJourneyResizeHandler);
    }
    contestJourneyResizeHandler = () => drawContestJourneyChart(points);
    window.addEventListener("resize", contestJourneyResizeHandler);
  } catch (error) {
    console.error("[RTN] openContestJourneyModal error", error);
    contestJourneySummaryEl.textContent = `Unable to load ${entry.displayName}'s contest journey right now.`;
    drawContestJourneyChart([]);
  }
}

function closeContestJourneyModal() {
  if (!contestJourneyModal) return;
  contestJourneyModal.hidden = true;
  contestJourneyModal.classList.remove("is-open");
  contestJourneyModal.setAttribute("aria-hidden", "true");
  contestJourneyModalOpen = false;
  if (contestJourneyResizeHandler) {
    window.removeEventListener("resize", contestJourneyResizeHandler);
    contestJourneyResizeHandler = null;
  }
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

function renderContestLeaderboard(list = contestLeaderboard, contest = currentContest) {
  if (!contestLeaderboardListEl) return;
  contestLeaderboardListEl.innerHTML = "";

  if (!contest || !list.length) {
    const empty = document.createElement("li");
    empty.className = "contest-leaderboard-row";
    empty.textContent = contest ? "No players have opted in yet." : "No contest leaderboard available.";
    contestLeaderboardListEl.appendChild(empty);
    return;
  }

  const criteria = getContestCriteria(contest);
  list.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "contest-leaderboard-row";
    if (entry.user_id === currentUser?.id) {
      item.classList.add("is-current-user");
    }

    const meta = document.createElement("div");
    meta.className = "contest-player-meta";

    const rank = document.createElement("span");
    rank.className = "contest-player-rank";
    rank.textContent = entry.qualifies ? `#${entry.qualifiedRank}` : "Not qualified";

    const name = document.createElement("span");
    name.className = "contest-player-name";
    name.textContent = entry.displayName;

    meta.append(rank, name);

    const score = document.createElement("span");
    score.className = "contest-player-score";
    score.textContent = `${criteria.scoreLabel}: ${formatCurrency(entry.score)} • Carter Cash: ${formatCurrency(entry.carter_cash)}`;

    item.append(meta, score);
    contestLeaderboardListEl.appendChild(item);
  });
}

function renderContestResultsModal(contest, leaderboard, { variant = "results" } = {}) {
  if (!contestResultsSummaryEl || !contestResultsListEl || !contestResultsNonQualifyingListEl) return;
  const { qualifying, nonQualifying } = splitContestParticipants(leaderboard);
  const winners = qualifying.filter((entry) => entry.score === qualifying[0]?.score);
  const qualificationRequirement = getContestQualificationRequirement(contest);
  const isLeaderboardVariant = variant === "leaderboard";
  const prizeStats = {
    participants: leaderboard.length,
    qualifying: qualifying.length
  };
  const prizeHeadline = getContestPrizeHeadline(contest, prizeStats);

  if (contestResultsTitleEl) {
    contestResultsTitleEl.textContent = isLeaderboardVariant ? "Contest Leaderboard" : "Contest Results";
  }

  contestResultsSummaryEl.textContent = isLeaderboardVariant
    ? `${contest.title} leaderboard. Prize pot is ${prizeHeadline}. ${getContestPrizeDistributionCopy(contest, prizeStats)}. Each participant needs at least ${formatCurrency(qualificationRequirement)} Carter Cash to qualify for the prize.`
    : winners.length
      ? `${contest.title} has ended. Congratulations to ${winners.map((winner) => winner.displayName).join(", ")} for posting the highest credits total among players with at least ${formatCurrency(qualificationRequirement)} Carter Cash. Prize pot: ${prizeHeadline}. ${getContestPrizeDistributionCopy(contest, prizeStats)}.`
      : `${contest.title} has ended. No participant reached the ${formatCurrency(qualificationRequirement)} Carter Cash qualification requirement. Prize pot: ${prizeHeadline}. ${getContestPrizeDistributionCopy(contest, prizeStats)}.`;
  contestResultsListEl.innerHTML = "";
  contestResultsNonQualifyingListEl.innerHTML = "";

  qualifying.forEach((entry) => {
    contestResultsListEl.appendChild(buildContestResultRow(entry, contest, {
      rankLabel: `#${entry.qualifiedRank} `,
      prizeStats
    }));
  });

  if (!qualifying.length) {
    const empty = document.createElement("li");
    empty.className = "contest-result-row";
    empty.innerHTML = `<span>No qualifying winners</span><strong>${formatCurrency(qualificationRequirement)} Carter Cash required</strong>`;
    contestResultsListEl.appendChild(empty);
  }

  nonQualifying.forEach((entry) => {
    contestResultsNonQualifyingListEl.appendChild(buildContestResultRow(entry, contest, {
      prizeStats
    }));
  });

  if (!nonQualifying.length) {
    const empty = document.createElement("li");
    empty.className = "contest-result-row";
    empty.innerHTML = `<span>Everyone qualified</span><strong>${formatCurrency(qualificationRequirement)} Carter Cash required</strong>`;
    contestResultsNonQualifyingListEl.appendChild(empty);
  }

  if (contestResultsNoteEl) {
    contestResultsNoteEl.hidden = isLeaderboardVariant;
  }
}

function openContestResultsModal(contest, leaderboard, options = {}) {
  if (!contestResultsModal) return;
  renderContestResultsModal(contest, leaderboard, options);
  contestResultsModal.hidden = false;
  contestResultsModal.classList.add("is-open");
  contestResultsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  contestResultsModalOpen = true;
  if (options.variant !== "leaderboard") {
    void markContestResultsSeen(contest.id);
  }
}

function closeContestResultsModal() {
  if (!contestResultsModal) return;
  contestResultsModal.hidden = true;
  contestResultsModal.classList.remove("is-open");
  contestResultsModal.setAttribute("aria-hidden", "true");
  contestResultsModalOpen = false;
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestJourneyModal || contestJourneyModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

function renderAdminContestResultsModal(contest, leaderboard) {
  if (!adminContestResultsSummaryEl || !adminContestResultsListEl || !adminContestResultsNonQualifyingListEl) return;
  const { qualifying, nonQualifying } = splitContestParticipants(leaderboard);
  const winners = qualifying.filter((entry) => entry.score === qualifying[0]?.score);
  const qualificationRequirement = getContestQualificationRequirement(contest);
  const prizeStats = {
    participants: leaderboard.length,
    qualifying: qualifying.length
  };
  adminContestResultsSummaryEl.textContent = winners.length
    ? `${contest.title} winner${winners.length > 1 ? "s" : ""}: ${winners.map((winner) => winner.displayName).join(", ")}. Prize pot: ${getContestPrizeHeadline(contest, prizeStats)}. ${getContestPrizeDistributionCopy(contest, prizeStats)}. Qualification requirement: ${formatCurrency(qualificationRequirement)} Carter Cash.`
    : `${contest.title} ended with no qualifying participants. Prize pot: ${getContestPrizeHeadline(contest, prizeStats)}. ${getContestPrizeDistributionCopy(contest, prizeStats)}. Requirement: ${formatCurrency(qualificationRequirement)} Carter Cash.`;
  adminContestResultsListEl.innerHTML = "";
  adminContestResultsNonQualifyingListEl.innerHTML = "";

  qualifying.forEach((entry) => {
    adminContestResultsListEl.appendChild(buildContestResultRow(entry, contest, {
      showEmail: true,
      rankLabel: `#${entry.qualifiedRank} `,
      prizeStats
    }));
  });

  if (!qualifying.length) {
    const empty = document.createElement("li");
    empty.className = "contest-result-row";
    empty.innerHTML = `<span>No qualifying participants</span><strong>${formatCurrency(qualificationRequirement)} Carter Cash required</strong>`;
    adminContestResultsListEl.appendChild(empty);
  }

  nonQualifying.forEach((entry) => {
    adminContestResultsNonQualifyingListEl.appendChild(buildContestResultRow(entry, contest, {
      showEmail: true,
      prizeStats
    }));
  });

  if (!nonQualifying.length) {
    const empty = document.createElement("li");
    empty.className = "contest-result-row";
    empty.innerHTML = `<span>Everyone qualified</span><strong>${formatCurrency(qualificationRequirement)} Carter Cash required</strong>`;
    adminContestResultsNonQualifyingListEl.appendChild(empty);
  }
}

function openAdminContestResultsModal(contest, leaderboard) {
  if (!adminContestResultsModal) return;
  renderAdminContestResultsModal(contest, leaderboard);
  adminContestResultsModal.hidden = false;
  adminContestResultsModal.classList.add("is-open");
  adminContestResultsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeAdminContestResultsModal() {
  if (!adminContestResultsModal) return;
  adminContestResultsModal.hidden = true;
  adminContestResultsModal.classList.remove("is-open");
  adminContestResultsModal.setAttribute("aria-hidden", "true");
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!contestJourneyModal || contestJourneyModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestantsModal || adminContestantsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

function renderAdminContestantsModal(contest, contestants = []) {
  if (!adminContestantsSummaryEl || !adminContestantsListEl) return;
  const required = getContestStartRequirement(contest);
  const entered = contestants.length;
  const remaining = Math.max(0, required - entered);
  adminContestantsSummaryEl.textContent = `${contest.title} currently has ${entered} contestant${entered === 1 ? "" : "s"} entered.${required > 0 ? ` ${remaining === 0 ? "The start requirement has been met." : `${remaining} more ${remaining === 1 ? "entrant is" : "entrants are"} needed to start.`}` : ""}`;

  adminContestantsListEl.innerHTML = "";
  if (!contestants.length) {
    const empty = document.createElement("li");
    empty.className = "contest-result-row";
    empty.innerHTML = "<span>No contestants have joined yet.</span><strong>Pending</strong>";
    adminContestantsListEl.appendChild(empty);
    return;
  }

  contestants.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "contest-result-row";

    const nameWrap = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = entry.display_name || getContestDisplayName(null, entry.user_id);
    const meta = document.createElement("div");
    meta.className = "contest-results-entry-email";
    meta.textContent = entry.participant_email || "Email unavailable";
    nameWrap.append(name, meta);

    const joined = document.createElement("div");
    joined.className = "contest-results-entry-meta";
    joined.innerHTML = `<strong>#${index + 1}</strong><span>${entry.opted_in_at ? new Date(entry.opted_in_at).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }) : "Joined"}</span>`;

    item.append(nameWrap, joined);
    adminContestantsListEl.appendChild(item);
  });
}

function openAdminContestantsModal(contest, contestants) {
  if (!adminContestantsModal) return;
  renderAdminContestantsModal(contest, contestants);
  adminContestantsModal.hidden = false;
  adminContestantsModal.classList.add("is-open");
  adminContestantsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeAdminContestantsModal() {
  if (!adminContestantsModal) return;
  adminContestantsModal.hidden = true;
  adminContestantsModal.classList.remove("is-open");
  adminContestantsModal.setAttribute("aria-hidden", "true");
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!contestJourneyModal || contestJourneyModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestantsModal || adminContestantsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function handleAdminContestViewContestants(contest) {
  if (!contest?.id) return;
  try {
    const { data, error } = await supabase
      .from("contest_entries")
      .select("user_id, display_name, participant_email, opted_in_at")
      .eq("contest_id", contest.id)
      .order("opted_in_at", { ascending: true });
    if (error) throw error;
    openAdminContestantsModal(contest, Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("[RTN] admin contest contestants error", error);
    showToast(error?.message || "Unable to load contestants", "error");
  }
}

function renderContestModal() {
  const contest = currentContest;
  const status = getContestStatus(contest);
  if (contestStatusText) {
    contestStatusText.textContent = contest ? `${getContestStatusLabel(status)} contest` : "No active contest.";
  }
  if (contestTitleEl) {
    contestTitleEl.textContent = contest?.title || "Contest details";
  }
  if (contestWindowEl) {
    contestWindowEl.textContent = contest ? getContestScheduleLabel(contest) : "";
  }
  const contestCaptionDetailsEl = document.getElementById("contest-caption-details");
  if (contestCaptionDetailsEl) {
    const detailsCopy = String(contest?.contest_details || "").trim();
    contestCaptionDetailsEl.textContent = detailsCopy;
    contestCaptionDetailsEl.hidden = !detailsCopy;
  }
  if (contestStartingBankrollEl) {
    contestStartingBankrollEl.textContent = formatCurrency(contest?.starting_credits ?? 0);
  }
  if (contestStartingCarterCashEl) {
    contestStartingCarterCashEl.textContent = formatCurrency(contest?.starting_carter_cash ?? 0);
  }
  if (contestWinningCriteriaEl) {
    contestWinningCriteriaEl.textContent = contest
      ? `${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash`
      : "-";
  }
  const leaderboardStats = {
    participants: contestLeaderboard.length,
    qualifying: contestLeaderboard.filter((entry) => entry.qualifies).length
  };
  if (contestRewardEl) {
    contestRewardEl.textContent = contest ? getContestPrizeHeadline(contest, leaderboardStats) : "-";
  }
  const contestPrizeGrowthEl = document.getElementById("contest-prize-growth");
  if (contestPrizeGrowthEl) {
    contestPrizeGrowthEl.textContent = contest ? getContestPrizeGrowthCopy(contest) : "";
  }
  if (contestOptInCopyEl) {
    const entryFee = getContestEntryFee(contest);
    const entryFeeCopy = entryFee > 0 ? ` Entry fee: ${formatCurrency(entryFee)} CC from your Normal Mode balance.` : "";
    const requiredRank = contest ? getRankByTier(getContestRequiredRankTier(contest)) : null;
    const rankCopy = requiredRank && requiredRank.tier > 1
      ? ` Rank requirement: ${requiredRank.name} or higher.`
      : "";
    if (!contest) {
      contestOptInCopyEl.textContent = "Check back soon for the next contest.";
    } else if (currentContestEntry) {
      contestOptInCopyEl.textContent = status === "pending"
        ? `You're entered. ${contest.title} will go live automatically as soon as ${getContestStartRequirement(contest)} contestants have joined, and it will run for ${getContestLengthHours(contest)} hour${getContestLengthHours(contest) === 1 ? "" : "s"}.${rankCopy}${entryFeeCopy}`
        : `You're opted in. Switch into ${contest.title} from the Mode selector in the menu whenever you want to play this contest account. You need at least ${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash to qualify.${rankCopy}${entryFeeCopy}`;
    } else {
      contestOptInCopyEl.textContent = status === "pending"
        ? `Join now to reserve your spot. This contest will begin the moment ${getContestStartRequirement(contest)} contestants have joined, then it will run for ${getContestLengthHours(contest)} hour${getContestLengthHours(contest) === 1 ? "" : "s"}. Your normal account stays untouched, and this contest gets its own starting balance of ${formatCurrency(contest.starting_credits ?? 0)} credits. You need at least ${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash by the end to qualify to win.${rankCopy}${entryFeeCopy}`
        : `Opt in to add this contest to your Mode selector. Your normal account stays untouched, and this contest gets its own starting balance of ${formatCurrency(contest.starting_credits ?? 0)} credits and ${formatCurrency(contest.starting_carter_cash ?? 0)} CC. You need at least ${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash by the end to qualify to win.${rankCopy}${entryFeeCopy}`;
    }
  }
  if (contestOptInButton) {
    const requiredRankTier = contest ? getContestRequiredRankTier(contest) : 1;
    const meetsRankRequirement = getCurrentPlayerRankTier() >= requiredRankTier;
    const canOptIn = Boolean(contest) && status !== "ended" && !currentContestEntry && meetsRankRequirement;
    contestOptInButton.hidden = !contest;
    contestOptInButton.disabled = !canOptIn;
    if (currentContestEntry) {
      contestOptInButton.textContent = "Joined";
    } else if (status === "ended") {
      contestOptInButton.textContent = "Contest ended";
    } else if (!meetsRankRequirement) {
      const requiredRank = getRankByTier(requiredRankTier);
      contestOptInButton.textContent = requiredRank ? `${requiredRank.name} Required` : "Rank Required";
    } else if (status === "pending") {
      contestOptInButton.textContent = `Join Pending Contest`;
    } else {
      contestOptInButton.textContent = "Add Contest Mode";
    }
  }
  renderContestLeaderboard();
}

function getContestScheduleLabel(contest, statsOrCount = contestParticipantCounts[contest?.id] || 0) {
  if (!contest) return "";
  if (getContestStatus(contest) === "pending" && isThresholdContest(contest)) {
    const stats = normalizeContestPrizeStats(statsOrCount);
    const remaining = Math.max(0, getContestStartRequirement(contest) - stats.participants);
    const remainingCopy = remaining > 0
      ? `${remaining} more contestant${remaining === 1 ? "" : "s"} needed`
      : "Ready to start";
    return `Starts when ${getContestStartRequirement(contest)} contestants join • ${getContestLengthHours(contest)} hour${getContestLengthHours(contest) === 1 ? "" : "s"} long • ${remainingCopy}`;
  }
  return `${formatContestDateTime(contest.starts_at)} - ${formatContestDateTime(contest.ends_at)}`;
}

function createContestThresholdProgress(contest, statsOrCount = 0, variant = "list") {
  if (!contest || !isThresholdContest(contest) || getContestStatus(contest) !== "pending") {
    return null;
  }

  const stats = normalizeContestPrizeStats(statsOrCount);
  const required = getContestStartRequirement(contest);
  const entered = Math.max(0, stats.participants);
  const progress = Math.max(0, Math.min(100, (entered / required) * 100));
  const joinBoost = getContestJoinBoost(contest.id, entered);

  const wrap = document.createElement("div");
  wrap.className = `contest-threshold-progress contest-threshold-progress-${variant}`;
  if (joinBoost) {
    wrap.classList.add("is-boosted");
  }

  const headline = document.createElement("p");
  headline.className = "contest-threshold-progress-title";
  headline.textContent = `Contest starts when ${required} contestants have entered`;

  const duration = document.createElement("p");
  duration.className = "contest-threshold-progress-duration";
  duration.textContent = `Contest duration ${getContestLengthHours(contest)} hours`;

  const bar = document.createElement("div");
  bar.className = "contest-threshold-progress-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(required));
  bar.setAttribute("aria-valuenow", String(Math.min(entered, required)));
  bar.setAttribute("aria-label", `${entered} of ${required} contestants entered`);

  const fill = document.createElement("span");
  fill.className = "contest-threshold-progress-fill";
  fill.style.width = `${progress}%`;
  fill.style.setProperty("--progress-width", `${progress}%`);
  bar.append(fill);

  if (joinBoost) {
    const burst = document.createElement("span");
    burst.className = "contest-threshold-progress-burst";
    burst.textContent = `+${joinBoost.delta}`;
    bar.append(burst);
  }

  const meta = document.createElement("p");
  meta.className = "contest-threshold-progress-meta";
  meta.textContent = `${entered}/${required} entered`;

  wrap.append(headline, duration, bar, meta);
  return wrap;
}

function formatContestRemaining(contest) {
  if (!contest) return "Details";
  const status = getContestStatus(contest);
  if (status === "pending" && isThresholdContest(contest)) {
    const stats = normalizeContestPrizeStats(contestParticipantCounts[contest.id] || 0);
    const remaining = Math.max(0, getContestStartRequirement(contest) - stats.participants);
    return remaining > 0
      ? `Waiting for ${remaining}`
      : "Starting soon";
  }
  const now = Date.now();
  const target = status === "upcoming"
    ? new Date(contest.starts_at).getTime()
    : new Date(contest.ends_at).getTime();
  const diff = Math.max(0, target - now);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (status === "ended") return "Ended";
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return status === "upcoming" ? `Starts in ${days}d` : `${days}d left`;
  }
  return status === "upcoming"
    ? `Starts in ${hours}h ${minutes}m`
    : `${hours}h ${minutes}m left`;
}

function renderContestChip() {
  const visibleContests = (contestCache || []).filter((entry) => isContestVisibleToCurrentUser(entry));
  const contest = isContestVisibleToCurrentUser(currentContest)
    ? currentContest
    : chooseCurrentContest(visibleContests);
  if (!drawerContestLink) {
    if (menuContestBadge) {
      menuContestBadge.hidden = !visibleContests.some((entry) => ["live", "pending"].includes(getContestStatus(entry)));
    }
    return;
  }
  if (!contest && !visibleContests.length) {
    drawerContestLink.hidden = true;
    if (menuContestBadge) {
      menuContestBadge.hidden = true;
    }
    return;
  }
  drawerContestLink.hidden = !contest || !isContestVisibleToCurrentUser(contest);
  if (drawerContestTimer) {
    drawerContestTimer.textContent = contest && isContestVisibleToCurrentUser(contest) ? formatContestRemaining(contest) : "View";
  }
  if (menuContestBadge) {
    menuContestBadge.hidden = !visibleContests.some((entry) => ["live", "pending"].includes(getContestStatus(entry)));
  }
}

function startContestTimer() {
  if (contestTimerInterval) {
    clearInterval(contestTimerInterval);
  }
  contestTimerInterval = setInterval(() => {
    renderContestChip();
    const activeModeContest = getModeContest();
    if (
      (currentContest && getContestStatus(currentContest) === "ended") ||
      (activeModeContest && getContestStatus(activeModeContest) === "ended")
    ) {
      void syncContestState({ force: true });
    }
  }, 1000);
}

function openContestModal() {
  if (!contestModal) return;
  renderContestModal();
  contestModal.hidden = false;
  contestModal.classList.add("is-open");
  contestModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

async function showContestDetails(contestId) {
  const contest = getContestById(contestId);
  if (!contest) {
    throw new Error("Contest not found");
  }
  currentContest = contest;
  currentContestEntry = getContestEntryById(contest.id);
  try {
    contestLeaderboard = await buildContestLeaderboard(contest);
  } catch (error) {
    console.error("[RTN] showContestDetails leaderboard error", error);
    contestLeaderboard = [];
  }
  openContestModal();
}

function closeContestModal() {
  if (!contestModal) return;
  contestModal.hidden = true;
  contestModal.classList.remove("is-open");
  contestModal.setAttribute("aria-hidden", "true");
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

function openAdminContestModal() {
  if (!adminContestModal) return;
  adminContestModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : adminContestAddButton;
  adminContestModal.hidden = false;
  adminContestModal.classList.add("is-open");
  adminContestModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  updateContestPrizeModeFields();
  updateContestLaunchModeFields();
  adminContestForm?.querySelector('input[name="title"]')?.focus();
}

function closeAdminContestModal({ resetFields = true, restoreFocus = false } = {}) {
  if (!adminContestModal) return;
  if (resetFields && adminContestForm) {
    adminContestForm.reset();
    updateContestPrizeModeFields();
    updateContestLaunchModeFields();
    renderPrizeAllocationRows();
  }
  if (adminContestMessage) {
    adminContestMessage.textContent = "";
  }
  adminContestModal.hidden = true;
  adminContestModal.classList.remove("is-open");
  adminContestModal.setAttribute("aria-hidden", "true");
  if (
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  if (restoreFocus) {
    (adminContestModalTrigger || adminContestAddButton)?.focus?.();
  }
}

function chooseCurrentContest(contests) {
  const now = Date.now();
  const visibleContests = (contests || []).filter((contest) => isContestVisibleToCurrentUser(contest));
  const live = visibleContests.filter((contest) => getContestStatus(contest, now) === "live");
  if (live.length) {
    return live.sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))[0];
  }
  const pending = visibleContests.filter((contest) => getContestStatus(contest, now) === "pending");
  if (pending.length) {
    return pending.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  }
  const upcoming = visibleContests.filter((contest) => getContestStatus(contest, now) === "upcoming");
  if (upcoming.length) {
    return upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  }
  return null;
}

function updateAdminContestCreateState(contests = contestCache) {
  if (!adminContestAddButton) return;
  adminContestAddButton.disabled = false;
  adminContestAddButton.textContent = "Create contest";
  adminContestAddButton.title = "";
}

async function openContestResultNotification(contestId) {
  const contest = getContestById(contestId);
  if (!contest) return;

  const userEntry = getContestEntryById(contest.id);
  if (userEntry && isContestAccountMode() && currentAccountMode.contestId === contest.id) {
    await finalizeContestEntryFromLocalState(contest, userEntry);
  }

  await ensureContestMedalsAwarded(contest);
  const leaderboard = await buildContestLeaderboard(contest);
  if (!leaderboard.length) return;

  openContestResultsModal(contest, leaderboard);
  await markContestResultsSeen(contest.id);
  refreshContestNotifications(contestCache);
}

async function openContestStartNotification(contestId) {
  const contest = getContestById(contestId);
  if (!contest) return;
  await showContestDetails(contest.id);
  await markContestStartNotificationSeen(contest.id);
  refreshContestNotifications(contestCache);
}

async function finalizeContestEntryFromLocalState(contest, entry) {
  if (!contest?.id || !entry?.user_id || entry.user_id !== currentUser?.id) {
    return entry;
  }

  const finalSnapshot = {
    current_credits: normalizeStoredCreditValue(bankroll),
    current_carter_cash: Number.isFinite(Number(carterCash)) ? Math.max(0, Math.round(Number(carterCash))) : 0,
    current_carter_cash_progress: Number.isFinite(Number(carterCashProgress)) ? Math.max(0, Number(carterCashProgress)) : 0,
    contest_history: buildContestHistory(entry.contest_history, bankroll, "Finish"),
    display_name: getContestDisplayName(currentProfile, currentUser.id),
    participant_email: currentUser.email || ""
  };

  const { error } = await supabase
    .from("contest_entries")
    .update(finalSnapshot)
    .eq("contest_id", contest.id)
    .eq("user_id", entry.user_id);
  if (error) throw error;

  const updatedEntry = {
    ...entry,
    ...finalSnapshot
  };
  contestEntryMap.set(updatedEntry.contest_id, updatedEntry);
  userContestEntries = userContestEntries.map((candidate) =>
    candidate.contest_id === updatedEntry.contest_id ? updatedEntry : candidate
  );

  if (currentContestEntry?.contest_id === contest.id && currentContestEntry?.user_id === entry.user_id) {
    currentContestEntry = {
      ...currentContestEntry,
      ...finalSnapshot
    };
  }

  return updatedEntry;
}

async function ensureContestMedalsAwarded(contest) {
  if (!contest?.id || getContestStatus(contest) !== "ended") return;
  try {
    const { error } = await supabase.rpc("award_contest_medals", {
      _contest_id: contest.id
    });
    if (error) throw error;
    if (currentUser?.id && currentUser.id !== GUEST_USER.id) {
      const refreshedProfile = await fetchProfileWithRetries(currentUser.id, {
        attempts: PROFILE_ATTEMPT_MAX,
        delayMs: PROFILE_RETRY_DELAY_MS,
        timeoutMs: PROFILE_FETCH_TIMEOUT_MS
      });
      if (refreshedProfile) {
        currentProfile = {
          ...(currentProfile || {}),
          ...refreshedProfile
        };
        await refreshCurrentRankState({ force: true });
      }
    }
  } catch (error) {
    console.error("[RTN] ensureContestMedalsAwarded error", error);
  }
}

async function syncContestState({ force = false } = {}) {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    currentContest = null;
    currentContestEntry = null;
    contestLeaderboard = [];
    userContestEntries = [];
    contestEntryMap = new Map();
    contestParticipantCounts = {};
    contestNotifications = [];
    contestStartNotifications = [];
    currentAccountMode = createNormalAccountMode();
    renderContestChip();
    renderAccountModeSelector();
    renderContestEmailPreference();
    renderContestNotifications();
    renderHomeContestPromos();
    updateModeSpecificModalCopy();
    return;
  }

  if (!force && contestCache.length) {
    renderContestChip();
    renderAccountModeSelector();
    renderContestEmailPreference();
    renderHomeContestPromos();
    return;
  }

  const { data: contests, error: contestError } = await supabase
    .from("contests")
    .select("*")
    .order("starts_at", { ascending: true });
  if (contestError) {
    console.error("[RTN] syncContestState contests error", contestError);
    return;
  }

  contestCache = Array.isArray(contests) ? contests : [];
  const seededLiveNotifications = await seedLiveContestNotifications();
  await dispatchContestStartEmails(seededLiveNotifications);
  currentContest = chooseCurrentContest(contestCache);
  contestLeaderboard = [];
  userContestEntries = [];
  contestEntryMap = new Map();
  contestParticipantCounts = {};

  const { data: entries, error: entryError } = await supabase
    .from("contest_entries")
    .select("*")
    .eq("user_id", currentUser.id);
  if (entryError) {
    console.error("[RTN] syncContestState contest entry error", entryError);
  } else {
    userContestEntries = Array.isArray(entries) ? entries : [];
    contestEntryMap = new Map(userContestEntries.map((entry) => [entry.contest_id, entry]));
  }

  await loadContestStartNotifications();
  await loadContestParticipantCounts(contestCache);

  currentContestEntry = currentContest ? getContestEntryById(currentContest.id) : null;

  if (currentContest) {
    contestLeaderboard = await buildContestLeaderboard(currentContest);
  }

  renderContestChip();
  renderContestModal();
  updateAdminContestCreateState(contestCache);
  if (isAdmin()) {
    adminContestsLoaded = false;
    await loadAdminContestList(true);
  }
  await loadPlayerContestList(currentRoute === "contests");
  renderContestEmailPreference();
  refreshContestNotifications(contestCache);
  await renderHomeContestPromos();
  syncActiveAccountMode({ forceApply: true, resetHistory: !bankrollInitialized });
}

async function optIntoContest(contest = currentContest) {
  if (!contest || !currentUser?.id) {
    showToast("No contest is available right now.", "error");
    return;
  }
  const existingEntry = getContestEntryById(contest.id);
  if (existingEntry) {
    showToast("You are already entered in this contest.", "info");
    return;
  }

  if (contestOptInButton) {
    contestOptInButton.disabled = true;
  }

  try {
    const participantCounts = await loadContestParticipantCounts([contest]);
    const contestStats = normalizeContestPrizeStats(participantCounts[contest.id] || 0);
    if (contestStats.participants >= getContestLimit(contest)) {
      showToast("This contest is already full.", "error");
      return;
    }

    const requiredRankTier = getContestRequiredRankTier(contest);
    const currentPlayerRankTier = getCurrentPlayerRankTier();
    if (currentPlayerRankTier < requiredRankTier) {
      const requiredRank = getRankByTier(requiredRankTier);
      throw new Error(`You need to be ${requiredRank?.name || `Tier ${requiredRankTier}`} or higher to enter this contest.`);
    }

    const entryFee = getContestEntryFee(contest);
    const normalModeCarterCash = Math.max(0, Math.round(Number(currentProfile?.carter_cash ?? 0)));
    if (entryFee > normalModeCarterCash) {
      showToast(`You need ${formatCurrency(entryFee)} CC in Normal Mode to join this contest.`, "error");
      return;
    }
    if (
      entryFee > 0 &&
      !window.confirm(`Use ${formatCurrency(entryFee)} Carter Cash to join this contest?`)
    ) {
      return;
    }

    const startingCredits = normalizeStoredCreditValue(contest.starting_credits || 0);
    const startingCarterCash = Math.max(0, Math.round(Number(contest.starting_carter_cash || 0)));
    const displayName = getContestDisplayName(currentProfile, currentUser.id);
    let chargedProfile = null;

    if (entryFee > 0) {
      const nextNormalModeCarterCash = normalModeCarterCash - entryFee;
      const profileVersion = currentProfile?.updated_at ?? null;
      let deductQuery = supabase
        .from("profiles")
        .update({ carter_cash: nextNormalModeCarterCash })
        .eq("id", currentUser.id)
        .gte("carter_cash", entryFee);

      if (profileVersion) {
        deductQuery = deductQuery.eq("updated_at", profileVersion);
      }

      const { data: deductedProfile, error: deductError } = await deductQuery
        .select("id, username, credits, carter_cash, carter_cash_progress, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, receive_contest_start_emails, updated_at")
        .maybeSingle();

      if (deductError) throw deductError;
      if (!deductedProfile) {
        throw new Error("Your Normal Mode Carter Cash changed in another tab. Refresh and try joining again.");
      }

      chargedProfile = deductedProfile;
      currentProfile = {
        ...currentProfile,
        ...deductedProfile
      };
      if (!isContestAccountMode()) {
        carterCash = Math.max(0, Math.round(Number(deductedProfile.carter_cash ?? 0)));
        carterCashProgress = Number.isFinite(Number(deductedProfile.carter_cash_progress))
          ? Number(deductedProfile.carter_cash_progress)
          : carterCashProgress;
        lastSyncedCarterCash = carterCash;
        lastSyncedCarterProgress = carterCashProgress;
        handleCarterCashChanged();
      }
    }

    const entryPayload = {
      contest_id: contest.id,
      user_id: currentUser.id,
      pre_contest_credits: normalizeStoredCreditValue(currentProfile?.credits ?? INITIAL_BANKROLL),
      pre_contest_carter_cash: Number.isFinite(Number(currentProfile?.carter_cash)) ? Math.round(Number(currentProfile.carter_cash)) : 0,
      pre_contest_carter_cash_progress: Number.isFinite(Number(currentProfile?.carter_cash_progress))
        ? Number(currentProfile.carter_cash_progress)
        : 0,
      starting_credits: startingCredits,
      starting_carter_cash: startingCarterCash,
      current_credits: startingCredits,
      current_carter_cash: startingCarterCash,
      current_carter_cash_progress: 0,
      contest_history: buildContestHistory([], startingCredits, "Start", contest.starts_at || new Date().toISOString()),
      display_name: displayName,
      participant_email: currentUser.email || ""
    };

    const { error: entryError } = await supabase.from("contest_entries").insert(entryPayload);
    if (entryError) {
      if (entryFee > 0 && chargedProfile) {
        const refundedAmount = Math.max(0, Math.round(Number(chargedProfile.carter_cash ?? 0))) + entryFee;
        const { data: refundedProfile } = await supabase
          .from("profiles")
          .update({ carter_cash: refundedAmount })
          .eq("id", currentUser.id)
          .eq("updated_at", chargedProfile.updated_at ?? null)
          .select("id, username, credits, carter_cash, carter_cash_progress, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, receive_contest_start_emails, updated_at")
          .maybeSingle();
        if (refundedProfile) {
          currentProfile = {
            ...currentProfile,
            ...refundedProfile
          };
          if (!isContestAccountMode()) {
            carterCash = Math.max(0, Math.round(Number(refundedProfile.carter_cash ?? 0)));
            carterCashProgress = Number.isFinite(Number(refundedProfile.carter_cash_progress))
              ? Number(refundedProfile.carter_cash_progress)
              : carterCashProgress;
            lastSyncedCarterCash = carterCash;
            lastSyncedCarterProgress = carterCashProgress;
            handleCarterCashChanged();
          }
        }
      }
      throw entryError;
    }

    const insertedEntry = {
      ...entryPayload,
      opted_in_at: new Date().toISOString()
    };
    userContestEntries = [...userContestEntries, insertedEntry];
    contestEntryMap.set(insertedEntry.contest_id, insertedEntry);
    if (currentContest?.id === insertedEntry.contest_id) {
      currentContestEntry = insertedEntry;
    }
    currentAccountMode = {
      type: "contest",
      contestId: insertedEntry.contest_id
    };
    saveAccountModeSelection(currentAccountMode);
    const activationResult = await maybeActivatePendingContest(insertedEntry.contest_id);
    showToast(entryFee > 0 ? `Contest mode added for ${formatCurrency(entryFee)} CC` : "Contest mode added", "success");
    if (activationResult?.activated) {
      showToast(`${contest.title || "Contest"} is now live`, "success");
    }
    incrementContestParticipantCount(contest, insertedEntry);
    await syncContestState({ force: true });
  } catch (error) {
    console.error("[RTN] optIntoContest error", error);
    showToast(error?.message || "Unable to join contest", "error");
  } finally {
    if (contestOptInButton) {
      contestOptInButton.disabled = false;
    }
  }
}

async function handleAdminContestSubmit(event) {
  event.preventDefault();
  if (!adminContestForm || !isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }

  const formData = new FormData(adminContestForm);
  const title = String(formData.get("title") ?? "").trim();
  const contestDetails = String(formData.get("contestDetails") ?? "").trim();
  const startWhenRequirementReached = String(formData.get("startWhenRequirementReached") ?? "") === "on";
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const startingBankroll = Math.max(0, Math.round(Number(formData.get("startingBankroll") ?? 0)));
  const entryFeeCarterCash = Math.max(0, Math.round(Number(formData.get("entryFeeCarterCash") ?? 0)));
  const contestantLimit = Math.max(1, Math.round(Number(formData.get("contestantLimit") ?? 100)));
  const contestantStartingRequirement = Math.max(1, Math.round(Number(formData.get("contestantStartingRequirement") ?? 1)));
  const contestLengthHours = Math.max(1, Math.round(Number(formData.get("contestLengthHours") ?? 1)));
  const qualificationCarterCash = Math.max(0, Math.round(Number(formData.get("qualificationCarterCash") ?? 0)));
  const requiredRankTier = Math.max(1, Math.round(Number(formData.get("requiredRankTier") ?? 1)));
  const rawContestGameIds = formData.getAll("contestGameIds");
  const allowedGameIds = normalizeContestAllowedGameIds(rawContestGameIds);
  const prizeStaticAmount = Math.max(0, Number(formData.get("prizeStaticAmount") ?? 0));
  const prizeVariableBasis = String(formData.get("prizeVariableBasis") ?? "none");
  const prizeVariableUnitAmount = Math.max(0, Number(formData.get("prizeVariableUnitAmount") ?? 0));
  const sendStartEmailNotification = String(formData.get("sendStartEmailNotification") ?? "") === "on";
  const isTestContest = String(formData.get("isTestContest") ?? "") === "on";
  const prizeAllocations = normalizePrizeAllocations(getPrizeAllocationValues());

  if (!title || (!startWhenRequirementReached && (!startsAt || !endsAt))) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "Please fill out all contest fields.";
    }
    return;
  }

  if (!allowedGameIds.length) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "Select at least one game for this contest.";
    }
    return;
  }

  if (!startWhenRequirementReached && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "End date must be after the start date.";
    }
    return;
  }

  if (startWhenRequirementReached && contestantStartingRequirement > contestantLimit) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "Contestant starting requirement cannot be higher than the contestant limit.";
    }
    return;
  }

  const usesVariablePrize = prizeVariableBasis !== "none";
  if (!["none", "contestant", "qualifying_contestant"].includes(prizeVariableBasis)) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "Choose how the variable prize pot should grow.";
    }
    return;
  }
  const allocationTotal = prizeAllocations.reduce((sum, allocation) => sum + Number(allocation.percentage || 0), 0);
  if (Math.abs(allocationTotal - 100) > 0.001) {
    if (adminContestMessage) {
      adminContestMessage.textContent = "Prize pot allocations must total 100%.";
    }
    return;
  }

  const payload = {
    title,
    contest_details: contestDetails || null,
    starts_at: startWhenRequirementReached ? null : new Date(startsAt).toISOString(),
    ends_at: startWhenRequirementReached ? null : new Date(endsAt).toISOString(),
    start_mode: startWhenRequirementReached ? "threshold" : "scheduled",
    status: startWhenRequirementReached ? "pending" : "upcoming",
    contestant_starting_requirement: startWhenRequirementReached ? contestantStartingRequirement : null,
    contest_length_hours: startWhenRequirementReached ? contestLengthHours : null,
    starting_credits: startingBankroll,
    starting_carter_cash: 0,
    entry_fee_carter_cash: entryFeeCarterCash,
    contestant_limit: contestantLimit,
    allowed_game_ids: allowedGameIds,
    winning_criteria: "highest_bankroll",
    qualification_carter_cash: qualificationCarterCash,
    required_rank_tier: requiredRankTier,
    reward: usesVariablePrize
      ? getContestPrizeGrowthCopy({
          prize_mode: "variable",
          prize_static_amount: prizeStaticAmount,
          prize_variable_basis: prizeVariableBasis,
          prize_variable_unit_amount: prizeVariableUnitAmount
        })
      : `Static prize pot of ${formatPrizeMoney(prizeStaticAmount)}.`,
    prize_mode: usesVariablePrize ? "variable" : "static",
    prize_static_amount: prizeStaticAmount,
    prize_variable_basis: usesVariablePrize ? prizeVariableBasis : "none",
    prize_variable_unit_amount: usesVariablePrize ? prizeVariableUnitAmount : 0,
    prize_allocations: prizeAllocations,
    send_start_email_notification: sendStartEmailNotification,
    is_test: isTestContest,
    created_by: currentUser.id
  };

  try {
    if (adminContestSaveButton) adminContestSaveButton.disabled = true;
    console.info("[RTN] handleAdminContestSubmit payload", {
      rawContestGameIds,
      normalizedAllowedGameIds: allowedGameIds,
      payloadAllowedGameIds: payload.allowed_game_ids
    });
    const { data, error } = await supabase.from("contests").insert(payload).select("id").single();
    if (error) throw error;
    if (startWhenRequirementReached && sendStartEmailNotification) {
      await sendContestPublishEmail(data?.id);
    }
    showToast("Contest created", "success");
    adminContestsLoaded = false;
    closeAdminContestModal({ resetFields: true, restoreFocus: true });
    await syncContestState({ force: true });
  } catch (error) {
    console.error("[RTN] handleAdminContestSubmit error", error);
    if (adminContestMessage) {
      adminContestMessage.textContent = error?.message || "Unable to create contest.";
    }
    showToast("Unable to create contest", "error");
  } finally {
    if (adminContestSaveButton) adminContestSaveButton.disabled = false;
  }
}

async function handleAdminContestDelete(contest) {
  if (!isAdmin()) {
    showToast("Admin access only", "error");
    return;
  }
  if (!contest?.id) {
    showToast("Unable to delete contest", "error");
    return;
  }

  const confirmed = typeof window === "undefined"
    ? true
    : window.confirm(
        `Delete "${contest.title}"? This will remove the contest and all contest-mode balances tied to it, but leave normal accounts untouched.`
      );
  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from("contests")
      .delete()
      .eq("id", contest.id);
    if (error) throw error;

    if (currentContest?.id === contest.id) {
      currentContest = null;
      currentContestEntry = null;
      contestLeaderboard = [];
      renderContestChip();
      closeContestModal();
    }

    adminContestsLoaded = false;
    contestCache = contestCache.filter((entry) => entry.id !== contest.id);
    await loadAdminContestList(true);
    await syncContestState({ force: true });
    showToast("Contest deleted", "success");
  } catch (error) {
    console.error("[RTN] handleAdminContestDelete error", error);
    showToast(error?.message || "Unable to delete contest", "error");
  }
}

async function handleAdminContestViewResults(contest) {
  try {
    await ensureContestMedalsAwarded(contest);
    const leaderboard = await buildContestLeaderboard(contest);
    openAdminContestResultsModal(contest, leaderboard);
  } catch (error) {
    console.error("[RTN] handleAdminContestViewResults error", error);
    showToast(error?.message || "Unable to load contest results", "error");
  }
}

async function switchToContestMode(contestId, { navigateToPlay = false } = {}) {
  const targetMode = parseAccountModeValue(`contest:${contestId}`);
  currentAccountMode = targetMode;
  saveAccountModeSelection(currentAccountMode);
  syncActiveAccountMode({ forceApply: true, resetHistory: true });
  if (navigateToPlay) {
    const contest = getContestById(contestId);
    const allowedGames = normalizeContestAllowedGameIds(contest?.allowed_game_ids);
    const firstAllowedRoute = allowedGames.includes(GAME_KEYS.RUN_THE_NUMBERS)
      ? "run-the-numbers"
      : allowedGames.includes(GAME_KEYS.GUESS_10)
        ? "red-black"
        : "play";
    await setRoute(firstAllowedRoute);
  }
}

function renderPlayerContestRow(contest, participantStats = 0) {
  const item = document.createElement("li");
  item.className = "admin-contest-card";
  const stats = normalizeContestPrizeStats(participantStats);

  const header = document.createElement("div");
  header.className = "admin-contest-header";
  const title = document.createElement("h3");
  title.textContent = contest.is_test ? `${contest.title || "Contest"} (Test)` : contest.title || "Contest";
  const titleRow = document.createElement("div");
  titleRow.className = "contest-card-title-row";
  const entryFeeBadge = document.createElement("span");
  entryFeeBadge.className = "contest-entry-fee-badge";
  entryFeeBadge.textContent = formatContestEntryFeeLabelText(contest);
  titleRow.append(title, entryFeeBadge);
  const badge = document.createElement("span");
  const status = getContestStatus(contest);
  badge.className = "contest-status-badge";
  badge.dataset.status = status;
  badge.textContent = getContestStatusLabel(status);
  const badgeGroup = document.createElement("div");
  badgeGroup.className = "contest-status-meta";
  badgeGroup.append(badge);
  const requiredRankTag = createContestRequiredRankTag(contest);
  if (requiredRankTag) {
    badgeGroup.append(requiredRankTag);
  }
  header.append(titleRow, badgeGroup);

  const details = document.createElement("p");
  details.className = "contest-window";
  details.textContent = getContestScheduleLabel(contest, stats);

  const meta = document.createElement("p");
  meta.className = "contest-opt-in-copy";
  const entryFeeAmount = getContestEntryFee(contest);
  meta.textContent = `Highest credits wins • Requires ${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash • Entry fee: ${formatCurrency(entryFeeAmount)} CC • Contestants: ${formatContestFill(contest, stats)}`;

  const games = document.createElement("p");
  games.className = "contest-prize-growth";
  games.textContent = `Games: ${getContestGamesLabel(contest)}`;

  const prize = document.createElement("p");
  prize.className = "contest-prize-pill";
  prize.textContent = `Prize Pot ${getContestPrizeHeadline(contest, stats)}`;

  const growth = document.createElement("p");
  growth.className = "contest-prize-growth";
  growth.textContent = getContestPrizeGrowthCopy(contest);

  const thresholdProgress = createContestThresholdProgress(contest, stats, "list");

  const caption = document.createElement("p");
  caption.className = "contest-prize-growth";
  caption.textContent = String(contest.contest_details || "").trim();

  const distribution = document.createElement("p");
  distribution.className = "contest-prize-growth";
  distribution.textContent = `Payouts: ${getContestPrizeDistributionCopy(contest, stats)}`;

  const payoutTable = buildContestPayoutTable(contest, stats, "contest-card-payouts");

  const actions = document.createElement("div");
  actions.className = "contest-actions";
  const playerEntry = getContestEntryById(contest.id);
  const contestIsFull = stats.participants >= getContestLimit(contest);
  const requiredRankTier = getContestRequiredRankTier(contest);
  const requiredRank = getRankByTier(requiredRankTier);
  const meetsRankRequirement = getCurrentPlayerRankTier() >= requiredRankTier;

  const leaderboardButton = document.createElement("button");
  leaderboardButton.type = "button";
  leaderboardButton.className = "secondary";
  leaderboardButton.textContent = "Show Leaderboard";
  leaderboardButton.addEventListener("click", async () => {
    try {
      const leaderboard = await buildContestLeaderboard(contest);
      openContestResultsModal(contest, leaderboard, { variant: "leaderboard" });
    } catch (error) {
      console.error("[RTN] player contest leaderboard error", error);
      showToast(error?.message || "Unable to load leaderboard", "error");
    }
  });
  actions.append(leaderboardButton);

  const shareButton = document.createElement("button");
  shareButton.type = "button";
  shareButton.className = "contest-share-button";
  shareButton.textContent = "Share";
  shareButton.setAttribute("aria-label", `Share ${contest.title || "contest"}`);
  shareButton.title = "Share contest";
  shareButton.addEventListener("click", () => {
    void shareContestLink(contest);
  });

  if (status === "live" || status === "pending") {
    if (playerEntry) {
      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.className = "primary";
      const usingMode = isUsingContestMode(contest.id);
      switchButton.textContent = status === "pending"
        ? "Joined"
        : usingMode
          ? "Using This Mode"
          : "Switch to Mode";
      switchButton.disabled = status === "pending" || usingMode;
      if (status !== "pending") {
        switchButton.addEventListener("click", () => {
          void switchToContestMode(contest.id, { navigateToPlay: true });
        });
      }
      actions.append(switchButton);
    } else {
      const joinButton = document.createElement("button");
      joinButton.type = "button";
      joinButton.className = "primary";
      joinButton.textContent = contestIsFull
        ? "Contest Full"
        : !meetsRankRequirement
          ? `${requiredRank?.name || "Rank"} Required`
          : `Join Now for ${formatContestEntryFeeText(contest)}`;
      joinButton.disabled = contestIsFull || !meetsRankRequirement;
      if (!contestIsFull && meetsRankRequirement) {
        joinButton.addEventListener("click", () => {
          void optIntoContest(contest);
        });
      }
      actions.append(joinButton);
    }
  }

  if (status === "ended") {
    const resultsButton = document.createElement("button");
    resultsButton.type = "button";
    resultsButton.className = "secondary";
    resultsButton.textContent = "View Results";
    resultsButton.addEventListener("click", async () => {
      try {
        await ensureContestMedalsAwarded(contest);
        const leaderboard = await buildContestLeaderboard(contest);
        openContestResultsModal(contest, leaderboard);
      } catch (error) {
        console.error("[RTN] player contest results error", error);
        showToast(error?.message || "Unable to load contest results", "error");
      }
    });
    actions.append(resultsButton);
  }

  actions.append(shareButton);

  if (caption.textContent) {
    item.append(header, details, prize, growth);
    if (thresholdProgress) item.append(thresholdProgress);
    item.append(caption, payoutTable, meta, games, distribution, actions);
  } else {
    item.append(header, details, prize, growth);
    if (thresholdProgress) item.append(thresholdProgress);
    item.append(payoutTable, meta, games, distribution, actions);
  }
  return item;
}

function renderHomeContestPromoCard(contest, participantStats = 0) {
  const item = document.createElement("li");
  item.className = "home-contest-card";
  const stats = normalizeContestPrizeStats(participantStats);

  const top = document.createElement("div");
  top.className = "home-contest-card-top";

  const titleWrap = document.createElement("div");
  titleWrap.className = "home-contest-title-wrap";
  const titleRow = document.createElement("div");
  titleRow.className = "home-contest-title-row";
  const title = document.createElement("h3");
  title.className = "home-contest-card-title";
  title.textContent = contest.title || "Contest";
  const entryFeeBadge = document.createElement("span");
  entryFeeBadge.className = "contest-entry-fee-badge";
  entryFeeBadge.textContent = formatContestEntryFeeLabelText(contest);

  const details = document.createElement("p");
  details.className = "home-contest-card-window";
  details.textContent = getContestStatus(contest) === "pending" && isThresholdContest(contest)
    ? `Starts when ${getContestStartRequirement(contest)} contestants join • ${getContestLengthHours(contest)} hour${getContestLengthHours(contest) === 1 ? "" : "s"} long`
    : getContestScheduleLabel(contest, stats);
  titleRow.append(title, entryFeeBadge);
  titleWrap.append(titleRow, details);

  const badge = document.createElement("span");
  const status = getContestStatus(contest);
  badge.className = "contest-status-badge";
  badge.dataset.status = status;
  badge.textContent = getContestStatusLabel(status);
  const badgeGroup = document.createElement("div");
  badgeGroup.className = "contest-status-meta";
  badgeGroup.append(badge);
  const requiredRankTag = createContestRequiredRankTag(contest);
  if (requiredRankTag) {
    badgeGroup.append(requiredRankTag);
  }
  top.append(titleWrap, badgeGroup);

  const prize = document.createElement("p");
  prize.className = "home-contest-card-prize";
  prize.textContent = `Prize Pot ${getContestPrizeHeadline(contest, stats)}`;

  const thresholdProgress = createContestThresholdProgress(contest, stats, "home");

  const games = document.createElement("p");
  games.className = "home-contest-card-growth";
  games.textContent = `Games: ${getContestGamesLabel(contest)}`;

  const payouts = buildContestPayoutTable(contest, stats, "home-contest-payouts");

  const actions = document.createElement("div");
  actions.className = "home-contest-card-actions";

  const playerEntry = getContestEntryById(contest.id);
  const contestIsFull = stats.participants >= getContestLimit(contest);
  const requiredRankTier = getContestRequiredRankTier(contest);
  const requiredRank = getRankByTier(requiredRankTier);
  const meetsRankRequirement = getCurrentPlayerRankTier() >= requiredRankTier;
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "home-button home-primary home-contest-action is-spotlight";

  if (playerEntry) {
    joinButton.textContent = status === "pending" ? "Joined" : "Joined";
    joinButton.classList.add("is-joined");
    joinButton.disabled = true;
  } else {
    joinButton.textContent = contestIsFull
      ? "Contest Full"
      : !meetsRankRequirement
        ? `${requiredRank?.name || "Rank"} Required`
        : `Join Now for ${formatContestEntryFeeText(contest)}`;
    joinButton.disabled = contestIsFull || !meetsRankRequirement;
    if (!contestIsFull && meetsRankRequirement) {
      joinButton.addEventListener("click", () => {
        void optIntoContest(contest);
      });
    }
  }

  const shareButton = document.createElement("button");
  shareButton.type = "button";
  shareButton.className = "contest-share-button";
  shareButton.textContent = "Share";
  shareButton.setAttribute("aria-label", `Share ${contest.title || "contest"}`);
  shareButton.title = "Share contest";
  shareButton.addEventListener("click", () => {
    void shareContestLink(contest);
  });

  actions.append(joinButton, shareButton);
  item.append(top, prize);
  if (thresholdProgress) item.append(thresholdProgress);
  item.append(games, payouts, actions);
  return item;
}

async function renderHomeContestPromos() {
  if (!homeLiveContestsSectionEl || !homeLiveContestListEl) return;

  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    homeLiveContestsSectionEl.hidden = true;
    homeLiveContestListEl.innerHTML = "";
    homeView?.classList.remove("has-contest-spotlight");
    return;
  }

  const liveContests = contestCache
    .filter((contest) => isContestVisibleToCurrentUser(contest))
    .filter((contest) => ["live", "pending"].includes(getContestStatus(contest)))
    .sort((a, b) => {
      const aStatus = getContestStatus(a);
      const bStatus = getContestStatus(b);
      if (aStatus !== bStatus) {
        return aStatus === "live" ? -1 : 1;
      }
      const aTime = new Date(a.ends_at || a.created_at || 0).getTime();
      const bTime = new Date(b.ends_at || b.created_at || 0).getTime();
      return aTime - bTime;
    });

  if (!liveContests.length) {
    homeLiveContestsSectionEl.hidden = true;
    homeLiveContestListEl.innerHTML = "";
    homeView?.classList.remove("has-contest-spotlight");
    return;
  }

  homeLiveContestsSectionEl.hidden = false;
  homeLiveContestListEl.innerHTML = "";
  homeView?.classList.add("has-contest-spotlight");

  try {
    const counts = await loadContestParticipantCounts(liveContests);
    liveContests.forEach((contest) => {
      homeLiveContestListEl.appendChild(renderHomeContestPromoCard(contest, counts[contest.id] || 0));
    });
  } catch (error) {
    console.error("[RTN] renderHomeContestPromos error", error);
    const item = document.createElement("li");
    item.className = "admin-prize-empty";
    item.textContent = "Unable to load live contests right now.";
    homeLiveContestListEl.appendChild(item);
  }
}

function renderContestListTabs() {
  if (!contestTabButtons.length) return;

  contestTabButtons.forEach((button) => {
    const isActive = button.dataset.contestTab === currentContestListTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  if (contestPanelLiveEl) {
    contestPanelLiveEl.hidden = currentContestListTab !== "live";
  }
  if (contestPanelEndedEl) {
    contestPanelEndedEl.hidden = currentContestListTab !== "ended";
  }
}

function setContestListTab(tab) {
  currentContestListTab = tab === "ended" ? "ended" : "live";
  renderContestListTabs();
}

function renderAdminContestTabs() {
  if (!adminContestTabButtons.length) return;

  adminContestTabButtons.forEach((button) => {
    const isActive = button.dataset.adminContestTab === currentAdminContestTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  if (adminContestPanelUpcomingEl) {
    adminContestPanelUpcomingEl.hidden = currentAdminContestTab !== "upcoming";
  }
  if (adminContestPanelLiveEl) {
    adminContestPanelLiveEl.hidden = currentAdminContestTab !== "live";
  }
  if (adminContestPanelEndedEl) {
    adminContestPanelEndedEl.hidden = currentAdminContestTab !== "ended";
  }
}

function setAdminContestTab(tab) {
  currentAdminContestTab = ["live", "ended"].includes(tab) ? tab : "upcoming";
  renderAdminContestTabs();
}

async function loadPlayerContestList(force = false) {
  if (!playerLiveContestListEl || !playerEndedContestListEl || !currentUser?.id || currentUser.id === GUEST_USER.id) {
    return;
  }
  if (!force && currentRoute !== "contests") return;

  renderContestListTabs();

  playerLiveContestListEl.innerHTML = "";
  playerEndedContestListEl.innerHTML = "";

  const loadingLive = document.createElement("li");
  loadingLive.className = "admin-prize-empty";
  loadingLive.textContent = "Loading contests...";
  const loadingEnded = loadingLive.cloneNode(true);
  playerLiveContestListEl.appendChild(loadingLive);
  playerEndedContestListEl.appendChild(loadingEnded);

  try {
    let contests = contestCache;
    if (!contests.length) {
      const { data, error } = await supabase
        .from("contests")
        .select("*")
        .order("starts_at", { ascending: false });
      if (error) throw error;
      contests = Array.isArray(data) ? data : [];
    }
    contestCache = Array.isArray(contests) ? contests : [];
    const visibleContests = contestCache.filter((contest) => isContestVisibleToCurrentUser(contest));

    const counts = await loadContestParticipantCounts(visibleContests);

    const liveContests = visibleContests
      .filter((contest) => ["live", "pending", "upcoming"].includes(getContestStatus(contest)))
      .sort((a, b) => {
        const aStart = new Date(a.starts_at || 0).getTime();
        const bStart = new Date(b.starts_at || 0).getTime();
        return aStart - bStart;
      });
    const endedContests = visibleContests
      .filter((contest) => getContestStatus(contest) === "ended")
      .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));

    playerLiveContestListEl.innerHTML = "";
    playerEndedContestListEl.innerHTML = "";

    if (!liveContests.length) {
      const empty = document.createElement("li");
      empty.className = "admin-prize-empty";
      empty.textContent = "No live contests right now.";
      playerLiveContestListEl.appendChild(empty);
    } else {
      liveContests.forEach((contest) => {
        playerLiveContestListEl.appendChild(renderPlayerContestRow(contest, counts[contest.id] || 0));
      });
    }

    if (!endedContests.length) {
      const empty = document.createElement("li");
      empty.className = "admin-prize-empty";
      empty.textContent = "No ended contests yet.";
      playerEndedContestListEl.appendChild(empty);
    } else {
      endedContests.forEach((contest) => {
        playerEndedContestListEl.appendChild(renderPlayerContestRow(contest, counts[contest.id] || 0));
      });
    }
  } catch (error) {
    console.error("[RTN] loadPlayerContestList error", error);
    playerLiveContestListEl.innerHTML = "";
    playerEndedContestListEl.innerHTML = "";
    const liveError = document.createElement("li");
    liveError.className = "admin-prize-empty";
    liveError.textContent = "Unable to load contests.";
    const endedError = liveError.cloneNode(true);
    playerLiveContestListEl.appendChild(liveError);
    playerEndedContestListEl.appendChild(endedError);
  }
}

function renderAdminContestRow(contest, participantStats = 0) {
  const item = document.createElement("li");
  item.className = "admin-contest-card";
  const stats = normalizeContestPrizeStats(participantStats);

  const header = document.createElement("div");
  header.className = "admin-contest-header";
  const title = document.createElement("h3");
  title.textContent = contest.title || "Contest";
  const badge = document.createElement("span");
  const status = getContestStatus(contest);
  badge.className = "contest-status-badge";
  badge.dataset.status = status;
  badge.textContent = getContestStatusLabel(status);
  header.append(title, badge);

  const details = document.createElement("p");
  details.className = "contest-window";
  details.textContent = getContestScheduleLabel(contest, stats);

  const meta = document.createElement("p");
  meta.className = "contest-opt-in-copy";
  meta.textContent = `Highest credits wins • Requires ${formatCurrency(getContestQualificationRequirement(contest))} Carter Cash • Contestants: ${formatContestFill(contest, stats)}`;

  const games = document.createElement("p");
  games.className = "contest-prize-growth";
  games.textContent = `Games: ${getContestGamesLabel(contest)}`;

  const prize = document.createElement("p");
  prize.className = "contest-prize-pill";
  prize.textContent = `Prize Pot ${getContestPrizeHeadline(contest, stats)}`;

  const growth = document.createElement("p");
  growth.className = "contest-prize-growth";
  growth.textContent = getContestPrizeGrowthCopy(contest);

  const distribution = document.createElement("p");
  distribution.className = "contest-prize-growth";
  distribution.textContent = `Payouts: ${getContestPrizeDistributionCopy(contest, stats)}`;

  const actions = document.createElement("div");
  actions.className = "contest-actions";

  if (status === "pending") {
    const contestantsButton = document.createElement("button");
    contestantsButton.type = "button";
    contestantsButton.className = "secondary";
    contestantsButton.textContent = "View Contestants";
    contestantsButton.addEventListener("click", () => {
      void handleAdminContestViewContestants(contest);
    });
    actions.append(contestantsButton);
  }

  if (status === "ended") {
    const resultsButton = document.createElement("button");
    resultsButton.type = "button";
    resultsButton.className = "primary";
    resultsButton.textContent = "View Results";
    resultsButton.addEventListener("click", () => {
      void handleAdminContestViewResults(contest);
    });
    actions.append(resultsButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary";
  deleteButton.textContent = "Delete Contest";
  deleteButton.addEventListener("click", () => {
    void handleAdminContestDelete(contest);
  });

  actions.append(deleteButton);
  item.append(header, details, prize, meta, games, growth, distribution, actions);
  return item;
}

async function loadAdminContestList(force = false) {
  if (!isAdmin()) {
    if (adminContestListUpcomingEl) adminContestListUpcomingEl.innerHTML = "";
    if (adminContestListLiveEl) adminContestListLiveEl.innerHTML = "";
    if (adminContestListEndedEl) adminContestListEndedEl.innerHTML = "";
    return;
  }
  if (adminContestsLoaded && !force) return;
  if (!adminContestListUpcomingEl || !adminContestListLiveEl || !adminContestListEndedEl) return;
  adminContestsLoaded = true;
  renderAdminContestTabs();
  adminContestListUpcomingEl.innerHTML = "";
  adminContestListLiveEl.innerHTML = "";
  adminContestListEndedEl.innerHTML = "";

  const loadingItem = document.createElement("li");
  loadingItem.className = "admin-prize-empty";
  loadingItem.textContent = "Loading contests...";
  adminContestListUpcomingEl.appendChild(loadingItem.cloneNode(true));
  adminContestListLiveEl.appendChild(loadingItem.cloneNode(true));
  adminContestListEndedEl.appendChild(loadingItem);

  try {
    let contests = contestCache;
    if (!contests.length) {
      const { data, error } = await supabase
        .from("contests")
        .select("*")
        .order("starts_at", { ascending: false });
      if (error) throw error;
      contests = Array.isArray(data) ? data : [];
    }
    contestCache = Array.isArray(contests) ? contests : [];

    const { data: entries, error: entryError } = await supabase
      .from("contest_entries")
      .select("contest_id");
    if (entryError) throw entryError;

    const counts = {};
    (entries || []).forEach((entry) => {
      counts[entry.contest_id] = (counts[entry.contest_id] || 0) + 1;
    });

    adminContestListUpcomingEl.innerHTML = "";
    adminContestListLiveEl.innerHTML = "";
    adminContestListEndedEl.innerHTML = "";
    if (!contestCache.length) {
      const empty = document.createElement("li");
      empty.className = "admin-prize-empty";
      empty.textContent = "No contests created yet.";
      adminContestListUpcomingEl.appendChild(empty.cloneNode(true));
      adminContestListLiveEl.appendChild(empty.cloneNode(true));
      adminContestListEndedEl.appendChild(empty);
      updateAdminContestCreateState(contestCache);
      return;
    }

    const sortedContests = contestCache
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.starts_at || a.created_at || 0).getTime();
        const bTime = new Date(b.starts_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });

    const renderContestGroup = (listEl, contests, emptyMessage) => {
      if (!contests.length) {
        const empty = document.createElement("li");
        empty.className = "admin-prize-empty";
        empty.textContent = emptyMessage;
        listEl.appendChild(empty);
        return;
      }
      contests.forEach((contest) => {
        listEl.appendChild(renderAdminContestRow(contest, counts[contest.id] || 0));
      });
    };

    renderContestGroup(
      adminContestListUpcomingEl,
      sortedContests.filter((contest) => ["pending", "upcoming"].includes(getContestStatus(contest))),
      "No upcoming contests."
    );
    renderContestGroup(
      adminContestListLiveEl,
      sortedContests.filter((contest) => getContestStatus(contest) === "live"),
      "No live contests."
    );
    renderContestGroup(
      adminContestListEndedEl,
      sortedContests.filter((contest) => getContestStatus(contest) === "ended"),
      "No ended contests."
    );
    updateAdminContestCreateState(contestCache);
  } catch (error) {
    console.error("[RTN] loadAdminContestList error", error);
    adminContestsLoaded = false;
    adminContestListUpcomingEl.innerHTML = "";
    adminContestListLiveEl.innerHTML = "";
    adminContestListEndedEl.innerHTML = "";
    const errorItem = document.createElement("li");
    errorItem.className = "admin-prize-empty";
    errorItem.textContent = "Unable to load contests.";
    adminContestListUpcomingEl.appendChild(errorItem.cloneNode(true));
    adminContestListLiveEl.appendChild(errorItem.cloneNode(true));
    adminContestListEndedEl.appendChild(errorItem);
    updateAdminContestCreateState([]);
  }
}

// ===========================
// Profile Management
// ===========================

let profileEditMode = false;
let profileOriginalData = {};

function formatMedalAwardDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function renderProfileMedals(medals = []) {
  if (!profileContestMedalsListEl) return;
  profileContestMedalsListEl.innerHTML = "";

  if (!Array.isArray(medals) || !medals.length) {
    const empty = document.createElement("li");
    empty.className = "profile-medal-empty";
    empty.textContent = "No contest medals yet. Win a contest to earn your first medal.";
    profileContestMedalsListEl.appendChild(empty);
    return;
  }

  medals.forEach((medal) => {
    const item = document.createElement("li");
    item.className = "profile-medal-row";
    item.innerHTML = `
      <div class="profile-medal-meta">
        <span class="profile-medal-title">${medal.contest_title || "Contest Winner"}</span>
        <span class="profile-medal-date">${formatMedalAwardDate(medal.awarded_at)}</span>
      </div>
      <span class="profile-medal-badge">Winner Medal</span>
    `;
    profileContestMedalsListEl.appendChild(item);
  });
}

async function loadProfile() {
  console.info("[RTN] loadProfile called");
  
  if (!currentUser || currentUser.id === GUEST_USER.id) {
    console.warn("[RTN] loadProfile: no user");
    forceAuth("profile-no-user", {
      message: "Session required. Please sign in again.",
      tone: "warning"
    });
    return;
  }

  try {
    // Get user metadata from auth
    console.info("[RTN] loadProfile: getting user from auth");
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.error("[RTN] loadProfile getUser error", error);
      showToast("Unable to load profile", "error");
      return;
    }

    console.info("[RTN] loadProfile: user email =", user.email);

    // Get profile data from profiles table
    console.info("[RTN] loadProfile: fetching profile from database");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, receive_contest_start_emails")
      .eq("id", user.id)
      .single();

    const { data: medals, error: medalsError } = await supabase
      .from("contest_medals")
      .select("contest_title, awarded_at")
      .eq("user_id", user.id)
      .order("awarded_at", { ascending: false });

    if (profileError) {
      console.error("[RTN] loadProfile profile fetch error", profileError);
      // If profile doesn't exist, create a placeholder
      if (profileError.code === 'PGRST116') {
        console.warn("[RTN] loadProfile: profile not found, using empty values");
      }
    }
    if (medalsError) {
      console.error("[RTN] loadProfile medals fetch error", medalsError);
    }
    
    console.info("[RTN] loadProfile: profile data", profile);

    // Populate form fields
    const firstName = profile?.first_name || "";
    const lastName = profile?.last_name || "";
    
    console.info("[RTN] loadProfile: setting firstName=", firstName, "lastName=", lastName);
    
    if (profileFirstNameInput) {
      profileFirstNameInput.value = firstName;
      console.info("[RTN] loadProfile: first name input value is now", profileFirstNameInput.value);
    } else {
      console.error("[RTN] loadProfile: profileFirstNameInput element is NULL!");
    }
    if (profileLastNameInput) {
      profileLastNameInput.value = lastName;
      console.info("[RTN] loadProfile: last name input value is now", profileLastNameInput.value);
    } else {
      console.error("[RTN] loadProfile: profileLastNameInput element is NULL!");
    }
    if (profileEmailInput) {
      profileEmailInput.value = profile?.username || user.email || "";
      console.info("[RTN] loadProfile: email input value is now", profileEmailInput.value);
    } else {
      console.error("[RTN] loadProfile: profileEmailInput element is NULL!");
    }
    if (profileMessage) {
      profileMessage.textContent = "";
      profileMessage.className = "profile-status-message";
    }
    if (currentProfile && currentProfile.id === user.id) {
      currentProfile.hands_played_all_time = Math.max(
        0,
        Math.round(Number(profile?.hands_played_all_time ?? currentProfile.hands_played_all_time ?? 0))
      );
      currentProfile.contest_wins = profile?.contest_wins ?? 0;
      currentProfile.current_rank_tier = Math.max(
        1,
        Math.round(Number(profile?.current_rank_tier ?? currentProfile.current_rank_tier ?? 1))
      );
      currentProfile.current_rank_id = profile?.current_rank_id ?? currentProfile.current_rank_id ?? null;
      currentProfile.receive_contest_start_emails = profile?.receive_contest_start_emails ?? true;
    }
    renderContestEmailPreference();
    renderProfileMedals(Array.isArray(medals) ? medals : []);
    await refreshCurrentRankState();

    // Reset to view mode
    setProfileEditMode(false);
    
  } catch (error) {
    console.error("[RTN] loadProfile error", error);
    showToast("Unable to load profile", "error");
  }
}

function setProfileEditMode(editing) {
  console.info(`[RTN] setProfileEditMode called with editing=${editing}`);
  profileEditMode = editing;

  if (editing) {
    console.info("[RTN] setProfileEditMode: entering edit mode");
    // Save original values
    profileOriginalData = {
      firstName: profileFirstNameInput?.value || "",
      lastName: profileLastNameInput?.value || "",
      password: ""
    };

    // Enable fields (except email)
    if (profileFirstNameInput) {
      profileFirstNameInput.disabled = false;
      console.info("[RTN] setProfileEditMode: first name input enabled, disabled=", profileFirstNameInput.disabled);
    } else {
      console.error("[RTN] setProfileEditMode: profileFirstNameInput is NULL!");
    }
    if (profileLastNameInput) {
      profileLastNameInput.disabled = false;
      console.info("[RTN] setProfileEditMode: last name input enabled, disabled=", profileLastNameInput.disabled);
    } else {
      console.error("[RTN] setProfileEditMode: profileLastNameInput is NULL!");
    }
    if (profilePasswordInput) {
      profilePasswordInput.disabled = false;
      profilePasswordInput.value = "";
      profilePasswordInput.placeholder = "Leave blank to keep current password";
      console.info("[RTN] setProfileEditMode: password input enabled");
    }
    if (profilePasswordToggle) {
      profilePasswordToggle.disabled = false;
    }

    // Update buttons
    if (profileEditButton) {
      profileEditButton.hidden = true;
      console.info("[RTN] setProfileEditMode: Edit button hidden");
    }
    if (profileCancelButton) {
      profileCancelButton.hidden = false;
      console.info("[RTN] setProfileEditMode: Cancel button shown");
    }
    if (profileSaveButton) {
      profileSaveButton.hidden = false;
      console.info("[RTN] setProfileEditMode: Save button shown");
    }
    
    // Clear message
    if (profileMessage) {
      profileMessage.textContent = "";
      profileMessage.className = "profile-status-message";
    }
  } else {
    // Disable fields
    if (profileFirstNameInput) profileFirstNameInput.disabled = true;
    if (profileLastNameInput) profileLastNameInput.disabled = true;
    if (profilePasswordInput) {
      profilePasswordInput.disabled = true;
      profilePasswordInput.value = "";
      profilePasswordInput.type = "password";
      profilePasswordInput.placeholder = "••••••••";
    }
    if (profilePasswordToggle) {
      profilePasswordToggle.disabled = true;
      updatePasswordToggleIcon(false);
    }

    // Update buttons
    if (profileEditButton) profileEditButton.hidden = false;
    if (profileCancelButton) profileCancelButton.hidden = true;
    if (profileSaveButton) profileSaveButton.hidden = true;
  }
}

function updatePasswordToggleIcon(isVisible) {
  if (!profilePasswordToggle) return;
  
  const eyeOpen = profilePasswordToggle.querySelectorAll(".eye-open");
  const eyeClosed = profilePasswordToggle.querySelectorAll(".eye-closed");
  
  eyeOpen.forEach(el => el.style.display = isVisible ? "none" : "");
  eyeClosed.forEach(el => el.style.display = isVisible ? "" : "none");
}

function cancelProfileEdit() {
  // Restore original values
  if (profileFirstNameInput) {
    profileFirstNameInput.value = profileOriginalData.firstName || "";
  }
  if (profileLastNameInput) {
    profileLastNameInput.value = profileOriginalData.lastName || "";
  }
  if (profilePasswordInput) {
    profilePasswordInput.value = "";
  }
  
  setProfileEditMode(false);
}

function setCarterCashTooltipOpen(isOpen) {
  const wrapper = carterCashInfoButton?.closest(".carter-cash");
  if (!wrapper || !carterCashInfoButton) return;
  wrapper.classList.toggle("is-tooltip-open", Boolean(isOpen));
  carterCashInfoButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
}

async function saveProfile(event) {
  event.preventDefault();
  
  if (!currentUser || currentUser.id === GUEST_USER.id) {
    showToast("Session expired. Please sign in again.", "error");
    return;
  }

  const firstName = profileFirstNameInput?.value.trim() || "";
  const lastName = profileLastNameInput?.value.trim() || "";
  const newPassword = profilePasswordInput?.value || "";

  if (!firstName || !lastName) {
    if (profileMessage) {
      profileMessage.textContent = "First name and last name are required.";
      profileMessage.className = "profile-status-message error";
    }
    return;
  }

  try {
    if (profileSaveButton) profileSaveButton.disabled = true;
    if (profileMessage) {
      profileMessage.textContent = "Saving...";
      profileMessage.className = "profile-status-message";
    }

    // Update profile in database
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName
      })
      .eq("id", currentUser.id);

    if (profileError) throw profileError;

    // Update password if provided
    if (newPassword) {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (passwordError) throw passwordError;
    }

    // Success
    if (profileMessage) {
      profileMessage.textContent = "Profile updated successfully!";
      profileMessage.className = "profile-status-message success";
    }
    showToast("Profile updated successfully", "success");
    
    setProfileEditMode(false);
    
    // Clear message after 3 seconds
    setTimeout(() => {
      if (profileMessage) {
        profileMessage.textContent = "";
        profileMessage.className = "profile-status-message";
      }
    }, 3000);
    
  } catch (error) {
    console.error("[RTN] saveProfile error", error);
    if (profileMessage) {
      profileMessage.textContent = "Failed to update profile. Please try again.";
      profileMessage.className = "profile-status-message error";
    }
    showToast("Failed to update profile", "error");
  } finally {
    if (profileSaveButton) profileSaveButton.disabled = false;
  }
}

function displayAuthScreen({ focus = true, replaceHash = false } = {}) {
  currentRoute = "auth";
  showAuthView("login");
  updateAdminVisibility(null);
  updateResetButtonVisibility(null);

  if (typeof document !== "undefined" && document.body) {
    document.body.dataset.appState = "auth";
  }

  if (typeof window !== "undefined") {
    updateHash("auth", { replace: replaceHash });
    setTimeout(() => {
      if (focus && authEmailInput) {
        authEmailInput.focus();
      }
    }, 0);
  }
}

function hideAuthResendAction() {
  if (authResendWrapEl) {
    authResendWrapEl.hidden = true;
  }
  if (authResendConfirmationButton) {
    authResendConfirmationButton.disabled = false;
  }
}

async function handleAuthResendConfirmationRequest() {
  const email = String(authEmailInput?.value || "").trim();
  if (!email) {
    if (authErrorEl) {
      authErrorEl.hidden = false;
      authErrorEl.textContent = "Enter your email address first.";
    }
    hideAuthResendAction();
    authEmailInput?.focus();
    return;
  }

  if (!supabase?.auth || typeof supabase.auth.resend !== "function") {
    showToast("Unable to resend confirmation email", "error");
    return;
  }

  if (authResendConfirmationButton) {
    authResendConfirmationButton.disabled = true;
  }

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email
    });

    if (error) {
      throw error;
    }

    hideAuthResendAction();
    if (authErrorEl) {
      authErrorEl.hidden = false;
      authErrorEl.textContent = "Confirmation email sent. Please check your inbox.";
    }
    showToast("Confirmation email sent", "success");
  } catch (error) {
    console.error("[RTN] handleAuthResendConfirmationRequest error", error);
    if (authErrorEl) {
      authErrorEl.hidden = false;
      authErrorEl.textContent = error?.message || "Unable to resend confirmation email.";
    }
    if (authResendWrapEl) {
      authResendWrapEl.hidden = false;
    }
    showToast("Unable to resend confirmation email", "error");
  } finally {
    if (authResendConfirmationButton) {
      authResendConfirmationButton.disabled = false;
    }
  }
}

function forceAuth(reason, { message, tone = "warning", focus = true } = {}) {
  if (message) {
    showToast(message, tone);
  }
  applySignedOutState(reason, { focusInput: focus });
}

function applySignedOutState(reason = "unknown", { focusInput = true } = {}) {
    console.warn(`[RTN] applySignedOutState invoked (reason=${reason})`);
    const clearFn = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
    lastSyncedBankroll = null;
    bankrollInitialized = false;
    currentUser = { ...GUEST_USER };
    currentProfile = { ...GUEST_PROFILE };
    dashboardLoaded = false;
    prizesLoaded = false;
    adminPrizesLoaded = false;
    adminContestsLoaded = false;
    adminEditingPrizeId = null;
    adminPrizeCache = [];
    contestCache = [];
    currentContest = null;
    currentContestEntry = null;
    contestLeaderboard = [];
    userContestEntries = [];
    contestEntryMap = new Map();
    contestNotifications = [];
    contestStartNotifications = [];
    contestParticipantCounts = {};
    currentAccountMode = createNormalAccountMode();
    persistentBankrollHistory = [];
    persistentBankrollUserId = null;
    lastProfileSync = Date.now();

  if (dashboardProfileRetryTimer) {
    clearFn(dashboardProfileRetryTimer);
    dashboardProfileRetryTimer = null;
  }

  stats = { hands: 0, wagered: 0, paid: 0 };
  updateStatsUI();

  resetSessionScopedGameplayState({
    reason: `signed-out:${reason}`,
    resetRunTheNumbersStatus: true
  });

  bankroll = INITIAL_BANKROLL;
  handleBankrollChanged();
  updateDashboardCreditsDisplay(0);
  renderContestChip();
  renderContestNotifications();
  carterCash = 0;
  carterCashProgress = 0;
  lastSyncedCarterCash = 0;
  lastSyncedCarterProgress = 0;
  stopCarterCashAnimation();
  updateCarterCashDisplay();
  resetBankrollHistory();
  stopBankrollAnimation();

  if (adminPrizeListEl) {
    adminPrizeListEl.innerHTML = "";
  }
  closeAdminForm({ resetFields: true, restoreFocus: false });

  if (paytableModal && !paytableModal.hidden) {
    closePaytableModal({ restoreFocus: false });
  }
  if (resetModal && !resetModal.hidden) {
    closeResetModal({ restoreFocus: false });
  }
  if (shippingModal && !shippingModal.hidden) {
    closeShippingModal({ restoreFocus: false });
  }
  if (adminPrizeModal && !adminPrizeModal.hidden) {
    closeAdminForm({ resetFields: true, restoreFocus: false });
  }
  if (prizeImageModal && !prizeImageModal.hidden) {
    closePrizeImageModal({ restoreFocus: false });
  }

  setSelectedChip(chipDenominations[0], false);
  closeUtilityPanel();
  closeActiveDrawer();
  clearPlayAreaHeight();
  updateRebetButtonState();
  updatePauseButton();

  if (dashboardRunsEl) {
    dashboardRunsEl.innerHTML = "";
  }

  if (appShell) {
    appShell.setAttribute("data-hidden", "true");
  }

  authState.lastUserId = null;
  authState.manualSignOutRequested = false;

  displayAuthScreen({ focus: focusInput });
}

async function handleSignOut() {
  authState.manualSignOutRequested = true;
  try {
    const result = await supabase.auth.signOut();
    const error = result?.error ?? null;
    if (error) {
      authState.manualSignOutRequested = false;
      console.error("signOut error", error);
      showToast("Unable to sign out", "error");
      return;
    }

    // Immediately apply signed-out state so the UI updates even if the
    // auth state change event is delayed or not emitted by an offline stub.
    console.info("[RTN] signOut completed, applying signed-out state");
    try {
      applySignedOutState("manual-signout", { focusInput: true });
    } catch (err) {
      console.warn("[RTN] applySignedOutState after signOut failed", err);
    }
  } catch (err) {
    authState.manualSignOutRequested = false;
    console.error("Unexpected error during signOut", err);
    showToast("Unable to sign out", "error");
  }
}

export async function logGameRun(score, metadata = {}) {
  const endingBankrollSnapshot = bankroll;
  const endingCarterCashSnapshot = carterCash;
  const accountModeSnapshot = getAccountModeValue();
  const contestIdSnapshot = isContestAccountMode() ? currentAccountMode.contestId : null;
  const resolvedAtSnapshot = new Date().toISOString();
  const { data: userResponse, error: logRunUserError } = await supabase.auth.getUser();
  if (logRunUserError) {
    console.error("[RTN] logGameRun getUser error", logRunUserError);
  }
  const sessionUser = userResponse?.user ?? null;
  if (!sessionUser) {
    throw new Error("User not logged in");
  }
  const enrichedMetadata = {
    ...metadata,
    recorded_score: roundCurrencyValue(score),
    ending_bankroll: endingBankrollSnapshot,
    ending_carter_cash: endingCarterCashSnapshot,
    resolved_at: resolvedAtSnapshot,
    account_mode: accountModeSnapshot,
    contest_id: contestIdSnapshot
  };
  let runScore = Number.isFinite(Number(score)) ? roundCurrencyValue(score) : 0;
  let { error: insertError } = await supabase.from("game_runs").insert({
    user_id: sessionUser.id,
    score: runScore,
    metadata: enrichedMetadata
  });

  if (insertError) {
    const fallbackScore = Math.round(runScore);
    ({ error: insertError } = await supabase.from("game_runs").insert({
      user_id: sessionUser.id,
      score: fallbackScore,
      metadata: enrichedMetadata
    }));
  }

  if (insertError) {
    throw insertError;
  }

  if (sessionUser.id === currentUser?.id) {
    persistentBankrollUserId = sessionUser.id;
    persistentBankrollHistory.push({
      value: endingBankrollSnapshot,
      created_at: resolvedAtSnapshot,
      fallbackIndex: persistentBankrollHistory.length
    });
    drawBankrollChart();
  }
}

async function insertGameHandRecord(handPayload, betRows = []) {
  let payload = { ...handPayload };
  let { data: hand, error: handError } = await supabase
    .from("game_hands")
    .insert(payload)
    .select()
    .single();

  if (
    handError &&
    (isMissingColumnError(handError, "game_id") || isMissingColumnError(handError, "commission_kept"))
  ) {
    const {
      game_id: _gameId,
      commission_kept: _commissionKept,
      ...fallbackPayload
    } = payload;
    payload = fallbackPayload;
    ({ data: hand, error: handError } = await supabase
      .from("game_hands")
      .insert(payload)
      .select()
      .single());
  }

  if (handError) {
    throw handError;
  }

  if (!Array.isArray(betRows) || betRows.length === 0) {
    return hand;
  }

  const { error: betsError } = await supabase.from("bet_plays").insert(betRows);
  if (betsError) {
    throw betsError;
  }

  return hand;
}

async function logStandaloneGameHand({
  gameKey = GAME_KEYS.RUN_THE_NUMBERS,
  stopperCard = null,
  totalCards = null,
  totalWager = 0,
  totalPaid = 0,
  net = 0,
  commissionKept = 0
} = {}) {
  try {
    const { data: userResponse, error: logHandUserError } = await supabase.auth.getUser();
    if (logHandUserError) {
      console.error("[RTN] logStandaloneGameHand getUser error", logHandUserError);
    }
    const sessionUser = userResponse?.user ?? null;
    if (!sessionUser) {
      return;
    }

    await insertGameHandRecord({
      user_id: sessionUser.id,
      game_id: resolveGameKey(gameKey),
      stopper_label: stopperCard?.label ?? null,
      stopper_suit: stopperCard?.suitName ?? stopperCard?.suit ?? null,
      total_cards: totalCards,
      total_wager: totalWager,
      total_paid: totalPaid,
      net,
      commission_kept: commissionKept
    });
  } catch (error) {
    console.error("Failed to log standalone game hand", error);
  }
}

async function logHandAndBets(stopperCard, context, betSnapshots, netThisHand, options = {}) {
  try {
    const { data: userResponse, error: logHandUserError } = await supabase.auth.getUser();
    if (logHandUserError) {
      console.error("[RTN] logHandAndBets getUser error", logHandUserError);
    }
    const sessionUser = userResponse?.user ?? null;

    if (!sessionUser) {
      return;
    }

    const safeBets = Array.isArray(betSnapshots) ? betSnapshots : [];

    const totalWager = safeBets.reduce((sum, bet) => sum + (bet.units ?? 0), 0);
    const totalPaid = safeBets.reduce((sum, bet) => sum + (bet.paid ?? 0), 0);

    const handPayload = {
      user_id: sessionUser.id,
      game_id: resolveGameKey(options.gameKey),
      stopper_label: stopperCard?.label ?? null,
      stopper_suit: stopperCard?.suitName ?? null,
      total_cards: context?.totalCards ?? null,
      total_wager: totalWager,
      total_paid: totalPaid,
      net: netThisHand,
      commission_kept: 0
    };

    const betRows = safeBets.map((bet) => {
      const amountWagered = bet.units ?? 0;
      const amountPaid = bet.paid ?? 0;
      const net = amountPaid - amountWagered;
      const outcome = amountPaid > 0 ? "W" : "L";

      return {
        user_id: sessionUser.id,
        hand_id: hand.id,
        bet_key: bet.key,
        amount_wagered: amountWagered,
        amount_paid: amountPaid,
        outcome,
        net,
        raw: bet
      };
    });

    await insertGameHandRecord(handPayload, betRows);
  } catch (error) {
    console.error("Failed to log hand and bets", error);
  }
  // end logHandAndBets
}

function applyTheme(theme) {
  const themeRecord = getThemeRecord(theme);
  if (!themeRecord) {
    return;
  }
  const next = THEME_CLASS_MAP[themeRecord.base_theme] ? themeRecord.base_theme : "blue";
  if (!document.body) {
    currentTheme = themeRecord.key;
    return;
  }
  if (currentTheme === themeRecord.key && document.body.classList.contains(THEME_CLASS_MAP[next])) {
    applyThemeVariables(themeRecord);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => drawBankrollChart());
    } else {
      drawBankrollChart();
    }
    return;
  }
  ALL_THEME_CLASSES.forEach((className) => {
    document.body.classList.remove(className);
  });
  document.body.classList.add(THEME_CLASS_MAP[next]);
  applyThemeVariables(themeRecord);
  currentTheme = themeRecord.key;
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => drawBankrollChart());
  } else {
    drawBankrollChart();
  }
}

function getAdminThemeOverrideStorageKey(userId = currentUser?.id) {
  if (!userId || userId === GUEST_USER.id) {
    return null;
  }
  return `rtn:admin-theme-override:${userId}`;
}

function loadStoredAdminThemeOverride(userId = currentUser?.id) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  const storageKey = getAdminThemeOverrideStorageKey(userId);
  if (!storageKey) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? slugifyThemeKey(raw) || null : null;
  } catch (error) {
    console.warn("[RTN] unable to load admin theme override", error);
    return null;
  }
}

function persistAdminThemeOverride(themeKey, userId = currentUser?.id) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const storageKey = getAdminThemeOverrideStorageKey(userId);
  if (!storageKey) {
    return;
  }
  try {
    if (themeKey) {
      window.localStorage.setItem(storageKey, String(themeKey));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn("[RTN] unable to persist admin theme override", error);
  }
}

function syncAdminThemeOverrideForCurrentUser() {
  const userId = currentUser?.id || null;
  if (adminThemeOverrideUserId === userId) {
    return;
  }
  adminThemeOverrideUserId = userId;

  if (!isAdmin()) {
    adminThemeOverrideTheme = null;
    adminThemeOverrideStoredKey = null;
    return;
  }

  const storedKey = loadStoredAdminThemeOverride(userId);
  adminThemeOverrideStoredKey = storedKey;
  adminThemeOverrideTheme = storedKey || null;
}

function getResolvedThemeRecord() {
  syncAdminThemeOverrideForCurrentUser();
  if (!currentUser?.id || currentUser.id === GUEST_USER.id) {
    return getThemeRecord("blue");
  }
  if (isAdmin() && adminThemeOverrideTheme) {
    return getThemeRecord(adminThemeOverrideTheme);
  }
  if (currentRankState?.currentRank?.theme_key) {
    return getThemeRecord(currentRankState.currentRank.theme_key);
  }
  return null;
}

function refreshAdminThemeOverrideThemeFromLibrary() {
  if (!adminThemeOverrideStoredKey) {
    return;
  }
  const matchingTheme = getThemeLibrary().find((theme) => theme.key === adminThemeOverrideStoredKey) || null;
  if (!matchingTheme) {
    adminThemeOverrideStoredKey = null;
    adminThemeOverrideTheme = null;
    persistAdminThemeOverride(null);
    return;
  }
  adminThemeOverrideTheme = matchingTheme;
}

function updateAdminThemeOverrideUI() {
  const overrideTheme = isAdmin() && adminThemeOverrideTheme ? getThemeRecord(adminThemeOverrideTheme) : null;
  const rankTheme = getThemeRecord(currentRankState?.currentRank?.theme_key || "blue");

  if (adminThemeOverrideStatus) {
    adminThemeOverrideStatus.textContent = overrideTheme
      ? `Trying on ${overrideTheme.name}. Rank theme remains ${rankTheme?.name || "Blue"}.`
      : `Using rank theme ${rankTheme?.name || "Blue"}.`;
  }

  if (adminThemeClearOverrideButton) {
    adminThemeClearOverrideButton.disabled = !overrideTheme;
  }

  document.querySelectorAll("[data-admin-theme-try-on-key]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const isActive = Boolean(overrideTheme && button.dataset.adminThemeTryOnKey === overrideTheme.key);
    button.textContent = isActive ? "Trying On" : "Try On";
    button.disabled = isActive;
  });
}

function applyResolvedTheme() {
  const resolvedTheme = getResolvedThemeRecord();
  if (!resolvedTheme) {
    return;
  }
  applyTheme(resolvedTheme);
  updateAdminThemeOverrideUI();
}

function setAdminThemeOverride(theme, { persist = false } = {}) {
  if (!isAdmin()) {
    return;
  }

  if (!theme) {
    adminThemeOverrideTheme = null;
    adminThemeOverrideStoredKey = null;
    persistAdminThemeOverride(null);
    applyResolvedTheme();
    return;
  }

  const record = getThemeRecord(theme);
  adminThemeOverrideTheme = record;
  adminThemeOverrideStoredKey = persist ? record.key : null;
  persistAdminThemeOverride(persist ? record.key : null);
  applyResolvedTheme();
}

function initTheme() {
  currentTheme = "blue";
}

const bankrollEl = document.getElementById("bankroll");
const carterCashEl = document.getElementById("carter-cash");
const carterCashDeltaEl = document.getElementById("carter-cash-delta");
const handToastContainer = document.getElementById("hand-toast-container");
const betsBody = document.getElementById("bets-body");
const dealButton = document.getElementById("deal-button");
const rebetButton = document.getElementById("rebet-button");
const autoDealToggleInput = document.getElementById("auto-deal-toggle");
const autoDealToggleWrap = document.getElementById("auto-deal-toggle-wrap");
const clearBetsButtons = Array.from(
  document.querySelectorAll('[data-action="clear-bets"]')
);
const drawsContainer = document.getElementById("draws");
const statusEl = document.getElementById("status");
const chipSelectorEl = document.getElementById("chip-selector");
let chipButtons = [];
const chipRackEditButton = document.getElementById("chip-rack-edit");
const betSpotButtons = Array.from(document.querySelectorAll(".bet-spot"));
const betDefinitions = new Map();
const betSpots = new Map();

function normalizeBetCatalogType(type) {
  if (type === "specific-card") return "card";
  if (type === "bust-suit" || type === "bust-rank" || type === "bust-joker") return "bust";
  if (type === "suit-pattern") return "suit";
  return type;
}

betSpotButtons.forEach((button) => {
  const key = button.dataset.betKey || button.dataset.rank;
  if (!key) return;
  const type = button.dataset.betType || "number";
  const label = button.dataset.betLabel || button.querySelector(".bet-label")?.textContent?.trim() || key;
  const lockDuringHand = button.dataset.lock === "hand";
  const payout = Number(button.dataset.payout) || 0;
  const payoutDisplay = button.dataset.payoutDisplay || button.querySelector(".bet-odds")?.textContent?.trim() || null;
  const metadata = {};

  if (type === "number") {
    metadata.rank = button.dataset.rank;
  } else if (type === "specific-card") {
    metadata.rank = button.dataset.rank;
    metadata.suit = button.dataset.suit;
    metadata.suitName = button.dataset.suitName;
  } else if (type === "bust-suit") {
    metadata.suit = button.dataset.suit;
  } else if (type === "bust-rank") {
    metadata.face = button.dataset.face;
  } else if (type === "bust-joker") {
    metadata.face = "Joker";
  } else if (type === "suit-pattern") {
    metadata.suit = button.dataset.suit;
    metadata.pattern = button.dataset.pattern;
  } else if (type === "count") {
    const min = button.dataset.countMin ? Number(button.dataset.countMin) : 0;
    const maxValue = button.dataset.countMax === "Infinity" ? Infinity : Number(button.dataset.countMax);
    metadata.countMin = min;
    metadata.countMax = Number.isFinite(maxValue) ? maxValue : Infinity;
  }

  let announce;
  if (type === "number") {
    const rankLabel = metadata.rank ? describeRank(metadata.rank) : label;
    announce = `Bet on ${rankLabel}`;
  } else if (type === "specific-card") {
    const rankLabel = metadata.rank ? describeRank(metadata.rank) : "";
    announce = `Bet on ${rankLabel} of ${metadata.suitName}`;
  } else if (type === "count") {
    announce = `${label} card count`;
  } else if (type === "bust-suit") {
    announce = `Bust suit ${metadata.suit}`;
  } else if (type === "bust-rank") {
    announce = `Bust ${metadata.face}`;
  } else if (type === "bust-joker") {
    announce = "Bust Joker";
  } else if (type === "suit-pattern") {
    const prefix = metadata.pattern === "none" ? "No" : metadata.pattern === "any" ? "Any" : "First";
    announce = `${prefix} ${metadata.suit}`;
  } else {
    announce = label;
  }

  betDefinitions.set(key, {
    key,
    type,
    label,
    lockDuringHand,
    payout,
    payoutDisplay,
    metadata,
    announce
  });

  betSpots.set(key, {
    button,
    totalEl: button.querySelector(".bet-total"),
    stackEl: button.querySelector(".chip-stack")
  });
});
const handsPlayedEl = document.getElementById("hands-played");
const totalWageredEl = document.getElementById("total-wagered");
const totalPaidEl = document.getElementById("total-paid");
const holdEl = document.getElementById("hold");
const houseEdgeEl = document.getElementById("house-edge");
const historyList = document.getElementById("history-list");
const cardTemplate = document.getElementById("card-template");
const redBlackStatusEl = document.getElementById("red-black-status");
const redBlackBetDisplayEl = document.getElementById("red-black-bet-display");
const redBlackPotDisplayEl = document.getElementById("red-black-pot-display");
const redBlackRungDisplayEl = document.getElementById("red-black-rung-display");
const redBlackMultiplierChipEl = document.getElementById("red-black-multiplier-chip");
const redBlackCommissionDisplayEl = document.getElementById("red-black-commission-display");
const redBlackDrawsEl = document.getElementById("red-black-draws");
const redBlackHistoryEl = document.getElementById("red-black-history");
const redBlackProgressSteps = Array.from(document.querySelectorAll(".beta-ladder-sticky-step[data-red-black-rung]"));
const redBlackBetSpotButton = document.getElementById("red-black-bet-spot");
const redBlackWagerPrimaryEl = document.getElementById("red-black-wager-primary");
const redBlackBetSpotWrapEl = document.getElementById("red-black-bet-spot-wrap");
const redBlackBetTotalEl = document.getElementById("red-black-bet-total");
const redBlackBetEmptyLabelEl = document.getElementById("red-black-bet-empty-label");
const redBlackChipStackEl = document.getElementById("red-black-chip-stack");
const redBlackPotTotalEl = document.getElementById("red-black-pot-total");
const redBlackPotCommissionEl = document.getElementById("red-black-pot-commission");
const redBlackNextPotTotalEl = document.getElementById("red-black-next-pot-total");
const redBlackChipButtons = Array.from(document.querySelectorAll("[data-red-black-chip]"));
const redBlackCategoryButtons = Array.from(document.querySelectorAll("[data-red-black-category]"));
const redBlackValueSelectorEl = document.getElementById("red-black-value-selector");
const redBlackSelectionHintEl = document.getElementById("red-black-selection-hint");
const redBlackSelectionSummaryEl = document.getElementById("red-black-selection-summary");
const redBlackClearBetButton = document.getElementById("red-black-clear-bet-inline");
const redBlackRebetButton = document.getElementById("red-black-rebet");
const redBlackDealButton = document.getElementById("red-black-draw");
const redBlackWithdrawButton = document.getElementById("red-black-withdraw");
const resetAccountButton = document.getElementById("reset-account");
const menuToggle = document.getElementById("menu-toggle");
const utilityPanel = document.getElementById("utility-panel");
const utilityClose = document.getElementById("utility-close");
const graphToggle = document.getElementById("graph-toggle");
const chartPanel = document.getElementById("chart-panel");
const chartClose = document.getElementById("chart-close");
const bankrollChartFilterButtons = Array.from(document.querySelectorAll("[data-bankroll-period]"));
const bankrollChartSubhead = document.getElementById("bankroll-chart-subhead");
const activityFilterButtons = Array.from(document.querySelectorAll("[data-activity-period]"));
const activeUsersFilterButtons = Array.from(document.querySelectorAll("[data-active-users-period]"));
const activeUsersSubheadEl = document.getElementById("active-users-subhead");
const panelScrim = document.getElementById("panel-scrim");
const bankrollChartCanvas = document.getElementById("bankroll-chart");
const bankrollChartWrapper = document.getElementById("bankroll-chart-wrapper");
const bankrollChartCtx =
  bankrollChartCanvas instanceof HTMLCanvasElement
    ? bankrollChartCanvas.getContext("2d")
    : null;
const advancedToggleInput = document.getElementById("advanced-toggle");
const advancedToggleWrapper = advancedToggleInput
  ? advancedToggleInput.closest(".advanced-toggle")
  : null;
const advancedBetsSection = document.getElementById("advanced-bets");
const pausePlayButton = document.getElementById("pause-play");
const paytableRadios = Array.from(document.querySelectorAll('input[name="paytable"]'));
const changePaytableButton = document.getElementById("change-paytable");
const paytableInfoButton = document.getElementById("paytable-info");
const paytableModal = document.getElementById("paytable-modal");
const paytableForm = document.getElementById("paytable-form");
const paytableApplyButton = document.getElementById("paytable-apply");
const paytableCancelButton = document.getElementById("paytable-cancel");
const paytableCloseButton = document.getElementById("paytable-close");
const resetModal = document.getElementById("reset-modal");
const resetConfirmButton = document.getElementById("reset-confirm");
const resetCancelButton = document.getElementById("reset-cancel");
const resetCloseButton = document.getElementById("reset-close");
const resetModalCopyEl = document.getElementById("reset-modal-copy");
const activePaytableNameEl = document.getElementById("active-paytable-name");
const activePaytableStepsEl = document.getElementById("active-paytable-steps");
const profileRetryBanner = document.getElementById("profile-retry-banner");
const profileRetryMessage = document.getElementById("profile-retry-message");
const profileRetryButton = document.getElementById("profile-retry-button");
const profileRetryButtonDefaultLabel = profileRetryButton
  ? profileRetryButton.textContent.trim()
  : "Retry loading profile";
const toastContainer = document.getElementById("toast-container");
const authView = document.getElementById("auth-view");
const authForm = document.getElementById("auth-form");
const authEmailInput = document.getElementById("auth-email");
const authErrorEl = document.getElementById("auth-error");
const authResendWrapEl = document.getElementById("auth-resend-wrap");
const authResendConfirmationButton = document.getElementById("auth-resend-confirmation");
const authSubmitButton = document.getElementById("auth-submit");
const signupView = document.getElementById("signup-view");
const signupForm = document.getElementById("signup-form");
const signupErrorEl = document.getElementById("signup-error");
const signupSubmitButton = document.getElementById("signup-submit");
const signupFirstInput = document.getElementById("signup-first");
const showSignUpButton = document.getElementById("show-signup");
const showLoginButton = document.getElementById("show-login");
const showForgotPasswordButton = document.getElementById("show-forgot-password");
const backToLoginButton = document.getElementById("back-to-login");
const forgotPasswordView = document.getElementById("forgot-password-view");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const resetPasswordView = document.getElementById("reset-password-view");
const resetPasswordForm = document.getElementById("reset-password-form");
const appShell = document.getElementById("app-shell");
const homeView = document.getElementById("home-view");
const playView = document.getElementById("play-view");
const runTheNumbersView = document.getElementById("run-the-numbers-view");
const redBlackView = document.getElementById("red-black-view");
const redBlackChipBarEl = document.getElementById("red-black-chip-bar");
const contestsView = document.getElementById("contests-view");
const storeView = document.getElementById("store-view");
const dashboardView = document.getElementById("dashboard-view");
const adminView = document.getElementById("admin-view");
const profileView = document.getElementById("profile-view");
const routeViews = {
  home: homeView,
  play: playView,
  "run-the-numbers": runTheNumbersView,
  "red-black": redBlackView,
  contests: contestsView,
  store: storeView,
  dashboard: dashboardView,
  admin: adminView,
  profile: profileView
};
const headerEl = document.querySelector(".header");
const chipBarEl = runTheNumbersView ? runTheNumbersView.querySelector(".chip-bar") : null;
const playLayout = runTheNumbersView ? runTheNumbersView.querySelector(".layout") : null;
const AUTH_ROUTES = new Set(["auth", "signup", "reset-password"]);
const TABLE_ROUTES = new Set(["home", "play", "run-the-numbers", "red-black", "contests", "store", "admin"]);
const routeButtons = Array.from(document.querySelectorAll("[data-route-target]"));
const signOutButtons = Array.from(document.querySelectorAll('[data-action="sign-out"]'));
const dashboardEmailEl = document.getElementById("dashboard-email");
const dashboardCreditsEl = document.getElementById("dashboard-credits");
const dashboardCarterEl = document.getElementById("dashboard-carter-cash");
const carterCashInfoButton = document.getElementById("carter-cash-info-button");
const carterCashTooltip = document.getElementById("carter-cash-tooltip");
const dashboardRunsEl = document.getElementById("dashboard-runs");
const homeRankPanelEl = document.getElementById("home-rank-panel");
const homeRankTitleEl = document.getElementById("home-rank-title");
const homeRankTypingEl = document.getElementById("home-rank-typing");
const homeRankHandsProgressTextEl = document.getElementById("home-rank-hands-progress-text");
const homeRankHandsProgressBarEl = document.getElementById("home-rank-hands-progress-bar");
const homeRankWinsProgressTextEl = document.getElementById("home-rank-wins-progress-text");
const homeRankWinsProgressBarEl = document.getElementById("home-rank-wins-progress-bar");
const homeRankLadderButton = document.getElementById("home-rank-ladder-button");
const homeRankIconEl = document.getElementById("home-rank-icon");
const homeRankIconFallbackEl = document.getElementById("home-rank-icon-fallback");
const drawerRankSummaryEl = document.getElementById("drawer-rank-summary");
const drawerRankIconEl = document.getElementById("drawer-rank-icon");
const drawerRankIconFallbackEl = document.getElementById("drawer-rank-icon-fallback");
const drawerRankNameEl = document.getElementById("drawer-rank-name");
const prizeListEl = document.getElementById("prize-list");
const adminNavButton = document.getElementById("admin-nav");
const drawerContestLink = document.getElementById("drawer-contest-link");
const drawerContestTimer = document.getElementById("drawer-contest-timer");
const drawerGraphLink = document.getElementById("drawer-graph-link");
const menuContestBadge = document.getElementById("menu-contest-badge");
const accountModeSelect = document.getElementById("account-mode-select");
const accountModeSummaryEl = document.getElementById("account-mode-summary");
const contestEmailOptInInput = document.getElementById("contest-email-opt-in");
const contestEmailSettingMessageEl = document.getElementById("contest-email-setting-message");
const notificationToggle = document.getElementById("notification-toggle");
const notificationBadge = document.getElementById("notification-badge");
const notificationsPanel = document.getElementById("notifications-panel");
const notificationsClose = document.getElementById("notifications-close");
const notificationsClearAllButton = document.getElementById("notifications-clear-all");
const notificationsListEl = document.getElementById("notifications-list");
const homeLiveContestsSectionEl = document.getElementById("home-live-contests");
const homeLiveContestListEl = document.getElementById("home-live-contest-list");
const adminAddButton = document.getElementById("admin-add-button");
const adminSaveButton = document.getElementById("admin-save-button");
const adminPrizeListEl = document.getElementById("admin-prize-list");
const adminContestListUpcomingEl = document.getElementById("admin-contest-list-upcoming");
const adminContestListLiveEl = document.getElementById("admin-contest-list-live");
const adminContestListEndedEl = document.getElementById("admin-contest-list-ended");
const adminContestTabButtons = Array.from(document.querySelectorAll("[data-admin-contest-tab]"));
const adminContestPanelUpcomingEl = document.getElementById("admin-contest-panel-upcoming");
const adminContestPanelLiveEl = document.getElementById("admin-contest-panel-live");
const adminContestPanelEndedEl = document.getElementById("admin-contest-panel-ended");
const adminPrizeForm = document.getElementById("admin-prize-form");
const adminPrizeMessage = document.getElementById("admin-prize-message");
const adminPrizeImageUrlInput = document.getElementById("prize-image-url");
const adminPrizeImageFileInput = document.getElementById("prize-image-file");
const adminPrizeModal = document.getElementById("admin-prize-modal");
const adminModalTitle = document.getElementById("admin-modal-title");
const adminModalCloseButton = document.getElementById("admin-modal-close");
const adminModalCancelButton = document.getElementById("admin-modal-cancel");
const adminContestModal = document.getElementById("admin-contest-modal");
const adminContestForm = document.getElementById("admin-contest-form");
const adminContestMessage = document.getElementById("admin-contest-message");
const adminContestAddButton = document.getElementById("admin-add-contest-button");
const adminContestCloseButton = document.getElementById("admin-contest-close");
const adminContestCancelButton = document.getElementById("admin-contest-cancel");
const adminContestSaveButton = document.getElementById("admin-contest-save");
const contestStartWhenRequirementReachedInput = document.getElementById("contest-start-when-requirement-reached");
const adminRankListEl = document.getElementById("admin-rank-list");
const adminAddRankButton = document.getElementById("admin-add-rank-button");
const adminRankModal = document.getElementById("admin-rank-modal");
const adminRankForm = document.getElementById("admin-rank-form");
const adminRankMessage = document.getElementById("admin-rank-message");
const adminRankCloseButton = document.getElementById("admin-rank-close");
const adminRankCancelButton = document.getElementById("admin-rank-cancel");
const adminRankSaveButton = document.getElementById("admin-rank-save");
const adminRankIconFileInput = document.getElementById("rank-icon-file");
const adminRankIconPreview = document.getElementById("admin-rank-icon-preview");
const adminRankIconPlaceholder = document.getElementById("admin-rank-icon-placeholder");
const rankUpModal = document.getElementById("rank-up-modal");
const rankUpTitleEl = document.getElementById("rank-up-title");
const rankUpCloseButton = document.getElementById("rank-up-close");
const rankUpOkButton = document.getElementById("rank-up-ok");
const rankUpCopyEl = document.getElementById("rank-up-copy");
const rankUpIconEl = document.getElementById("rank-up-icon");
const rankUpIconFallbackEl = document.getElementById("rank-up-icon-fallback");
const shippingModal = document.getElementById("shipping-modal");
const shippingForm = document.getElementById("shipping-form");
const shippingSummaryEl = document.getElementById("shipping-summary");
const shippingPhoneInput = document.getElementById("shipping-phone");
const shippingAddressInput = document.getElementById("shipping-address");
const shippingCloseButton = document.getElementById("shipping-close");
const shippingCancelButton = document.getElementById("shipping-cancel");
const shippingSubmitButton = document.getElementById("shipping-submit");
const profileForm = document.getElementById("profile-form");
const profileFirstNameInput = document.getElementById("profile-first-name");
const profileLastNameInput = document.getElementById("profile-last-name");
const profileEmailInput = document.getElementById("profile-email");
const profilePasswordInput = document.getElementById("profile-password");
const profilePasswordToggle = document.getElementById("profile-password-toggle");
const profileResetPasswordButton = document.getElementById("profile-reset-password-button");
const profileEditButton = document.getElementById("profile-edit-button");
const profileCancelButton = document.getElementById("profile-cancel-button");
const profileSaveButton = document.getElementById("profile-save-button");
const profileMessage = document.getElementById("profile-message");
const profileContestMedalsListEl = document.getElementById("profile-contest-medals");
const prizeImageModal = document.getElementById("prize-image-modal");
const prizeImageCloseButton = document.getElementById("prize-image-close");
const prizeImagePreview = document.getElementById("prize-image-preview");
const prizeImageCaption = document.getElementById("prize-image-caption");
const contestModal = document.getElementById("contest-modal");
const contestModalCloseButton = document.getElementById("contest-modal-close");
const contestOptInButton = document.getElementById("contest-opt-in-button");
const contestStatusText = document.getElementById("contest-status-text");
const contestTitleEl = document.getElementById("contest-title");
const contestWindowEl = document.getElementById("contest-window");
const contestStartingBankrollEl = document.getElementById("contest-starting-bankroll");
const contestStartingCarterCashEl = document.getElementById("contest-starting-carter-cash");
const contestWinningCriteriaEl = document.getElementById("contest-winning-criteria");
const contestRewardEl = document.getElementById("contest-reward");
const contestOptInCopyEl = document.getElementById("contest-opt-in-copy");
const contestLeaderboardListEl = document.getElementById("contest-leaderboard-list");
const playerLiveContestListEl = document.getElementById("player-live-contest-list");
const playerEndedContestListEl = document.getElementById("player-ended-contest-list");
const contestTabButtons = Array.from(document.querySelectorAll("[data-contest-tab]"));
const contestPanelLiveEl = document.getElementById("contest-panel-live");
const contestPanelEndedEl = document.getElementById("contest-panel-ended");
const contestResultsModal = document.getElementById("contest-results-modal");
const contestResultsTitleEl = document.getElementById("contest-results-title");
const contestResultsCloseButton = document.getElementById("contest-results-close");
const contestResultsOkButton = document.getElementById("contest-results-ok");
const contestResultsSummaryEl = document.getElementById("contest-results-summary");
const contestResultsListEl = document.getElementById("contest-results-list");
const contestResultsNonQualifyingListEl = document.getElementById("contest-results-nonqualifying-list");
const contestResultsNoteEl = document.getElementById("contest-results-note");
const adminContestResultsModal = document.getElementById("admin-contest-results-modal");
const adminContestResultsCloseButton = document.getElementById("admin-contest-results-close");
const adminContestResultsOkButton = document.getElementById("admin-contest-results-ok");
const adminContestResultsSummaryEl = document.getElementById("admin-contest-results-summary");
const adminContestResultsListEl = document.getElementById("admin-contest-results-list");
const adminContestResultsNonQualifyingListEl = document.getElementById("admin-contest-results-nonqualifying-list");
const adminContestantsModal = document.getElementById("admin-contestants-modal");
const adminContestantsCloseButton = document.getElementById("admin-contestants-close");
const adminContestantsOkButton = document.getElementById("admin-contestants-ok");
const adminContestantsSummaryEl = document.getElementById("admin-contestants-summary");
const adminContestantsListEl = document.getElementById("admin-contestants-list");
const contestJourneyModal = document.getElementById("contest-journey-modal");
const contestJourneyTitleEl = document.getElementById("contest-journey-title");
const contestJourneySummaryEl = document.getElementById("contest-journey-summary");
const contestJourneyChartEl = document.getElementById("contest-journey-chart");
const contestJourneyCloseButton = document.getElementById("contest-journey-close");
const contestJourneyOkButton = document.getElementById("contest-journey-ok");
const numberBetsModal = document.getElementById("number-bets-modal");
const numberBetsInfoButton = document.getElementById("number-bets-info");
const numberBetsModalClose = document.getElementById("number-bets-modal-close");
const numberBetsModalOk = document.getElementById("number-bets-modal-ok");
const handReviewModal = document.getElementById("hand-review-modal");
const handReviewSummaryEl = document.getElementById("hand-review-summary");
const handReviewListEl = document.getElementById("hand-review-list");
const handReviewTotalsEl = document.getElementById("hand-review-totals");
const handReviewTotalWagerEl = document.getElementById("hand-review-total-wager");
const handReviewTotalReturnEl = document.getElementById("hand-review-total-return");
const handReviewTotalNetEl = document.getElementById("hand-review-total-net");
const handReviewCloseButton = document.getElementById("hand-review-close");
const handReviewOkButton = document.getElementById("hand-review-ok");
const outOfCreditsCopyEl = document.getElementById("out-of-credits-copy");
const betAnalyticsModal = document.getElementById("bet-analytics-modal");
const betAnalyticsClose = document.getElementById("bet-analytics-close");
const playerBankrollModal = document.getElementById("player-bankroll-modal");
const playerBankrollClose = document.getElementById("player-bankroll-close");
const playerBankrollTitleEl = document.getElementById("player-bankroll-title");
const playerBankrollSubheadEl = document.getElementById("player-bankroll-subhead");
const playerHandsModal = document.getElementById("player-hands-modal");
const playerHandsClose = document.getElementById("player-hands-close");
const playerHandsTitleEl = document.getElementById("player-hands-title");
const playerHandsSubheadEl = document.getElementById("player-hands-subhead");
const playerModeBreakdownModal = document.getElementById("player-mode-breakdown-modal");
const playerModeBreakdownClose = document.getElementById("player-mode-breakdown-close");
const playerModeBreakdownTitleEl = document.getElementById("player-mode-breakdown-title");
const playerModeBreakdownSummaryEl = document.getElementById("player-mode-breakdown-summary");
const playerModeBreakdownModeBodyEl = document.getElementById("player-mode-breakdown-mode-body");
const playerModeBreakdownModeTotalEl = document.getElementById("player-mode-breakdown-mode-total");
const playerModeBreakdownGameBodyEl = document.getElementById("player-mode-breakdown-game-body");
const playerModeBreakdownGameTotalEl = document.getElementById("player-mode-breakdown-game-total");
const playerModeBreakdownOk = document.getElementById("player-mode-breakdown-ok");
const playerBreakdownFilterButtons = Array.from(document.querySelectorAll("[data-player-breakdown-period]"));
const adminTabButtons = document.querySelectorAll(".admin-tab");
const adminPrizesContent = document.getElementById("admin-prizes-content");
const adminAnalyticsContent = document.getElementById("admin-analytics-content");
const adminContestsContent = document.getElementById("admin-contests-content");
const adminDesignContent = document.getElementById("admin-design-content");
const adminRanksContent = document.getElementById("admin-ranks-content");
const adminThemeForm = document.getElementById("admin-theme-form");
const adminThemeListEl = document.getElementById("admin-theme-list");
const adminThemeMessage = document.getElementById("admin-theme-message");
const adminThemePreviewEl = document.getElementById("admin-theme-preview");
const adminThemePreviewPageSelect = document.getElementById("admin-theme-preview-page");
const adminThemeOverrideStatus = document.getElementById("admin-theme-override-status");
const adminThemeCreateButton = document.getElementById("admin-theme-create-button");
const adminThemeModal = document.getElementById("admin-theme-modal");
const adminThemeModalTitle = document.getElementById("admin-theme-modal-title");
const adminThemeCloseButton = document.getElementById("admin-theme-close");
const adminThemeCancelButton = document.getElementById("admin-theme-cancel");
const adminThemeSaveButton = document.getElementById("admin-theme-save");
const adminThemeTryOnButton = document.getElementById("admin-theme-try-on");
const adminThemeClearOverrideButton = document.getElementById("admin-theme-clear-override");
const adminThemeBaseSelect = document.getElementById("admin-theme-base-select");
const adminRankThemeSelect = document.getElementById("admin-rank-theme-select");
const mostActiveWeekListEl = document.getElementById("most-active-week-list");
const mostActiveSubheadEl = document.getElementById("most-active-subhead");
const mostActiveLoadMoreButton = document.getElementById("most-active-load-more");
const rankLadderModal = document.getElementById("rank-ladder-modal");
const rankLadderListEl = document.getElementById("rank-ladder-list");
const rankLadderCloseButton = document.getElementById("rank-ladder-close");
const rankLadderOkButton = document.getElementById("rank-ladder-ok");
const playAssistantToggle = document.getElementById("play-assistant-toggle");
const playAssistantPanel = document.getElementById("play-assistant-panel");
const playAssistantCloseButton = document.getElementById("play-assistant-close");
const playAssistantTitleEl = document.getElementById("play-assistant-title");
const playAssistantContextEl = document.getElementById("play-assistant-context");
const playAssistantThreadEl = document.getElementById("play-assistant-thread");
const playAssistantQuickActionsEl = document.getElementById("play-assistant-quick-actions");
const playAssistantQuickActionButtons = Array.from(
  document.querySelectorAll("[data-play-assistant-prompt]")
);
const playAssistantForm = document.getElementById("play-assistant-form");
const playAssistantInput = document.getElementById("play-assistant-input");
const playAssistantSendButton = document.getElementById("play-assistant-send");
const chipEditorModal = document.getElementById("chip-editor-modal");
const chipEditorForm = document.getElementById("chip-editor-form");
const chipEditorInputs = [1, 2, 3, 4]
  .map((slot) => document.getElementById(`chip-editor-${slot}`))
  .filter(Boolean);
const chipEditorMessage = document.getElementById("chip-editor-message");
const chipEditorCloseButton = document.getElementById("chip-editor-close");
const chipEditorCancelButton = document.getElementById("chip-editor-cancel");
const chipEditorApplyButton = document.getElementById("chip-editor-apply");
const chipEditorResetButton = document.getElementById("chip-editor-reset");

const THEME_CLASS_MAP = {
  blue: "theme-blue",
  pink: "theme-pink",
  orange: "theme-orange",
  "steel-black": "theme-steel-black",
  angelic: "theme-angelic",
  retro: "theme-retro",
  "cotton-candy": "theme-cotton-candy",
  pastel: "theme-pastel"
};
const DEFAULT_CUSTOM_THEME_PALETTE = {
  accent: "#63f0ff",
  accentSecondary: "#f857c1",
  accentTertiary: "#8b80ff",
  heroButton: "#4f9bff",
  primaryButton: "#4f9bff",
  primaryButtonDisabled: "#7f9dc7",
  secondaryButton: "#2b6fd6",
  secondaryButtonDisabled: "#647da3",
  progressStart: "#63f0ff",
  progressEnd: "#8b80ff",
  gold: "#ffd166",
  muted: "#bfd5ff",
  success: "#5af78e",
  danger: "#ff5c8a",
  bgStart: "#08142d",
  bgEnd: "#050913",
  panelStart: "#0e2c63",
  panelEnd: "#08142d",
  headerStart: "#15386d",
  headerEnd: "#0b1b3d"
};
const DEFAULT_CUSTOM_THEME_SETTINGS = {
  glowStrength: 48,
  surfaceContrast: 58,
  radiusScale: 72,
  flatSurfaces: false
};
const CUSTOM_THEME_VARIABLE_KEYS = [
  "--neon-cyan",
  "--neon-magenta",
  "--neon-violet",
  "--gold",
  "--muted",
  "--success",
  "--danger",
  "--text-light",
  "--body-bg",
  "--body-bg-size",
  "--body-bg-position",
  "--app-overlay",
  "--header-gradient",
  "--header-border-color",
  "--icon-button-bg",
  "--icon-button-border-color",
  "--icon-button-border-hover",
  "--icon-button-shadow-hover",
  "--icon-graph-gradient",
  "--reset-border-color",
  "--reset-bg",
  "--reset-border-hover",
  "--reset-bg-hover",
  "--reset-shadow-hover",
  "--menu-bg",
  "--menu-border-color",
  "--menu-shadow",
  "--menu-border-hover",
  "--menu-shadow-hover",
  "--stat-bg",
  "--stat-border",
  "--stat-shadow",
  "--table-panel-bg",
  "--table-panel-shadow",
  "--paytable-panel-bg",
  "--paytable-panel-border",
  "--paytable-panel-shadow",
  "--paytable-option-bg",
  "--paytable-option-border",
  "--paytable-option-shadow",
  "--paytable-option-border-hover",
  "--paytable-option-shadow-hover",
  "--paytable-option-border-selected",
  "--paytable-option-shadow-selected",
  "--paytable-option-name-color",
  "--paytable-option-steps-color",
  "--active-paytable-bg",
  "--active-paytable-border",
  "--active-paytable-shadow",
  "--active-paytable-label-color",
  "--active-paytable-steps-color",
  "--change-paytable-bg",
  "--change-paytable-border",
  "--change-paytable-border-hover",
  "--change-paytable-shadow",
  "--betting-panel-bg",
  "--betting-panel-border",
  "--betting-panel-shadow",
  "--bet-spot-bg",
  "--bet-spot-border",
  "--bet-spot-border-hover",
  "--bet-spot-border-active",
  "--bet-spot-shadow",
  "--bet-spot-active-shadow",
  "--bet-total-color",
  "--bet-total-active-color",
  "--bet-total-glow",
  "--bet-total-active-glow",
  "--status-text-color",
  "--table-callout-color",
  "--table-callout-shadow",
  "--chip-5-bg",
  "--chip-10-bg",
  "--chip-25-bg",
  "--chip-100-bg",
  "--chip-choice-bg",
  "--chip-choice-border",
  "--chip-choice-shadow",
  "--chip-choice-shadow-hover",
  "--chip-choice-active-bg",
  "--chip-choice-active-shadow",
  "--chip-bar-bg",
  "--chip-bar-border",
  "--chip-bar-shadow",
  "--primary-button-bg",
  "--primary-button-border",
  "--primary-button-shadow",
  "--primary-button-shadow-hover",
  "--primary-button-text",
  "--primary-button-disabled-bg",
  "--primary-button-disabled-border",
  "--primary-button-disabled-shadow",
  "--primary-button-disabled-text",
  "--secondary-button-bg",
  "--secondary-button-border",
  "--secondary-button-shadow",
  "--secondary-button-shadow-hover",
  "--secondary-button-text",
  "--secondary-button-disabled-bg",
  "--secondary-button-disabled-border",
  "--secondary-button-disabled-shadow",
  "--secondary-button-disabled-text",
  "--assistant-fab-bg",
  "--assistant-fab-border",
  "--assistant-fab-border-hover",
  "--assistant-fab-shadow",
  "--assistant-fab-shadow-hover",
  "--hero-button-bg",
  "--hero-button-border",
  "--hero-button-shadow",
  "--hero-button-shadow-hover",
  "--deal-button-bg",
  "--deal-button-shadow",
  "--deal-button-shadow-hover",
  "--deal-button-text",
  "--progress-fill-start",
  "--progress-fill-end",
  "--progress-fill-glow",
  "--drawer-bg",
  "--drawer-border",
  "--drawer-shadow",
  "--modal-bg",
  "--modal-border",
  "--modal-shadow",
  "--scrim-bg",
  "--analytics-bg",
  "--analytics-border",
  "--analytics-shadow",
  "--chart-background",
  "--chart-axis-color",
  "--chart-grid-color",
  "--chart-line-color",
  "--chart-line-shadow",
  "--chart-fill-color",
  "--chart-fill-fade",
  "--chart-background-gradient-start",
  "--chart-background-gradient-end",
  "--chart-marker-color",
  "--chart-marker-stroke",
  "--chart-marker-shadow",
  "--chart-base-line",
  "--chart-scroll-track",
  "--chart-scroll-thumb",
  "--carter-green",
  "--carter-green-glow",
  "--bust-bet-bg",
  "--bust-bet-border",
  "--bust-bet-shadow",
  "--count-bet-start-base",
  "--count-bet-end-base"
];
const ALL_THEME_CLASSES = [...new Set(Object.values(THEME_CLASS_MAP))];

let bankroll = INITIAL_BANKROLL;
let bets = [];
let dealing = false;
let chipDenominations = loadStoredChipDenominations();
let selectedChip = chipDenominations[0];
let bettingOpen = true;
let redBlackSelectedChip = 5;
let redBlackBet = 0;
let redBlackRung = 0;
let redBlackHandActive = false;
let redBlackAwaitingDecision = false;
let redBlackSettlementPending = false;
let redBlackDeck = [];
let redBlackCurrentPot = 0;
let redBlackCategory = "color";
let redBlackSelectedValues = ["red"];
let redBlackLastBet = 0;
let redBlackHandHistoryEntries = [];
let stats = {
  hands: 0,
  wagered: 0,
  paid: 0
};
let lastBetLayout = [];
  let currentOpeningLayout = [];
  let bankrollAnimating = false;
let bankrollAnimationFrame = null;
let bankrollDeltaTimeout = null;
let bankrollHistory = [];
let persistentBankrollHistory = [];
let persistentBankrollUserId = null;
let bankrollChartPeriod = "year";
let activityLeaderboardPeriod = "week";
let activeUsersChartPeriod = "all";
let autoDealEnabled = true;
let carterCash = 0;
  let carterCashProgress = 0;
  let carterCashAnimating = false;
  let carterCashDeltaTimeout = null;
  let lastSyncedCarterCash = 0;
  let lastSyncedCarterProgress = 0;
let advancedMode = true; // Always enabled - all bets always available
  let handPaused = false;
  let awaitingManualDeal = false;
  let pauseResolvers = [];
  let currentHandContext = null;
  let activePaytable = PAYTABLES[0];
  let pendingPaytableId = activePaytable.id;
  let openDrawerPanel = null;
  let openDrawerToggle = null;
let currentTheme = "blue";
  const GUEST_USER = {
    id: "guest-user",
    email: "guest@example.com",
    user_metadata: {
      full_name: "Guest Player",
      first_name: "Guest",
      last_name: "Player"
    }
  };

  const GUEST_PROFILE = {
    id: GUEST_USER.id,
    username: "Guest",
    credits: INITIAL_BANKROLL,
    carter_cash: 0,
    carter_cash_progress: 0,
    hands_played_all_time: 0,
    contest_wins: 0,
    current_rank_tier: 1,
    current_rank_id: null,
    first_name: "Guest",
    last_name: "Player"
  };
  let currentUser = null;
  let currentRoute = "home";
  const authState = {
    lastUserId: null,
    manualSignOutRequested: false
  };
let dashboardLoaded = false;
let prizesLoaded = false;
let adminPrizesLoaded = false;
let adminContestsLoaded = false;
let currentAdminContestTab = "upcoming";
let adminRanksLoaded = false;
let adminThemesLoaded = false;
let adminEditingPrizeId = null;
let adminEditingRankId = null;
let adminEditingThemeId = null;
let adminEditingThemeSourceKey = null;
let adminEditingThemeSourceBuiltin = false;
let adminThemeOverrideTheme = null;
let adminThemeOverrideStoredKey = null;
let adminThemeOverrideUserId = null;
let adminThemePreviewPage = "home";
let adminPrizeCache = [];
let rankLadderCache = [];
let themeLibraryCache = [];
let themeLibraryHydrated = false;
let currentRankState = null;
let reconciledHandsPlayedUserId = null;
let rankWelcomeTypingTimer = null;
let rankWelcomeTypingToken = 0;
let contestCache = [];
let currentContest = null;
let currentContestEntry = null;
let contestLeaderboard = [];
let userContestEntries = [];
let contestEntryMap = new Map();
let contestParticipantCounts = {};
let contestJoinBoosts = new Map();
let currentContestListTab = "live";
let currentAccountMode = {
  type: "normal",
  contestId: null
};
let currentProfile = null;
let suppressHash = false;
let dashboardProfileRetryTimer = null;
let resetModalTrigger = null;
let playAssistantOpen = false;
let playAssistantThread = [];
let playAssistantThreadGameKey = null;
let playAssistantRiskTolerance = "balanced";
let playAssistantPendingPlan = null;
let playAssistantRequestInFlight = false;
let playAssistantHistoryCache = {
  userId: null,
  gameKey: null,
  fetchedAt: 0,
  insights: null
};
let recentHandReviews = [];
let handReviewModalTrigger = null;
let chipEditorModalTrigger = null;

let shippingModalTrigger = null;
let activeShippingPurchase = null;
let adminModalTrigger = null;
let adminContestModalTrigger = null;
let prizeImageTrigger = null;
let contestTimerInterval = null;
let contestResultsModalOpen = false;
let contestJourneyModalOpen = false;
let contestJourneyResizeHandler = null;
let contestNotifications = [];
let contestStartNotifications = [];

const MAX_HISTORY_POINTS = 500;
const PROFILE_SYNC_INTERVAL = 15000;
const PLAY_ASSISTANT_MAX_HISTORY = 12;
const PLAY_ASSISTANT_HISTORY_LIMIT = 100;
const PLAY_ASSISTANT_HISTORY_CACHE_MS = 60 * 1000;
const PLAY_ASSISTANT_REQUEST_TIMEOUT_MS = 25000;
const PLAY_ASSISTANT_CONFIG = {
  [GAME_KEYS.RUN_THE_NUMBERS]: {
    title: "Bankroll Coach",
    rulesSummary: [
      "Run the Numbers uses a fresh 53-card deck every hand.",
      "Ace and number cards 2 through 10 keep the hand alive.",
      "Any Jack, Queen, King, or the Joker stops the hand immediately.",
      "Number bets on Ace through 10 must be placed before the hand starts and can hit multiple times until a stopper appears.",
      "Specific-card bets pay when the exact rank and suit appears.",
      "Card-count bets are based on the total cards dealt, including the final bust card.",
      "The assistant may suggest bets and, with consent, place chips on the felt, but it must never start the hand."
    ].join(" "),
    greeting:
      "I can explain the rules, talk through the current table state, and draft a betting layout if you want one. Tell me what you want to understand or propose.",
    quickActions: [
      {
        label: "How do I play?",
        prompt: "Explain how Run the Numbers works in simple terms."
      },
      {
        label: "Beginner plan",
        prompt: "Give me a beginner-friendly strategy for my bankroll."
      },
      {
        label: "Size my bets",
        prompt: "Help me choose bet sizing based on my bankroll."
      }
    ]
  },
  [GAME_KEYS.GUESS_10]: {
    title: "Bankroll Coach",
    rulesSummary: [
      "Guess 10 uses a fresh 52-card deck with no Joker.",
      "You place one wager, choose a prediction category, and keep drawing as long as each new card matches your current prediction.",
      "Color picks exactly 1 color and pays 2x on each hit.",
      "Suit picks 1 to 3 suits and pays 4 divided by the number of selected suits on each hit.",
      "Rank picks 1 to 12 ranks and pays 13 divided by the number of selected ranks on each hit.",
      "After each hit you may change your prediction, draw again, or cash out.",
      "Commission only applies when you cash out, and the commission rate drops as the streak gets longer.",
      "A miss ends the hand immediately and loses the current pot."
    ].join(" "),
    greeting:
      "I can explain Guess 10, talk through your live prediction and pot, and help you think through draw-versus-cash-out decisions. Tell me what you want to understand.",
    quickActions: [
      {
        label: "How do I play?",
        prompt: "Explain how Guess 10 works in simple terms."
      },
      {
        label: "Cash out?",
        prompt: "Help me think through when to cash out in Guess 10."
      },
      {
        label: "My odds",
        prompt: "Explain how the Guess 10 multipliers and commission work."
      }
    ]
  }
};
const PLAY_ASSISTANT_RISK_LABELS = {
  cautious: "Cautious",
  balanced: "Balanced",
  aggressive: "Aggressive"
};

let bankrollInitialized = false;
let lastSyncedBankroll = null;
  let lastProfileSync = 0;

  let authSubscription = null;

let playAreaUpdateFrame = null;

function clearPlayAreaHeight() {
  if (playAreaUpdateFrame !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(playAreaUpdateFrame);
    playAreaUpdateFrame = null;
  }
  if (playLayout) {
    playLayout.style.removeProperty("--play-area-height");
  }
  if (typeof document !== "undefined") {
    document.documentElement.style.removeProperty("--play-assistant-top");
    document.documentElement.style.removeProperty("--play-assistant-bottom");
    document.documentElement.style.removeProperty("--play-assistant-max-height");
  }
}

function getViewportMetrics() {
  if (typeof window === "undefined") {
    return {
      height: 0,
      offsetTop: 0
    };
  }

  const visualViewport = window.visualViewport;
  if (visualViewport) {
    return {
      height: Math.round(visualViewport.height || window.innerHeight || 0),
      offsetTop: Math.max(0, Math.round(visualViewport.offsetTop || 0))
    };
  }

  return {
    height: window.innerHeight || 0,
    offsetTop: 0
  };
}

function updatePlayAreaHeight() {
  if (!playLayout) {
    return;
  }

  if (currentRoute !== "run-the-numbers") {
    clearPlayAreaHeight();
    return;
  }

  const { height: viewportHeight } = getViewportMetrics();
  if (!viewportHeight) {
    return;
  }

  const headerHeight = headerEl ? headerEl.offsetHeight : 0;
  const chipBarHeight = chipBarEl ? chipBarEl.offsetHeight : 0;
  const available = Math.max(viewportHeight - headerHeight - chipBarHeight, 0);
  playLayout.style.setProperty("--play-area-height", `${available}px`);
  updatePlayAssistantBounds();
}

function schedulePlayAreaHeightUpdate() {
  if (typeof window === "undefined") {
    return;
  }
  if (playAreaUpdateFrame !== null) {
    window.cancelAnimationFrame(playAreaUpdateFrame);
  }
  playAreaUpdateFrame = window.requestAnimationFrame(() => {
    playAreaUpdateFrame = null;
    updatePlayAreaHeight();
  });
}

function updatePlayAssistantBounds() {
  if (typeof document === "undefined") {
    return;
  }

  const { height: viewportHeight, offsetTop } = getViewportMetrics();
  const headerHeight = headerEl ? headerEl.offsetHeight : 0;
  const chipBarHeight = chipBarEl ? chipBarEl.offsetHeight : 0;
  const isMobileViewport =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  const topInset = Math.max(headerHeight + 12 + offsetTop, 76);
  const closedBottomInset = Math.max(chipBarHeight + 22, 130);
  const openBottomInset = isMobileViewport ? 0 : Math.max(chipBarHeight + 8, 24);
  const bottomInset = playAssistantOpen ? openBottomInset : closedBottomInset;
  const maxAvailable = Math.max(viewportHeight - topInset - bottomInset, 220);

  document.documentElement.style.setProperty("--play-assistant-top", `${topInset}px`);
  document.documentElement.style.setProperty("--play-assistant-bottom", `${bottomInset}px`);
  document.documentElement.style.setProperty("--play-assistant-max-height", `${maxAvailable}px`);
}

const layoutResizeObserver =
  typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => schedulePlayAreaHeightUpdate())
    : null;

if (layoutResizeObserver) {
  if (headerEl) {
    layoutResizeObserver.observe(headerEl);
  }
  if (chipBarEl) {
    layoutResizeObserver.observe(chipBarEl);
  }
}

function getPaytableById(id) {
  return PAYTABLES.find((table) => table.id === id) ?? PAYTABLES[0];
}

function normalizeChipDenominations(values) {
  if (!Array.isArray(values)) {
    return [...DEFAULT_CHIP_DENOMINATIONS];
  }

  const normalized = values
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 1)
    .sort((a, b) => a - b);

  if (normalized.length !== 4 || new Set(normalized).size !== 4) {
    return [...DEFAULT_CHIP_DENOMINATIONS];
  }

  return normalized;
}

function loadStoredChipDenominations() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return [...DEFAULT_CHIP_DENOMINATIONS];
  }

  try {
    const raw = window.sessionStorage.getItem(CHIP_DENOMINATIONS_STORAGE_KEY);
    return raw ? normalizeChipDenominations(JSON.parse(raw)) : [...DEFAULT_CHIP_DENOMINATIONS];
  } catch (error) {
    console.warn("[RTN] unable to load chip denominations", error);
    return [...DEFAULT_CHIP_DENOMINATIONS];
  }
}

function persistChipDenominations() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      CHIP_DENOMINATIONS_STORAGE_KEY,
      JSON.stringify(chipDenominations)
    );
  } catch (error) {
    console.warn("[RTN] unable to persist chip denominations", error);
  }
}

function getChipToneIndex(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  if (numericValue <= 5) return 0;
  if (numericValue <= 15) return 1;
  if (numericValue <= 49) return 2;
  if (numericValue <= 99) return 3;
  if (numericValue <= 499) return 4;
  return 5;
}

function renderChipSelector() {
  if (!chipSelectorEl) return;

  chipSelectorEl.innerHTML = chipDenominations
    .map(
      (value) => `
        <button
          class="chip-choice"
          type="button"
          data-value="${value}"
          data-tone="${getChipToneIndex(value)}"
          role="radio"
          aria-checked="${value === selectedChip ? "true" : "false"}"
        >
          ${value}
        </button>
      `
    )
    .join("");

  chipButtons = Array.from(chipSelectorEl.querySelectorAll(".chip-choice"));
  chipButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const value = Number(button.dataset.value);
      if (!Number.isFinite(value)) return;
      setSelectedChip(value);
    });
  });

  updateChipSelectionUI();
}

function showChipEditorMessage(message = "") {
  if (!chipEditorMessage) return;
  chipEditorMessage.textContent = message;
  chipEditorMessage.hidden = !message;
}

function syncChipEditorFormValues(values = chipDenominations) {
  chipEditorInputs.forEach((input, index) => {
    input.value = String(values[index] ?? "");
  });
  showChipEditorMessage("");
}

function openChipEditorModal() {
  if (!chipEditorModal || !chipEditorModal.hidden) return;
  chipEditorModalTrigger =
    document.activeElement instanceof HTMLElement ? document.activeElement : chipRackEditButton;
  syncChipEditorFormValues(chipDenominations);
  chipEditorModal.hidden = false;
  chipEditorModal.classList.add("is-open");
  chipEditorModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  chipEditorInputs[0]?.focus();
}

function closeChipEditorModal({ restoreFocus = false } = {}) {
  if (!chipEditorModal) return;
  chipEditorModal.classList.remove("is-open");
  chipEditorModal.setAttribute("aria-hidden", "true");
  chipEditorModal.hidden = true;
  if (
    (!paytableModal || paytableModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  if (restoreFocus && chipEditorModalTrigger instanceof HTMLElement) {
    chipEditorModalTrigger.focus();
  }
  chipEditorModalTrigger = null;
}

function applyChipDenominations(values, { announce = true } = {}) {
  chipDenominations = normalizeChipDenominations(values);
  persistChipDenominations();
  if (!chipDenominations.includes(selectedChip)) {
    selectedChip = chipDenominations[0];
  }
  renderChipSelector();
  refreshBetControls();
  if (announce && statusEl && !dealing) {
    statusEl.textContent = `Chip rack updated to ${chipDenominations
      .map((value) => formatCurrency(value))
      .join(", ")} units.`;
  }
}

function handleChipEditorApply(values = chipEditorInputs.map((input) => input.value)) {
  const normalized = values.map((value) => Math.round(Number(value)));
  if (normalized.some((value) => !Number.isFinite(value) || value < 1)) {
    showChipEditorMessage("Enter four whole-number chip values greater than 0.");
    return false;
  }
  if (new Set(normalized).size !== 4) {
    showChipEditorMessage("Choose four different chip values.");
    return false;
  }
  applyChipDenominations(normalized);
  closeChipEditorModal({ restoreFocus: true });
  return true;
}

function formatPaytableSummary(table) {
  return table.steps.map((step) => `${step}×`).join(", ");
}

function updateActivePaytableUI({ announce = false } = {}) {
  paytableRadios.forEach((radio) => {
    radio.checked = radio.value === activePaytable.id;
    radio.setAttribute("aria-checked", String(radio.checked));
    const option = radio.closest(".paytable-option");
    if (option) {
      option.classList.toggle("selected", radio.checked);
    }
  });

  if (activePaytableNameEl) {
    activePaytableNameEl.textContent = activePaytable.name;
  }
  if (activePaytableStepsEl) {
    activePaytableStepsEl.textContent = formatPaytableSummary(activePaytable);
  }

  if (announce && statusEl && !dealing) {
    statusEl.textContent = `${activePaytable.name} selected. Ladder pays ${formatPaytableSummary(
      activePaytable
    )}.`;
  }
}

function setActivePaytable(id, { announce = false } = {}) {
  const next = getPaytableById(id);
  if (next.id === activePaytable.id) {
    updateActivePaytableUI({ announce });
    return;
  }
  activePaytable = next;
  pendingPaytableId = activePaytable.id;
  updateActivePaytableUI({ announce });
}

function updatePaytableAvailability() {
  const disabled = !bettingOpen;
  paytableRadios.forEach((radio) => {
    radio.disabled = disabled;
    radio.setAttribute("aria-disabled", String(disabled));
    const option = radio.closest(".paytable-option");
    if (option) {
      option.classList.toggle("option-disabled", disabled);
    }
  });

  if (changePaytableButton) {
    changePaytableButton.disabled = disabled;
    if (disabled) {
      changePaytableButton.setAttribute("aria-disabled", "true");
    } else {
      changePaytableButton.removeAttribute("aria-disabled");
    }
  }
}

function currentStepPays() {
  return activePaytable.steps;
}

function createDeck() {
  const deck = [];
  NUMBER_RANKS.forEach((rank) => {
    SUITS.forEach((suit) => {
      deck.push({
        rank,
        label: String(rank),
        suit: suit.symbol,
        color: suit.color,
        suitName: suit.name,
        stopper: false
      });
    });
  });

  ["J", "Q", "K"].forEach((face) => {
    SUITS.forEach((suit) => {
      deck.push({
        rank: face,
        label: face,
        suit: suit.symbol,
        color: suit.color === "red" ? "red" : "black",
        suitName: suit.name,
        stopper: true
      });
    });
  });

  deck.push({
    rank: "Joker",
    label: "Joker",
    suit: "★",
    color: "black",
    suitName: null,
    stopper: true
  });

  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function updateBankroll() {
  if (bankrollAnimating) {
    stopBankrollAnimation();
  }
  bankrollEl.textContent = formatCurrency(bankroll);
}

function updateDashboardCarterDisplay(value = carterCash) {
  if (!dashboardCarterEl) return;
  if (Number.isFinite(value)) {
    dashboardCarterEl.textContent = Number(value).toString();
  } else if (typeof value === "string") {
    dashboardCarterEl.textContent = value;
  } else {
    dashboardCarterEl.textContent = "0";
  }
}

function updateCarterCashDisplay() {
  if (carterCashEl) {
    const safeValue = Number.isFinite(carterCash) ? Math.max(0, Math.round(carterCash)) : 0;
    carterCashEl.textContent = formatCurrency(safeValue);
  }
  updateDashboardCarterDisplay(carterCash);
}

function handleCarterCashChanged() {
  updateCarterCashDisplay();
  updatePlayAssistantContext();
  syncCurrentModeShadowState();
}

function deductCarterCash(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  carterCash = Math.max(0, Math.round(carterCash - amount));
  handleCarterCashChanged();
}

function updateDashboardCreditsDisplay(value = bankroll) {
  if (!dashboardCreditsEl) return;
  if (Number.isFinite(value)) {
    dashboardCreditsEl.textContent = formatCurrency(Number(value));
  } else if (typeof value === "string") {
    dashboardCreditsEl.textContent = value;
  } else {
    dashboardCreditsEl.textContent = "0";
  }
}

async function persistBankroll({ recordContestHistory = false, contestHistoryLabel = "Hand" } = {}) {
  if (!currentUser) return;
  const normalizedBankroll = normalizeStoredCreditValue(bankroll);

  const updates = {};
  if (Number.isFinite(normalizedBankroll) && normalizedBankroll !== lastSyncedBankroll) {
    updates.credits = normalizedBankroll;
  }
  if (Number.isFinite(carterCash) && carterCash !== lastSyncedCarterCash) {
    updates.carter_cash = carterCash;
  }
  if (
    Number.isFinite(carterCashProgress) &&
    carterCashProgress !== lastSyncedCarterProgress
  ) {
    updates.carter_cash_progress = carterCashProgress;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  try {
    if (isContestAccountMode()) {
      const activeContest = getModeContest();
      const activeEntry = getModeContestEntry();
      if (!activeContest || !activeEntry) {
        throw new Error("Contest mode is unavailable.");
      }

      const contestSnapshot = {
        current_credits: Number.isFinite(normalizedBankroll) ? normalizedBankroll : 0,
        current_carter_cash: Number.isFinite(carterCash) ? carterCash : 0,
        current_carter_cash_progress: Number.isFinite(carterCashProgress) ? carterCashProgress : 0,
        contest_history: recordContestHistory
          ? buildContestHistory(activeEntry.contest_history, normalizedBankroll, contestHistoryLabel)
          : activeEntry.contest_history,
        display_name: getContestDisplayName(currentProfile, currentUser.id),
        participant_email: currentUser.email || ""
      };
      const { error: contestEntryError } = await supabase
        .from("contest_entries")
        .update(contestSnapshot)
        .eq("contest_id", activeContest.id)
        .eq("user_id", currentUser.id);
      if (contestEntryError) {
        throw contestEntryError;
      }

      lastSyncedBankroll = contestSnapshot.current_credits;
      lastSyncedCarterCash = contestSnapshot.current_carter_cash;
      lastSyncedCarterProgress = contestSnapshot.current_carter_cash_progress;

      const updatedEntry = {
        ...activeEntry,
        ...contestSnapshot
      };
      contestEntryMap.set(updatedEntry.contest_id, updatedEntry);
      userContestEntries = userContestEntries.map((entry) =>
        entry.contest_id === updatedEntry.contest_id ? updatedEntry : entry
      );
      if (currentContest?.id === updatedEntry.contest_id) {
        currentContestEntry = updatedEntry;
      }
    } else {
      const profileVersion = currentProfile?.updated_at ?? null;
      let profileUpdateQuery = supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUser.id);

      if (profileVersion) {
        profileUpdateQuery = profileUpdateQuery.eq("updated_at", profileVersion);
      }

      const { data, error } = await profileUpdateQuery
        .select("id, username, credits, carter_cash, carter_cash_progress, first_name, last_name, hands_played_all_time, contest_wins, current_rank_tier, current_rank_id, updated_at")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const nextCredits = Number.isFinite(Number(data.credits))
          ? normalizeStoredCreditValue(data.credits)
          : normalizedBankroll;
        const nextCarterCash = Number.isFinite(Number(data.carter_cash))
          ? Math.round(Number(data.carter_cash))
          : carterCash;
        const nextProgress = Number.isFinite(Number(data.carter_cash_progress))
          ? Number(data.carter_cash_progress)
          : carterCashProgress;

        lastSyncedBankroll = nextCredits;
        lastSyncedCarterCash = nextCarterCash;
        lastSyncedCarterProgress = nextProgress;

        if (bankroll !== nextCredits) {
          bankroll = nextCredits;
          handleBankrollChanged();
        }

        if (carterCash !== nextCarterCash) {
          carterCash = nextCarterCash;
          handleCarterCashChanged();
        }

        carterCashProgress = nextProgress;

        if (currentProfile) {
          currentProfile.credits = nextCredits;
          currentProfile.carter_cash = nextCarterCash;
          currentProfile.carter_cash_progress = nextProgress;
          currentProfile.updated_at = data.updated_at ?? currentProfile.updated_at;
        }
      } else {
        const latestProfile = await fetchProfileWithRetries(currentUser.id, {
          attempts: PROFILE_ATTEMPT_MAX,
          delayMs: PROFILE_RETRY_DELAY_MS,
          timeoutMs: PROFILE_FETCH_TIMEOUT_MS
        });
        if (latestProfile) {
          applyProfileCredits(latestProfile);
          void loadPersistentBankrollHistory({ force: true });
          return;
        }
      }
    }

    lastProfileSync = Date.now();
  } catch (error) {
    console.error("Unable to sync bankroll", error);
  }
}

function handleBankrollChanged() {
  updateBankroll();
  updateDashboardCreditsDisplay(bankroll);
  updatePlayAssistantContext();
  syncCurrentModeShadowState();
}

function renderHeaderFromProfile(profile) {
  if (!profile) {
    console.warn("[RTN] renderHeaderFromProfile called without a profile");
    return;
  }

  console.info(
    `[RTN] renderHeaderFromProfile updating header (bankroll=${profile.credits}, carterCash=${profile.carter_cash}, progress=${profile.carter_cash_progress})`
  );
  applyAccountSnapshot(profile);
}

function applyProfileCredits(profile, { resetHistory = false } = {}) {
  if (!profile) return null;
  console.info(
    `[RTN] applyProfileCredits storing profile ${profile.id} with credits=${profile.credits} carterCash=${profile.carter_cash}`
  );
  currentProfile = profile;
  lastProfileSync = Date.now();
  if (isContestAccountMode()) {
    updateModeSpecificModalCopy();
  } else {
    renderHeaderFromProfile(profile);
    if (resetHistory) {
      bankrollHistory = [bankroll];
      drawBankrollChart();
      bankrollInitialized = true;
    }
  }
  return currentProfile;
}

function getBetDefinition(key) {
  return betDefinitions.get(key);
}

function updateBetSpotTotals() {
  const totals = new Map(bets.map((bet) => [bet.key, bet.units]));
  betSpots.forEach(({ totalEl, button }, key) => {
    const total = totals.get(key) ?? 0;
    totalEl.textContent = formatCurrency(total);
    button.classList.toggle("has-bet", total > 0);
    const definition = getBetDefinition(key);
    const spokenLabel =
      definition?.type === "number"
        ? describeRank(definition.metadata?.rank ?? definition?.label ?? key)
        : definition?.label || key;
    const prefix = definition?.type === "number" ? `Bet on ${spokenLabel}` : `${spokenLabel} bet`;
    const ariaLabel =
      total > 0
        ? `${prefix}. Total wager ${formatCurrency(total)} units.`
        : `${prefix}. No chips placed.`;
    button.setAttribute("aria-label", ariaLabel);
  });
}

function addChipToSpot(key, value) {
  const spot = betSpots.get(key);
  if (!spot) return;
  const { stackEl } = spot;
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.dataset.value = value;
  chip.dataset.tone = String(getChipToneIndex(value));
  chip.textContent = value.toString();
  chip.setAttribute("aria-hidden", "true");
  const stackIndex = stackEl.children.length;
  chip.style.setProperty("--stack-index", stackIndex);
  chip.classList.add(`denom-${value}`);
  stackEl.appendChild(chip);
  requestAnimationFrame(() => {
    chip.classList.add("chip-enter");
  });
}

function clearChipStacks() {
  betSpots.forEach(({ stackEl, totalEl, button }) => {
    stackEl.innerHTML = "";
    totalEl.textContent = formatCurrency(0);
    button.classList.remove("has-bet");
  });
}

function setClearBetsDisabled(disabled) {
  clearBetsButtons.forEach((button) => {
    button.disabled = disabled;
    if (disabled) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
  });
}

function updateDealButtonState() {
  if (!dealButton) return;
  const canAdvanceManualHand = dealing && awaitingManualDeal;
  dealButton.textContent = canAdvanceManualHand ? "Deal Next Card" : "Deal Hand";
  dealButton.disabled = canAdvanceManualHand ? false : dealing || !bettingOpen || bets.length === 0;
}

function updateAutoDealToggleUI() {
  if (autoDealToggleInput) {
    autoDealToggleInput.checked = autoDealEnabled;
    autoDealToggleInput.setAttribute("aria-checked", String(autoDealEnabled));
    autoDealToggleInput.disabled = dealing;
  }
  if (autoDealToggleWrap) {
    autoDealToggleWrap.classList.toggle("is-active", autoDealEnabled);
    autoDealToggleWrap.classList.toggle("is-disabled", dealing);
  }
}

function refreshBetControls() {
  const intermission = dealing && awaitingManualDeal;
  const chipEnabled = bettingOpen || intermission;
  if (chipSelectorEl) {
    chipSelectorEl.classList.toggle("selector-disabled", !chipEnabled);
  }
  chipButtons.forEach((button) => {
    button.disabled = !chipEnabled;
    button.setAttribute("aria-disabled", String(!chipEnabled));
  });
  if (chipRackEditButton) {
    chipRackEditButton.disabled = dealing;
    chipRackEditButton.setAttribute("aria-disabled", String(dealing));
  }

  betSpotButtons.forEach((button) => {
    const key = button.dataset.betKey || button.dataset.rank;
    const definition = key ? getBetDefinition(key) : null;
    const canUseDuringIntermission = Boolean(
      intermission &&
      definition &&
      ["specific-card", "bust-suit", "bust-rank", "bust-joker"].includes(definition.type)
    );
    const disabled = bettingOpen ? false : !canUseDuringIntermission;

    button.disabled = disabled;
    button.setAttribute("aria-disabled", String(disabled));
  });

  setClearBetsDisabled(!bettingOpen || dealing || bets.length === 0);
}

function setBettingEnabled(enabled) {
  bettingOpen = enabled;
  refreshBetControls();
  updatePaytableAvailability();
}

function updateRebetButtonState() {
  if (!rebetButton) return;
  const hasLayout = lastBetLayout.length > 0;
  rebetButton.hidden = !hasLayout;
  const disabled = !hasLayout || dealing;
  rebetButton.disabled = disabled;
  rebetButton.setAttribute("aria-disabled", String(disabled));
  schedulePlayAreaHeightUpdate();
}

function updateChipSelectionUI() {
  chipButtons.forEach((button) => {
    const isSelected = Number(button.dataset.value) === selectedChip;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  });
}

function setSelectedChip(value, announce = true) {
  selectedChip = value;
  updateChipSelectionUI();
  if (announce && !dealing) {
    statusEl.textContent = `Selected ${formatCurrency(value)}-unit chip. Tap a bet spot to place chips.`;
  }
}

function renderBets() {
  betsBody.innerHTML = "";
  if (bets.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty";
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No bets placed.";
    row.appendChild(cell);
    betsBody.appendChild(row);
    updateDealButtonState();
    setClearBetsDisabled(true);
    updateBetSpotTotals();
    refreshBetControls();
    return;
  }

  bets.forEach((bet) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${bet.label}</td>
      <td>${bet.units}</td>
      <td>${bet.type === "number" ? bet.hits : "—"}</td>
      <td>${formatCurrency(bet.paid)}</td>
    `;
    betsBody.appendChild(row);
  });
  updateDealButtonState();
  setClearBetsDisabled(!bettingOpen);
  updateBetSpotTotals();
  refreshBetControls();
}

function resetBets() {
  bets = [];
  renderBets();
  clearChipStacks();
}

function addBet(key, units) {
  const definition = getBetDefinition(key);
  if (!definition) return null;

  let bet = bets.find((b) => b.key === key);
  if (bet) {
    bet.units += units;
    bet.chips.push(units);
  } else {
    bet = {
      key,
      type: definition.type,
      label: definition.label,
      units,
      hits: definition.type === "number" ? 0 : 0,
      paid: 0,
      chips: [units],
      metadata: { ...definition.metadata },
      rank: definition.metadata.rank ?? null
    };
    bets.push(bet);
  }
  bankroll -= units;
  handleBankrollChanged();
  renderBets();
  addChipToSpot(key, units);
  return bet;
}

function restoreUnits(units) {
  bankroll += units;
  handleBankrollChanged();
}

function resetBetCounters() {
  bets.forEach((bet) => {
    if (bet.type === "number") {
      bet.hits = 0;
    }
    bet.paid = 0;
  });
  renderBets();
}

function makeCardElement(card) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  const rankEl = node.querySelector(".card-rank");
  const suitEl = node.querySelector(".card-suit");
  rankEl.textContent = card.label;
  suitEl.textContent = card.suit;
  node.dataset.rank = card.label;

  const colorClass = card.color === "red" ? "card-red" : "card-black";
  node.classList.add(colorClass);

  if (card.stopper) {
    node.classList.add("stopper");
  }

  return node;
}

function setRedBlackStatus(message) {
  if (redBlackStatusEl) {
    redBlackStatusEl.textContent = String(message || "");
  }
}

function updateRedBlackActionState() {
  const selectionValid = isRedBlackSelectionValid();
  const handLocked = redBlackHandActive || redBlackSettlementPending;
  redBlackChipButtons.forEach((button) => {
    button.disabled = handLocked;
    button.setAttribute("aria-disabled", String(handLocked));
  });
  if (redBlackBetSpotButton) {
    const canAddToBet = !handLocked;
    redBlackBetSpotButton.disabled = !canAddToBet;
    redBlackBetSpotButton.setAttribute("aria-disabled", String(!canAddToBet));
  }
  if (redBlackClearBetButton) {
    const canClear = !handLocked && redBlackBet > 0;
    redBlackClearBetButton.disabled = !canClear;
    redBlackClearBetButton.classList.toggle("is-visible", canClear);
    redBlackClearBetButton.setAttribute("aria-hidden", String(!canClear));
    redBlackClearBetButton.tabIndex = canClear ? 0 : -1;
  }
  if (redBlackRebetButton) {
    redBlackRebetButton.disabled = handLocked || redBlackBet > 0 || redBlackLastBet <= 0;
  }
  if (redBlackDealButton) {
    redBlackDealButton.disabled = redBlackSettlementPending || redBlackBet <= 0 || !selectionValid;
  }
  if (redBlackWithdrawButton) {
    redBlackWithdrawButton.disabled =
      redBlackSettlementPending || !redBlackHandActive || redBlackRung <= 0 || redBlackCurrentPot <= 0;
  }
  redBlackCategoryButtons.forEach((button) => {
    const isActive = button.dataset.redBlackCategory === redBlackCategory;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderRedBlackSummary() {
  const handStarted = redBlackHandActive || redBlackRung > 0;
  const displayPot = handStarted ? redBlackCurrentPot : redBlackBet;
  const commissionRate = handStarted ? getGuess10CommissionRate() : 0;
  const commissionUnits = handStarted
    ? roundCurrencyValue(Math.max(0, redBlackCurrentPot - redBlackBet) * commissionRate)
    : 0;
  const nextPot = roundCurrencyValue(displayPot * getRedBlackPreviewMultiplier());
  if (redBlackBetSpotButton) {
    redBlackBetSpotButton.classList.toggle("is-empty", redBlackBet <= 0);
  }
  if (redBlackBetTotalEl) {
    redBlackBetTotalEl.textContent = formatCurrency(redBlackBet);
    redBlackBetTotalEl.hidden = redBlackBet <= 0;
  }
  if (redBlackPotTotalEl) {
    redBlackPotTotalEl.textContent = formatCurrency(displayPot);
  }
  if (redBlackPotCommissionEl) {
    redBlackPotCommissionEl.textContent = `(-${formatCurrency(commissionUnits)})`;
  }
  if (redBlackNextPotTotalEl) {
    redBlackNextPotTotalEl.textContent = formatCurrency(nextPot);
  }
  if (redBlackBetEmptyLabelEl) {
    redBlackBetEmptyLabelEl.hidden = redBlackBet > 0;
  }
  updateRedBlackMultiplierChip();
  if (redBlackCommissionDisplayEl) {
    redBlackCommissionDisplayEl.textContent = `${formatCurrency(commissionUnits)} (${Math.round(commissionRate * 100)}%)`;
  }
  renderRedBlackSelectionMeta();
  renderRedBlackBetStack();
}

function updateRedBlackMultiplierChip() {
  if (!redBlackMultiplierChipEl) return;
  const multiplierText = (formatRedBlackMultiplier(getRedBlackPreviewMultiplier()) || "0x").toUpperCase();
  redBlackMultiplierChipEl.textContent = `Multiplier ${multiplierText}`;
}

function handleGuess10BetSpotPress() {
  if (redBlackHandActive || redBlackSettlementPending) return;
  if (redBlackSelectedChip > bankroll) {
    setRedBlackStatus(`Not enough bankroll for a ${formatCurrency(redBlackSelectedChip)} unit chip.`);
    showToast("Not enough funds", "error");
    return;
  }
  bankroll = roundCurrencyValue(bankroll - redBlackSelectedChip);
  handleBankrollChanged();
  redBlackBet += redBlackSelectedChip;
  renderRedBlackSummary();
  updateRedBlackActionState();
  setRedBlackStatus(`Added ${formatCurrency(redBlackSelectedChip)} to the wager. Current bet: ${formatCurrency(redBlackBet)}.`);
}

function updateRedBlackPaytableHighlight() {
  const visualRung = Math.max(0, Math.min(redBlackRung, RED_BLACK_MAX_RUNGS));
  redBlackProgressSteps.forEach((row) => {
    const rung = Number(row.dataset.redBlackRung || 0);
    const isComplete = rung <= visualRung;
    const isCurrent = rung === visualRung && visualRung > 0;
    row.classList.toggle("is-complete", isComplete);
    row.classList.toggle("is-current", isCurrent);
  });
}

function ensureRedBlackDrawPlaceholder() {
  if (!redBlackDrawsEl) return;
  if (redBlackDrawsEl.children.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "beta-draw-placeholder";
    placeholder.textContent = "No cards drawn yet.";
    redBlackDrawsEl.appendChild(placeholder);
  }
}

function clearRedBlackDraws() {
  if (!redBlackDrawsEl) return;
  redBlackDrawsEl.innerHTML = "";
  ensureRedBlackDrawPlaceholder();
}

function clearRedBlackHistory() {
  if (!redBlackHistoryEl) return;
  redBlackHistoryEl.innerHTML = "";
  redBlackHandHistoryEntries = [];
}

function appendRedBlackHistoryEntry({ card, matched, multiplier, selectionLabel, potAfter = 0 }) {
  if (!redBlackHistoryEl) return;
  const item = document.createElement("li");
  const cardLabel = `${card?.label || ""}${card?.suit || ""}`;
  item.textContent = `${selectionLabel} · ${formatRedBlackMultiplier(multiplier)} · ${cardLabel} · ${matched ? "Hit" : "Miss"}`;
  redBlackHistoryEl.appendChild(item);
  redBlackHandHistoryEntries.push({
    card: card ? { ...card } : null,
    matched: Boolean(matched),
    multiplier,
    selectionLabel,
    potAfter: roundCurrencyValue(potAfter)
  });
}

function appendRedBlackCard(card) {
  if (!redBlackDrawsEl) return;
  const placeholder = redBlackDrawsEl.querySelector(".beta-draw-placeholder");
  placeholder?.remove();
  const cardEl = makeCardElement(card);
  redBlackDrawsEl.appendChild(cardEl);
  requestAnimationFrame(() => {
    cardEl.classList.add("dealt-in");
  });
  return cardEl;
}

function renderRedBlackChipRack() {
  redBlackChipButtons.forEach((button) => {
    const value = Number(button.dataset.redBlackChip || 0);
    const isSelected = value === redBlackSelectedChip;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderRedBlackSummary();
}

function getRedBlackSelectionConfig(category = redBlackCategory) {
  if (category === "color") {
    return {
      max: 1,
      values: [
        { key: "red", label: "Red", short: "RED" },
        { key: "black", label: "Black", short: "BLACK" }
      ]
    };
  }
  if (category === "suit") {
    return {
      max: 3,
      values: [
        { key: "hearts", label: "Hearts", short: "♥" },
        { key: "diamonds", label: "Diamonds", short: "♦" },
        { key: "clubs", label: "Clubs", short: "♣" },
        { key: "spades", label: "Spades", short: "♠" }
      ]
    };
  }
  return {
    max: 12,
    values: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => ({
      key: rank,
      label: rank,
      short: rank
    }))
  };
}

function isRedBlackSelectionValid() {
  const count = redBlackSelectedValues.length;
  if (redBlackCategory === "color") return count === 1;
  if (redBlackCategory === "suit") return count >= 1 && count <= 3;
  if (redBlackCategory === "rank") return count >= 1 && count <= 12;
  return false;
}

function getRedBlackMultiplier() {
  if (!isRedBlackSelectionValid()) return 0;
  if (redBlackCategory === "color") return 2;
  if (redBlackCategory === "suit") return 4 / redBlackSelectedValues.length;
  return 13 / redBlackSelectedValues.length;
}

function getRedBlackPreviewMultiplier() {
  if (redBlackCategory === "color") return 2;
  const count = Math.max(1, redBlackSelectedValues.length);
  if (redBlackCategory === "suit") return 4 / count;
  return 13 / count;
}

function formatRedBlackMultiplier(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "";
  return `${roundCurrencyValue(value)}x`;
}

function renderRedBlackValueSelector() {
  if (!redBlackValueSelectorEl) return;
  const config = getRedBlackSelectionConfig();
  redBlackValueSelectorEl.innerHTML = "";
  config.values.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary beta-value-button";
    button.dataset.redBlackValue = item.key;
    button.textContent = item.short;
    button.dataset.category = redBlackCategory;
    const isSelected = redBlackSelectedValues.includes(item.key);
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = redBlackSettlementPending;
    button.setAttribute("aria-disabled", String(redBlackSettlementPending));
    button.addEventListener("click", () => {
      if (redBlackSettlementPending) return;
      toggleGuess10Value(item.key);
    });
    redBlackValueSelectorEl.appendChild(button);
  });
}

function renderRedBlackSelectionMeta() {
  const count = redBlackSelectedValues.length;
  if (redBlackSelectionHintEl) {
    if (redBlackCategory === "color") {
      redBlackSelectionHintEl.textContent = "Pick exactly 1 color.";
    } else if (redBlackCategory === "suit") {
      redBlackSelectionHintEl.textContent = "Pick 1 to 3 suits.";
    } else {
      redBlackSelectionHintEl.textContent = "Pick 1 to 12 ranks.";
    }
  }
  if (redBlackSelectionSummaryEl) {
    if (redBlackCategory === "color") {
      redBlackSelectionSummaryEl.textContent = count === 1 ? "1 selected" : "Choose 1";
    } else if (redBlackCategory === "suit") {
      redBlackSelectionSummaryEl.textContent = `${count} / 3 selected`;
    } else {
      redBlackSelectionSummaryEl.textContent = `${count} / 12 selected`;
    }
  }
}

function renderRedBlackChipStack(stackEl, amount) {
  if (!stackEl) return;
  stackEl.innerHTML = "";
  if (amount <= 0) return;
  const chipsToRender = [];
  let remaining = amount;
  const orderedChips = [...RED_BLACK_CHIPS].sort((a, b) => b - a);

  orderedChips.forEach((value) => {
    while (remaining >= value && chipsToRender.length < 7) {
      chipsToRender.push(value);
      remaining -= value;
    }
  });

  if (remaining > 0 && chipsToRender.length < 7) {
    chipsToRender.push(remaining);
  }

  chipsToRender.forEach((value, index) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.value = String(value);
    chip.dataset.tone = String(getChipToneIndex(value));
    chip.textContent = String(value);
    chip.style.setProperty("--stack-index", String(index));
    chip.style.setProperty("--stack-shift", `${Math.min(index, 4) * 3}px`);
    chip.style.zIndex = String(index + 1);
    stackEl.appendChild(chip);
    requestAnimationFrame(() => {
      chip.classList.add("chip-enter");
    });
  });
}

function renderRedBlackBetStack() {
  renderRedBlackChipStack(redBlackChipStackEl, redBlackBet);
}

function resetGuess10Hand({ keepBet = true } = {}) {
  redBlackRung = 0;
  redBlackHandActive = false;
  redBlackAwaitingDecision = false;
  redBlackSettlementPending = false;
  redBlackDeck = [];
  redBlackCurrentPot = 0;
  redBlackCategory = "color";
  redBlackSelectedValues = ["red"];
  if (!keepBet) {
    redBlackBet = 0;
    redBlackLastBet = 0;
  }
  clearRedBlackDraws();
  clearRedBlackHistory();
  renderRedBlackValueSelector();
  renderRedBlackSummary();
  updateRedBlackPaytableHighlight();
  updateRedBlackActionState();
}

function finishGuess10Hand(message, { clearBet = false } = {}) {
  redBlackRung = 0;
  redBlackHandActive = false;
  redBlackAwaitingDecision = false;
  redBlackDeck = [];
  redBlackCurrentPot = 0;
  if (clearBet) {
    redBlackBet = 0;
  }
  setRedBlackStatus(message);
  renderRedBlackSummary();
  updateRedBlackPaytableHighlight();
  updateRedBlackActionState();
}

function resetSessionScopedGameplayState({
  reason = "session-change",
  resetRunTheNumbersStatus = false
} = {}) {
  console.info(`[RTN] resetting session-scoped gameplay state (${reason})`);
  resetBets();
  lastBetLayout = [];
  currentOpeningLayout = [];
  clearRecentHandHistory();
  resetTable(
    resetRunTheNumbersStatus ? "Select a chip and place your bets in the betting panel." : "",
    { clearDraws: true }
  );
  resetGuess10Hand({ keepBet: false });
  setRedBlackStatus("Build one base wager, choose COLOR, SUIT, or RANK, make your selection, then draw.");
}

async function finalizeGuess10Hand({
  completedBet,
  completedCards,
  drawnCards,
  handHistory,
  totalReturn,
  net,
  commissionKept = 0,
  stopperCard = null,
  result
}) {
  try {
    stats.hands += 1;
    stats.wagered += completedBet;
    stats.paid += totalReturn;
    updateStatsUI();
    animateBankrollOutcome(net);
    recordBankrollHistoryPoint();
    applyPlaythrough(completedBet);
    await persistBankroll({
      recordContestHistory: isContestAccountMode(),
      contestHistoryLabel: "Guess 10 Hand"
    });
    await incrementProfileHandProgress(1);
    await ensureProfileSynced({ force: true });
    await logStandaloneGameHand({
      gameKey: GAME_KEYS.GUESS_10,
      stopperCard,
      totalCards: completedCards,
      totalWager: completedBet,
      totalPaid: totalReturn,
      net,
      commissionKept
    });
    await logGameRun(net, {
      gameKey: GAME_KEYS.GUESS_10,
      totalCards: completedCards,
      totalWager: completedBet,
      totalPaid: totalReturn,
      result
    });
  } catch (error) {
    console.error(error);
    showToast("Could not record game run", "error");
  } finally {
    redBlackSettlementPending = false;
    renderRedBlackValueSelector();
    updateRedBlackActionState();
  }
}

async function dealGuess10Card() {
  if (redBlackBet <= 0 || !isRedBlackSelectionValid()) {
    return;
  }
  if (!canUseCurrentFundsForGame(GAME_KEYS.GUESS_10)) {
    const contest = getModeContest(currentAccountMode);
    setRedBlackStatus(`This contest bankroll can only be used for ${getContestGamesLabel(contest)}.`);
    showToast(`This contest bankroll can only be used for ${getContestGamesLabel(contest)}.`, "error");
    return;
  }
  if (!redBlackHandActive) {
    redBlackLastBet = redBlackBet;
    redBlackRung = 0;
    redBlackCurrentPot = redBlackBet;
    redBlackHandActive = true;
    clearRedBlackDraws();
    clearRedBlackHistory();
  }

  redBlackDeck = createRedBlackDeck();
  const nextCard = redBlackDeck.pop();
  if (!nextCard) {
    finishGuess10Hand("No cards left in the deck.", { clearBet: false });
    return;
  }

  const cardEl = appendRedBlackCard(nextCard);
  const multiplier = getRedBlackMultiplier();
  const selectionLabel = getGuess10SelectionLabel();

  const matched = doesGuess10CardMatch(nextCard);
  const nextPot = matched ? roundCurrencyValue(redBlackCurrentPot * multiplier) : 0;
  appendRedBlackHistoryEntry({ card: nextCard, matched, multiplier, selectionLabel, potAfter: nextPot });

  if (!matched) {
    const completedBet = redBlackBet;
    const completedCards = redBlackHistoryEl?.children.length || 1;
    const handHistory = redBlackHandHistoryEntries.map((entry) => ({
      ...entry,
      card: entry.card ? { ...entry.card } : null
    }));
    const drawnCards = handHistory.map((entry) => entry.card).filter(Boolean);
    redBlackSettlementPending = true;
    finishGuess10Hand(
      `${nextCard.label}${nextCard.suit} missed ${selectionLabel}. Hand over. Place a new wager to start again.`,
      { clearBet: true }
    );
    addHistoryEntry({
      gameKey: GAME_KEYS.GUESS_10,
      gameLabel: getGameLabel(GAME_KEYS.GUESS_10),
      drawnCards,
      handHistory,
      totalWager: completedBet,
      totalReturn: 0,
      net: -completedBet,
      commissionKept: 0
    });
    await finalizeGuess10Hand({
      completedBet,
      completedCards,
      drawnCards,
      handHistory,
      totalReturn: 0,
      net: -completedBet,
      commissionKept: 0,
      stopperCard: nextCard,
      result: "loss"
    });
    return;
  }

  redBlackCurrentPot = nextPot;
  redBlackRung += 1;
  if (cardEl) {
    cardEl.classList.add("card-match");
  }
  renderRedBlackSummary();
  updateRedBlackPaytableHighlight();
  const commissionRate = getGuess10CommissionRate();
  setRedBlackStatus(
    `${nextCard.label}${nextCard.suit} matched ${selectionLabel}. Pot is now ${formatCurrency(
      redBlackCurrentPot
    )}. Adjust your selection, draw again, or cash out. Current commission: ${formatPercent(commissionRate)} of winnings.`
  );
  updateRedBlackActionState();
}

function rebetGuess10Hand() {
  if (redBlackHandActive || redBlackSettlementPending || redBlackLastBet <= 0) {
    return;
  }
  if (redBlackLastBet > bankroll) {
    setRedBlackStatus(`Not enough bankroll to rebet ${formatCurrency(redBlackLastBet)}.`);
    return;
  }
  bankroll = roundCurrencyValue(bankroll - redBlackLastBet);
  handleBankrollChanged();
  redBlackBet = redBlackLastBet;
  redBlackCurrentPot = 0;
  renderRedBlackSummary();
  updateRedBlackActionState();
  setRedBlackStatus(`Rebet loaded for ${formatCurrency(redBlackBet)}. Choose your prediction and draw.`);
}

async function withdrawGuess10Hand() {
  if (redBlackSettlementPending || !redBlackHandActive || redBlackRung <= 0 || redBlackCurrentPot <= 0) {
    return;
  }
  const completedBet = redBlackBet;
  const completedCards = redBlackHistoryEl?.children.length || redBlackRung;
  const commissionRate = getGuess10CommissionRate();
  const winnings = Math.max(0, redBlackCurrentPot - redBlackBet);
  const commission = roundCurrencyValue(winnings * commissionRate);
  const payout = roundCurrencyValue(redBlackCurrentPot - commission);
  const handHistory = redBlackHandHistoryEntries.map((entry) => ({
    ...entry,
    card: entry.card ? { ...entry.card } : null
  }));
  const drawnCards = handHistory.map((entry) => entry.card).filter(Boolean);
  bankroll = roundCurrencyValue(bankroll + payout);
  handleBankrollChanged();
  redBlackSettlementPending = true;
  finishGuess10Hand(
    `You cashed out for ${formatCurrency(payout)} after a ${redBlackRung}-card streak. Commission: ${formatPercent(
      commissionRate
    )} on winnings (${formatCurrency(commission)}).`,
    { clearBet: true }
  );
  addHistoryEntry({
    gameKey: GAME_KEYS.GUESS_10,
    gameLabel: getGameLabel(GAME_KEYS.GUESS_10),
    drawnCards,
    handHistory,
    totalWager: completedBet,
    totalReturn: payout,
    net: roundCurrencyValue(payout - completedBet),
    commissionKept: commission
  });
  await finalizeGuess10Hand({
    completedBet,
    completedCards,
    drawnCards,
    handHistory,
    totalReturn: payout,
    net: roundCurrencyValue(payout - completedBet),
    commissionKept: commission,
    stopperCard: null,
    result: "cashout"
  });
}

function getGuess10CommissionRate() {
  return RED_BLACK_COMMISSION_BY_RUNG[Math.min(redBlackRung, RED_BLACK_MAX_RUNGS)] ?? 0;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function getGuess10SelectionLabel() {
  if (redBlackCategory === "color") {
    return redBlackSelectedValues[0].toUpperCase();
  }
  if (redBlackCategory === "suit") {
    return redBlackSelectedValues.map((value) => value.toUpperCase()).join(" + ");
  }
  return redBlackSelectedValues.join(" + ");
}

function doesGuess10CardMatch(card) {
  if (!card) return false;
  if (redBlackCategory === "color") {
    return redBlackSelectedValues.includes(card.color);
  }
  if (redBlackCategory === "suit") {
    const suitKey = SUITS.find((suit) => suit.symbol === card.suit)?.name.toLowerCase();
    return redBlackSelectedValues.includes(suitKey);
  }
  return redBlackSelectedValues.includes(card.label);
}

function setGuess10Category(category) {
  redBlackCategory = category;
  if (category === "color") {
    redBlackSelectedValues = ["red"];
  } else {
    redBlackSelectedValues = [];
  }
  renderRedBlackValueSelector();
  updateRedBlackMultiplierChip();
  renderRedBlackSummary();
  updateRedBlackActionState();
}

function toggleGuess10Value(value) {
  const config = getRedBlackSelectionConfig();
  if (redBlackCategory === "color") {
    redBlackSelectedValues = [value];
  } else if (redBlackSelectedValues.includes(value)) {
    redBlackSelectedValues = redBlackSelectedValues.filter((entry) => entry !== value);
  } else if (redBlackSelectedValues.length < config.max) {
    redBlackSelectedValues = [...redBlackSelectedValues, value];
  }
  renderRedBlackValueSelector();
  updateRedBlackMultiplierChip();
  renderRedBlackSummary();
  updateRedBlackActionState();
}

function roundCurrencyValue(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Number(Number(value).toFixed(2));
}

function normalizeStoredCreditValue(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Number(Number(value).toFixed(2)));
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatSignedCurrency(value) {
  const amount = Number(Number(value || 0).toFixed(2));
  if (amount > 0) {
    return `+${formatCurrency(amount)}`;
  }
  if (amount < 0) {
    return `-${formatCurrency(Math.abs(amount))}`;
  }
  return "0";
}

function formatSignedValue(value) {
  const amount = Number(Number(value || 0).toFixed(2));
  if (amount > 0) {
    return `+${formatCurrency(amount)}`;
  }
  if (amount < 0) {
    return `-${formatCurrency(Math.abs(amount))}`;
  }
  return "0";
}

const RED_BLACK_MAX_RUNGS = 10;
const RED_BLACK_CHIPS = [5, 10, 25, 100];
const RED_BLACK_COMMISSION_BY_RUNG = {
  1: 0.1,
  2: 0.09,
  3: 0.08,
  4: 0.07,
  5: 0.06,
  6: 0.05,
  7: 0.04,
  8: 0.03,
  9: 0.02,
  10: 0.01
};

function createRedBlackDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let value = 1; value <= 13; value += 1) {
      const label = value === 1 ? "A" : value === 11 ? "J" : value === 12 ? "Q" : value === 13 ? "K" : String(value);
      deck.push({
        label,
        suit: suit.symbol,
        color: suit.color,
        stopper: false,
        isJoker: false
      });
    }
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function getAnalyticsPeriodStart(period) {
  const now = Date.now();
  if (period === "hour") return new Date(now - 60 * 60 * 1000);
  if (period === "day") return new Date(now - 24 * 60 * 60 * 1000);
  if (period === "week") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === "month") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (period === "90days") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now - 365 * 24 * 60 * 60 * 1000);
  return null;
}

async function fetchGameHandsRecords({
  startAt = null,
  endAt = null,
  userIds = null,
  fields = ["user_id", "created_at", "game_id"]
} = {}) {
  const allRecords = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;
  let includeGameId = fields.includes("game_id");

  while (hasMore) {
    const selectFields = fields.filter((field) => field !== "game_id" || includeGameId).join(", ");
    let query = supabase
      .from("game_hands")
      .select(selectFields)
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (startAt) {
      query = query.gte("created_at", startAt.toISOString());
    }

    if (endAt) {
      query = query.lte("created_at", endAt.toISOString());
    }

    if (Array.isArray(userIds) && userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data, error } = await query;
    if (error) {
      if (includeGameId && isMissingColumnError(error, "game_id")) {
        includeGameId = false;
        page = 0;
        hasMore = true;
        allRecords.length = 0;
        continue;
      }
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    rows.forEach((row) => {
      allRecords.push({
        ...row,
        game_id: resolveGameKey(row?.game_id)
      });
    });

    hasMore = rows.length === pageSize;
    page += 1;
  }

  return allRecords;
}

function buildHandsChartBuckets(period, startDate, endDate = new Date()) {
  const start = new Date(startDate || endDate);
  const end = new Date(endDate);
  const buckets = [];

  if (period === "hour") {
    start.setSeconds(0, 0);
    const minuteBlock = Math.floor(start.getMinutes() / 5) * 5;
    start.setMinutes(minuteBlock, 0, 0);
    for (const current = new Date(start); current <= end; current = new Date(current.getTime() + 5 * 60 * 1000)) {
      const key = current.toISOString();
      buckets.push({
        key,
        label: formatAnalyticsDate(current, { hour: "numeric", minute: "2-digit" }),
        start: new Date(current),
        end: new Date(current.getTime() + 5 * 60 * 1000)
      });
    }
    return buckets;
  }

  if (period === "day") {
    start.setMinutes(0, 0, 0);
    for (const current = new Date(start); current <= end; current = new Date(current.getTime() + 60 * 60 * 1000)) {
      const key = current.toISOString();
      buckets.push({
        key,
        label: formatAnalyticsDate(current, { hour: "numeric" }),
        start: new Date(current),
        end: new Date(current.getTime() + 60 * 60 * 1000)
      });
    }
    return buckets;
  }

  start.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  for (const current = new Date(start); current <= last; current.setDate(current.getDate() + 1)) {
    const bucketStart = new Date(current);
    const bucketEnd = new Date(current);
    bucketEnd.setDate(bucketEnd.getDate() + 1);
    buckets.push({
      key: bucketStart.toISOString(),
      label: formatAnalyticsDate(bucketStart, { month: "short", day: "numeric" }),
      start: bucketStart,
      end: bucketEnd
    });
  }
  return buckets;
}

async function buildHandsByGameSeries(period, {
  startAt = null,
  endAt = new Date(),
  userIds = null
} = {}) {
  try {
    const data = await invokeAdminAnalytics("hands_timeseries", {
      period,
      startAt: startAt ? startAt.toISOString() : null,
      endAt: endAt.toISOString(),
      targetUserIds: Array.isArray(userIds) && userIds.length ? userIds : null
    });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if (rows.length) {
      return {
        labels: rows.map((row) => row.label || ""),
        datasets: [
          {
            key: GAME_KEYS.RUN_THE_NUMBERS,
            label: getGameLabel(GAME_KEYS.RUN_THE_NUMBERS),
            values: rows.map((row) => Number(row.runTheNumbersHands || 0))
          },
          {
            key: GAME_KEYS.GUESS_10,
            label: getGameLabel(GAME_KEYS.GUESS_10),
            values: rows.map((row) => Number(row.guess10Hands || 0))
          }
        ]
      };
    }
  } catch (error) {
    console.warn("[RTN] buildHandsByGameSeries edge fallback", error);
  }

  const records = await fetchGameHandsRecords({
    startAt,
    endAt,
    userIds,
    fields: ["user_id", "created_at", "game_id"]
  });

  const effectiveStart =
    startAt ||
    (records.length > 0 ? new Date(records[0].created_at) : new Date(endAt.getTime() - 29 * 24 * 60 * 60 * 1000));
  const buckets = buildHandsChartBuckets(period, effectiveStart, endAt);
  const seriesMap = new Map(
    Object.values(GAME_KEYS).map((gameKey) => [
      gameKey,
      {
        key: gameKey,
        label: getGameLabel(gameKey),
        values: new Array(buckets.length).fill(0)
      }
    ])
  );

  records.forEach((record) => {
    const createdAt = new Date(record.created_at);
    const bucketIndex = buckets.findIndex((bucket) => createdAt >= bucket.start && createdAt < bucket.end);
    if (bucketIndex < 0) return;
    const gameKey = resolveGameKey(record.game_id);
    const series = seriesMap.get(gameKey);
    if (!series) return;
    series.values[bucketIndex] += 1;
  });

  return {
    labels: buckets.map((bucket) => bucket.label),
    datasets: Array.from(seriesMap.values())
  };
}

function formatBankrollTickLabel(point, fallbackIndex, period = "all") {
  if (point?.created_at) {
    const date = new Date(point.created_at);
    if (!Number.isNaN(date.getTime())) {
      if (period === "hour") {
        return formatAnalyticsDate(date, {
          hour: "numeric",
          minute: "2-digit"
        });
      }
      if (period === "day") {
        return formatAnalyticsDate(date, {
          month: "short",
          day: "numeric",
          hour: "numeric"
        });
      }
      return formatAnalyticsDate(date, {
        month: "short",
        day: "numeric"
      });
    }
  }
  return String(fallbackIndex + 1);
}

function getFilteredBankrollHistoryPoints() {
  let source = persistentBankrollHistory.length
    ? persistentBankrollHistory
    : bankrollHistory.map((value, index) => ({
        value,
        created_at: null,
        fallbackIndex: index
      }));

  const startDate = getAnalyticsPeriodStart(bankrollChartPeriod);
  const filtered = startDate
    ? source.filter((point) => {
        if (!point?.created_at) return true;
        const createdAt = new Date(point.created_at);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= startDate;
      })
    : source;

  return filtered.length ? filtered : source.slice(-1);
}

function updateBankrollChartFilterUI() {
  bankrollChartFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.bankrollPeriod === bankrollChartPeriod);
  });

  if (!bankrollChartSubhead) return;

  const labels = {
    hour: "Showing normal-mode account value snapshots from the last hour.",
    day: "Showing normal-mode account value snapshots from the last 24 hours.",
    week: "Showing normal-mode bankroll history for the last week.",
    month: "Showing normal-mode bankroll history for the last month.",
    "90days": "Showing normal-mode bankroll history for the last 3 months.",
    year: "Showing normal-mode bankroll history for the last year."
  };

  bankrollChartSubhead.textContent = labels[bankrollChartPeriod] || labels.year;
}

function updateActivityFilterUI() {
  activityFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.activityPeriod === activityLeaderboardPeriod);
  });

  if (!mostActiveSubheadEl) return;

  const labels = {
    hour: "Ranked by hands played in the last hour.",
    day: "Ranked by hands played in the last 24 hours.",
    week: "Ranked by hands played in the last 7 days.",
    month: "Ranked by hands played in the last 30 days.",
    year: "Ranked by hands played in the last year."
  };

  mostActiveSubheadEl.textContent = labels[activityLeaderboardPeriod] || labels.week;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function waitWhilePaused() {
  if (!handPaused) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pauseResolvers.push(resolve);
  });
}

async function waitForManualDealAdvance() {
  awaitingManualDeal = true;
  setHandPaused(true);
  updateDealButtonState();
  await waitWhilePaused();
  awaitingManualDeal = false;
  updateDealButtonState();
}

async function waitForDealDelay() {
  let remaining = DEAL_DELAY;
  while (remaining > 0) {
    const slice = Math.min(DEAL_DELAY_STEP, remaining);
    await new Promise((resolve) => setTimeout(resolve, slice));
    remaining -= slice;
    if (handPaused) {
      await waitWhilePaused();
    }
  }
}

function drawBankrollChart() {
  if (!bankrollChartCanvas || !bankrollChartCtx) return;

  const historyPoints = getFilteredBankrollHistoryPoints();
  const values = historyPoints.length
    ? historyPoints.map((point) => Number(point?.value ?? bankroll))
    : [bankroll];
  const padding = {
    top: 28,
    right: 48,
    bottom: 64,
    left: 84
  };
  const minCanvasWidth = 240;

  if (bankrollChartWrapper) {
    const wrapperWidth = bankrollChartWrapper.clientWidth || minCanvasWidth;
    bankrollChartCanvas.style.width = `${Math.max(
      minCanvasWidth,
      Math.round(wrapperWidth)
    )}px`;
  }

  const rect = bankrollChartCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  bankrollChartCanvas.width = rect.width * dpr;
  bankrollChartCanvas.height = rect.height * dpr;

  const ctx = bankrollChartCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bankrollChartCanvas.width, bankrollChartCanvas.height);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const baseY = padding.top + chartHeight;

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const bodyStyles = getComputedStyle(document.body);
  const rootStyles = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) => {
    const raw = bodyStyles.getPropertyValue(name) || rootStyles.getPropertyValue(name);
    return raw && raw.trim() ? raw.trim() : fallback;
  };
  const chartBackground = cssVar("--chart-background", "rgba(6, 8, 26, 0.92)");
  const chartBgStart = cssVar("--chart-background-gradient-start", "rgba(255, 99, 224, 0.18)");
  const chartBgEnd = cssVar("--chart-background-gradient-end", "rgba(31, 241, 255, 0.16)");
  const chartGridColor = cssVar("--chart-grid-color", "rgba(31, 241, 255, 0.18)");
  const chartFillColor = cssVar("--chart-fill-color", "rgba(31, 241, 255, 0.18)");
  const chartFillFade = cssVar("--chart-fill-fade", "rgba(31, 241, 255, 0)");
  const chartLineColor = cssVar("--chart-line-color", "#1ff1ff");
  const chartLineShadow = cssVar("--chart-line-shadow", "rgba(139, 109, 255, 0.45)");
  const chartMarkerColor = cssVar("--chart-marker-color", "#ff63e0");
  const chartMarkerStroke = cssVar("--chart-marker-stroke", "rgba(248, 249, 255, 0.85)");
  const chartMarkerShadow = cssVar("--chart-marker-shadow", "rgba(255, 99, 224, 0.6)");
  const chartBaseLine = cssVar("--chart-base-line", "rgba(31, 241, 255, 0.35)");
  const chartAxisColor = cssVar("--chart-axis-color", "rgba(248, 249, 255, 0.85)");

  ctx.fillStyle = chartBackground;
  ctx.fillRect(0, 0, width, height);

  const backgroundGradient = ctx.createLinearGradient(0, 0, width, height);
  backgroundGradient.addColorStop(0, chartBgStart);
  backgroundGradient.addColorStop(1, chartBgEnd);
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = chartGridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 10]);
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (chartWidth * index) / (values.length - 1);
    const y = padding.top + chartHeight * (1 - (value - minVal) / range);
    return { x, y };
  });

  if (points.length >= 2) {
    const fillGradient = ctx.createLinearGradient(0, padding.top, 0, baseY);
    fillGradient.addColorStop(0, chartFillColor);
    fillGradient.addColorStop(1, chartFillFade);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, baseY);
    ctx.lineTo(points[0].x, baseY);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();
  }

  ctx.beginPath();
  if (points.length === 1) {
    const point = points[0];
    ctx.fillStyle = chartLineColor;
    ctx.shadowColor = chartLineShadow;
    ctx.shadowBlur = 12;
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.strokeStyle = chartLineColor;
    ctx.lineWidth = 2.8;
    ctx.shadowColor = chartLineShadow;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (points.length > 0) {
    const lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.fillStyle = chartMarkerColor;
    ctx.strokeStyle = chartMarkerStroke;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = chartMarkerShadow;
    ctx.shadowBlur = 12;
    ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.strokeStyle = chartBaseLine;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(padding.left, baseY);
  ctx.lineTo(width - padding.right, baseY);
  ctx.stroke();

  ctx.font = "600 12px 'Play', 'Segoe UI', sans-serif";
  ctx.fillStyle = chartAxisColor;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight * i) / 4;
    const valueLabel = minVal + (range * (4 - i)) / 4;
    ctx.fillText(formatCurrency(Math.round(valueLabel)), padding.left - 12, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (points.length > 0) {
    const tickIndices = [];
    const minSpacing = 48;
    let lastX = -Infinity;
    points.forEach((point, index) => {
      const isEdge = index === 0 || index === points.length - 1;
      if (isEdge || point.x - lastX >= minSpacing) {
        tickIndices.push(index);
        lastX = point.x;
      }
    });

    tickIndices.forEach((index) => {
      const point = points[index];
      ctx.fillText(formatBankrollTickLabel(historyPoints[index], index, bankrollChartPeriod), point.x, baseY + 8);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Hands tracked: ${Math.max(0, values.length)}`, padding.left, padding.top + 6);
}

function recordBankrollHistoryPoint() {
  bankrollHistory.push(bankroll);
  if (bankrollHistory.length > MAX_HISTORY_POINTS) {
    bankrollHistory = bankrollHistory.slice(-MAX_HISTORY_POINTS);
  }
  drawBankrollChart();
}

function resetBankrollHistory() {
  bankrollHistory = [bankroll];
  drawBankrollChart();
}

async function loadPersistentBankrollHistory({ force = false } = {}) {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id || !supabase) {
    persistentBankrollHistory = [];
    persistentBankrollUserId = null;
    updateBankrollChartFilterUI();
    drawBankrollChart();
    return;
  }

  if (!force && persistentBankrollUserId === currentUser.id && persistentBankrollHistory.length) {
    updateBankrollChartFilterUI();
    drawBankrollChart();
    return;
  }

  const allRuns = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("game_runs")
      .select("score, created_at, metadata")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("[RTN] loadPersistentBankrollHistory error", error);
      return;
    }

    if (Array.isArray(data) && data.length) {
      allRuns.push(...data);
      hasMore = data.length === pageSize;
      page += 1;
    } else {
      hasMore = false;
    }
  }

  const normalModeRuns = allRuns.filter((run) => {
    const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
    const accountMode = String(metadata?.account_mode || "").trim().toLowerCase();
    const contestId = metadata?.contest_id;
    const hasExplicitContestMode = accountMode === "contest";
    const isContestLinked = Boolean(contestId);
    const isNormalOrLegacyRun = !accountMode || accountMode === "normal";
    return isNormalOrLegacyRun && !isContestLinked && !hasExplicitContestMode;
  }).sort(compareRunsByResolvedAt);

  persistentBankrollHistory = normalModeRuns.map((run, index) => {
    const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
    const endingBankroll = Number(metadata?.ending_bankroll);
    if (!Number.isFinite(endingBankroll)) {
      return null;
    }

    return {
      value: Number(endingBankroll.toFixed(2)),
      created_at: getRunResolvedAt(run),
      fallbackIndex: index
    };
  }).filter(Boolean);

  persistentBankrollUserId = currentUser.id;
  updateBankrollChartFilterUI();
  drawBankrollChart();
}

async function loadGameRunsForUser(userId, { startAt = null } = {}) {
  const allRuns = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("game_runs")
      .select("score, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (startAt) {
      query = query.gte("created_at", startAt.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

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

function updatePauseButton() {
  if (!pausePlayButton) return;
  const shouldShow = advancedMode && dealing && autoDealEnabled;
  pausePlayButton.hidden = !shouldShow;
  if (!shouldShow) {
    pausePlayButton.setAttribute("aria-pressed", "false");
    pausePlayButton.textContent = "Pause";
    pausePlayButton.disabled = true;
    return;
  }
  pausePlayButton.disabled = false;
  pausePlayButton.textContent = handPaused ? "Resume" : "Pause";
  pausePlayButton.setAttribute("aria-pressed", String(handPaused));
}

function setHandPaused(paused) {
  if (handPaused === paused) return;
  handPaused = paused;
  if (!handPaused) {
    while (pauseResolvers.length) {
      const resolve = pauseResolvers.shift();
      if (resolve) {
        resolve();
      }
    }
  }
  updatePauseButton();
  refreshBetControls();
  updateDealButtonState();
  if (handPaused) {
    statusEl.textContent = awaitingManualDeal
      ? "Manual deal mode: place specific card or bust bets, then press Deal Next Card."
      : "Dealing paused. Place bust bets or resume play.";
  } else if (dealing) {
    statusEl.textContent = "Dealing...";
  }
}

function setAutoDealEnabled(enabled) {
  autoDealEnabled = enabled;
  updateAutoDealToggleUI();
  updatePauseButton();
  updateDealButtonState();
  if (!dealing) {
    statusEl.textContent = enabled
      ? "Auto Deal is on. Press Deal Hand to run the hand to completion."
      : "Auto Deal is off. Press Deal Hand to reveal one card at a time.";
  }
}

function setAdvancedMode(enabled) {
  if (advancedMode === enabled) return;
  advancedMode = enabled;

  if (advancedBetsSection) {
    if (enabled) {
      advancedBetsSection.hidden = false;
      advancedBetsSection.classList.add("is-open");
      advancedBetsSection.setAttribute("aria-hidden", "false");
    } else {
      advancedBetsSection.classList.remove("is-open");
      advancedBetsSection.setAttribute("aria-hidden", "true");
      advancedBetsSection.hidden = true;
    }
  }

  if (advancedToggleInput) {
    advancedToggleInput.checked = enabled;
    advancedToggleInput.setAttribute("aria-checked", String(enabled));
  }

  if (advancedToggleWrapper) {
    advancedToggleWrapper.classList.toggle("is-active", enabled);
  }

  document.body.classList.toggle("advanced-enabled", enabled);
  if (!enabled) {
    setHandPaused(false);
  }
  refreshBetControls();
  updatePauseButton();
  updateDealButtonState();
}

function stopBankrollAnimation(restoreDisplay = true) {
  if (bankrollAnimationFrame !== null) {
    cancelAnimationFrame(bankrollAnimationFrame);
    bankrollAnimationFrame = null;
  }
  if (bankrollDeltaTimeout !== null) {
    clearTimeout(bankrollDeltaTimeout);
    bankrollDeltaTimeout = null;
  }
  bankrollAnimating = false;
  if (bankrollEl) {
    bankrollEl.classList.remove(
      "bankroll-positive",
      "bankroll-negative",
      "bankroll-neutral",
      "bankroll-pulse"
    );
    if (restoreDisplay) {
      bankrollEl.textContent = formatCurrency(bankroll);
    }
  }
}

function stopCarterCashAnimation() {
  const clearFn = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
  if (carterCashDeltaTimeout !== null) {
    clearFn(carterCashDeltaTimeout);
    carterCashDeltaTimeout = null;
  }
  carterCashAnimating = false;
  if (carterCashEl) {
    carterCashEl.classList.remove("carter-cash-pulse");
  }
  if (carterCashDeltaEl) {
    carterCashDeltaEl.classList.remove("visible");
    carterCashDeltaEl.textContent = "";
  }
}

function animateCarterCashGain(amount) {
  if (!carterCashEl || amount <= 0) {
    return;
  }

  stopCarterCashAnimation();

  carterCashAnimating = true;
  carterCashEl.classList.remove("carter-cash-pulse");
  void carterCashEl.offsetWidth;
  carterCashEl.classList.add("carter-cash-pulse");

  if (carterCashDeltaEl) {
    carterCashDeltaEl.textContent = `+${formatCurrency(amount)}`;
    carterCashDeltaEl.classList.add("visible");
  }

  const timeoutFn = typeof window !== "undefined" ? window.setTimeout : setTimeout;
  carterCashDeltaTimeout = timeoutFn(() => {
    if (carterCashEl) {
      carterCashEl.classList.remove("carter-cash-pulse");
    }
    if (carterCashDeltaEl) {
      carterCashDeltaEl.classList.remove("visible");
      carterCashDeltaEl.textContent = "";
    }
    carterCashAnimating = false;
    carterCashDeltaTimeout = null;
  }, 1400);
}

function animateBankrollOutcome(delta) {
  if (!bankrollEl) return;

  stopBankrollAnimation(false);

  if (!Number.isFinite(delta)) {
    bankrollEl.textContent = formatCurrency(bankroll);
    return;
  }

  showHandOutcomeToast(delta);

  if (delta === 0) {
    bankrollAnimating = true;
    bankrollEl.classList.remove("bankroll-positive", "bankroll-negative");
    bankrollEl.classList.add("bankroll-neutral", "bankroll-pulse");
    bankrollDeltaTimeout = window.setTimeout(() => {
      if (bankrollEl) {
        bankrollEl.classList.remove("bankroll-neutral", "bankroll-pulse");
        bankrollEl.textContent = formatCurrency(bankroll);
      }
      bankrollAnimating = false;
      bankrollDeltaTimeout = null;
    }, 1200);
    return;
  }

  const finalValue = bankroll;
  const startValue = finalValue - delta;
  const directionClass = delta > 0 ? "bankroll-positive" : "bankroll-negative";

  bankrollAnimating = true;
  bankrollEl.classList.remove(
    delta > 0 ? "bankroll-negative" : "bankroll-positive",
    "bankroll-neutral"
  );
  bankrollEl.classList.add(directionClass, "bankroll-pulse");
  bankrollEl.textContent = formatCurrency(startValue);

  const duration = 900;
  const startTime = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    const currentValue = Math.round(startValue + (finalValue - startValue) * eased);
    bankrollEl.textContent = formatCurrency(currentValue);
    if (progress < 1) {
      bankrollAnimationFrame = requestAnimationFrame(step);
    } else {
      bankrollEl.textContent = formatCurrency(finalValue);
      bankrollAnimationFrame = null;
      bankrollAnimating = false;
      bankrollDeltaTimeout = window.setTimeout(() => {
        if (bankrollEl) {
          bankrollEl.classList.remove(directionClass, "bankroll-pulse");
        }
        bankrollDeltaTimeout = null;
      }, 1400);
    }
  }

  bankrollAnimationFrame = requestAnimationFrame(step);
}

function updateStatsUI() {
  handsPlayedEl.textContent = stats.hands.toString();
  totalWageredEl.textContent = formatCurrency(stats.wagered);
  totalPaidEl.textContent = formatCurrency(stats.paid);
  const hold = stats.wagered - stats.paid;
  holdEl.textContent = formatCurrency(hold);
  const edge = stats.wagered > 0 ? (hold / stats.wagered) * 100 : 0;
  houseEdgeEl.textContent = `${edge.toFixed(2)}%`;
}

function formatStopper({ label, suit }) {
  return label === "Joker" ? "Joker" : `${label}${suit}`;
}

function snapshotLayout(source) {
  return source.map((entry) => ({
    key: entry.key,
    chips: Array.isArray(entry.chips) ? [...entry.chips] : []
  }));
}

function layoutTotalUnits(layout) {
  return layout.reduce((sum, entry) => {
    const chips = entry.chips ?? [];
    return sum + chips.reduce((inner, value) => inner + value, 0);
  }, 0);
}

function applyBetLayout(layout) {
  bets = [];
  clearChipStacks();
  renderBets();
  const needsAdvanced = layout.some(({ key }) => {
    const definition = getBetDefinition(key);
    return definition && definition.type !== "number";
  });
  if (needsAdvanced) {
    setAdvancedMode(true);
  }
  layout.forEach(({ key, chips = [] }) => {
    chips.forEach((value) => addBet(key, value));
  });
}

function inferPlayAssistantRiskTolerance(text = "") {
  const normalized = String(text).toLowerCase();
  if (!normalized) return null;
  if (/(cautious|conservative|safe|small|low risk)/.test(normalized)) {
    return "cautious";
  }
  if (/(aggressive|high risk|press|bigger|swing|volatile)/.test(normalized)) {
    return "aggressive";
  }
  if (/(balanced|medium risk|moderate|middle)/.test(normalized)) {
    return "balanced";
  }
  return null;
}

function setPlayAssistantRiskTolerance(risk, { announce = false } = {}) {
  if (!PLAY_ASSISTANT_RISK_LABELS[risk]) {
    return;
  }
  playAssistantRiskTolerance = risk;
  updatePlayAssistantContext();
  if (announce) {
    pushPlayAssistantMessage({
      role: "system",
      text: `${PLAY_ASSISTANT_RISK_LABELS[risk]} risk mode saved. I’ll keep that preference in mind for future suggestions.`
    });
  }
}

function getCurrentPlayAssistantGameKey() {
  return getGameKeyForRoute(currentRoute) || GAME_KEYS.RUN_THE_NUMBERS;
}

function getPlayAssistantConfig(gameKey = getCurrentPlayAssistantGameKey()) {
  return PLAY_ASSISTANT_CONFIG[resolveGameKey(gameKey)] || PLAY_ASSISTANT_CONFIG[GAME_KEYS.RUN_THE_NUMBERS];
}

function updatePlayAssistantUiContent() {
  const config = getPlayAssistantConfig();
  if (playAssistantTitleEl) {
    playAssistantTitleEl.textContent = config.title || "Bankroll Coach";
  }
  playAssistantQuickActionButtons.forEach((button, index) => {
    const action = config.quickActions?.[index];
    if (!action) return;
    button.textContent = action.label || button.textContent;
    button.dataset.playAssistantPrompt = action.prompt || "";
  });
}

function getPlayAssistantBetCatalog() {
  return Array.from(betDefinitions.values()).map((definition) => ({
    key: definition.key,
    type: normalizeBetCatalogType(definition.type),
    label: definition.label,
    payout: definition.payout ?? null,
    payoutDisplay: definition.payoutDisplay ?? null,
    metadata: definition.metadata ?? {}
  }));
}

function calculateSequentialHitProbability(hitCount) {
  if (!Number.isFinite(hitCount) || hitCount <= 0) return 0;
  let probability = 1;
  for (let index = 0; index < hitCount; index += 1) {
    probability *= (4 - index) / (17 - index);
  }
  return probability;
}

function calculateExactHandLengthProbability(totalCards) {
  const length = Math.max(1, Math.round(Number(totalCards) || 0));
  if (length > 41) return 0;
  let probability = 1;
  for (let index = 0; index < length - 1; index += 1) {
    probability *= (40 - index) / (53 - index);
  }
  return probability * (13 / (54 - length));
}

function calculateAtLeastHandLengthProbability(totalCards) {
  const length = Math.max(1, Math.round(Number(totalCards) || 0));
  if (length <= 1) return 1;
  if (length > 41) return 0;
  let probability = 1;
  for (let index = 0; index < length - 1; index += 1) {
    probability *= (40 - index) / (53 - index);
  }
  return probability;
}

function calculateRunTheNumbersHouseEdge(definition, paytable = activePaytable) {
  if (!definition) return null;

  if (definition.type === "number") {
    const steps = Array.isArray(paytable?.steps) ? paytable.steps : [];
    const expectedPayout = steps.reduce(
      (sum, step, index) => sum + safeNumber(step) * calculateSequentialHitProbability(index + 1),
      0
    );
    return 1 - expectedPayout;
  }

  let winProbability = 0;
  switch (definition.type) {
    case "specific-card":
      winProbability = 1 / 53;
      break;
    case "bust-suit":
      winProbability = 3 / 13;
      break;
    case "bust-rank":
      winProbability = 4 / 13;
      break;
    case "bust-joker":
      winProbability = 1 / 13;
      break;
    case "suit-pattern":
      if (definition.metadata?.pattern === "none") {
        winProbability = 10 / 23;
      } else if (definition.metadata?.pattern === "any") {
        winProbability = 13 / 23;
      } else if (definition.metadata?.pattern === "first") {
        winProbability = 13 / 53;
      }
      break;
    case "count":
      if (definition.metadata?.countMax === Infinity) {
        winProbability = calculateAtLeastHandLengthProbability(definition.metadata?.countMin);
      } else {
        winProbability = calculateExactHandLengthProbability(definition.metadata?.countMin);
      }
      break;
    default:
      return null;
  }

  return 1 - ((safeNumber(definition.payout) + 1) * winProbability);
}

function formatAssistantPercent(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  return Number((Number(value) * 100).toFixed(digits));
}

function getPlayAssistantBetReference() {
  const catalog = Array.from(betDefinitions.values());
  const paytables = PAYTABLES.map((paytable) => ({
    id: paytable.id,
    name: paytable.name,
    steps: [...paytable.steps],
    numberBetHouseEdgePercent: formatAssistantPercent(
      calculateRunTheNumbersHouseEdge({ type: "number" }, paytable),
      3
    )
  }));

  return {
    deck: {
      totalCards: 53,
      liveCards: 40,
      stopperCards: 13
    },
    activePaytable: {
      id: activePaytable.id,
      name: activePaytable.name,
      steps: [...activePaytable.steps],
      numberBetHouseEdgePercent: formatAssistantPercent(
        calculateRunTheNumbersHouseEdge({ type: "number" }, activePaytable),
        3
      )
    },
    paytables,
    bets: catalog.map((definition) => {
      const shared = {
        key: definition.key,
        type: normalizeBetCatalogType(definition.type),
        label: definition.label,
        payout: definition.payout ?? null,
        payoutDisplay: definition.payoutDisplay ?? null,
        metadata: definition.metadata ?? {},
        payoutDependsOnPaytable: definition.type === "number",
        resolutionPool:
          definition.type === "specific-card"
            ? "full-deck"
            : definition.type === "bust-suit" || definition.type === "bust-rank" || definition.type === "bust-joker"
              ? "bust-card-only"
              : null
      };
      if (definition.type === "number") {
        return {
          ...shared,
          houseEdgeByPaytable: paytables.map((paytable) => ({
            id: paytable.id,
            name: paytable.name,
            houseEdgePercent: paytable.numberBetHouseEdgePercent
          }))
        };
      }
      return {
        ...shared,
        houseEdgePercent: formatAssistantPercent(calculateRunTheNumbersHouseEdge(definition), 3)
      };
    })
  };
}

function getGuess10AssistantReference() {
  return {
    deck: {
      totalCards: 52,
      liveCards: 52,
      stopperCards: 0
    },
    predictionCategories: [
      { key: "color", picksAllowed: "exactly 1", multiplierFormula: "2x" },
      { key: "suit", picksAllowed: "1 to 3", multiplierFormula: "4 / selectedSuits" },
      { key: "rank", picksAllowed: "1 to 12", multiplierFormula: "13 / selectedRanks" }
    ],
    commissionByRung: Array.from({ length: RED_BLACK_MAX_RUNGS }, (_, index) => {
      const rung = index + 1;
      return {
        rung,
        commissionPercent: Number((((RED_BLACK_COMMISSION_BY_RUNG[rung] ?? 0) * 100)).toFixed(2))
      };
    })
  };
}

function getGuess10AssistantTableState() {
  const handStarted = redBlackHandActive || redBlackRung > 0;
  return {
    wagerUnits: redBlackBet,
    currentPotUnits: handStarted ? redBlackCurrentPot : redBlackBet,
    rung: redBlackRung,
    handActive: redBlackHandActive,
    settlementPending: redBlackSettlementPending,
    category: redBlackCategory,
    selectedValues: [...redBlackSelectedValues],
    selectionLabel: getGuess10SelectionLabel(),
    multiplier: Number(getRedBlackPreviewMultiplier().toFixed(2)),
    commissionPercent: Number((getGuess10CommissionRate() * 100).toFixed(2)),
    canDraw: !redBlackSettlementPending && redBlackBet > 0 && isRedBlackSelectionValid(),
    canCashOut: !redBlackSettlementPending && redBlackHandActive && redBlackRung > 0 && redBlackCurrentPot > 0
  };
}

function buildPlayAssistantHandHistoryInsights(records = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const summarize = (rows) => {
    const handCount = rows.length;
    const totals = rows.reduce(
      (acc, row) => {
        const cards = Math.max(0, Math.round(safeNumber(row?.total_cards)));
        const wager = safeNumber(row?.total_wager);
        const paid = safeNumber(row?.total_paid);
        const net = safeNumber(row?.net);
        const stopperKey = row?.stopper_label === "Joker"
          ? "Joker"
          : [row?.stopper_label, row?.stopper_suit].filter(Boolean).join(" ");
        acc.totalCards += cards;
        acc.totalWager += wager;
        acc.totalPaid += paid;
        acc.totalNet += net;
        if (net > 0) {
          acc.profitable += 1;
        } else if (net < 0) {
          acc.unprofitable += 1;
        } else {
          acc.breakEven += 1;
        }
        if (cards > 8) {
          acc.over8 += 1;
        }
        if (cards > 0) {
          acc.distribution[String(cards)] = (acc.distribution[String(cards)] || 0) + 1;
        }
        if (stopperKey) {
          acc.stopperBreakdown[stopperKey] = (acc.stopperBreakdown[stopperKey] || 0) + 1;
        }
        return acc;
      },
      {
        totalCards: 0,
        totalWager: 0,
        totalPaid: 0,
        totalNet: 0,
        profitable: 0,
        unprofitable: 0,
        breakEven: 0,
        over8: 0,
        distribution: {},
        stopperBreakdown: {}
      }
    );

    return {
      handCount,
      averageCards: handCount ? Number((totals.totalCards / handCount).toFixed(2)) : 0,
      averageWager: handCount ? Number((totals.totalWager / handCount).toFixed(2)) : 0,
      averageReturn: handCount ? Number((totals.totalPaid / handCount).toFixed(2)) : 0,
      averageNet: handCount ? Number((totals.totalNet / handCount).toFixed(2)) : 0,
      profitableHandsCount: totals.profitable,
      profitableHandsPercent: handCount ? Number(((totals.profitable / handCount) * 100).toFixed(2)) : 0,
      losingHandsCount: totals.unprofitable,
      losingHandsPercent: handCount ? Number(((totals.unprofitable / handCount) * 100).toFixed(2)) : 0,
      breakEvenHandsCount: totals.breakEven,
      breakEvenHandsPercent: handCount ? Number(((totals.breakEven / handCount) * 100).toFixed(2)) : 0,
      over8CardsCount: totals.over8,
      over8CardsPercent: handCount ? Number(((totals.over8 / handCount) * 100).toFixed(2)) : 0,
      handLengthDistribution: totals.distribution,
      stopperBreakdown: totals.stopperBreakdown
    };
  };

  const recent = [...safeRecords]
    .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
    .slice(0, PLAY_ASSISTANT_HISTORY_LIMIT);

  return {
    allTime: summarize(safeRecords),
    last100: summarize(recent),
    recentHands: recent.slice(0, 20).map((row) => ({
      createdAt: row?.created_at || null,
      totalCards: Math.max(0, Math.round(safeNumber(row?.total_cards))),
      stopper: row?.stopper_label === "Joker"
        ? "Joker"
        : [row?.stopper_label, row?.stopper_suit].filter(Boolean).join(" "),
      totalWager: safeNumber(row?.total_wager),
      totalPaid: safeNumber(row?.total_paid),
      net: safeNumber(row?.net)
    }))
  };
}

function buildPlayAssistantBetHistoryInsights(records = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const normalized = safeRecords
    .map((row) => {
      const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
      const amountWagered = safeNumber(row?.amount_wagered);
      const amountPaid = safeNumber(row?.amount_paid);
      const net = safeNumber(row?.net, amountPaid - amountWagered);
      return {
        createdAt: row?.placed_at || row?.created_at || null,
        handId: row?.hand_id || null,
        betKey: row?.bet_key || raw?.key || "",
        label: raw?.label || row?.bet_key || "Unknown Bet",
        type: raw?.type || null,
        amountWagered,
        amountPaid,
        net,
        outcome: row?.outcome || (amountPaid > 0 ? "W" : amountPaid < amountWagered ? "L" : "P"),
        handNet: safeNumber(row?.hand_net),
        handTotalCards: Math.max(0, Math.round(safeNumber(row?.hand_total_cards))),
        stopper: row?.hand_stopper_label === "Joker"
          ? "Joker"
          : [row?.hand_stopper_label, row?.hand_stopper_suit].filter(Boolean).join(" "),
        raw
      };
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return {
    totalBets: normalized.length,
    recentBets: normalized.slice(0, 100)
  };
}

async function fetchBetPlayRecords({ userId, limit = 1000 } = {}) {
  if (!userId || !supabase) return [];
  const allRecords = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore && allRecords.length < limit) {
    const { data, error } = await supabase
      .from("bet_plays")
      .select("user_id, hand_id, bet_key, amount_wagered, amount_paid, outcome, net, raw, placed_at")
      .eq("user_id", userId)
      .order("placed_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    allRecords.push(...rows);
    hasMore = rows.length === pageSize && allRecords.length < limit;
    page += 1;
  }

  return allRecords.slice(0, limit);
}

async function loadPlayAssistantHandHistoryInsights({
  force = false,
  gameKey = getCurrentPlayAssistantGameKey()
} = {}) {
  if (!currentUser?.id || currentUser.id === GUEST_USER.id || !supabase) {
    return null;
  }

  const now = Date.now();
  if (
    !force &&
    playAssistantHistoryCache.userId === currentUser.id &&
    playAssistantHistoryCache.gameKey === gameKey &&
    playAssistantHistoryCache.insights &&
    now - playAssistantHistoryCache.fetchedAt < PLAY_ASSISTANT_HISTORY_CACHE_MS
  ) {
    return playAssistantHistoryCache.insights;
  }

  try {
    const records = await fetchGameHandsRecords({
      userIds: [currentUser.id],
      fields: ["id", "user_id", "created_at", "game_id", "total_cards", "stopper_label", "stopper_suit", "total_wager", "total_paid", "net"]
    });
    const gameRecords = records.filter((row) => resolveGameKey(row?.game_id) === gameKey);
    const handHistory = buildPlayAssistantHandHistoryInsights(gameRecords);
    let insights = handHistory;

    if (gameKey === GAME_KEYS.RUN_THE_NUMBERS) {
      const handMap = new Map(gameRecords.map((row) => [String(row?.id || ""), row]));
      const betRecords = await fetchBetPlayRecords({ userId: currentUser.id, limit: 2000 });
      const enrichedBetRecords = betRecords
        .map((row) => {
          const hand = handMap.get(String(row?.hand_id || ""));
          if (!hand) return null;
          return {
            ...row,
            hand_total_cards: hand?.total_cards ?? null,
            hand_stopper_label: hand?.stopper_label ?? null,
            hand_stopper_suit: hand?.stopper_suit ?? null,
            hand_net: hand?.net ?? null,
            created_at: hand?.created_at ?? null
          };
        })
        .filter(Boolean);
      insights = {
        ...handHistory,
        betHistory: buildPlayAssistantBetHistoryInsights(enrichedBetRecords)
      };
    }
    playAssistantHistoryCache = {
      userId: currentUser.id,
      gameKey,
      fetchedAt: now,
      insights
    };
    return insights;
  } catch (error) {
    console.warn("[RTN] unable to load play assistant hand history", error);
    return null;
  }
}

async function getPlayAssistantState() {
  const gameKey = getCurrentPlayAssistantGameKey();
  const config = getPlayAssistantConfig(gameKey);
  const handHistory = await loadPlayAssistantHandHistoryInsights({ gameKey });

  if (gameKey === GAME_KEYS.GUESS_10) {
    const outstanding = Math.max(0, Number(redBlackBet || 0));
    return {
      gameKey,
      gameLabel: getGameLabel(gameKey),
      bankroll,
      carterCash,
      riskTolerance: playAssistantRiskTolerance,
      accountMode: {
        key: getAccountModeValue(),
        label: getAccountModeLabel(),
        contest: isContestAccountMode()
          ? {
              id: currentAccountMode.contestId,
              title: getModeContest()?.title ?? "Contest Mode"
            }
          : null
      },
      betting: {
        canPlaceBets: !redBlackSettlementPending,
        dealing: redBlackSettlementPending,
        outstandingUnits: outstanding,
        availableUnits: bankroll,
        totalExposureUnits: bankroll + outstanding,
        currentBets: outstanding > 0
          ? [{
              key: `guess10-${redBlackCategory}`,
              label: `${getGuess10SelectionLabel()} (${redBlackCategory})`,
              units: outstanding,
              type: redBlackCategory
            }]
          : []
      },
      stats: null,
      rulesSummary: config.rulesSummary,
      betCatalog: [],
      gameReference: getGuess10AssistantReference(),
      tableState: getGuess10AssistantTableState(),
      handHistory
    };
  }

  const outstanding = bets.reduce((sum, bet) => sum + Math.max(0, Number(bet.units ?? 0)), 0);
  return {
    gameKey,
    gameLabel: getGameLabel(gameKey),
    bankroll,
    carterCash,
    riskTolerance: playAssistantRiskTolerance,
    selectedChip,
    activePaytable: {
      id: activePaytable.id,
      name: activePaytable.name,
      steps: [...activePaytable.steps]
    },
    accountMode: {
      key: getAccountModeValue(),
      label: getAccountModeLabel(),
      contest: isContestAccountMode()
        ? {
            id: currentAccountMode.contestId,
            title: getModeContest()?.title ?? "Contest Mode"
          }
        : null
    },
    betting: {
      canPlaceBets: !dealing,
      dealing,
      outstandingUnits: outstanding,
      availableUnits: bankroll,
      totalExposureUnits: bankroll + outstanding,
      currentBets: bets.map((bet) => ({
        key: bet.key,
        label: bet.label,
        units: bet.units,
        type: bet.type
      }))
    },
    stats: {
      hands: stats.hands,
      wagered: stats.wagered,
      paid: stats.paid
    },
    rulesSummary: config.rulesSummary,
    betCatalog: getPlayAssistantBetCatalog(),
    gameReference: getPlayAssistantBetReference(),
    tableState: null,
    handHistory
  };
}

function updatePlayAssistantContext() {
  if (!playAssistantContextEl) return;
  playAssistantContextEl.textContent = "";
  updatePlayAssistantUiContent();
}

function escapeAssistantHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAssistantMessageHtml(text) {
  const safeText = String(text ?? "").trim();
  if (!safeText) {
    return "<p></p>";
  }

  const blocks = safeText.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));
      if (bulletLines.length === lines.length && bulletLines.length > 0) {
        const items = bulletLines
          .map((line) => `<li>${escapeAssistantHtml(line.replace(/^[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeAssistantHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function createPlayAssistantMessageId() {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushPlayAssistantMessage(message) {
  playAssistantThread.push({
    id: message.id || createPlayAssistantMessageId(),
    role: message.role || "assistant",
    text: message.text || "",
    plan: message.plan ? { ...message.plan } : null,
    loading: Boolean(message.loading),
    timestamp: Date.now()
  });
  if (playAssistantThread.length > PLAY_ASSISTANT_MAX_HISTORY) {
    playAssistantThread = playAssistantThread.slice(-PLAY_ASSISTANT_MAX_HISTORY);
  }
  renderPlayAssistantThread();
}

function setPlayAssistantLoading(loading) {
  playAssistantRequestInFlight = loading;
  if (playAssistantSendButton) {
    playAssistantSendButton.disabled = loading;
    playAssistantSendButton.classList.toggle("is-loading", loading);
    playAssistantSendButton.setAttribute(
      "aria-label",
      loading ? "Sending message" : "Send message"
    );
  }
  if (playAssistantInput) {
    playAssistantInput.disabled = loading;
  }

  const lastMessage = playAssistantThread[playAssistantThread.length - 1];
  if (loading) {
    if (!lastMessage || !lastMessage.loading) {
      pushPlayAssistantMessage({
        role: "assistant",
        text: "Thinking through your table state...",
        loading: true
      });
    }
    return;
  }

  if (lastMessage?.loading) {
    playAssistantThread.pop();
    renderPlayAssistantThread();
  }
}

function updatePlayAssistantQuickActionsVisibility() {
  if (!playAssistantQuickActionsEl) return;
  const hasStartedConversation = playAssistantThread.some(
    (message) => !message.loading && message.role === "user"
  );
  playAssistantQuickActionsEl.hidden = hasStartedConversation;
  playAssistantQuickActionsEl.classList.toggle("is-hidden", hasStartedConversation);
  playAssistantQuickActionsEl.setAttribute("aria-hidden", String(hasStartedConversation));
}

function renderPlayAssistantThread() {
  if (!playAssistantThreadEl) return;
  playAssistantThreadEl.innerHTML = "";

  playAssistantThread.forEach((message) => {
    const article = document.createElement("article");
    article.className = `play-assistant-message${message.loading ? " is-loading" : ""}`;
    article.dataset.role = message.role;

    const roleLabel =
      message.role === "user" ? "You" : message.role === "system" ? "Table Note" : "Assistant";

    article.innerHTML = `
      <div class="play-assistant-message-meta">
        <span>${roleLabel}</span>
        <span>${new Date(message.timestamp).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        })}</span>
      </div>
      <div class="play-assistant-message-body">${formatAssistantMessageHtml(message.text)}</div>
    `;

    if (message.plan?.bets?.length) {
      const planWrap = document.createElement("div");
      planWrap.className = "play-assistant-plan";
      const listItems = message.plan.bets
        .map(
          (bet) =>
            `<li><strong>${escapeAssistantHtml(bet.label || bet.key)}</strong><span>${formatCurrency(
              Number(bet.units || 0)
            )} units</span></li>`
        )
        .join("");
      planWrap.innerHTML = `
        <p class="play-assistant-plan-summary">${escapeAssistantHtml(
          message.plan.summary || "Suggested betting layout"
        )}</p>
        <ul class="play-assistant-plan-list">${listItems}</ul>
        <div class="play-assistant-plan-actions">
          <span class="play-assistant-plan-total">Total ${formatCurrency(
            Number(message.plan.totalUnits || 0)
          )} units</span>
          <button type="button" class="primary play-assistant-apply" data-plan-id="${escapeAssistantHtml(
            message.id
          )}" ${message.plan.applied ? "disabled" : ""}>
            ${message.plan.applied ? "Placed" : "Place these bets"}
          </button>
        </div>
      `;
      article.appendChild(planWrap);
    }

    playAssistantThreadEl.appendChild(article);
  });

  playAssistantThreadEl.scrollTop = playAssistantThreadEl.scrollHeight;
  updatePlayAssistantQuickActionsVisibility();
}

function togglePlayAssistant(open = !playAssistantOpen) {
  playAssistantOpen = Boolean(open);
  if (typeof document !== "undefined") {
    document.body.classList.toggle("play-assistant-open", playAssistantOpen);
  }
  if (playAssistantPanel) {
    updatePlayAssistantBounds();
    playAssistantPanel.hidden = !playAssistantOpen;
    playAssistantPanel.setAttribute("aria-hidden", String(!playAssistantOpen));
  }
  if (playAssistantToggle) {
    playAssistantToggle.hidden =
      !["run-the-numbers", "red-black"].includes(currentRoute) || playAssistantOpen;
    playAssistantToggle.setAttribute("aria-expanded", String(playAssistantOpen));
  }
  if (playAssistantOpen && playAssistantInput) {
    playAssistantInput.focus();
  }
}

function updatePlayAssistantVisibility() {
  updatePlayAssistantUiContent();
  const shouldShow = currentRoute === "run-the-numbers" || currentRoute === "red-black";
  if (shouldShow) {
    ensurePlayAssistantThreadMatchesCurrentGame();
  }
  if (playAssistantToggle) {
    playAssistantToggle.hidden = !shouldShow || playAssistantOpen;
  }
  if (!shouldShow) {
    togglePlayAssistant(false);
  }
}

function resetPlayAssistantDraft() {
  if (!playAssistantInput) return;
  playAssistantInput.value = "";
}

function ensurePlayAssistantThreadMatchesCurrentGame() {
  const gameKey = getCurrentPlayAssistantGameKey();
  if (playAssistantThreadGameKey && playAssistantThreadGameKey !== gameKey) {
    playAssistantThread = [];
    playAssistantPendingPlan = null;
    renderPlayAssistantThread();
  }
  playAssistantThreadGameKey = gameKey;
}

function serializePlayAssistantMessages() {
  return playAssistantThread
    .filter((message) => !message.loading)
    .slice(-8)
    .map((message) => ({
      role: message.role === "system" ? "assistant" : message.role,
      content: message.text
    }));
}

function buildAssistantChipBreakdown(units) {
  let remaining = Math.round(Number(units));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return null;
  }
  const chips = [];
  const ordered = [...new Set([...chipDenominations, ASSISTANT_SHADOW_DENOMINATION])].sort(
    (a, b) => b - a
  );
  ordered.forEach((value) => {
    while (remaining >= value) {
      chips.push(value);
      remaining -= value;
    }
  });
  return remaining === 0 ? chips : null;
}

function normalizeAssistantPlan(plan) {
  if (getCurrentPlayAssistantGameKey() !== GAME_KEYS.RUN_THE_NUMBERS) {
    return null;
  }
  if (!plan || !Array.isArray(plan.bets) || !plan.bets.length) {
    return null;
  }

  const normalizedBets = [];
  for (const candidate of plan.bets) {
    const key = String(candidate?.key || "").trim();
    const definition = getBetDefinition(key);
    const units = Math.round(Number(candidate?.units ?? 0));
    if (!definition || !Number.isFinite(units) || units <= 0) {
      continue;
    }
    const chips = buildAssistantChipBreakdown(units);
    if (!chips) {
      continue;
    }
    normalizedBets.push({
      key,
      label: definition.label,
      units,
      chips
    });
  }

  if (!normalizedBets.length) {
    return null;
  }

  return {
    summary: String(plan.summary || "").trim(),
    replaceExisting: plan.replaceExisting !== false,
    bets: normalizedBets,
    totalUnits: normalizedBets.reduce((sum, bet) => sum + bet.units, 0)
  };
}

function normalizeAssistantBetPhrase(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAssistantUnits(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!raw) return NaN;
  const match = raw.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return NaN;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return NaN;
  const multiplier = match[2] === "m" ? 1000000 : match[2] === "k" ? 1000 : 1;
  return Math.round(base * multiplier);
}

function resolveAssistantBetTarget(targetText) {
  const normalized = normalizeAssistantBetPhrase(targetText);
  if (!normalized) {
    return null;
  }

  for (const definition of betDefinitions.values()) {
    if (normalizeAssistantBetPhrase(definition.label) === normalized) {
      return definition;
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
        /\b(?:8|eight)\s*(?:plus|\+|or more)\s*cards?\b|\b(?:8|eight)\s+cards?\s+(?:or more|plus)\b|\bat least\s+(?:8|eight)\s+cards?\b|\bover\s+7\s+cards?\b/,
      key: "count-8"
    }
  ];
  for (const { pattern, key } of countPatterns) {
    if (pattern.test(normalized)) {
      return getBetDefinition(key) || null;
    }
  }

  const numberMatch = normalized.match(/\b(?:number\s+)?(ace|a|[2-9]|10)\b/);
  if (numberMatch) {
    const rank = numberMatch[1] === "ace" || numberMatch[1] === "a" ? "A" : numberMatch[1];
    return getBetDefinition(`number-${rank}`) || null;
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
    const suitMap = {
      hearts: "♥",
      diamonds: "♦",
      clubs: "♣",
      spades: "♠"
    };
    return getBetDefinition(`card-${rank}${suitMap[suitName]}`) || null;
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
      return getBetDefinition(`${keyPrefix}${suitName}`) || null;
    }
  }

  const bustSuitMatch = normalized.match(/\b(?:bust|stop(?:per)?|end)\s+(?:on\s+)?(hearts|diamonds|clubs|spades)\b/);
  if (bustSuitMatch) {
    return getBetDefinition(`bust-${bustSuitMatch[1]}`) || null;
  }

  const bustRankMatch = normalized.match(/\b(?:bust|stop(?:per)?|end)\s+(jack|queen|king|joker)\b/);
  if (bustRankMatch) {
    const face = bustRankMatch[1];
    return getBetDefinition(face === "joker" ? "bust-joker" : `bust-${face}`) || null;
  }

  const aliasChecks = [
    { test: /\b(?:8plus|8 plus|8\+)\s*cards?\b/, key: "count-8" },
    { test: /\bjoker\b/, key: "bust-joker" }
  ];
  for (const alias of aliasChecks) {
    if (alias.test.test(normalized)) {
      return getBetDefinition(alias.key) || null;
    }
  }

  return null;
}

function resolveAssistantBetTargets(targetText, state) {
  const normalized = normalizeAssistantBetPhrase(targetText);
  const catalog = Array.isArray(state?.betCatalog) ? state.betCatalog : getPlayAssistantBetCatalog();
  if (!normalized) {
    return [];
  }

  const categoryMatchers = [
    {
      pattern: /\b(?:every|all|each)\s+(?:number|rank)\s+bets?\b|\b(?:every|all|each)\s+numbers?\b|\ball\s+ten\s+numbers?\b/,
      filter: (entry) => entry.type === "number"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:count|card count)\s+bets?\b|\b(?:every|all|each)\s+counts?\b/,
      filter: (entry) => entry.type === "count"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:specific\s+card|card)\s+bets?\b|\b(?:every|all|each)\s+specific\s+cards?\b/,
      filter: (entry) => entry.type === "card"
    },
    {
      pattern: /\b(?:every|all|each)\s+(?:bust|stopper|end)\s+bets?\b|\b(?:every|all|each)\s+busts?\b/,
      filter: (entry) => entry.type === "bust"
    },
    {
      pattern: /\b(?:every|all|each)\s+suit\s+bets?\b|\b(?:every|all|each)\s+suits?\b/,
      filter: (entry) => entry.type === "suit"
    }
  ];

  for (const matcher of categoryMatchers) {
    if (matcher.pattern.test(normalized)) {
      return catalog.filter(matcher.filter);
    }
  }

  const single = resolveAssistantBetTarget(targetText);
  return single ? [single] : [];
}

function shuffleAssistantEntries(entries) {
  const copy = [...entries];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function parseAssistantRandomSpreadDirective(message, state) {
  const raw = String(message || "").trim();
  const normalized = normalizeAssistantBetPhrase(raw);
  if (!raw || !normalized.includes("random")) {
    return null;
  }
  if (!/\b(?:play|place|bet|put|set|drop|stage|choose|pick)\b/.test(normalized)) {
    return null;
  }

  const countMatch = raw.match(/(?:play|place|bet|put|set|drop|stage|choose|pick)\s+(\d+)/i);
  const perBetMatch = raw.match(/(\d+|one)\s+(?:unit|units|credit|credits)\s+bets?/i);
  const maxPerBetMatch = raw.match(/no more than\s+(\d+|one)\s+(?:unit|units|credit|credits)\s+(?:on|in)\s+any\s+one\s+bet/i);
  const betCount = countMatch ? Math.max(1, Math.round(parseAssistantUnits(countMatch[1]) || 0)) : 0;
  const perBetUnits = perBetMatch
    ? Math.max(1, Math.round(parseAssistantUnits(perBetMatch[1]) || (String(perBetMatch[1]).toLowerCase() === "one" ? 1 : 0)))
    : 1;
  const maxPerBet = maxPerBetMatch
    ? Math.max(1, Math.round(parseAssistantUnits(maxPerBetMatch[1]) || (String(maxPerBetMatch[1]).toLowerCase() === "one" ? 1 : 0)))
    : perBetUnits;

  if (!betCount || !perBetUnits) {
    return null;
  }

  const catalog = Array.isArray(state?.betCatalog) ? state.betCatalog : getPlayAssistantBetCatalog();
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

  const availableUnits = Math.max(0, Math.round(Number(state?.betting?.availableUnits ?? bankroll)));
  const cappedPerBetUnits = Math.max(1, Math.min(perBetUnits, maxPerBet));
  const affordableCount = Math.max(0, Math.floor(availableUnits / cappedPerBetUnits));
  const selectedCount = Math.min(betCount, pool.length, affordableCount);
  const definitions = shuffleAssistantEntries(pool).slice(0, selectedCount).map((entry) =>
    getBetDefinition(entry.key)
  ).filter(Boolean);

  return {
    requestedCount: betCount,
    selectedCount,
    perBetUnits: cappedPerBetUnits,
    availableUnits,
    definitions
  };
}

function parseAssistantDirective(message, state) {
  const normalized = String(message || "").trim();
  const commandMatch = normalized.match(
    /(?:^|\b)(?:play|place|bet|put|set|drop|stage)\s+\$?([\d,.]+(?:\.\d+)?\s*[km]?)\s*(?:units?)?\s+(?:on\s+)?(.+)$/i
  );
  if (!commandMatch) {
    return null;
  }

  const requestedUnits = parseAssistantUnits(commandMatch[1]);
  const targetText = String(commandMatch[2] || "")
    .replace(/\s+(?:please|pls|for me|thanks?)\s*$/i, "")
    .trim();
  const definitions = resolveAssistantBetTargets(targetText, state);
  const availableUnits = Math.max(0, Math.round(Number(state?.betting?.availableUnits ?? bankroll)));

  return {
    requestedUnits,
    targetText,
    definitions,
    availableUnits
  };
}

function parseAssistantClearDirective(message) {
  const normalized = normalizeAssistantBetPhrase(message);
  if (!normalized) {
    return false;
  }
  return /\b(?:clear|remove|reset|take\s+off)\b/.test(normalized) &&
    /\b(?:bets|bet|table|layout|board|felt|all)\b/.test(normalized);
}

async function requestPlayAssistantResponse(userMessage) {
  const gameKey = getCurrentPlayAssistantGameKey();
  const state = await getPlayAssistantState();
  if (gameKey === GAME_KEYS.RUN_THE_NUMBERS && parseAssistantClearDirective(userMessage)) {
    return {
      reply: "Understood. Confirm if you want me to clear all current bets from the felt.",
      riskTolerance: state.riskTolerance,
      plan: {
        summary: "Clear all current bets from the table.",
        replaceExisting: true,
        bets: [],
        totalUnits: 0,
        clearOnly: true
      }
    };
  }
  try {
    const invokePromise = supabase.functions.invoke("play-assistant", {
      body: {
        message: userMessage,
        messages: serializePlayAssistantMessages(),
        state
      }
    });
    const timeoutPromise = new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Play assistant request timed out."));
      }, PLAY_ASSISTANT_REQUEST_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
    if (error) {
      throw error;
    }
    if (data?.reply) {
      return {
        reply: String(data.reply),
        riskTolerance: data.riskTolerance || state.riskTolerance,
        plan: normalizeAssistantPlan(data.plan)
      };
    }
  } catch (error) {
    console.warn("[RTN] play assistant fallback", error);
  }

  if (gameKey !== GAME_KEYS.RUN_THE_NUMBERS) {
    return {
      reply:
        "I can help explain Guess 10, your current prediction, and cash-out decisions, but I can't auto-stage Guess 10 actions yet.",
      riskTolerance: state.riskTolerance,
      plan: null
    };
  }

  const explicitDirective = parseAssistantDirective(userMessage, state);
  const randomSpreadDirective = parseAssistantRandomSpreadDirective(userMessage, state);
  if (randomSpreadDirective) {
    const totalRequestedUnits = randomSpreadDirective.selectedCount * randomSpreadDirective.perBetUnits;
    if (randomSpreadDirective.definitions?.length) {
      const adjustedCopy =
        randomSpreadDirective.selectedCount < randomSpreadDirective.requestedCount
          ? ` I could fit ${randomSpreadDirective.selectedCount} bets within your current bankroll and the one-per-bet limit.`
          : "";
      return {
        reply: `Understood. I made a best-guess random draft of ${randomSpreadDirective.selectedCount} bet${randomSpreadDirective.selectedCount === 1 ? "" : "s"} at ${randomSpreadDirective.perBetUnits} unit${randomSpreadDirective.perBetUnits === 1 ? "" : "s"} each for ${totalRequestedUnits} total units.${adjustedCopy} Confirm if you want me to place it on the felt.`,
        riskTolerance: state.riskTolerance,
        plan: normalizeAssistantPlan({
          summary: "Best-guess random layout captured. Confirm and I will stage it on the felt.",
          replaceExisting: true,
          bets: randomSpreadDirective.definitions.map((definition) => ({
            key: definition.key,
            units: randomSpreadDirective.perBetUnits
          }))
        })
      };
    }
  }

  if (explicitDirective) {
    const { requestedUnits, targetText, definitions, availableUnits } = explicitDirective;
    const totalRequestedUnits =
      Array.isArray(definitions) && definitions.length > 0 ? requestedUnits * definitions.length : requestedUnits;

    if (definitions?.length && requestedUnits > 0 && totalRequestedUnits <= availableUnits) {
      const summaryTarget =
        definitions.length === 1
          ? definitions[0].label
          : targetText.replace(/\s+/g, " ").trim() || "that layout";
      return {
        reply:
          definitions.length === 1
            ? `Understood. I drafted exactly ${requestedUnits} units on ${definitions[0].label}. Confirm if you want me to place it on the felt.`
            : `Understood. I made a best-guess draft of ${requestedUnits} units on each target in ${summaryTarget} for ${totalRequestedUnits} units total. Confirm if you want me to place it on the felt.`,
        riskTolerance: state.riskTolerance,
        plan: normalizeAssistantPlan({
          summary:
            definitions.length === 1
              ? "Direct instruction captured. Confirm and I will stage this exact layout on the felt."
              : "Best-guess instruction captured. Confirm and I will stage this layout on the felt.",
          replaceExisting: true,
          bets: definitions.map((definition) => ({ key: definition.key, units: requestedUnits }))
        })
      };
    }

    if (definitions?.length && totalRequestedUnits > availableUnits) {
      const targetLabel =
        definitions.length === 1 ? definitions[0].label : targetText.replace(/\s+/g, " ").trim() || "that layout";
      return {
        reply:
          definitions.length === 1
            ? `I can't place ${requestedUnits} units on ${targetLabel} because only ${availableUnits} units are available right now.`
            : `I can't place ${requestedUnits} units on each target in ${targetLabel} because that needs ${totalRequestedUnits} units and only ${availableUnits} are available right now.`,
        riskTolerance: state.riskTolerance,
        plan: null
      };
    }

  }

  return {
    reply: "The assistant is temporarily unavailable. Try again in a moment.",
    riskTolerance: state.riskTolerance,
    plan: null
  };
}

function applyAssistantPlan(plan, messageId = null) {
  const isClearOnly = Boolean(plan?.clearOnly);
  const normalizedPlan = isClearOnly
    ? {
        summary: String(plan?.summary || "Clear all current bets from the table."),
        replaceExisting: true,
        bets: [],
        totalUnits: 0,
        clearOnly: true
      }
    : normalizeAssistantPlan(plan);
  if (!normalizedPlan) {
    showToast("That assistant plan could not be applied.", "error");
    return false;
  }

  if (currentRoute !== "run-the-numbers") {
    showToast("Open the PLAY table before applying assistant bets.", "error");
    return false;
  }

  if (dealing) {
    pushPlayAssistantMessage({
      role: "system",
      text: "The hand is already in motion. Wait for the table to reopen before I place a new layout."
    });
    return false;
  }

  const outstanding = bets.reduce((sum, bet) => sum + bet.units, 0);
  const available = normalizedPlan.replaceExisting ? bankroll + outstanding : bankroll;
  if (normalizedPlan.totalUnits > available) {
    pushPlayAssistantMessage({
      role: "system",
      text: `This layout needs ${formatCurrency(
        normalizedPlan.totalUnits
      )} units, but only ${formatCurrency(available)} are available right now.`
    });
    return false;
  }

  if (normalizedPlan.replaceExisting && outstanding > 0) {
    restoreUnits(outstanding);
    resetBets();
  }

  if (normalizedPlan.clearOnly) {
    playAssistantPendingPlan = null;
    if (messageId) {
      const sourceMessage = playAssistantThread.find((entry) => entry.id === messageId);
      if (sourceMessage?.plan) {
        sourceMessage.plan.applied = true;
        renderPlayAssistantThread();
      }
    }
    statusEl.textContent = "Assistant cleared all current bets from the table.";
    pushPlayAssistantMessage({
      role: "system",
      text: "Cleared all current bets from the table. The felt is reset and ready for a new layout."
    });
    return true;
  }

  if (normalizedPlan.replaceExisting) {
    applyBetLayout(
      normalizedPlan.bets.map((bet) => ({
        key: bet.key,
        chips: [...bet.chips]
      }))
    );
  } else {
    normalizedPlan.bets.forEach((bet) => {
      bet.chips.forEach((chip) => addBet(bet.key, chip));
    });
  }

  playAssistantPendingPlan = null;
  if (messageId) {
    const sourceMessage = playAssistantThread.find((entry) => entry.id === messageId);
    if (sourceMessage?.plan) {
      sourceMessage.plan.applied = true;
      renderPlayAssistantThread();
    }
  }
  statusEl.textContent = `Assistant placed ${formatCurrency(
    normalizedPlan.totalUnits
  )} units on the felt. Review the layout, then deal when you're ready.`;
  pushPlayAssistantMessage({
    role: "system",
    text: `Placed ${formatCurrency(
      normalizedPlan.totalUnits
    )} units on the table. I stopped there so you stay in control of starting the hand.`
  });
  return true;
}

async function sendPlayAssistantMessage(rawMessage) {
  const userMessage = String(rawMessage || "").trim();
  if (!userMessage || playAssistantRequestInFlight) {
    return;
  }

  const inferredRisk = inferPlayAssistantRiskTolerance(userMessage);
  if (inferredRisk) {
    setPlayAssistantRiskTolerance(inferredRisk);
  }

  if (
    playAssistantPendingPlan &&
    /^\s*(yes|y|apply|place|set it|do it|go ahead|ok|okay)\b/i.test(userMessage)
  ) {
    pushPlayAssistantMessage({ role: "user", text: userMessage });
    resetPlayAssistantDraft();
    applyAssistantPlan(playAssistantPendingPlan);
    return;
  }

  pushPlayAssistantMessage({ role: "user", text: userMessage });
  resetPlayAssistantDraft();
  setPlayAssistantLoading(true);

  const response = await requestPlayAssistantResponse(userMessage);

  setPlayAssistantLoading(false);

  if (response?.riskTolerance) {
    setPlayAssistantRiskTolerance(response.riskTolerance);
  }

  playAssistantPendingPlan = response?.plan || null;

  pushPlayAssistantMessage({
    role: "assistant",
    text: response?.reply || "I hit a snag. Please try again in a moment.",
    plan: response?.plan || null
  });
}

function seedPlayAssistant() {
  ensurePlayAssistantThreadMatchesCurrentGame();
  if (playAssistantThread.length > 0) {
    return;
  }
  updatePlayAssistantContext();
  const config = getPlayAssistantConfig();
  pushPlayAssistantMessage({
    role: "assistant",
    text: config.greeting
  });
}

function summarizeBetResult(bet) {
  if (bet.type === "number") {
    const spokenRank = describeRank(bet.metadata?.rank ?? bet.rank ?? "");
    return bet.hits > 0
      ? `${bet.units}u on ${spokenRank}: <span class="hit">${bet.hits} hits / ${formatCurrency(
          bet.paid
        )}</span>`
      : `${bet.units}u on ${spokenRank}: 0 hits`;
  }

  const profit = bet.paid > 0 ? bet.paid - bet.units : 0;
  const payoutText =
    bet.paid > 0
      ? `<span class="hit">won ${formatCurrency(profit)} · stake returned</span>`
      : "no win";
  return `${bet.label}: ${payoutText}`;
}

function addHistoryEntry(result) {
  recentHandReviews.unshift({
    id: result.id || `hand-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gameKey: result.gameKey || GAME_KEYS.RUN_THE_NUMBERS,
    gameLabel: result.gameLabel || getGameLabel(result.gameKey || GAME_KEYS.RUN_THE_NUMBERS),
    commissionKept: Math.max(0, Number(Number(result.commissionKept || 0).toFixed(2))),
    handHistory: Array.isArray(result.handHistory) ? result.handHistory.map((item) => ({ ...item })) : [],
    drawnCards: Array.isArray(result.drawnCards) ? result.drawnCards.map((card) => ({ ...card })) : [],
    bets: Array.isArray(result.bets) ? result.bets.map((bet) => ({ ...bet })) : [],
    totalWager: Math.max(0, Number(Number(result.totalWager || 0).toFixed(2))),
    totalReturn: Math.max(0, Number(Number(result.totalReturn || 0).toFixed(2))),
    net: Number(Number(result.net || 0).toFixed(2)),
    timestamp: Date.now()
  });
  if (recentHandReviews.length > 8) {
    recentHandReviews = recentHandReviews.slice(0, 8);
  }
  renderRecentHandHistory();
}

function clearRecentHandHistory() {
  recentHandReviews = [];
  if (historyList) {
    historyList.innerHTML = "";
  }
  closeHandReviewModal();
}

function renderRecentHandHistory() {
  if (!historyList) {
    return;
  }

  historyList.innerHTML = "";
  recentHandReviews.forEach((entry) => {
    const item = document.createElement("li");
    const gameLabel = entry.gameLabel || getGameLabel(entry.gameKey || GAME_KEYS.RUN_THE_NUMBERS);
    const cardsList = (entry.drawnCards || [])
      .map((card) => {
        if (card.label === "Joker") {
          return "Joker";
        }
        return `${card.label}${card.suit || ""}`;
      })
      .join(", ");
    const totalCards = Array.isArray(entry.drawnCards) ? entry.drawnCards.length : 0;
    const metaLine = `${formatCurrency(entry.totalWager)} wagered · ${formatCurrency(entry.totalReturn)} returned`;

    item.innerHTML = `
      <div class="history-hand-game">${escapeAssistantHtml(gameLabel)}</div>
      <div class="history-hand-cards">${cardsList}</div>
      <div class="history-hand-meta">${metaLine} · ${totalCards} card${totalCards === 1 ? "" : "s"}</div>
      <button type="button" class="history-review-button" data-hand-review-id="${escapeAssistantHtml(entry.id)}">Hand Review</button>
    `;
    historyList.appendChild(item);
  });
}

function closeHandReviewModal({ restoreFocus = false } = {}) {
  if (!handReviewModal) {
    return;
  }

  handReviewModal.classList.remove("is-open");
  handReviewModal.setAttribute("aria-hidden", "true");
  handReviewModal.hidden = true;

  if (
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!numberBetsModal || numberBetsModal.hidden) &&
    (!betAnalyticsModal || betAnalyticsModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }

  if (restoreFocus && handReviewModalTrigger instanceof HTMLElement) {
    handReviewModalTrigger.focus();
  }
  handReviewModalTrigger = null;
}

function buildHandReviewField(label, value, options = {}) {
  const toneClass = options.toneClass ? ` ${options.toneClass}` : "";
  return `
    <div class="review-hand-field">
      <span class="review-hand-field-label">${escapeAssistantHtml(label)}</span>
      <span class="review-hand-field-value${toneClass}">${escapeAssistantHtml(value)}</span>
    </div>
  `;
}

function renderGuess10ReviewCards(entry) {
  const steps = Array.isArray(entry.handHistory) ? entry.handHistory : [];
  if (!steps.length) {
    return `
      <article class="review-hand-card review-hand-card-empty">
        <p>No round details were saved for this hand.</p>
      </article>
    `;
  }

  return steps
    .map((step, index) => {
      const predictionText = `${step.selectionLabel || "Selection"} · ${
        formatRedBlackMultiplier(step.multiplier || 0) || "0x"
      }`;
      const cardLabel = step?.card ? `${step.card.label || ""}${step.card.suit || ""}` : "—";
      const resultText = step?.matched ? `Hit · Pot ${formatCurrency(step.potAfter || 0)}` : "Miss";
      const resultToneClass = step?.matched ? "review-hand-positive" : "review-hand-negative";
      return `
        <article class="review-hand-card review-hand-round-card">
          <div class="review-hand-card-topline">
            <span class="review-hand-card-kicker">Round ${index + 1}</span>
            <span class="review-hand-card-pill ${resultToneClass}">${escapeAssistantHtml(resultText)}</span>
          </div>
          <div class="review-hand-field-grid">
            ${buildHandReviewField("Prediction", predictionText)}
            ${buildHandReviewField("Card Drawn", cardLabel)}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderClassicHandReviewCards(entry) {
  const bets = Array.isArray(entry.bets) ? entry.bets : [];
  if (!bets.length) {
    return `
      <article class="review-hand-card review-hand-card-empty">
        <p>No wager rows were saved for this hand.</p>
      </article>
    `;
  }

  return bets
    .map((bet) => {
      const wager = Math.max(0, Math.round(Number(bet.units || 0)));
      const totalReturn = Math.max(0, Math.round(Number(bet.paid || 0)));
      const net = totalReturn - wager;
      const toneClass =
        net > 0 ? "review-hand-positive" : net < 0 ? "review-hand-negative" : "review-hand-neutral";

      return `
        <article class="review-hand-card">
          <div class="review-hand-card-topline">
            <span class="review-hand-card-title">${escapeAssistantHtml(bet.label || bet.key || "Bet")}</span>
            <span class="review-hand-card-pill ${toneClass}">${escapeAssistantHtml(formatSignedCurrency(net))}</span>
          </div>
          <div class="review-hand-field-grid review-hand-field-grid-compact">
            ${buildHandReviewField("Wager", formatCurrency(wager))}
            ${buildHandReviewField("Return", formatCurrency(totalReturn))}
            ${buildHandReviewField("Net", formatSignedCurrency(net), { toneClass })}
          </div>
        </article>
      `;
    })
    .join("");
}

function openHandReviewModal(reviewId, trigger = null) {
  if (!handReviewModal || !handReviewListEl) {
    return;
  }

  const entry = recentHandReviews.find((candidate) => candidate.id === reviewId);
  if (!entry) {
    showToast("That hand review is no longer available.", "error");
    return;
  }

  handReviewModalTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  handReviewListEl.innerHTML = "";
  const isGuess10 = (entry.gameKey || "") === GAME_KEYS.GUESS_10;

  if (handReviewSummaryEl) {
    handReviewSummaryEl.textContent = isGuess10
      ? `${entry.gameLabel || "Guess 10"} · ${entry.drawnCards.length} cards · ${formatCurrency(entry.totalWager)} wagered · ${formatCurrency(entry.totalReturn)} returned · ${formatSignedCurrency(entry.net)} net · ${formatCurrency(entry.commissionKept || 0)} commission kept.`
      : `Hand length ${entry.drawnCards.length}. Total return ${formatCurrency(
          entry.totalReturn
        )} units on ${formatCurrency(entry.totalWager)} wagered.`;
  }

  if (isGuess10) {
    handReviewListEl.innerHTML = renderGuess10ReviewCards(entry);
  } else {
    handReviewListEl.innerHTML = renderClassicHandReviewCards(entry);
  }

  if (handReviewTotalWagerEl) {
    handReviewTotalWagerEl.textContent = formatCurrency(entry.totalWager);
  }
  if (handReviewTotalReturnEl) {
    handReviewTotalReturnEl.textContent = formatCurrency(entry.totalReturn);
  }
  if (handReviewTotalNetEl) {
    handReviewTotalNetEl.textContent = formatSignedValue(entry.net);
    handReviewTotalNetEl.className = `review-hand-total-value ${
      entry.net > 0 ? "review-hand-positive" : entry.net < 0 ? "review-hand-negative" : "review-hand-neutral"
    }`;
  }

  handReviewModal.hidden = false;
  handReviewModal.classList.add("is-open");
  handReviewModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  handReviewOkButton?.focus();
}

function resetTable(
  message = "Select a chip and place your bets in the betting panel.",
  { clearDraws = false } = {}
) {
  if (clearDraws) {
    drawsContainer.innerHTML = "";
  }
  if (message) {
    statusEl.textContent = message;
  }
  dealing = false;
  awaitingManualDeal = false;
  currentHandContext = null;
  setHandPaused(false);
  setBettingEnabled(true);
  updateAutoDealToggleUI();
  updateDealButtonState();
  updatePauseButton();
  updateRebetButtonState();
}

async function performAccountReset() {
  const contestMode = isContestAccountMode();
  const modeContest = getModeContest();
  const modeEntry = getModeContestEntry();
  const resetCredits = contestMode
    ? normalizeStoredCreditValue(modeEntry?.starting_credits ?? modeContest?.starting_credits ?? 0)
    : INITIAL_BANKROLL;
  const resetCarterCash = contestMode
    ? Math.max(0, Math.round(Number(modeEntry?.starting_carter_cash ?? modeContest?.starting_carter_cash ?? 0)))
    : 0;

  bankroll = resetCredits;
  handleBankrollChanged();
  stats = { hands: 0, wagered: 0, paid: 0 };
  updateStatsUI();
  lastBetLayout = [];
  currentOpeningLayout = [];
  clearRecentHandHistory();
  resetBets();
  stopCarterCashAnimation();
  carterCash = resetCarterCash;
  carterCashProgress = 0;
  updateCarterCashDisplay();
  syncCurrentModeShadowState();
  await persistBankroll();
  if (!contestMode) {
    await ensureProfileSynced({ force: true });
  }
  resetTable("Account reset. Select a chip and place your bets in the betting panel.", {
    clearDraws: true
  });
  resetBankrollHistory();
  closeUtilityPanel();
  showToast(
    contestMode
      ? "Contest mode reset to its starting balance."
      : "Account reset. Bankroll restored to 1,000 units and Carter Cash cleared.",
    "info"
  );
}

function openResetModal() {
  if (!resetModal) {
    void performAccountReset();
    return;
  }
  if (!resetModal.hidden) {
    return;
  }
  updateModeSpecificModalCopy();
  resetModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : resetAccountButton;
  resetModal.hidden = false;
  resetModal.classList.add("is-open");
  resetModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  resetConfirmButton?.focus();
}

function closeResetModal({ restoreFocus = false } = {}) {
  if (!resetModal) return;
  resetModal.classList.remove("is-open");
  resetModal.setAttribute("aria-hidden", "true");
  resetModal.hidden = true;
  if (
    (!paytableModal || paytableModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  if (restoreFocus && resetModalTrigger instanceof HTMLElement) {
    resetModalTrigger.focus();
  }
  resetModalTrigger = null;
}

let outOfCreditsModalTrigger = null;

function openOutOfCreditsModal() {
  const modal = document.getElementById("out-of-credits-modal");
  if (!modal) return;
  if (!modal.hidden) return;
  updateModeSpecificModalCopy();
  outOfCreditsModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  
  const okButton = document.getElementById("out-of-credits-ok");
  okButton?.focus();
}

function closeOutOfCreditsModal({ restoreFocus = false } = {}) {
  const modal = document.getElementById("out-of-credits-modal");
  if (!modal) return;
  
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.hidden = true;
  
  if (
    (!paytableModal || paytableModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!contestModal || contestModal.hidden) &&
    (!contestResultsModal || contestResultsModal.hidden) &&
    (!adminContestResultsModal || adminContestResultsModal.hidden) &&
    (!adminContestModal || adminContestModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  
  if (restoreFocus && outOfCreditsModalTrigger instanceof HTMLElement) {
    outOfCreditsModalTrigger.focus();
  }
  outOfCreditsModalTrigger = null;
}

function renderDraw(card) {
  const cardEl = makeCardElement(card);
  const fragment = document.createDocumentFragment();
  fragment.appendChild(cardEl);
  drawsContainer.appendChild(fragment);
  requestAnimationFrame(() => {
    cardEl.classList.add("dealt-in");
  });
}

function settleAdvancedBets(stopperCard, context = {}) {
  const nonStopperCount = context.nonStopperCount ?? 0;
  const totalCards = context.totalCards ?? nonStopperCount;
  const drawnCards = Array.isArray(context.drawnCards) ? context.drawnCards : [];

  for (const bet of bets) {
    if (bet.type === "number") {
      continue;
    }

    const definition = getBetDefinition(bet.key);
    if (!definition) {
      continue;
    }

    let payout = 0;
    const { metadata } = definition;

    switch (definition.type) {
      case "bust-suit":
        if (stopperCard.label !== "Joker" && stopperCard.suitName === metadata.suit) {
          payout = definition.payout * bet.units;
        }
        break;
      case "bust-rank":
        if (stopperCard.label === metadata.face) {
          payout = definition.payout * bet.units;
        }
        break;
      case "bust-joker":
        if (stopperCard.label === "Joker") {
          payout = definition.payout * bet.units;
        }
        break;
      case "suit-pattern":
        {
          const suit = metadata.suit;
          const pattern = String(metadata.pattern || "").toLowerCase();
          const matchingCards = drawnCards.filter((card) => card?.suitName === suit);
          const firstCard = drawnCards[0] || null;

          if (pattern === "none" && matchingCards.length === 0) {
            payout = definition.payout * bet.units;
          } else if (pattern === "any" && matchingCards.length > 0) {
            payout = definition.payout * bet.units;
          } else if (pattern === "first" && firstCard?.suitName === suit) {
            payout = definition.payout * bet.units;
          }
        }
        break;
      case "count":
        {
          const min = metadata.countMin ?? 0;
          const max = metadata.countMax ?? min;
          if (max === Infinity) {
            if (totalCards >= min) {
              payout = definition.payout * bet.units;
            }
          } else if (totalCards === max) {
            payout = definition.payout * bet.units;
          }
        }
        break;
      default:
        break;
    }

  if (payout > 0) {
      const totalReturn = roundCurrencyValue(payout + bet.units);
      bet.paid = roundCurrencyValue(bet.paid + totalReturn);
      bankroll = roundCurrencyValue(bankroll + totalReturn);
      handleBankrollChanged();
    }
  }
}

function applyPlaythrough(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const previousCash = carterCash;
  const previousProgress = carterCashProgress;

  carterCashProgress += amount;
  const earned = Math.floor(carterCashProgress / 1000);
  if (earned > 0) {
    carterCash += earned;
    carterCashProgress -= earned * 1000;
    handleCarterCashChanged();
    animateCarterCashGain(earned);
  } else if (!carterCashAnimating) {
    handleCarterCashChanged();
  }

  syncCurrentModeShadowState();
}

async function endHand(stopperCard, context = {}) {
  setHandPaused(false);
  settleAdvancedBets(stopperCard, context);
  const totalWagerThisHand = bets.reduce((sum, bet) => sum + bet.units, 0);
  const totalPaidThisHand = bets.reduce((sum, bet) => sum + bet.paid, 0);
  const netThisHand = totalPaidThisHand - totalWagerThisHand;

  const betSnapshots = bets.map((bet) => ({
    key: bet.key,
    type: bet.type,
    label: bet.label,
    units: bet.units,
    hits: bet.hits,
    paid: bet.paid,
    metadata: bet.metadata ? { ...bet.metadata } : null
  }));

  applyPlaythrough(totalWagerThisHand);

  stats.hands += 1;
  stats.wagered += totalWagerThisHand;
  stats.paid += totalPaidThisHand;
  updateStatsUI();

  statusEl.textContent = `Hand stopped on ${stopperCard.label}${
    stopperCard.label !== "Joker" ? " of " + stopperCard.suit : ""
  }. Place your next bets.`;

  addHistoryEntry({
    gameKey: GAME_KEYS.RUN_THE_NUMBERS,
    gameLabel: getGameLabel(GAME_KEYS.RUN_THE_NUMBERS),
    drawnCards: context.drawnCards || [],
    bets: betSnapshots,
    totalWager: totalWagerThisHand,
    totalReturn: totalPaidThisHand,
    net: netThisHand
  });

  lastBetLayout = currentOpeningLayout.length > 0 ? snapshotLayout(currentOpeningLayout) : [];
  currentOpeningLayout = [];

  dealing = false;
  awaitingManualDeal = false;
  animateBankrollOutcome(netThisHand);
  recordBankrollHistoryPoint();
  await persistBankroll({
    recordContestHistory: isContestAccountMode(),
    contestHistoryLabel: `Hand ${stats.hands}`
  });
  await incrementProfileHandProgress(1);
  await ensureProfileSynced({ force: true });
  await logHandAndBets(stopperCard, context, betSnapshots, netThisHand, {
    gameKey: GAME_KEYS.RUN_THE_NUMBERS
  });
  const metadata = {
    stopper: stopperCard.label,
    suit: stopperCard.suitName ?? null,
    totalCards: context.totalCards ?? null,
    bets: betSnapshots.map((bet) => ({
      key: bet.key,
      type: bet.type,
      units: bet.units,
      hits: bet.hits,
      paid: bet.paid
    }))
  };
  logGameRun(netThisHand, metadata).catch((error) => {
    console.error(error);
    showToast("Could not record game run", "error");
  });
  resetBets();
  setBettingEnabled(true);
  updateAutoDealToggleUI();
  updateDealButtonState();
  updateRebetButtonState();
  updatePauseButton();
}

async function processCard(card, context) {
  if (context) {
    context.totalCards = (context.totalCards ?? 0) + 1;
    if (!context.drawnCards) {
      context.drawnCards = [];
    }
    context.drawnCards.push(card);
  }

  renderDraw(card);

  if (card.stopper) {
    await endHand(card, context);
    return true;
  }

  if (context) {
    context.nonStopperCount = (context.nonStopperCount ?? 0) + 1;
  }

  const rank = card.rank;
  const suit = card.suit;
  let totalHitPayout = 0;
  let hitsRecorded = 0;
  const stepPays = currentStepPays();
  bets.forEach((bet) => {
    if (
      bet.type === "number" &&
      bet.metadata?.rank === rank &&
      bet.hits < stepPays.length
    ) {
      const pay = stepPays[bet.hits] * bet.units;
      bet.paid += pay;
      bet.hits += 1;
      bankroll += pay;
      handleBankrollChanged();
      totalHitPayout += pay;
      hitsRecorded += 1;
    } else if (
      bet.type === "specific-card" &&
      bet.metadata?.rank === rank &&
      bet.metadata?.suit === suit &&
      bet.hits === 0
    ) {
      // Specific card bet pays 12 to 1 (wager + 12x payout)
      const definition = getBetDefinition(bet.key);
      const payout = definition?.payout || 12;
      const pay = (payout + 1) * bet.units; // Return wager plus payout
      bet.paid += pay;
      bet.hits += 1;
      bankroll += pay;
      handleBankrollChanged();
      totalHitPayout += pay;
      hitsRecorded += 1;
    }
  });

  renderBets();
  if (hitsRecorded > 0) {
    const spokenRank = describeRank(rank);
    statusEl.textContent = `${spokenRank} hits ${hitsRecorded} bet${
      hitsRecorded > 1 ? "s" : ""
    } for ${formatCurrency(totalHitPayout)} units.`;
  } else {
    statusEl.textContent = `${describeRank(rank)} keeps the action going.`;
  }
  return false;
}

async function dealHand() {
  if (bets.length === 0 || dealing) return;
  if (!canUseCurrentFundsForGame(GAME_KEYS.RUN_THE_NUMBERS)) {
    const contest = getModeContest(currentAccountMode);
    statusEl.textContent = `This contest bankroll can only be used for ${getContestGamesLabel(contest)}.`;
    showToast(`This contest bankroll can only be used for ${getContestGamesLabel(contest)}.`, "error");
    return;
  }
  currentOpeningLayout = snapshotLayout(bets);
  dealing = true;
  awaitingManualDeal = false;
  pauseResolvers = [];
  currentHandContext = { nonStopperCount: 0, totalCards: 0, drawnCards: [] };
  setHandPaused(false);
  setBettingEnabled(false);
  updateDealButtonState();
  updateRebetButtonState();
  resetBetCounters();
  drawsContainer.innerHTML = "";
  statusEl.textContent = "Dealing...";
  updateAutoDealToggleUI();
  updatePauseButton();

  const deck = createDeck();
  shuffle(deck);

  for (const card of deck) {
    await waitWhilePaused();
    const shouldStop = await processCard(card, currentHandContext);
    if (shouldStop) {
      break;
    }
    if (autoDealEnabled) {
      await waitForDealDelay();
    } else {
      await waitForManualDealAdvance();
    }
  }

  currentHandContext = null;
  awaitingManualDeal = false;
  setHandPaused(false);
  updateAutoDealToggleUI();
  updateDealButtonState();
  updatePauseButton();
}

function placeBet(key) {
  const definition = getBetDefinition(key);
  if (!definition) return;

  // Check if player has zero credits
  if (bankroll === 0) {
    openOutOfCreditsModal();
    return;
  }

  const canUseDuringIntermission =
    dealing &&
    awaitingManualDeal &&
    ["specific-card", "bust-suit", "bust-rank", "bust-joker"].includes(definition.type);

  if (!bettingOpen && !canUseDuringIntermission) {
    statusEl.textContent = awaitingManualDeal
      ? `${definition.label} bets cannot be changed once the hand has started. Only specific card and bust bets can be added between cards.`
      : `${definition.label} bets are locked while a hand is in progress.`;
    return;
  }

  if (selectedChip > bankroll) {
    statusEl.textContent = `Insufficient bankroll for a ${formatCurrency(
      selectedChip
    )}-unit chip. Try a smaller denomination.`;
    return;
  }

  const bet = addBet(key, selectedChip);
  if (!bet) return;
  const totalForBet = formatCurrency(bet.units);
  const spokenLabel =
    definition.type === "number"
      ? describeRank(definition.metadata?.rank ?? definition.label)
      : definition.label;
  statusEl.textContent = `Placed ${formatCurrency(selectedChip)} unit${
    selectedChip !== 1 ? "s" : ""
  } on ${spokenLabel}. Total on ${definition.label}: ${totalForBet} unit${
    bet.units !== 1 ? "s" : ""
  }.`;
}

betSpotButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    const key = button.dataset.betKey || button.dataset.rank;
    if (!key) return;
    placeBet(key);
  });
});

paytableRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    pendingPaytableId = radio.value;
  });
});

if (advancedToggleInput) {
  advancedToggleInput.addEventListener("change", (event) => {
    const enabled = Boolean(event.target.checked);
    setAdvancedMode(enabled);
    if (!dealing) {
      statusEl.textContent = enabled
        ? "Advanced Mode enabled. Bust and card count wagers are available below the deal area."
        : "Advanced Mode disabled. Only Ace and number bets remain on the felt.";
    }
  });
}

if (pausePlayButton) {
  pausePlayButton.addEventListener("click", () => {
    if (!dealing) return;
    setHandPaused(!handPaused);
  });
}

function handleClearBetsClick() {
  if (dealing || !bettingOpen || bets.length === 0) return;
  const totalUnits = bets.reduce((sum, bet) => sum + bet.units, 0);
  restoreUnits(totalUnits);
  resetBets();
  statusEl.textContent = "Bets cleared.";
}

clearBetsButtons.forEach((button) => {
  button.addEventListener("click", handleClearBetsClick);
});

dealButton.addEventListener("click", () => {
  if (dealing) {
    if (awaitingManualDeal) {
      setHandPaused(false);
    }
    return;
  }
  if (bets.length === 0) return;
  dealHand();
});

if (autoDealToggleInput) {
  autoDealToggleInput.addEventListener("change", (event) => {
    setAutoDealEnabled(Boolean(event.target.checked));
  });
}

updateAutoDealToggleUI();
updateDealButtonState();

rebetButton.addEventListener("click", () => {
  if (dealing || lastBetLayout.length === 0) return;
  const totalNeeded = layoutTotalUnits(lastBetLayout);
  if (totalNeeded === 0) {
    statusEl.textContent = "No prior wagers to rebet.";
    return;
  }

  const outstanding = bets.reduce((sum, bet) => sum + bet.units, 0);
  const available = bankroll + outstanding;
  if (totalNeeded > available) {
    statusEl.textContent = `Not enough bankroll to rebet ${formatCurrency(
      totalNeeded
    )} units. Reset your account or place smaller bets.`;
    return;
  }

  if (outstanding > 0) {
    restoreUnits(outstanding);
    resetBets();
  }

  rebetButton.disabled = true;
  applyBetLayout(lastBetLayout);
  statusEl.textContent = "Previous wagers restored. Adjust or add bets, then deal when ready.";
  rebetButton.disabled = false;
  updateRebetButtonState();
  dealButton.disabled = false;
});

if (playAssistantToggle) {
  playAssistantToggle.addEventListener("click", () => {
    seedPlayAssistant();
    togglePlayAssistant();
  });
}

if (playAssistantCloseButton) {
  playAssistantCloseButton.addEventListener("click", () => {
    togglePlayAssistant(false);
    playAssistantToggle?.focus();
  });
}

if (playAssistantQuickActionButtons.length) {
  playAssistantQuickActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      seedPlayAssistant();
      togglePlayAssistant(true);
      void sendPlayAssistantMessage(button.dataset.playAssistantPrompt || "");
    });
  });
}

if (playAssistantThreadEl) {
  playAssistantThreadEl.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-plan-id]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const messageId = target.dataset.planId;
    const message = playAssistantThread.find((entry) => entry.id === messageId);
    if (message?.plan) {
      applyAssistantPlan(message.plan, messageId);
    }
  });
}

if (playAssistantInput) {
  playAssistantInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPlayAssistantMessage(playAssistantInput.value);
    }
  });
}

if (playAssistantForm) {
  playAssistantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendPlayAssistantMessage(playAssistantInput?.value || "");
  });
}

chipRackEditButton?.addEventListener("click", () => {
  if (chipRackEditButton.disabled) return;
  openChipEditorModal();
});

chipEditorCloseButton?.addEventListener("click", () => {
  closeChipEditorModal({ restoreFocus: true });
});

chipEditorCancelButton?.addEventListener("click", () => {
  closeChipEditorModal({ restoreFocus: true });
});

chipEditorApplyButton?.addEventListener("click", () => {
  handleChipEditorApply();
});

chipEditorResetButton?.addEventListener("click", () => {
  syncChipEditorFormValues(DEFAULT_CHIP_DENOMINATIONS);
  handleChipEditorApply(DEFAULT_CHIP_DENOMINATIONS);
});

chipEditorForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleChipEditorApply();
});

chipEditorModal?.addEventListener("click", (event) => {
  if (event.target === chipEditorModal) {
    closeChipEditorModal({ restoreFocus: true });
  }
});

if (resetAccountButton) {
  resetAccountButton.addEventListener("click", () => {
    if (dealing) return;
    openResetModal();
  });
}

if (profileRetryButton) {
  profileRetryButton.addEventListener("click", () => {
    void retryProfileLoad("profile-retry:manual");
  });
}

function openDrawer(panel, toggle) {
  if (!panel || !panelScrim) return;
  if (panel === openDrawerPanel) return;
  closeActiveDrawer();
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "true");
  }
  panelScrim.hidden = false;
  openDrawerPanel = panel;
  openDrawerToggle = toggle || null;
  if (panel === chartPanel) {
    void loadPersistentBankrollHistory();
    requestAnimationFrame(() => {
      drawBankrollChart();
    });
  }
}

function closeDrawer(panel = openDrawerPanel, toggle = openDrawerToggle) {
  if (!panel) return;
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
  }
  if (panel === openDrawerPanel) {
    openDrawerPanel = null;
    openDrawerToggle = null;
  }
  if (!openDrawerPanel && panelScrim) {
    panelScrim.hidden = true;
  }
}

function closeActiveDrawer({ returnFocus = false } = {}) {
  if (!openDrawerPanel) return;

  const panel = openDrawerPanel;
  const toggle = openDrawerToggle;
  const activeElement = document.activeElement;

  if (activeElement && panel.contains(activeElement)) {
    if (toggle) {
      toggle.focus();
    } else {
      document.body.focus?.();
    }
  }

  closeDrawer(panel, toggle);

  if (returnFocus && toggle) {
    toggle.focus();
  }
}

function closeUtilityPanel() {
  closeDrawer(utilityPanel, menuToggle);
}

function openPaytableModal() {
  if (!paytableModal || !changePaytableButton) return;
  if (!bettingOpen) return;
  pendingPaytableId = activePaytable.id;
  updateActivePaytableUI();
  paytableRadios.forEach((radio) => {
    radio.checked = radio.value === pendingPaytableId;
  });
  paytableModal.hidden = false;
  paytableModal.classList.add("is-open");
  paytableModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  const focusTarget =
    paytableForm?.querySelector('input[name="paytable"]:checked') ||
    paytableForm?.querySelector('input[name="paytable"]');
  focusTarget?.focus();
}

function closePaytableModal({ restoreFocus = false } = {}) {
  if (!paytableModal) return;
  paytableModal.classList.remove("is-open");
  paytableModal.setAttribute("aria-hidden", "true");
  paytableModal.hidden = true;
  if (
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
  updateActivePaytableUI();
  if (restoreFocus && changePaytableButton) {
    changePaytableButton.focus();
  }
}

if (menuToggle && utilityPanel && utilityClose && panelScrim) {
  menuToggle.addEventListener("click", () => {
    const isOpen = utilityPanel.classList.contains("is-open");
    if (isOpen) {
      closeDrawer(utilityPanel, menuToggle);
    } else {
      openDrawer(utilityPanel, menuToggle);
    }
  });

  utilityClose.addEventListener("click", () => {
    closeDrawer(utilityPanel, menuToggle);
  });
}

if (notificationToggle && notificationsPanel && notificationsClose) {
  notificationToggle.addEventListener("click", () => {
    const isOpen = notificationsPanel.classList.contains("is-open");
    if (isOpen) {
      closeDrawer(notificationsPanel, notificationToggle);
    } else {
      openDrawer(notificationsPanel, notificationToggle);
    }
  });

  notificationsClose.addEventListener("click", () => {
    closeDrawer(notificationsPanel, notificationToggle);
  });

  if (notificationsClearAllButton) {
    notificationsClearAllButton.addEventListener("click", () => {
      void markAllContestNotificationsSeen();
    });
  }
}

if (graphToggle && chartPanel && chartClose) {
  graphToggle.addEventListener("click", () => {
    const isOpen = chartPanel.classList.contains("is-open");
    if (isOpen) {
      closeDrawer(chartPanel, graphToggle);
    } else {
      openDrawer(chartPanel, graphToggle);
    }
  });

  chartClose.addEventListener("click", () => {
    closeDrawer(chartPanel, graphToggle);
  });
}

if (!graphToggle && chartPanel && chartClose) {
  chartClose.addEventListener("click", () => {
    closeDrawer(chartPanel, drawerGraphLink || chartClose);
  });
}

if (accountModeSelect) {
  accountModeSelect.addEventListener("change", async (event) => {
    const nextMode = parseAccountModeValue(event.target?.value || ACCOUNT_MODE_NORMAL);
    currentAccountMode = nextMode;
    saveAccountModeSelection(currentAccountMode);
    syncActiveAccountMode({ forceApply: true, resetHistory: true });
  });
}

if (drawerGraphLink && chartPanel && chartClose) {
  drawerGraphLink.addEventListener("click", () => {
    closeDrawer(utilityPanel, menuToggle);
    openDrawer(chartPanel, drawerGraphLink);
  });
}

bankrollChartFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    bankrollChartPeriod = button.dataset.bankrollPeriod || "year";
    updateBankrollChartFilterUI();
    drawBankrollChart();
  });
});

activityFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activityLeaderboardPeriod = button.dataset.activityPeriod || "week";
    updateActivityFilterUI();
    loadMostActiveThisWeek();
  });
});

if (mostActiveLoadMoreButton) {
  mostActiveLoadMoreButton.addEventListener("click", () => {
    analyticsMostActiveVisibleCount += ANALYTICS_ACTIVITY_PAGE_SIZE;
    renderMostActiveEntries();
  });
}

if (notificationsListEl) {
  notificationsListEl.addEventListener("click", (event) => {
    const button = event.target.closest(".notification-card");
    if (!button) return;
    const contestId = button.dataset.contestId;
    if (!contestId) return;
    const notificationType = button.dataset.notificationType || "result";
    closeDrawer(notificationsPanel, notificationToggle);
    if (notificationType === "start") {
      void openContestStartNotification(contestId);
    } else {
      void openContestResultNotification(contestId);
    }
  });
}

if (carterCashInfoButton) {
  carterCashInfoButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = carterCashInfoButton.closest(".carter-cash");
    const isOpen = wrapper?.classList.contains("is-tooltip-open");
    setCarterCashTooltipOpen(!isOpen);
  });
}

if (authForm) {
  authForm.addEventListener("submit", handleAuthFormSubmit);
}

if (authResendConfirmationButton) {
  authResendConfirmationButton.addEventListener("click", () => {
    void handleAuthResendConfirmationRequest();
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", handleSignUpFormSubmit);
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", handleForgotPasswordSubmit);
}

if (resetPasswordForm) {
  resetPasswordForm.addEventListener("submit", handleResetPasswordSubmit);
}

if (adminPrizeForm) {
  adminPrizeForm.addEventListener("submit", handleAdminPrizeSubmit);
}

if (adminPrizeImageFileInput) {
  adminPrizeImageFileInput.addEventListener("change", handlePrizeImageSelection);
}

if (adminAddButton) {
  adminAddButton.addEventListener("click", () => {
    openAdminCreateForm();
  });
}

if (adminContestAddButton) {
  adminContestAddButton.addEventListener("click", () => {
    if (!isAdmin()) {
      showToast("Admin access only", "error");
      return;
    }
    openAdminContestModal();
  });
}

if (adminModalCancelButton) {
  adminModalCancelButton.addEventListener("click", () => {
    closeAdminForm({ resetFields: true, restoreFocus: true });
  });
}

if (adminModalCloseButton) {
  adminModalCloseButton.addEventListener("click", () => {
    closeAdminForm({ resetFields: false, restoreFocus: true });
  });
}

applyAdminFormDefaults();

if (shippingForm) {
  shippingForm.addEventListener("submit", handleShippingSubmit);
}

if (adminContestForm) {
  adminContestForm.addEventListener("submit", handleAdminContestSubmit);
  adminContestForm.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === "prizeVariableBasis") {
      updateContestPrizeModeFields();
    }
    if (target instanceof HTMLInputElement && target.name === "startWhenRequirementReached") {
      updateContestLaunchModeFields();
    }
  });
  updateContestPrizeModeFields();
  updateContestLaunchModeFields();
  renderPrizeAllocationRows();
}

if (contestTabButtons.length) {
  contestTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setContestListTab(button.dataset.contestTab || "live");
    });
  });
  renderContestListTabs();
}

if (adminContestTabButtons.length) {
  adminContestTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAdminContestTab(button.dataset.adminContestTab || "upcoming");
    });
  });
  renderAdminContestTabs();
}

const addPrizeAllocationButton = document.getElementById("add-prize-allocation-button");
if (addPrizeAllocationButton) {
  addPrizeAllocationButton.addEventListener("click", () => {
    const next = getPrizeAllocationValues();
    next.push({
      place: next.length + 1,
      percentage: 0
    });
    renderPrizeAllocationRows(next);
  });
}

if (adminContestCancelButton) {
  adminContestCancelButton.addEventListener("click", () => {
    closeAdminContestModal({ resetFields: true, restoreFocus: true });
  });
}

if (adminContestCloseButton) {
  adminContestCloseButton.addEventListener("click", () => {
    closeAdminContestModal({ resetFields: true, restoreFocus: true });
  });
}

if (contestModalCloseButton) {
  contestModalCloseButton.addEventListener("click", () => {
    closeContestModal();
  });
}

if (contestModal) {
  contestModal.addEventListener("click", (event) => {
    if (event.target === contestModal) {
      closeContestModal();
    }
  });
}

if (contestOptInButton) {
  contestOptInButton.addEventListener("click", () => {
    void optIntoContest();
  });
}

if (contestResultsCloseButton) {
  contestResultsCloseButton.addEventListener("click", () => {
    closeContestResultsModal();
  });
}

if (contestResultsOkButton) {
  contestResultsOkButton.addEventListener("click", () => {
    closeContestResultsModal();
  });
}

if (contestResultsModal) {
  contestResultsModal.addEventListener("click", (event) => {
    if (event.target === contestResultsModal) {
      closeContestResultsModal();
    }
  });
}

if (adminContestResultsCloseButton) {
  adminContestResultsCloseButton.addEventListener("click", () => {
    closeAdminContestResultsModal();
  });
}

if (adminContestResultsOkButton) {
  adminContestResultsOkButton.addEventListener("click", () => {
    closeAdminContestResultsModal();
  });
}

if (adminContestResultsModal) {
  adminContestResultsModal.addEventListener("click", (event) => {
    if (event.target === adminContestResultsModal) {
      closeAdminContestResultsModal();
    }
  });
}

if (adminContestantsCloseButton) {
  adminContestantsCloseButton.addEventListener("click", () => {
    closeAdminContestantsModal();
  });
}

if (adminContestantsOkButton) {
  adminContestantsOkButton.addEventListener("click", () => {
    closeAdminContestantsModal();
  });
}

if (adminContestantsModal) {
  adminContestantsModal.addEventListener("click", (event) => {
    if (event.target === adminContestantsModal) {
      closeAdminContestantsModal();
    }
  });
}

if (contestJourneyCloseButton) {
  contestJourneyCloseButton.addEventListener("click", () => {
    closeContestJourneyModal();
  });
}

if (contestJourneyOkButton) {
  contestJourneyOkButton.addEventListener("click", () => {
    closeContestJourneyModal();
  });
}

if (contestJourneyModal) {
  contestJourneyModal.addEventListener("click", (event) => {
    if (event.target === contestJourneyModal) {
      closeContestJourneyModal();
    }
  });
}

if (shippingCancelButton) {
  shippingCancelButton.addEventListener("click", () => {
    closeShippingModal({ restoreFocus: true });
  });
}

if (shippingCloseButton) {
  shippingCloseButton.addEventListener("click", () => {
    closeShippingModal({ restoreFocus: true });
  });
}

// Profile form handlers
if (profileForm) {
  profileForm.addEventListener("submit", saveProfile);
}

if (contestEmailOptInInput) {
  contestEmailOptInInput.addEventListener("change", (event) => {
    void handleContestEmailPreferenceChange(event);
  });
}

if (homeRankLadderButton) {
  homeRankLadderButton.addEventListener("click", () => {
    void openRankLadderModal();
  });
}

if (rankLadderCloseButton) {
  rankLadderCloseButton.addEventListener("click", () => {
    closeRankLadderModal();
  });
}

if (rankLadderOkButton) {
  rankLadderOkButton.addEventListener("click", () => {
    closeRankLadderModal();
  });
}

if (rankLadderModal) {
  rankLadderModal.addEventListener("click", (event) => {
    if (event.target === rankLadderModal) {
      closeRankLadderModal();
    }
  });
}

if (rankUpCloseButton) {
  rankUpCloseButton.addEventListener("click", () => {
    closeRankUpModal();
  });
}

if (rankUpOkButton) {
  rankUpOkButton.addEventListener("click", () => {
    closeRankUpModal();
  });
}

if (rankUpModal) {
  rankUpModal.addEventListener("click", (event) => {
    if (event.target === rankUpModal) {
      closeRankUpModal();
    }
  });
}

if (adminAddRankButton) {
  adminAddRankButton.addEventListener("click", () => {
    openAdminRankModal();
  });
}

if (adminRankCloseButton) {
  adminRankCloseButton.addEventListener("click", () => {
    closeAdminRankModal({ restoreFocus: true, resetFields: true });
  });
}

if (adminRankCancelButton) {
  adminRankCancelButton.addEventListener("click", () => {
    closeAdminRankModal({ restoreFocus: true, resetFields: true });
  });
}

if (adminRankModal) {
  adminRankModal.addEventListener("click", (event) => {
    if (event.target === adminRankModal) {
      closeAdminRankModal({ restoreFocus: true, resetFields: true });
    }
  });
}

if (adminRankForm) {
  adminRankForm.addEventListener("submit", (event) => {
    void handleAdminRankSubmit(event);
  });

  const iconUrlField = adminRankForm.elements.namedItem("iconUrl");
  if (iconUrlField instanceof HTMLInputElement) {
    iconUrlField.addEventListener("input", () => {
      updateAdminRankIconPreview(iconUrlField.value);
    });
  }
}

if (adminRankIconFileInput) {
  adminRankIconFileInput.addEventListener("change", () => {
    const file = adminRankIconFileInput.files?.[0];
    if (!file) {
      const iconUrlField = adminRankForm?.elements.namedItem("iconUrl");
      updateAdminRankIconPreview(
        iconUrlField instanceof HTMLInputElement ? iconUrlField.value : ""
      );
      return;
    }
    updateAdminRankIconPreview(URL.createObjectURL(file));
  });
}

if (adminThemeForm) {
  resetAdminThemeForm();
  adminThemeForm.addEventListener("input", () => {
    applyPreviewTheme(getThemeFormState());
  });
  adminThemeForm.addEventListener("submit", (event) => {
    void handleAdminThemeSubmit(event);
  });
}

if (adminThemePreviewPageSelect) {
  adminThemePreviewPageSelect.addEventListener("change", () => {
    adminThemePreviewPage = adminThemePreviewPageSelect.value || "home";
    renderAdminThemePreview(adminThemePreviewPage);
    applyPreviewTheme(getThemeFormState());
  });
}

if (adminThemeCreateButton) {
  adminThemeCreateButton.addEventListener("click", () => {
    openAdminThemeModal();
  });
}

if (adminThemeCloseButton) {
  adminThemeCloseButton.addEventListener("click", () => {
    closeAdminThemeModal();
  });
}

if (adminThemeCancelButton) {
  adminThemeCancelButton.addEventListener("click", () => {
    closeAdminThemeModal();
  });
}

if (adminThemeModal) {
  adminThemeModal.addEventListener("click", (event) => {
    if (event.target === adminThemeModal) {
      closeAdminThemeModal();
    }
  });
}

if (adminThemeTryOnButton) {
  adminThemeTryOnButton.addEventListener("click", () => {
    setAdminThemeOverride(getThemeFormState(), { persist: false });
  });
}

if (adminThemeClearOverrideButton) {
  adminThemeClearOverrideButton.addEventListener("click", () => {
    setAdminThemeOverride(null);
  });
}

// Debug: Log button state at initialization
console.info("[RTN] Profile Edit Button Check:", {
  exists: !!profileEditButton,
  element: profileEditButton,
  hidden: profileEditButton?.hidden,
  disabled: profileEditButton?.disabled,
  style: profileEditButton?.style.cssText,
  computedDisplay: profileEditButton ? window.getComputedStyle(profileEditButton).display : null,
  computedPointerEvents: profileEditButton ? window.getComputedStyle(profileEditButton).pointerEvents : null
});

// Global test function for debugging
window.testEditClick = function() {
  console.info("[RTN] testEditClick called from inline onclick!");
  setProfileEditMode(true);
};

if (profileEditButton) {
  profileEditButton.addEventListener("click", (e) => {
    console.info("[RTN] Profile edit button CLICKED!", e);
    console.info("[RTN] Event target:", e.target);
    console.info("[RTN] Current target:", e.currentTarget);
    setProfileEditMode(true);
    profileFirstNameInput?.focus();
  });
} else {
  console.warn("[RTN] profileEditButton not found during event listener setup");
}

if (profileCancelButton) {
  profileCancelButton.addEventListener("click", cancelProfileEdit);
}

if (profileResetPasswordButton) {
  profileResetPasswordButton.addEventListener("click", handleProfilePasswordResetRequest);
}

if (profilePasswordToggle) {
  profilePasswordToggle.addEventListener("click", () => {
    if (!profilePasswordInput || profilePasswordInput.disabled) return;
    
    const isPassword = profilePasswordInput.type === "password";
    profilePasswordInput.type = isPassword ? "text" : "password";
    updatePasswordToggleIcon(!isPassword);
  });
}

if (prizeImageCloseButton) {
  prizeImageCloseButton.addEventListener("click", () => {
    closePrizeImageModal({ restoreFocus: true });
  });
}

if (prizeImageModal) {
  prizeImageModal.addEventListener("click", (event) => {
    if (event.target === prizeImageModal) {
      closePrizeImageModal({ restoreFocus: true });
    }
  });
}

if (numberBetsInfoButton) {
  numberBetsInfoButton.addEventListener("click", () => {
    openNumberBetsModal();
  });
}

if (paytableInfoButton) {
  paytableInfoButton.addEventListener("click", () => {
    openNumberBetsModal();
  });
}

if (numberBetsModalClose) {
  numberBetsModalClose.addEventListener("click", () => {
    closeNumberBetsModal({ restoreFocus: true });
  });
}

if (numberBetsModalOk) {
  numberBetsModalOk.addEventListener("click", () => {
    closeNumberBetsModal({ restoreFocus: true });
  });
}

if (numberBetsModal) {
  numberBetsModal.addEventListener("click", (event) => {
    if (event.target === numberBetsModal) {
      closeNumberBetsModal({ restoreFocus: true });
    }
  });
}

if (historyList) {
  historyList.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-hand-review-id]") : null;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    openHandReviewModal(button.dataset.handReviewId || "", button);
  });
}

if (handReviewCloseButton) {
  handReviewCloseButton.addEventListener("click", () => {
    closeHandReviewModal({ restoreFocus: true });
  });
}

if (handReviewOkButton) {
  handReviewOkButton.addEventListener("click", () => {
    closeHandReviewModal({ restoreFocus: true });
  });
}

if (handReviewModal) {
  handReviewModal.addEventListener("click", (event) => {
    if (event.target === handReviewModal) {
      closeHandReviewModal({ restoreFocus: true });
    }
  });
}

if (betAnalyticsClose) {
  betAnalyticsClose.addEventListener("click", () => {
    closeBetAnalyticsModal();
  });
}

if (betAnalyticsModal) {
  betAnalyticsModal.addEventListener("click", (event) => {
    if (event.target === betAnalyticsModal) {
      closeBetAnalyticsModal();
    }
  });
}

if (mostActiveWeekListEl) {
  mostActiveWeekListEl.addEventListener("click", (event) => {
    const bankrollButton =
      event.target instanceof HTMLElement ? event.target.closest("[data-player-bankroll-user-id]") : null;
    if (bankrollButton instanceof HTMLElement) {
      void openPlayerBankrollModal(
        bankrollButton.dataset.playerBankrollUserId || "",
        bankrollButton.dataset.playerBankrollName || "Player"
      );
      return;
    }

    const handsButton =
      event.target instanceof HTMLElement ? event.target.closest("[data-player-hands-user-id]") : null;
    if (handsButton instanceof HTMLElement) {
      void openPlayerHandsModal(
        handsButton.dataset.playerHandsUserId || "",
        handsButton.dataset.playerHandsName || "Player"
      );
      return;
    }

    const breakdownButton =
      event.target instanceof HTMLElement ? event.target.closest("[data-player-mode-breakdown-user-id]") : null;
    if (breakdownButton instanceof HTMLElement) {
      void openPlayerModeBreakdownModal(
        breakdownButton.dataset.playerModeBreakdownUserId || "",
        breakdownButton.dataset.playerModeBreakdownName || "Player"
      );
    }
  });
}

if (playerBankrollClose) {
  playerBankrollClose.addEventListener("click", () => {
    closePlayerBankrollModal();
  });
}

if (playerBankrollModal) {
  playerBankrollModal.addEventListener("click", (event) => {
    if (event.target === playerBankrollModal) {
      closePlayerBankrollModal();
    }
  });
}

document.querySelectorAll("[data-player-bankroll-period]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextPeriod = button instanceof HTMLElement ? button.dataset.playerBankrollPeriod || "year" : "year";
    playerBankrollPeriod = nextPeriod;
    document.querySelectorAll("[data-player-bankroll-period]").forEach((candidate) => {
      candidate.classList.toggle(
        "active",
        candidate instanceof HTMLElement && candidate.dataset.playerBankrollPeriod === nextPeriod
      );
    });
    if (activePlayerBankrollUserId) {
      void renderPlayerBankrollChart(activePlayerBankrollUserId, nextPeriod);
    }
  });
});

if (playerHandsClose) {
  playerHandsClose.addEventListener("click", () => {
    closePlayerHandsModal();
  });
}

if (playerHandsModal) {
  playerHandsModal.addEventListener("click", (event) => {
    if (event.target === playerHandsModal) {
      closePlayerHandsModal();
    }
  });
}

document.querySelectorAll("[data-player-hands-period]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextPeriod = button instanceof HTMLElement ? button.dataset.playerHandsPeriod || "year" : "year";
    playerHandsPeriod = nextPeriod;
    document.querySelectorAll("[data-player-hands-period]").forEach((candidate) => {
      candidate.classList.toggle(
        "active",
        candidate instanceof HTMLElement && candidate.dataset.playerHandsPeriod === nextPeriod
      );
    });
    if (activePlayerHandsUserId) {
      void renderPlayerHandsChart(activePlayerHandsUserId, nextPeriod);
    }
  });
});

if (playerModeBreakdownClose) {
  playerModeBreakdownClose.addEventListener("click", () => {
    closePlayerModeBreakdownModal();
  });
}

if (playerModeBreakdownOk) {
  playerModeBreakdownOk.addEventListener("click", () => {
    closePlayerModeBreakdownModal();
  });
}

if (playerModeBreakdownModal) {
  playerModeBreakdownModal.addEventListener("click", (event) => {
    if (event.target === playerModeBreakdownModal) {
      closePlayerModeBreakdownModal();
    }
  });
}

playerBreakdownFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextPeriod = button.dataset.playerBreakdownPeriod || "year";
    playerBreakdownPeriod = nextPeriod;
    playerBreakdownFilterButtons.forEach((candidate) => {
      candidate.classList.toggle(
        "active",
        candidate instanceof HTMLElement && candidate.dataset.playerBreakdownPeriod === nextPeriod
      );
    });
    if (activePlayerBreakdownUserId) {
      void renderPlayerModeBreakdown(activePlayerBreakdownUserId, nextPeriod);
    }
  });
});

// Chart filter buttons
document.querySelectorAll(".analytics-modal .chart-filter-btn[data-period]").forEach(button => {
  button.addEventListener("click", () => {
    const period = button.dataset.period;
    
    // Update active state
    document.querySelectorAll(".analytics-modal .chart-filter-btn[data-period]").forEach(btn => {
      btn.classList.remove("active");
    });
    button.classList.add("active");
    
    // Get current bet key from modal title
    const modalTitle = document.getElementById("bet-analytics-title");
    if (modalTitle) {
      const titleText = modalTitle.textContent;
      // Extract bet key - need to store it globally when modal opens
      if (window.currentAnalyticsBetKey) {
        renderBetVolumeChart(window.currentAnalyticsBetKey, period);
      }
    }
  });
});


// Admin tab switching
adminTabButtons.forEach(button => {
  button.addEventListener("click", () => {
    const targetTab = button.dataset.adminTab;
    
    // Update active tab
    adminTabButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");
    
    // Show/hide content
    if (targetTab === "prizes") {
      adminPrizesContent.hidden = false;
      adminAnalyticsContent.hidden = true;
      if (adminContestsContent) adminContestsContent.hidden = true;
      if (adminDesignContent) adminDesignContent.hidden = true;
      if (adminRanksContent) adminRanksContent.hidden = true;
    } else if (targetTab === "analytics") {
      adminPrizesContent.hidden = true;
      adminAnalyticsContent.hidden = false;
      if (adminContestsContent) adminContestsContent.hidden = true;
      if (adminDesignContent) adminDesignContent.hidden = true;
      if (adminRanksContent) adminRanksContent.hidden = true;
      loadPlayerFilter(); // Load player list for filter
      initializeAnalyticsBettingGrid();
      renderOverviewChart("year");
      renderActiveUsersChart("year");
      loadMostActiveThisWeek();
    } else if (targetTab === "contests") {
      adminPrizesContent.hidden = true;
      adminAnalyticsContent.hidden = true;
      if (adminContestsContent) adminContestsContent.hidden = false;
      if (adminDesignContent) adminDesignContent.hidden = true;
      if (adminRanksContent) adminRanksContent.hidden = true;
      loadAdminContestList(true);
    } else if (targetTab === "design") {
      adminPrizesContent.hidden = true;
      adminAnalyticsContent.hidden = true;
      if (adminContestsContent) adminContestsContent.hidden = true;
      if (adminDesignContent) adminDesignContent.hidden = false;
      if (adminRanksContent) adminRanksContent.hidden = true;
      void loadAdminThemes(true);
    } else if (targetTab === "ranks") {
      adminPrizesContent.hidden = true;
      adminAnalyticsContent.hidden = true;
      if (adminContestsContent) adminContestsContent.hidden = true;
      if (adminDesignContent) adminDesignContent.hidden = true;
      if (adminRanksContent) adminRanksContent.hidden = false;
      void loadAdminRanks(true);
    }
  });
});

// Overview chart filter buttons
document.querySelectorAll(".overview-filters .chart-filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    const period = button.dataset.period;
    
    // Update active state
    document.querySelectorAll(".overview-filters .chart-filter-btn").forEach(btn => {
      btn.classList.remove("active");
    });
    button.classList.add("active");
    
    // Render chart with new period
    renderOverviewChart(period);
  });
});

activeUsersFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const period = button.dataset.activeUsersPeriod || "year";
    renderActiveUsersChart(period);
  });
});

// Global variable to store selected player filter
let selectedPlayerIds = null; // null = all players, [] = specific players
let playerEmailMap = {}; // Map of user_id to email for display
let analyticsBetBadgePeriod = "all";
let analyticsPlayerFilterPromise = null;
let analyticsPlayerFilterLoaded = false;
let analyticsMostActiveRequestId = 0;
let analyticsMostActiveEntries = [];
let analyticsMostActiveVisibleCount = 10;
let playerBankrollChartInstance = null;
let playerBankrollPeriod = "year";
let activePlayerBankrollUserId = null;
let activePlayerBankrollName = "";
let playerHandsChartInstance = null;
let playerHandsPeriod = "year";
let activePlayerHandsUserId = null;
let activePlayerHandsName = "";
const ANALYTICS_TIME_ZONE = "America/Denver";

function formatAnalyticsDate(dateInput, options = {}) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone: ANALYTICS_TIME_ZONE,
    ...options
  });
}

function formatAnalyticsDateKey(dateInput) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(dateInput instanceof Date ? dateInput : new Date(dateInput));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
let activePlayerBreakdownUserId = null;
let activePlayerBreakdownName = "";
let playerBreakdownPeriod = "year";
const analyticsProfileCache = new Map();
const ANALYTICS_ACTIVITY_PAGE_SIZE = 10;

function cacheAnalyticsProfiles(profiles) {
  (profiles || []).forEach((profile) => {
    if (!profile?.id) return;
    analyticsProfileCache.set(profile.id, profile);
    playerEmailMap[profile.id] =
      profile.username ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      `User ${profile.id.substring(0, 8)}`;
  });
}

async function loadAnalyticsProfilesByIds(userIds) {
  const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
  const missingIds = uniqueIds.filter((id) => !analyticsProfileCache.has(id));
  const batchSize = 100;

  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, username, first_name, last_name, hands_played_all_time")
      .in("id", batch);

    if (error) {
      console.error("[RTN] Error loading analytics profiles batch:", error);
      continue;
    }

    cacheAnalyticsProfiles(profiles);
  }

  return new Map(uniqueIds.map((id) => [id, analyticsProfileCache.get(id) || null]));
}

function populatePlayerFilterOptions(profiles) {
  const select = document.getElementById("player-filter-select");
  if (!select) {
    console.warn("[RTN] Player filter select not found");
    return;
  }

  const sortedProfiles = [...(profiles || [])].sort((a, b) => {
    const nameA = getContestDisplayName(a, a?.id).toLowerCase();
    const nameB = getContestDisplayName(b, b?.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  select.innerHTML = '<option value="all" selected>All Players</option>';
  const selectedIdSet = selectedPlayerIds && selectedPlayerIds.length > 0 ? new Set(selectedPlayerIds) : null;

  const fragment = document.createDocumentFragment();
  sortedProfiles.forEach((profile) => {
    if (!profile?.id) return;
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = getContestDisplayName(profile, profile.id);
    option.selected = selectedIdSet ? selectedIdSet.has(profile.id) : false;
    fragment.appendChild(option);
  });

  select.appendChild(fragment);
}

async function loadPlayerFilterFromProfilesFallback() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, first_name, last_name, hands_played_all_time")
    .gt("hands_played_all_time", 0)
    .order("username", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(profiles) ? profiles : [];
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return message.includes("could not find the function") || details.includes("could not find the function");
}

function renderMostActiveEntries() {
  if (!mostActiveWeekListEl) return;

  mostActiveWeekListEl.innerHTML = "";

  if (!analyticsMostActiveEntries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "analytics-activity-item analytics-activity-empty";
    emptyItem.textContent = "No hands were played in this time range.";
    mostActiveWeekListEl.appendChild(emptyItem);
    if (mostActiveLoadMoreButton) mostActiveLoadMoreButton.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  analyticsMostActiveEntries.slice(0, analyticsMostActiveVisibleCount).forEach((entry, index) => {
    const profile = entry.profile || analyticsProfileCache.get(entry.userId) || null;
    const item = document.createElement("li");
    item.className = "analytics-activity-item";

    const rank = document.createElement("span");
    rank.className = "analytics-activity-rank";
    rank.textContent = `#${index + 1}`;

    const body = document.createElement("div");
    body.className = "analytics-activity-body";

    const name = document.createElement("span");
    name.className = "analytics-activity-name";
    name.textContent = getContestDisplayName(profile, entry.userId);

    const meta = document.createElement("span");
    meta.className = "analytics-activity-meta";
    meta.textContent = `${(entry.handsPlayed || 0).toLocaleString()} hands played`;

    const actions = document.createElement("div");
    actions.className = "analytics-activity-actions";

    const bankrollButton = document.createElement("button");
    bankrollButton.type = "button";
    bankrollButton.className = "analytics-inline-action";
    bankrollButton.dataset.playerBankrollUserId = entry.userId;
    bankrollButton.dataset.playerBankrollName = getContestDisplayName(profile, entry.userId);
    bankrollButton.textContent = "Bankroll Analytics";

    const viewGraphButton = document.createElement("button");
    viewGraphButton.type = "button";
    viewGraphButton.className = "analytics-inline-action";
    viewGraphButton.dataset.playerHandsUserId = entry.userId;
    viewGraphButton.dataset.playerHandsName = getContestDisplayName(profile, entry.userId);
    viewGraphButton.textContent = "Hands Played";

    const viewBreakdownButton = document.createElement("button");
    viewBreakdownButton.type = "button";
    viewBreakdownButton.className = "analytics-inline-action";
    viewBreakdownButton.dataset.playerModeBreakdownUserId = entry.userId;
    viewBreakdownButton.dataset.playerModeBreakdownName = getContestDisplayName(profile, entry.userId);
    viewBreakdownButton.textContent = "View Breakdown";

    body.append(name, meta);
    actions.appendChild(bankrollButton);
    actions.appendChild(viewGraphButton);
    actions.appendChild(viewBreakdownButton);
    item.append(rank, body, actions);
    fragment.appendChild(item);
  });

  mostActiveWeekListEl.appendChild(fragment);

  if (mostActiveLoadMoreButton) {
    const remainingCount = analyticsMostActiveEntries.length - analyticsMostActiveVisibleCount;
    mostActiveLoadMoreButton.hidden = remainingCount <= 0;
    if (remainingCount > 0) {
      mostActiveLoadMoreButton.textContent = `Load More (${remainingCount.toLocaleString()} left)`;
    }
  }
}

async function invokeAdminAnalytics(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("admin-analytics", {
    body: {
      action,
      ...payload
    }
  });
  if (error) {
    throw error;
  }
  return data || {};
}

async function loadPlayerBankrollHistory(userId) {
  if (!supabase || !userId) {
    return [];
  }
  const data = await invokeAdminAnalytics("player_bankroll_history", {
    userId,
    period: playerBankrollPeriod
  });
  return Array.isArray(data?.points) ? data.points : [];
}

async function loadPlayerHandsHistory(userId, period = "all") {
  const data = await invokeAdminAnalytics("hands_timeseries", {
    userId,
    period,
    endAt: new Date().toISOString(),
    targetUserIds: [userId]
  });
  return Array.isArray(data?.rows) ? data.rows : [];
}

function closePlayerBankrollModal() {
  if (!playerBankrollModal) {
    return;
  }

  playerBankrollModal.classList.remove("is-open");
  playerBankrollModal.setAttribute("aria-hidden", "true");
  playerBankrollModal.hidden = true;

  if (playerBankrollChartInstance) {
    playerBankrollChartInstance.destroy();
    playerBankrollChartInstance = null;
  }

  if (
    (!betAnalyticsModal || betAnalyticsModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!numberBetsModal || numberBetsModal.hidden) &&
    (!handReviewModal || handReviewModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function renderPlayerBankrollChart(userId, period = "year") {
  playerBankrollPeriod = period;
  const points = await loadPlayerBankrollHistory(userId);
  const source = points;

  const canvas = document.getElementById("player-bankroll-chart");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  if (playerBankrollChartInstance) {
    playerBankrollChartInstance.destroy();
  }

  const labels = source.map((point, index) => formatBankrollTickLabel(point, index, period));
  const values = source.length ? source.map((point) => Number(point.value || 0)) : [INITIAL_BANKROLL];

  playerBankrollChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Bankroll",
          data: values,
          borderColor: "rgba(53, 255, 234, 1)",
          backgroundColor: "rgba(53, 255, 234, 0.14)",
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: values.length > 1 ? 0 : 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(9, 18, 32, 0.95)",
          titleColor: "rgba(53, 255, 234, 1)",
          bodyColor: "rgba(226, 248, 255, 0.9)",
          borderColor: "rgba(53, 255, 234, 0.5)",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label(context) {
              return `Bankroll: ${formatCurrency(Number(context.parsed.y || 0))}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          grid: {
            color: "rgba(53, 255, 234, 0.1)"
          },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            callback(value) {
              return formatCurrency(Number(value || 0));
            }
          }
        }
      }
    }
  });

  if (playerBankrollSubheadEl) {
    const labelsByPeriod = {
      hour: `Showing ${source.length.toLocaleString()} account balance snapshots from the last hour.`,
      day: `Showing ${source.length.toLocaleString()} account balance snapshots from the last 24 hours.`,
      week: `Showing ${source.length.toLocaleString()} account balance snapshots from the last week.`,
      month: `Showing ${source.length.toLocaleString()} account balance snapshots from the last month.`,
      "90days": `Showing ${source.length.toLocaleString()} account balance snapshots from the last 90 days.`,
      year: `Showing ${source.length.toLocaleString()} account balance snapshots from the last year.`
    };
    playerBankrollSubheadEl.textContent = labelsByPeriod[period] || labelsByPeriod.year;
  }
}

async function openPlayerBankrollModal(userId, playerName) {
  if (!playerBankrollModal || !userId) {
    return;
  }

  activePlayerBankrollUserId = userId;
  activePlayerBankrollName = playerName || "Player";
  playerBankrollPeriod = "year";

  if (playerBankrollTitleEl) {
    playerBankrollTitleEl.textContent = `${activePlayerBankrollName} Bankroll Analytics`;
  }

  document.querySelectorAll("[data-player-bankroll-period]").forEach((button) => {
    button.classList.toggle(
      "active",
      button instanceof HTMLElement && button.dataset.playerBankrollPeriod === "year"
    );
  });

  playerBankrollModal.hidden = false;
  playerBankrollModal.classList.add("is-open");
  playerBankrollModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  await renderPlayerBankrollChart(userId, "year");
  playerBankrollClose?.focus();
}

function closePlayerHandsModal() {
  if (!playerHandsModal) {
    return;
  }

  playerHandsModal.classList.remove("is-open");
  playerHandsModal.setAttribute("aria-hidden", "true");
  playerHandsModal.hidden = true;

  if (playerHandsChartInstance) {
    playerHandsChartInstance.destroy();
    playerHandsChartInstance = null;
  }

  if (
    (!playerBankrollModal || playerBankrollModal.hidden) &&
    (!playerModeBreakdownModal || playerModeBreakdownModal.hidden) &&
    (!betAnalyticsModal || betAnalyticsModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!numberBetsModal || numberBetsModal.hidden) &&
    (!handReviewModal || handReviewModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function renderPlayerHandsChart(userId, period = "year") {
  playerHandsPeriod = period;
  const rows = await loadPlayerHandsHistory(userId, period);
  const labels = rows.map((row) => row.label || "");
  const runTheNumbersValues = rows.map((row) => Number(row.runTheNumbersHands || 0));
  const guess10Values = rows.map((row) => Number(row.guess10Hands || 0));
  const hasSplitData = rows.length > 0;

  const canvas = document.getElementById("player-hands-chart");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  if (playerHandsChartInstance) {
    playerHandsChartInstance.destroy();
  }

  playerHandsChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["No Data"],
      datasets: hasSplitData
        ? [
            {
              label: getGameLabel(GAME_KEYS.RUN_THE_NUMBERS),
              data: runTheNumbersValues,
              borderColor: "rgba(255, 209, 102, 1)",
              backgroundColor: "rgba(255, 209, 102, 0.18)",
              borderWidth: 2,
              fill: false,
              tension: 0.25,
              pointRadius: runTheNumbersValues.length > 1 ? 0 : 4,
              pointHoverRadius: 4
            },
            {
              label: getGameLabel(GAME_KEYS.GUESS_10),
              data: guess10Values,
              borderColor: "rgba(255, 118, 222, 1)",
              backgroundColor: "rgba(255, 118, 222, 0.14)",
              borderWidth: 2,
              fill: false,
              tension: 0.25,
              pointRadius: guess10Values.length > 1 ? 0 : 4,
              pointHoverRadius: 4
            }
          ]
        : [
            {
              label: "Hands Played",
              data: [0],
              borderColor: "rgba(255, 118, 222, 1)",
              backgroundColor: "rgba(255, 118, 222, 0.14)",
              borderWidth: 2,
              fill: false,
              tension: 0.25,
              pointRadius: 4
            }
          ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "rgba(226, 248, 255, 0.85)",
            boxWidth: 14,
            boxHeight: 14
          }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(9, 18, 32, 0.95)",
          titleColor: "rgba(255, 118, 222, 1)",
          bodyColor: "rgba(226, 248, 255, 0.9)",
          borderColor: "rgba(255, 118, 222, 0.5)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${Math.round(Number(context.parsed.y || 0)).toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(53, 255, 234, 0.1)" },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(53, 255, 234, 0.1)" },
          ticks: {
            color: "rgba(173, 225, 247, 0.75)",
            precision: 0,
            callback(value) {
              return Math.round(Number(value || 0)).toLocaleString();
            }
          }
        }
      }
    }
  });

  if (playerHandsSubheadEl) {
    const labelsByPeriod = {
      hour: `Showing ${rows.length.toLocaleString()} hands buckets from the last hour in US Mountain Time, split by game.`,
      day: `Showing ${rows.length.toLocaleString()} hands buckets from the last 24 hours in US Mountain Time, split by game.`,
      week: `Showing ${rows.length.toLocaleString()} hands buckets from the last week in US Mountain Time, split by game.`,
      month: `Showing ${rows.length.toLocaleString()} hands buckets from the last month in US Mountain Time, split by game.`,
      "90days": `Showing ${rows.length.toLocaleString()} hands buckets from the last 90 days in US Mountain Time, split by game.`,
      year: `Showing ${rows.length.toLocaleString()} hands buckets from the last year in US Mountain Time, split by game.`
    };
    playerHandsSubheadEl.textContent = labelsByPeriod[period] || labelsByPeriod.year;
  }
}

async function openPlayerHandsModal(userId, playerName) {
  if (!playerHandsModal || !userId) {
    return;
  }

  activePlayerHandsUserId = userId;
  activePlayerHandsName = playerName || "Player";
  playerHandsPeriod = "year";

  if (playerHandsTitleEl) {
    playerHandsTitleEl.textContent = `${activePlayerHandsName} Hands Played`;
  }

  document.querySelectorAll("[data-player-hands-period]").forEach((button) => {
    button.classList.toggle(
      "active",
      button instanceof HTMLElement && button.dataset.playerHandsPeriod === "year"
    );
  });

  playerHandsModal.hidden = false;
  playerHandsModal.classList.add("is-open");
  playerHandsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  await renderPlayerHandsChart(userId, "year");
  playerHandsClose?.focus();
}

function closePlayerModeBreakdownModal() {
  if (!playerModeBreakdownModal) {
    return;
  }

  playerModeBreakdownModal.classList.remove("is-open");
  playerModeBreakdownModal.setAttribute("aria-hidden", "true");
  playerModeBreakdownModal.hidden = true;

  if (
    (!playerBankrollModal || playerBankrollModal.hidden) &&
    (!betAnalyticsModal || betAnalyticsModal.hidden) &&
    (!resetModal || resetModal.hidden) &&
    (!shippingModal || shippingModal.hidden) &&
    (!paytableModal || paytableModal.hidden) &&
    (!adminPrizeModal || adminPrizeModal.hidden) &&
    (!prizeImageModal || prizeImageModal.hidden) &&
    (!numberBetsModal || numberBetsModal.hidden) &&
    (!handReviewModal || handReviewModal.hidden)
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function openPlayerModeBreakdownModal(userId, playerName) {
  if (!playerModeBreakdownModal || !playerModeBreakdownModeBodyEl || !playerModeBreakdownGameBodyEl || !userId) {
    return;
  }

  activePlayerBreakdownUserId = userId;
  activePlayerBreakdownName = playerName || "Player";
  if (playerModeBreakdownTitleEl) {
    playerModeBreakdownTitleEl.textContent = `${activePlayerBreakdownName} Breakdown`;
  }

  playerBreakdownPeriod = "year";
  playerBreakdownFilterButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button instanceof HTMLElement && button.dataset.playerBreakdownPeriod === playerBreakdownPeriod
    );
  });

  await renderPlayerModeBreakdown(userId, playerBreakdownPeriod);

  playerModeBreakdownModal.hidden = false;
  playerModeBreakdownModal.classList.add("is-open");
  playerModeBreakdownModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  playerModeBreakdownOk?.focus();
}

async function loadPlayerModeBreakdownFallback(userId, period = "year") {
  const startDate = getAnalyticsPeriodStart(period);
  const records = await fetchGameHandsRecords({
    startAt: startDate,
    endAt: new Date(),
    userIds: [userId],
    fields: ["user_id", "created_at", "game_id"]
  });
  const countsByGame = new Map(
    Object.values(GAME_KEYS).map((gameKey) => [gameKey, 0])
  );
  records.forEach((record) => {
    const gameKey = resolveGameKey(record.game_id);
    countsByGame.set(gameKey, (countsByGame.get(gameKey) || 0) + 1);
  });
  const gameRows = Array.from(countsByGame.entries()).map(([gameKey, handsPlayed]) => ({
    label: getGameLabel(gameKey),
    handsPlayed
  }));
  const gameTotalHands = gameRows.reduce((sum, row) => sum + Number(row.handsPlayed || 0), 0);

  const runRows = await loadGameRunsForUser(userId, { startAt: startDate });
  const contestHands = (Array.isArray(runRows) ? runRows : []).filter((row) => {
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const accountMode = String(metadata?.account_mode || "").trim().toLowerCase();
    const contestId = String(metadata?.contest_id || "").trim();
    return accountMode === "contest" || Boolean(contestId);
  }).length;
  const normalHands = Math.max(0, (Array.isArray(runRows) ? runRows.length : 0) - contestHands);
  const modeRows = [
    { label: "Normal Mode", handsPlayed: normalHands },
    { label: "Contest Mode", handsPlayed: contestHands }
  ];
  const modeTotalHands = modeRows.reduce((sum, row) => sum + Number(row.handsPlayed || 0), 0);

  return {
    modeRows,
    gameRows,
    modeTotalHands,
    gameTotalHands
  };
}

async function renderPlayerModeBreakdown(userId, period = "year") {
  let modeRows = [];
  let gameRows = [];
  let modeTotalHands = 0;
  let gameTotalHands = 0;
  try {
    const data = await invokeAdminAnalytics("player_mode_breakdown", {
      userId,
      period
    });
    modeRows = Array.isArray(data?.modeRows) ? data.modeRows : [];
    gameRows = Array.isArray(data?.gameRows) ? data.gameRows : [];
    modeTotalHands = Math.max(0, Number(data?.modeTotalHands || 0));
    gameTotalHands = Math.max(0, Number(data?.gameTotalHands || 0));
    if (!modeRows.length && !gameRows.length && modeTotalHands === 0 && gameTotalHands === 0) {
      const fallback = await loadPlayerModeBreakdownFallback(userId, period);
      modeRows = fallback.modeRows;
      gameRows = fallback.gameRows;
      modeTotalHands = fallback.modeTotalHands;
      gameTotalHands = fallback.gameTotalHands;
    }
  } catch (error) {
    console.warn("[RTN] player breakdown edge fallback", error);
    const fallback = await loadPlayerModeBreakdownFallback(userId, period);
    modeRows = fallback.modeRows;
    gameRows = fallback.gameRows;
    modeTotalHands = fallback.modeTotalHands;
    gameTotalHands = fallback.gameTotalHands;
  }

  if (playerModeBreakdownSummaryEl) {
    const labelsByPeriod = {
      hour: `Mode and game hands played in the last hour.`,
      day: `Mode and game hands played in the last 24 hours.`,
      week: `Mode and game hands played in the last 7 days.`,
      month: `Mode and game hands played in the last 30 days.`,
      "90days": `Mode and game hands played in the last 90 days.`,
      year: `Mode and game hands played in the last year.`
    };
    playerModeBreakdownSummaryEl.textContent = labelsByPeriod[period] || labelsByPeriod.year;
  }

  playerModeBreakdownModeBodyEl.innerHTML = "";
  modeRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Mode">${escapeAssistantHtml(row.label || "Unknown Mode")}</td>
      <td data-label="Hands">${formatRankRequirementValue(row.handsPlayed || 0)}</td>
    `;
    playerModeBreakdownModeBodyEl.appendChild(tr);
  });

  playerModeBreakdownGameBodyEl.innerHTML = "";
  gameRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Game">${escapeAssistantHtml(row.label || "Unknown Game")}</td>
      <td data-label="Hands">${formatRankRequirementValue(row.handsPlayed || 0)}</td>
    `;
    playerModeBreakdownGameBodyEl.appendChild(tr);
  });

  if (playerModeBreakdownModeTotalEl) {
    playerModeBreakdownModeTotalEl.textContent = formatRankRequirementValue(modeTotalHands);
  }
  if (playerModeBreakdownGameTotalEl) {
    playerModeBreakdownGameTotalEl.textContent = formatRankRequirementValue(gameTotalHands);
  }
}

function updateAnalyticsBetFilterUI() {
  const subhead = document.getElementById("analytics-bet-filter-subhead");
  const labels = {
    hour: "Showing bet counts from the last hour. Click on any bet to view detailed statistics.",
    day: "Showing bet counts from the last 24 hours. Click on any bet to view detailed statistics.",
    week: "Showing bet counts from the last 7 days. Click on any bet to view detailed statistics.",
    month: "Showing bet counts from the last 30 days. Click on any bet to view detailed statistics.",
    all: "Showing all-time bet counts. Click on any bet to view detailed statistics."
  };

  document.querySelectorAll("[data-bet-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.betPeriod === analyticsBetBadgePeriod);
  });

  if (subhead) {
    subhead.textContent = labels[analyticsBetBadgePeriod] || labels.all;
  }
}

function refreshBetBadgeCounts() {
  document.querySelectorAll(".analytics-bet-spot").forEach((button) => {
    const betKey = button.dataset.betKey;
    const badge = button.querySelector(".bet-count-badge");

    if (!badge || !betKey) return;
    badge.textContent = "...";

    loadBetBadgeCount(betKey).then((count) => {
      badge.textContent = count.toLocaleString();
    });
  });
}

document.querySelectorAll("[data-bet-period]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextPeriod = button.dataset.betPeriod || "all";
    if (analyticsBetBadgePeriod === nextPeriod) return;
    analyticsBetBadgePeriod = nextPeriod;
    updateAnalyticsBetFilterUI();
    refreshBetBadgeCounts();
  });
});

// Load all players for filter
async function loadPlayerFilter() {
  if (!supabase) return;

  const select = document.getElementById("player-filter-select");
  if (!select) {
    console.warn("[RTN] Player filter select not found");
    return;
  }

  if (analyticsPlayerFilterLoaded) {
    populatePlayerFilterOptions(Array.from(analyticsProfileCache.values()));
    return;
  }

  if (analyticsPlayerFilterPromise) {
    return analyticsPlayerFilterPromise;
  }

  console.info("[RTN] Loading players for filter");
  select.innerHTML = '<option value="all" selected>Loading players...</option>';

  analyticsPlayerFilterPromise = (async () => {
    try {
      let profiles = [];
      const { data, error } = await supabase.rpc("get_admin_analytics_players");

      if (error) {
        if (!isMissingRpcError(error)) {
          console.warn("[RTN] get_admin_analytics_players failed, using fallback:", error);
        }
        profiles = await loadPlayerFilterFromProfilesFallback();
      } else {
        profiles = Array.isArray(data) ? data : [];
      }

      playerEmailMap = {};
      cacheAnalyticsProfiles(profiles);
      populatePlayerFilterOptions(profiles);
      analyticsPlayerFilterLoaded = true;
      console.info(`[RTN] Populated filter with ${profiles.length} players`);
    } catch (error) {
      console.error("[RTN] Error loading player filter:", error);
      select.innerHTML = '<option value="all" selected>All Players (Error loading)</option>';
    } finally {
      analyticsPlayerFilterPromise = null;
    }
  })();

  return analyticsPlayerFilterPromise;
}

async function loadMostActiveThisWeek() {
  if (!supabase || !mostActiveWeekListEl) return;
  const requestId = ++analyticsMostActiveRequestId;
  analyticsMostActiveEntries = [];
  analyticsMostActiveVisibleCount = ANALYTICS_ACTIVITY_PAGE_SIZE;

  updateActivityFilterUI();

  mostActiveWeekListEl.innerHTML = "";
  if (mostActiveLoadMoreButton) {
    mostActiveLoadMoreButton.hidden = true;
    mostActiveLoadMoreButton.textContent = "Load More";
  }
  const loadingItem = document.createElement("li");
  loadingItem.className = "analytics-activity-item analytics-activity-empty";
  loadingItem.textContent = "Loading activity rankings...";
  mostActiveWeekListEl.appendChild(loadingItem);

  const startDate = getAnalyticsPeriodStart(activityLeaderboardPeriod);
  try {
    let rankedUsers = [];
    const { data, error } = await supabase.rpc("get_admin_most_active_hands", {
      start_at: startDate ? startDate.toISOString() : null,
      end_at: new Date().toISOString(),
      target_user_ids: selectedPlayerIds && selectedPlayerIds.length > 0 ? selectedPlayerIds : null,
      limit_count: null
    });

    if (error) {
      if (!isMissingRpcError(error)) {
        console.warn("[RTN] get_admin_most_active_hands failed, using fallback:", error);
      }
      rankedUsers = await loadMostActiveHandsFallback(startDate);
    } else {
      rankedUsers = Array.isArray(data)
        ? data.map((entry) => ({
            userId: entry.user_id,
            handsPlayed: Number(entry.hands_played || 0),
            profile: {
              id: entry.user_id,
              username: entry.username || null,
              first_name: entry.first_name || null,
              last_name: entry.last_name || null
            }
          }))
        : [];
      cacheAnalyticsProfiles(rankedUsers.map((entry) => entry.profile).filter(Boolean));
    }

    if (requestId !== analyticsMostActiveRequestId) return;
    analyticsMostActiveEntries = rankedUsers;
    renderMostActiveEntries();
  } catch (error) {
    if (requestId !== analyticsMostActiveRequestId) return;
    console.error("[RTN] loadMostActiveThisWeek error", error);
    mostActiveWeekListEl.innerHTML = "";
    const errorItem = document.createElement("li");
    errorItem.className = "analytics-activity-item analytics-activity-empty";
    errorItem.textContent = "Unable to load activity rankings.";
    mostActiveWeekListEl.appendChild(errorItem);
  }
}

async function loadMostActiveHandsFallback(startDate) {
  const allRecords = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("game_hands")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (startDate) {
      query = query.gte("created_at", startDate.toISOString());
    }

    if (selectedPlayerIds && selectedPlayerIds.length > 0) {
      query = query.in("user_id", selectedPlayerIds);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    if (Array.isArray(data) && data.length) {
      allRecords.push(...data);
      hasMore = data.length === pageSize;
      page += 1;
    } else {
      hasMore = false;
    }
  }

  const rankedMap = new Map();
  allRecords.forEach((record) => {
    const userId = record?.user_id;
    if (!userId) return;
    const current = rankedMap.get(userId) || {
      userId,
      handsPlayed: 0
    };
    current.handsPlayed += 1;
    rankedMap.set(userId, current);
  });

  const rankedUsers = Array.from(rankedMap.values()).sort((a, b) => {
    if ((b.handsPlayed || 0) !== (a.handsPlayed || 0)) return (b.handsPlayed || 0) - (a.handsPlayed || 0);
    return String(a.userId).localeCompare(String(b.userId));
  });
  const topUsers = rankedUsers.slice(0, 10);
  const profilesById = await loadAnalyticsProfilesByIds(topUsers.map((entry) => entry.userId));

  return topUsers.map((entry) => ({
    ...entry,
    profile: profilesById.get(entry.userId) || null
  }));
}

// Apply player filter
document.getElementById("apply-player-filter")?.addEventListener("click", () => {
  const select = document.getElementById("player-filter-select");
  const selectedOptions = Array.from(select.selectedOptions);
  
  if (selectedOptions.some(opt => opt.value === "all")) {
    selectedPlayerIds = null; // All players
    console.info("[RTN] Filter set to: All Players");
  } else {
    selectedPlayerIds = selectedOptions.map(opt => opt.value);
    console.info(`[RTN] Filter set to: ${selectedPlayerIds.length} player(s)`);
  }
  
  // Refresh all analytics data
  refreshAnalytics();
});

// Clear player filter
document.getElementById("clear-player-filter")?.addEventListener("click", () => {
  const select = document.getElementById("player-filter-select");
  Array.from(select.options).forEach(opt => {
    opt.selected = opt.value === "all";
  });
  selectedPlayerIds = null;
  console.info("[RTN] Filter cleared");
  refreshAnalytics();
});

// Refresh all analytics with current filter
function refreshAnalytics() {
  refreshBetBadgeCounts();
  
  // Reload overview chart
  const activeFilterBtn = document.querySelector(".overview-filters .chart-filter-btn.active");
  const period = activeFilterBtn?.dataset.period || "year";
  renderOverviewChart(period);
  const activeUsersFilterBtn = document.querySelector(".active-users-filters .chart-filter-btn.active");
  const activeUsersPeriod = activeUsersFilterBtn?.dataset.activeUsersPeriod || "year";
  renderActiveUsersChart(activeUsersPeriod);
  loadMostActiveThisWeek();
}

function initializeAnalyticsBettingGrid() {
  // Populate number bets
  const numberBetsContainer = document.querySelector(".analytics-number-bets .analytics-playmat");
  if (numberBetsContainer && numberBetsContainer.children.length === 0) {
    for (const rank of NUMBER_RANKS) {
      const button = document.createElement("button");
      button.className = "bet-spot analytics-bet-spot";
      button.type = "button";
      const betKey = `number-${rank}`;
      button.dataset.betKey = betKey;
      button.dataset.betLabel = `${rank === 'A' ? 'Ace' : rank}`;
      button.innerHTML = `<span class="bet-label">${rank}</span>`;
      button.addEventListener("click", () => {
        loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
      });
      numberBetsContainer.appendChild(button);
      
      // Add badge with loading state
      const badge = document.createElement('span');
      badge.className = 'bet-count-badge';
      badge.textContent = '...';
      button.appendChild(badge);
      
    }
  }

  // Populate specific card bets
  const specificCardsContainer = document.querySelector(".analytics-specific-card-bets .analytics-grid");
  if (specificCardsContainer && specificCardsContainer.children.length === 0) {
    const suits = [
      { symbol: "♥", name: "Hearts", class: "hearts" },
      { symbol: "♣", name: "Clubs", class: "clubs" },
      { symbol: "♠", name: "Spades", class: "spades" },
      { symbol: "♦", name: "Diamonds", class: "diamonds" }
    ];
    
    for (const suit of suits) {
      for (const rank of NUMBER_RANKS) {
        const button = document.createElement("button");
        button.className = "bet-spot specific-card-bet analytics-bet-spot";
        button.type = "button";
        const betKey = `card-${rank}${suit.symbol}`;
        button.dataset.betKey = betKey;
        button.dataset.betLabel = `${rank === 'A' ? 'Ace' : rank} of ${suit.name}`;
        button.innerHTML = `
          <span class="bet-label">
            <span class="card-rank">${rank}</span>
            <span class="card-suit ${suit.class}">${suit.symbol}</span>
          </span>
        `;
        button.addEventListener("click", () => {
          loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
        });
        specificCardsContainer.appendChild(button);
        
        // Add badge with loading state
        const badge = document.createElement('span');
        badge.className = 'bet-count-badge';
        badge.textContent = '...';
        button.appendChild(badge);
        
      }
    }
  }

  // Populate bust bets
  const bustBetsContainer = document.querySelector(".analytics-bust-card-bets .analytics-grid");
  if (bustBetsContainer && bustBetsContainer.children.length === 0) {
    const bustSuits = [
      { key: "bust-hearts", label: "Bust Hearts", icon: "♥", text: "Hearts" },
      { key: "bust-clubs", label: "Bust Clubs", icon: "♣", text: "Clubs" },
      { key: "bust-spades", label: "Bust Spades", icon: "♠", text: "Spades" },
      { key: "bust-diamonds", label: "Bust Diamonds", icon: "♦", text: "Diamonds" }
    ];
    const bustFaces = [
      { key: "bust-jack", label: "Bust Jack", text: "Jack" },
      { key: "bust-queen", label: "Bust Queen", text: "Queen" },
      { key: "bust-king", label: "Bust King", text: "King" }
    ];
    
    for (const bust of bustSuits) {
      const button = document.createElement("button");
      button.className = "bet-spot bust-bet analytics-bet-spot";
      button.type = "button";
      button.dataset.betKey = bust.key;
      button.dataset.betLabel = bust.label;
      button.innerHTML = `
        <span class="bet-label">
          <span class="suit-icon">${bust.icon}</span>
          <span class="bet-text">${bust.text}</span>
        </span>
      `;
      button.addEventListener("click", () => {
        loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
      });
      bustBetsContainer.appendChild(button);
      
      // Add badge with loading state
      const badge = document.createElement('span');
      badge.className = 'bet-count-badge';
      badge.textContent = '...';
      button.appendChild(badge);
      
    }
    
    for (const bust of bustFaces) {
      const button = document.createElement("button");
      button.className = "bet-spot bust-bet analytics-bet-spot";
      button.type = "button";
      button.dataset.betKey = bust.key;
      button.dataset.betLabel = bust.label;
      button.innerHTML = `<span class="bet-label">${bust.text}</span>`;
      button.addEventListener("click", () => {
        loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
      });
      bustBetsContainer.appendChild(button);
      
      // Add badge with loading state
      const badge = document.createElement('span');
      badge.className = 'bet-count-badge';
      badge.textContent = '...';
      button.appendChild(badge);
      
    }
    
    const jokerButton = document.createElement("button");
    jokerButton.className = "bet-spot bust-bet analytics-bet-spot";
    jokerButton.type = "button";
    jokerButton.dataset.betKey = "bust-joker";
    jokerButton.dataset.betLabel = "Bust Joker";
    jokerButton.innerHTML = `<span class="bet-label">Joker</span>`;
    jokerButton.addEventListener("click", () => {
      loadBetAnalytics(jokerButton.dataset.betKey, jokerButton.dataset.betLabel);
    });
    bustBetsContainer.appendChild(jokerButton);
    
    // Add badge with loading state for joker
    const jokerBadge = document.createElement('span');
    jokerBadge.className = 'bet-count-badge';
    jokerBadge.textContent = '...';
    jokerButton.appendChild(jokerBadge);
    
  }

  const suitBetsContainer = document.querySelector(".analytics-suit-bets .analytics-suit-bet-groups");
  if (suitBetsContainer && suitBetsContainer.children.length === 0) {
    const suitBetGroups = [
      {
        title: "None",
        odds: "6:5",
        bets: [
          { key: "suit-none-hearts", label: "No Hearts", icon: "♥", text: "Hearts" },
          { key: "suit-none-clubs", label: "No Clubs", icon: "♣", text: "Clubs" },
          { key: "suit-none-spades", label: "No Spades", icon: "♠", text: "Spades" },
          { key: "suit-none-diamonds", label: "No Diamonds", icon: "♦", text: "Diamonds" }
        ]
      },
      {
        title: "Any",
        odds: "3:4",
        bets: [
          { key: "suit-any-hearts", label: "Any Hearts", icon: "♥", text: "Hearts" },
          { key: "suit-any-clubs", label: "Any Clubs", icon: "♣", text: "Clubs" },
          { key: "suit-any-spades", label: "Any Spades", icon: "♠", text: "Spades" },
          { key: "suit-any-diamonds", label: "Any Diamonds", icon: "♦", text: "Diamonds" }
        ]
      },
      {
        title: "First",
        odds: "3:1",
        bets: [
          { key: "suit-first-hearts", label: "First Hearts", icon: "♥", text: "Hearts" },
          { key: "suit-first-clubs", label: "First Clubs", icon: "♣", text: "Clubs" },
          { key: "suit-first-spades", label: "First Spades", icon: "♠", text: "Spades" },
          { key: "suit-first-diamonds", label: "First Diamonds", icon: "♦", text: "Diamonds" }
        ]
      }
    ];

    for (const group of suitBetGroups) {
      const groupEl = document.createElement("div");
      groupEl.className = "suit-bet-group";
      groupEl.innerHTML = `
        <div class="suit-bet-group-header">
          <h4 class="suit-bet-group-title">${group.title}</h4>
          <span class="suit-bet-group-odds">${group.odds}</span>
        </div>
      `;
      const gridEl = document.createElement("div");
      gridEl.className = "suit-bet-grid analytics-grid";

      for (const suitBet of group.bets) {
        const button = document.createElement("button");
        button.className = "bet-spot suit-bet analytics-bet-spot";
        button.type = "button";
        button.dataset.betKey = suitBet.key;
        button.dataset.betLabel = suitBet.label;
        button.innerHTML = `
          <span class="bet-label">
            <span class="suit-icon">${suitBet.icon}</span>
            <span class="bet-text">${suitBet.text}</span>
          </span>
        `;
        button.addEventListener("click", () => {
          loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
        });
        const badge = document.createElement("span");
        badge.className = "bet-count-badge";
        badge.textContent = "...";
        button.appendChild(badge);
        gridEl.appendChild(button);
      }

      groupEl.appendChild(gridEl);
      suitBetsContainer.appendChild(groupEl);
    }
  }

  // Populate card count bets
  const countBetsContainer = document.querySelector(".analytics-card-count-bets .analytics-grid");
  if (countBetsContainer && countBetsContainer.children.length === 0) {
    const counts = [
      { key: "count-1", label: "1 Card" },
      { key: "count-2", label: "2 Cards" },
      { key: "count-3", label: "3 Cards" },
      { key: "count-4", label: "4 Cards" },
      { key: "count-5", label: "5 Cards" },
      { key: "count-6", label: "6 Cards" },
      { key: "count-7", label: "7 Cards" },
      { key: "count-8", label: "8+ Cards" }
    ];
    
    for (const count of counts) {
      const button = document.createElement("button");
      button.className = "bet-spot count-bet analytics-bet-spot";
      button.type = "button";
      button.dataset.betKey = count.key;
      button.dataset.betLabel = count.label;
      button.innerHTML = `<span class="bet-label">${count.label}</span>`;
      button.addEventListener("click", () => {
        loadBetAnalytics(button.dataset.betKey, button.dataset.betLabel);
      });
      countBetsContainer.appendChild(button);
      
      // Add badge with loading state
      const badge = document.createElement('span');
      badge.className = 'bet-count-badge';
      badge.textContent = '...';
      button.appendChild(badge);
      
    }
  }

  updateAnalyticsBetFilterUI();
  refreshBetBadgeCounts();
}

if (showSignUpButton) {
  showSignUpButton.addEventListener("click", async () => {
    if (signupForm) {
      signupForm.reset();
    }
    if (signupErrorEl) {
      signupErrorEl.hidden = true;
      signupErrorEl.textContent = "";
    }
    await setRoute("signup");
    signupFirstInput?.focus();
  });
}

if (showLoginButton) {
  showLoginButton.addEventListener("click", () => {
    if (authErrorEl) {
      authErrorEl.hidden = true;
      authErrorEl.textContent = "";
    }
    displayAuthScreen();
  });
}

if (showForgotPasswordButton) {
  showForgotPasswordButton.addEventListener("click", async () => {
    const forgotPasswordForm = document.getElementById("forgot-password-form");
    if (forgotPasswordForm) {
      forgotPasswordForm.reset();
    }
    const forgotErrorEl = document.getElementById("forgot-error");
    const forgotSuccessEl = document.getElementById("forgot-success");
    if (forgotErrorEl) {
      forgotErrorEl.hidden = true;
      forgotErrorEl.textContent = "";
    }
    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = true;
      forgotSuccessEl.textContent = "";
    }
    await setRoute("forgot-password");
    const forgotEmailInput = document.getElementById("forgot-email");
    forgotEmailInput?.focus();
  });
}

if (backToLoginButton) {
  backToLoginButton.addEventListener("click", () => {
    displayAuthScreen();
  });
}

routeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = button.dataset.routeTarget;
    closeActiveDrawer();
    await setRoute(target);
  });
});

signOutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    closeActiveDrawer();
    await handleSignOut();
  });
});

redBlackChipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (redBlackHandActive || redBlackSettlementPending) return;
    const value = Number(button.dataset.redBlackChip || 0);
    if (!RED_BLACK_CHIPS.includes(value)) return;
    redBlackSelectedChip = value;
    renderRedBlackChipRack();
    setRedBlackStatus(`Selected a ${formatCurrency(value)} unit chip. Tap the wager spot to add it to the hand.`);
  });
});

redBlackCategoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (redBlackAwaitingDecision || redBlackSettlementPending) return;
    const category = button.dataset.redBlackCategory;
    if (!category) return;
    setGuess10Category(category);
    setRedBlackStatus(`Category set to ${category.toUpperCase()}. Make your selection and review the multiplier.`);
  });
});

if (redBlackBetSpotButton) {
  redBlackBetSpotButton.addEventListener("click", (event) => {
    event.stopPropagation();
    handleGuess10BetSpotPress();
  });
}

if (redBlackClearBetButton) {
  redBlackClearBetButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (redBlackHandActive || redBlackSettlementPending || redBlackBet === 0) return;
    bankroll = roundCurrencyValue(bankroll + redBlackBet);
    handleBankrollChanged();
    redBlackBet = 0;
    redBlackCurrentPot = 0;
    renderRedBlackSummary();
    updateRedBlackActionState();
    setRedBlackStatus("Wager cleared. Select a chip and tap the bet spot to build your hand.");
  });
}

if (redBlackBetSpotWrapEl) {
  redBlackBetSpotWrapEl.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#red-black-clear-bet-inline")) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("#red-black-bet-spot")) {
      return;
    }
    handleGuess10BetSpotPress();
  });
}

if (redBlackWagerPrimaryEl) {
  redBlackWagerPrimaryEl.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#red-black-bet-spot-wrap")) {
      return;
    }
    handleGuess10BetSpotPress();
  });
}

if (redBlackRebetButton) {
  redBlackRebetButton.addEventListener("click", () => {
    rebetGuess10Hand();
  });
}

if (redBlackDealButton) {
  redBlackDealButton.addEventListener("click", () => {
    dealGuess10Card();
  });
}

if (redBlackWithdrawButton) {
  redBlackWithdrawButton.addEventListener("click", () => {
    withdrawGuess10Hand();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", handleHashChange);
}

if (panelScrim) {
  panelScrim.addEventListener("click", () => {
    closeActiveDrawer();
  });
}

if (changePaytableButton && paytableModal && paytableApplyButton && paytableCancelButton) {
  changePaytableButton.addEventListener("click", () => {
    if (changePaytableButton.disabled) return;
    openPaytableModal();
  });

  paytableApplyButton.addEventListener("click", () => {
    if (!paytableModal.hidden) {
      setActivePaytable(pendingPaytableId, { announce: true });
      closePaytableModal({ restoreFocus: true });
    }
  });

  paytableCancelButton.addEventListener("click", () => {
    pendingPaytableId = activePaytable.id;
    closePaytableModal({ restoreFocus: true });
  });

  if (paytableCloseButton) {
    paytableCloseButton.addEventListener("click", () => {
      pendingPaytableId = activePaytable.id;
      closePaytableModal({ restoreFocus: true });
    });
  }
}

if (resetConfirmButton) {
  resetConfirmButton.addEventListener("click", async () => {
    closeResetModal({ restoreFocus: false });
    await performAccountReset();
    resetAccountButton?.focus();
  });
}

if (resetCancelButton) {
  resetCancelButton.addEventListener("click", () => {
    closeResetModal({ restoreFocus: true });
  });
}

if (resetCloseButton) {
  resetCloseButton.addEventListener("click", () => {
    closeResetModal({ restoreFocus: true });
  });
}

const outOfCreditsOkButton = document.getElementById("out-of-credits-ok");
const outOfCreditsCloseButton = document.getElementById("out-of-credits-close");

if (outOfCreditsOkButton) {
  outOfCreditsOkButton.addEventListener("click", () => {
    closeOutOfCreditsModal({ restoreFocus: true });
  });
}

if (outOfCreditsCloseButton) {
  outOfCreditsCloseButton.addEventListener("click", () => {
    closeOutOfCreditsModal({ restoreFocus: true });
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (playAssistantOpen) {
      togglePlayAssistant(false);
      playAssistantToggle?.focus();
      event.preventDefault();
      return;
    }
    setCarterCashTooltipOpen(false);
    const outOfCreditsModal = document.getElementById("out-of-credits-modal");
    if (outOfCreditsModal && !outOfCreditsModal.hidden) {
      closeOutOfCreditsModal({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (prizeImageModal && !prizeImageModal.hidden) {
      closePrizeImageModal({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (contestResultsModal && !contestResultsModal.hidden) {
      closeContestResultsModal();
      event.preventDefault();
      return;
    }
    if (adminContestResultsModal && !adminContestResultsModal.hidden) {
      closeAdminContestResultsModal();
      event.preventDefault();
      return;
    }
    if (contestModal && !contestModal.hidden) {
      closeContestModal();
      event.preventDefault();
      return;
    }
    if (adminContestModal && !adminContestModal.hidden) {
      closeAdminContestModal({ resetFields: true, restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (adminThemeModal && !adminThemeModal.hidden) {
      closeAdminThemeModal();
      event.preventDefault();
      return;
    }
    if (resetModal && !resetModal.hidden) {
      closeResetModal({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (chipEditorModal && !chipEditorModal.hidden) {
      closeChipEditorModal({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (paytableModal && !paytableModal.hidden) {
      pendingPaytableId = activePaytable.id;
      closePaytableModal({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (openDrawerPanel) {
      event.preventDefault();
      closeActiveDrawer({ returnFocus: true });
    }
  }
});

document.addEventListener("click", (event) => {
  if (!carterCashInfoButton) return;
  const wrapper = carterCashInfoButton.closest(".carter-cash");
  if (!wrapper) return;
  if (event.target instanceof Node && wrapper.contains(event.target)) return;
  setCarterCashTooltipOpen(false);
});

  updateAdminVisibility(currentUser);
  updateResetButtonVisibility(currentUser);

initTheme();
startContestTimer();
setActivePaytable(activePaytable.id, { announce: false });
updatePaytableAvailability();
renderChipSelector();
setSelectedChip(selectedChip, false);
renderRedBlackChipRack();
resetGuess10Hand({ keepBet: false });
setRedBlackStatus("Build one base wager, choose COLOR, SUIT, or RANK, make your selection, then draw.");
renderBets();
updateBankroll();
updateCarterCashDisplay();
resetTable();
updateStatsUI();
updatePlayAssistantVisibility();
seedPlayAssistant();
updatePlayAssistantBounds();
resetBankrollHistory();
window.addEventListener("resize", schedulePlayAreaHeightUpdate);
window.addEventListener("resize", drawBankrollChart);
if (typeof window !== "undefined" && window.visualViewport) {
  window.visualViewport.addEventListener("resize", schedulePlayAreaHeightUpdate);
  window.visualViewport.addEventListener("scroll", schedulePlayAreaHeightUpdate);
}

async function bootstrapAuth(initialRoute) {
  try {
    // Prefer checking getSession (returns session + user) so we can detect
    // an active session restored by the Supabase client across page reloads.
    let sessionUser = null;
    try {
      if (supabase && typeof supabase.auth?.getSession === "function") {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn("[RTN] bootstrapAuth getSession error", sessionError);
        }
        sessionUser = sessionData?.session?.user ?? null;
      }
    } catch (err) {
      console.warn("[RTN] bootstrapAuth getSession threw", err);
      sessionUser = null;
    }

    // Fallback to getUser if getSession wasn't available or returned null.
    if (!sessionUser) {
      const { data: userResponse, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        console.error("[RTN] bootstrapAuth getUser error", getUserError);
      }
      sessionUser = userResponse?.user ?? null;
    }

    if (!sessionUser) {
      return false;
    }

    currentUser = sessionUser;
    updateAdminVisibility(currentUser);
    updateResetButtonVisibility(currentUser);

    // Ensure profile is loaded and applied
  await ensureProfileSynced({ force: true });

    // If the initial route is an auth route (except reset-password for recovery flow),
    // send them to home instead
    const isPasswordResetRoute = initialRoute === "reset-password";
    const route = (AUTH_ROUTES.has(initialRoute) && !isPasswordResetRoute) ? "home" : initialRoute;
    try {
      await setRoute(route, { replaceHash: true });
    } catch (err) {
      console.warn("[RTN] bootstrapAuth setRoute warning", err);
    }

    return true;
  } catch (error) {
    console.error("[RTN] bootstrapAuth exception", error);
    return false;
  }
}

// Register a global auth state listener so sign-in/sign-out events (including
// those caused by refresh or token changes) update the app state automatically.
function setupAuthListener() {
  try {
    // Guard so we only register the listener once.
    if (setupAuthListener._registered) {
      return;
    }
    setupAuthListener._registered = true;

    const registerAuthHandler = () => {
      try {
        if (!supabase || typeof supabase.auth?.onAuthStateChange !== "function") {
          return null;
        }
        // Avoid double-registration
        if (authSubscription) return authSubscription;

        const sub = supabase.auth.onAuthStateChange(async (event, session) => {
          console.info(`[RTN] auth state changed: ${event}`);
          const previousUserId =
            currentUser?.id && currentUser.id !== GUEST_USER.id ? currentUser.id : null;
          
          if (event === "PASSWORD_RECOVERY") {
            const user = session?.user ?? currentUser ?? null;
            if (user) {
              currentUser = user;
              updateAdminVisibility(currentUser);
              updateResetButtonVisibility(currentUser);
            }
            showToast("Choose your new password.", "info");
            setRoute("reset-password").catch(() => {});
          } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
            const user = session?.user ?? null;
            if (user) {
              if (previousUserId && previousUserId !== user.id) {
                resetSessionScopedGameplayState({
                  reason: `user-switch:${previousUserId}->${user.id}`,
                  resetRunTheNumbersStatus: true
                });
              }
              currentUser = user;
              updateAdminVisibility(currentUser);
              updateResetButtonVisibility(currentUser);
              
              // If we're on auth callback, we need to:
              // 1. First sync the profile (before changing route)
              // 2. Then navigate to home
              if (currentRoute === "auth/callback") {
                const isRecoveryFlow = isRecoveryRedirectUrl();
                console.info(`[RTN] SIGNED_IN on auth/callback, syncing profile then navigating to ${isRecoveryFlow ? "reset-password" : "home"}`);
                // Temporarily clear currentRoute so ensureProfileSynced doesn't skip
                const savedRoute = currentRoute;
                currentRoute = ""; // Clear so profile sync happens
                await ensureProfileSynced({ force: true }).catch((err) => console.warn("[RTN] Profile sync error:", err));
                currentRoute = savedRoute; // Restore so setRoute knows we're coming from callback
                setRoute(isRecoveryFlow ? "reset-password" : "home").catch(() => {});
              } else if (currentRoute === "auth" || currentRoute === "signup") {
                // For normal auth flows, sync profile and navigate
                await ensureProfileSynced({ force: true }).catch((err) => console.warn("[RTN] Profile sync error:", err));
                setRoute("home").catch(() => {});
              } else {
                // For token refresh or other updates, just sync profile
                await ensureProfileSynced({ force: true }).catch((err) => console.warn("[RTN] Profile sync error:", err));
              }
            }
          } else if (event === "SIGNED_OUT" || event === "USER_DELETED") {
            // Don't redirect if we're on a public auth page (auth, signup, forgot-password, callback)
            const isPublicAuthPage = currentRoute === "auth" || currentRoute === "signup" || 
                                    currentRoute === "forgot-password" || currentRoute === "reset-password" || currentRoute === "auth/callback";
            if (isPublicAuthPage) {
              console.info(`[RTN] SIGNED_OUT on ${currentRoute} page, staying put`);
              return;
            }
            // Apply signed out state so UI falls back to auth screen.
            applySignedOutState("auth-change", { focusInput: false });
          }
        });

        authSubscription = sub;
        return sub;
      } catch (err) {
        console.warn("[RTN] registerAuthHandler error", err);
        return null;
      }
    };

    // If supabase is already initialized and exposes auth, register immediately.
    registerAuthHandler();

    // Also listen for the supabase:ready event so if the client initializes
    // after app startup we can register the auth handler and attempt to
    // bootstrap the session (rehydrate any existing session).
    if (typeof window !== "undefined") {
      if (!setupAuthListener._readyListenerAttached) {
        window.addEventListener(
          "supabase:ready",
          async () => {
            try {
              console.info("[RTN] received supabase:ready, registering auth listener");
              registerAuthHandler();
              
              const routeFromHash = getRouteFromHash();
              const isRecoveryPage =
                routeFromHash === "forgot-password" ||
                routeFromHash === "reset-password" ||
                routeFromHash === "auth/callback";
              const shouldAttemptLateBootstrap =
                !isRecoveryPage &&
                (!currentUser?.id ||
                  currentUser.id === GUEST_USER.id ||
                  authBootstrapFallbackShown ||
                  routeFromHash === "auth" ||
                  routeFromHash === "signup");
              if (shouldAttemptLateBootstrap) {
                console.info(`[RTN] attempting late bootstrapAuth from route "${routeFromHash}"`);
                const restored = await bootstrapAuth(routeFromHash);
                if (restored) {
                  authBootstrapFallbackShown = false;
                }
              }
            } catch (err) {
              console.warn("[RTN] supabase:ready handler error", err);
            }
          },
          { once: true }
        );
        setupAuthListener._readyListenerAttached = true;
      }
    }
  } catch (error) {
    console.warn("[RTN] setupAuthListener error", error);
  }
}

async function initializeApp() {
  stripSupabaseRedirectHash();
  // start with a guest user until we determine session state
  currentUser = { ...GUEST_USER };

  // Ensure we are listening for auth state changes early so reloads and token
  // refreshes can rehydrate the session automatically.
  setupAuthListener();

  if (appShell) {
    appShell.removeAttribute("data-hidden");
  }

  const initialRoute = getRouteFromHash();
  console.info(`[RTN] initializeApp initial route resolved to "${initialRoute}"`);

  let sessionApplied = false;

  try {
    // Wait a short time for the Supabase client to become ready so
    // bootstrapAuth can detect an existing session without the app
    // briefly showing the auth screen. If the ready event doesn't
    // fire within the timeout we proceed (to avoid blocking startup).
    async function waitForSupabaseReady(timeoutMs = 5000) {
      if (supabase && typeof supabase.auth?.getSession === "function") {
        return true;
      }
      if (typeof window === "undefined") return false;
      return await new Promise((resolve) => {
        let settled = false;
        const onReady = () => {
          if (settled) return;
          settled = true;
          resolve(true);
        };
        window.addEventListener("supabase:ready", onReady, { once: true });
        setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(false);
        }, timeoutMs);
      });
    }

    const clientReady = await waitForSupabaseReady();
    console.info(`[RTN] initializeApp waitForSupabaseReady result=${clientReady}`);

    // Check if URL contains auth tokens/code (magic link callback)
    const hasAuthTokensInUrl = window.location.hash.includes("access_token=") || 
                               window.location.hash.includes("refresh_token=") ||
                               window.location.search.includes("access_token=") ||
                               window.location.search.includes("refresh_token=") ||
                               window.location.search.includes("code=");  // PKCE flow
    
    if (hasAuthTokensInUrl) {
      console.info("[RTN] initializeApp detected auth tokens/code in URL");
      console.info("[RTN] Showing callback view and waiting for Supabase to process...");
      const isRecoveryCallback = isRecoveryRedirectUrl();
      
      // Show callback spinner immediately
      showAuthCallbackView();
      currentRoute = "auth/callback";
      
      // Supabase client with detectSessionInUrl:true will automatically:
      // 1. Extract tokens/code from URL
      // 2. Exchange PKCE code for session (if needed)
      // 3. Store session in localStorage
      // 4. Fire SIGNED_IN event via onAuthStateChange
      // 5. Clean up the URL (remove tokens/code)
      
      // Wait for the SIGNED_IN event to fire, but also poll for session as fallback
      console.info("[RTN] Waiting for Supabase to fire SIGNED_IN event...");
      
      // Fallback: Check for session after a delay in case event doesn't fire
      const checkSessionAndNavigate = async () => {
        // Wait for Supabase to process the tokens (2 seconds should be plenty)
        await delay(2000);
        
        console.info("[RTN] Callback fallback: checking if session was established...");
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("[RTN] Callback fallback: error getting session", error);
          showToast("Authentication failed. Please try again.", "error");
          showAuthView("login");
          updateHash("auth", { replace: true });
          return;
        }
        
        if (session?.user) {
          console.info(`[RTN] Callback fallback: session found, navigating to ${isRecoveryCallback ? "reset-password" : "home"}`);
          currentUser = session.user;
          updateAdminVisibility(currentUser);
          updateResetButtonVisibility(currentUser);
          
          // Temporarily clear currentRoute so ensureProfileSynced doesn't skip
          currentRoute = "";
          await ensureProfileSynced({ force: true }).catch((err) => console.warn("[RTN] Profile sync error:", err));
          currentRoute = "auth/callback";
          
          // Hide the callback view explicitly
          const authCallbackView = document.getElementById("auth-callback-view");
          if (authCallbackView) {
            setViewVisibility(authCallbackView, false);
          }
          
          await setRoute(isRecoveryCallback ? "reset-password" : "home");
          markAppReady(); // Make sure UI is visible after navigation
        } else {
          console.warn("[RTN] Callback fallback: no session found after processing");
          showToast("Authentication incomplete. Please try again.", "error");
          showAuthView("login");
          updateHash("auth", { replace: true });
        }
      };
      
      checkSessionAndNavigate().catch((err) => {
        console.error("[RTN] Callback fallback error:", err);
        showAuthView("login");
        updateHash("auth", { replace: true });
      });
      
      return; // Don't do anything else - let the auth event handler or fallback take over
    }

    const isPasswordSupportRoute =
      initialRoute === "forgot-password" || initialRoute === "reset-password";

    if (isPasswordSupportRoute) {
      console.info(`[RTN] initializeApp showing public auth page: ${initialRoute}`);
      currentRoute = initialRoute;
      if (initialRoute === "forgot-password") {
        showAuthView("forgot-password");
        updateHash("forgot-password", { replace: true });
      } else {
        showAuthView("reset-password");
        updateHash("reset-password", { replace: true });
      }
    } else {
      sessionApplied = await bootstrapAuth(initialRoute);
      console.info(`[RTN] initializeApp bootstrapAuth sessionApplied=${sessionApplied}`);

      if (!sessionApplied) {
        console.info(`[RTN] initializeApp showing public auth page: ${initialRoute}`);
        authBootstrapFallbackShown = true;
        currentRoute = initialRoute === "signup" ? "signup" : "auth";
        if (initialRoute === "signup") {
          showAuthView("signup");
          updateHash("signup", { replace: true });
        } else {
          showAuthView("login");
          updateHash("auth", { replace: true });
        }
      }
    }
  } catch (error) {
    console.error("[RTN] Error initializing app:", error);
    console.info("[RTN] initializeApp showing auth view due to initialization error");
    showAuthView("login");
    updateHash("auth", { replace: true });
  } finally {
    markAppReady();
  }
}

initializeApp();
