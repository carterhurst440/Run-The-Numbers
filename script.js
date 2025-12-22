import { supabase } from "./supabaseClient.js";

console.info("[RTN] main script loaded");

if (typeof document !== "undefined" && document.body) {
  document.body.dataset.appState = "loading";
  console.info("[RTN] body dataset appState set to \"loading\" on script load");
}

let appReady = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (typeof window === "undefined") {
    return;
  }

  const rawHash = window.location.hash || "";
  const search = window.location.search || "";
  const hashContainsTokens = rawHash.startsWith("#access_token=");
  const searchContainsTokens = search.includes("access_token=");
  
  // Don't strip if this is a password recovery redirect - Supabase needs to process it
  const isPasswordRecovery = rawHash.includes("type=recovery") || search.includes("type=recovery");
  
  if ((hashContainsTokens || searchContainsTokens) && !isPasswordRecovery) {
    const cleanedHash = hashContainsTokens ? "" : rawHash;
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${cleanedHash}`
    );
  }
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
const DENOMINATIONS = [5, 10, 25, 100];
const INITIAL_BANKROLL = 1000;
const ADMIN_EMAIL = "carterwarrenhurst@gmail.com";
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

function showAuthView(mode = "login") {
  hideAllRoutes();
  if (appShell) {
    appShell.setAttribute("data-hidden", "true");
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
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = true;
      resetPasswordErrorEl.textContent = "";
    }
    if (resetPasswordSubmitButton) {
      resetPasswordSubmitButton.disabled = false;
    }
  }
}

function updateHash(route, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const hash = `#/${route}`;
  suppressHash = true;
  if (replace && typeof history !== "undefined" && history.replaceState) {
    history.replaceState(null, "", hash);
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

  if (!routeViews[nextRoute] && !isAuthRoute) {
    nextRoute = "home";
  }

  if (!currentUser) {
    currentUser = { ...GUEST_USER };
  }

  updateAdminVisibility(currentUser);
  updateResetButtonVisibility(currentUser);

  await ensureProfileSynced({ force: !currentProfile });

  if (!isAuthRoute && nextRoute === "admin" && !isAdmin()) {
    showToast("Admin access only", "error");
    nextRoute = "home";
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

  let resolvedRoute = isAuthRoute ? "home" : nextRoute;
  if (!routeViews[resolvedRoute]) {
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

  if (resolvedRoute === "play") {
    schedulePlayAreaHeightUpdate();
  } else {
    clearPlayAreaHeight();
  }

  currentRoute = resolvedRoute;

  if (isAuthRoute) {
    // Show the specific auth view
    if (nextRoute === "signup") {
      showAuthView("signup");
    } else if (nextRoute === "forgot-password") {
      showAuthView("forgot-password");
    } else if (nextRoute === "reset-password") {
      showAuthView("reset-password");
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
  }
}

function getRouteFromHash() {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash || "";
  
  // Check if this is a password recovery redirect from Supabase
  if (hash.includes("type=recovery") || hash.includes("type%3Drecovery")) {
    return "reset-password";
  }
  
  const match = hash.match(/#\/([\w-]+)/);
  return match ? match[1] : "home";
}

function handleHashChange() {
  if (suppressHash) return;
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
        .select("id, username, credits, carter_cash, carter_cash_progress, first_name, last_name")
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
        "id, username, credits, carter_cash, carter_cash_progress, first_name, last_name"
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
  if (!currentUser) {
    currentUser = { ...GUEST_USER };
  }
  const now = Date.now();
  if (!force && currentProfile && now - lastProfileSync < PROFILE_SYNC_INTERVAL) {
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
    currentProfile = resolvedProfile;
    const applied = applyProfileCredits(resolvedProfile, { resetHistory: !bankrollInitialized });
    lastProfileSync = Date.now();
    return applied;
  }

  // fallback to guest profile only if not logged in or fetch fails
  currentProfile = { ...GUEST_PROFILE, id: currentUser.id || GUEST_USER.id };
  const appliedFallback = applyProfileCredits(currentProfile, { resetHistory: !bankrollInitialized });
  lastProfileSync = Date.now();
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
    return;
  }

  if (authSubmitButton) {
    authSubmitButton.disabled = true;
  }
  if (authErrorEl) {
    authErrorEl.hidden = true;
    authErrorEl.textContent = "";
  }

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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName
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

  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : forgotPasswordForm;
  if (!form || !forgotSubmitButton) {
    return;
  }

  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    if (forgotErrorEl) {
      forgotErrorEl.hidden = false;
      forgotErrorEl.textContent = "Please enter your email address.";
    }
    return;
  }

  forgotSubmitButton.disabled = true;
  if (forgotErrorEl) {
    forgotErrorEl.hidden = true;
    forgotErrorEl.textContent = "";
  }
  if (forgotSuccessEl) {
    forgotSuccessEl.hidden = true;
    forgotSuccessEl.textContent = "";
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}#/reset-password`
    });

    if (error) {
      throw error;
    }

    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = false;
      forgotSuccessEl.textContent = "Password reset link sent! Check your email.";
    }
    showToast("Password reset link sent to your email", "success");
    
    if (forgotPasswordForm) {
      forgotPasswordForm.reset();
    }
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to send reset link";
    showToast(message, "error");
    if (forgotErrorEl) {
      forgotErrorEl.hidden = false;
      forgotErrorEl.textContent = message;
    }
  } finally {
    forgotSubmitButton.disabled = false;
  }
}

async function handleResetPasswordSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : resetPasswordForm;
  if (!form || !resetPasswordSubmitButton) {
    return;
  }

  const formData = new FormData(form);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || !confirmPassword) {
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = "Please enter and confirm your new password.";
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

  if (password.length < 6) {
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = "Password must be at least 6 characters.";
    }
    return;
  }

  resetPasswordSubmitButton.disabled = true;
  if (resetPasswordErrorEl) {
    resetPasswordErrorEl.hidden = true;
    resetPasswordErrorEl.textContent = "";
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      throw error;
    }

    showToast("Password updated successfully", "success");
    
    if (resetPasswordForm) {
      resetPasswordForm.reset();
    }

    // Redirect to home after successful password reset
    await setRoute("home");
  } catch (error) {
    console.error(error);
    const message = error?.message || "Unable to update password";
    showToast(message, "error");
    if (resetPasswordErrorEl) {
      resetPasswordErrorEl.hidden = false;
      resetPasswordErrorEl.textContent = message;
    }
  } finally {
    resetPasswordSubmitButton.disabled = false;
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
  document.querySelectorAll(".chart-filter-btn").forEach(btn => {
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

async function renderOverviewChart(period = "all") {
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

  // Calculate date range
  const now = new Date();
  let startDate = null;

  if (period === "week") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "90days") {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (period === "year") {
    startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }

  // Fetch ALL records using pagination (Supabase has 1000 row default limit)
  const allRecords = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  console.info(`[RTN] Fetching all bet plays in batches...`);

  while (hasMore) {
    let query = supabase
      .from("bet_plays")
      .select("bet_key, placed_at, user_id")
      .not("bet_key", "is", null)
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
      console.error("[RTN] Error loading overview chart data:", error);
      if (loadingOverlay) loadingOverlay.style.display = "none";
      document.querySelectorAll(".overview-filters .chart-filter-btn").forEach(btn => {
        btn.disabled = false;
      });
      return;
    }

    if (data && data.length > 0) {
      allRecords.push(...data);
      console.info(`[RTN] Fetched page ${page + 1}: ${data.length} records (total so far: ${allRecords.length})`);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  console.info(`[RTN] Loaded ${allRecords.length} total bet play records`);
  
  // Debug: Check what bet_keys we actually got
  if (allRecords && allRecords.length > 0) {
    const uniqueKeys = [...new Set(allRecords.map(r => r.bet_key))];
    console.info(`[RTN] Found ${uniqueKeys.length} unique bet_keys:`, uniqueKeys.slice(0, 10));
    
    const todayStr = now.toISOString().split("T")[0];
    const todayRecords = allRecords.filter(r => r.placed_at.startsWith(todayStr));
    console.info(`[RTN] Records from today (${todayStr}): ${todayRecords.length}`);
  }

  // Determine date range for chart
  let chartStartDate;
  if (startDate) {
    chartStartDate = startDate;
  } else if (allRecords.length > 0) {
    const sorted = allRecords.sort((a, b) => a.placed_at.localeCompare(b.placed_at));
    chartStartDate = new Date(sorted[0].placed_at);
  } else {
    chartStartDate = now;
  }

  // Generate all dates from start to today
  const dates = [];
  const current = new Date(chartStartDate);
  current.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  while (current <= today) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  // Count bet plays per date
  const countsMap = {};
  dates.forEach(date => {
    countsMap[date] = 0;
  });

  allRecords.forEach(record => {
    const dateStr = record.placed_at.split("T")[0];
    if (countsMap.hasOwnProperty(dateStr)) {
      countsMap[dateStr]++;
    }
  });

  const counts = dates.map(date => countsMap[date]);

  const todayStr = now.toISOString().split("T")[0];
  console.info(`[RTN] Today (${todayStr}) has ${countsMap[todayStr] ?? 0} bet plays`);
  console.info(`[RTN] Chart date range: ${dates[0]} to ${dates[dates.length - 1]}`);

  // Render chart
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
      labels: dates,
      datasets: [{
        label: "Total Bet Plays",
        data: counts,
        borderColor: "rgba(255, 105, 180, 1)",
        backgroundColor: "rgba(255, 105, 180, 0.2)",
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
          titleColor: "rgba(255, 105, 180, 1)",
          bodyColor: "rgba(226, 248, 255, 0.9)",
          borderColor: "rgba(255, 105, 180, 0.5)",
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

  console.info("[RTN] Overview chart rendered successfully");
  
  // Hide loading state
  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }
  
  // Re-enable filter buttons
  document.querySelectorAll(".overview-filters .chart-filter-btn").forEach(btn => {
    btn.disabled = false;
  });
}

// Load badge count for individual bet - uses EXACT same query as modal
async function loadBetBadgeCount(betKey) {
  if (!supabase) return 0;
  
  // EXACT same query as modal uses
  let query = supabase
    .from("bet_plays")
    .select("amount_wagered, amount_paid, net")
    .eq("bet_key", betKey);
  
  // Apply player filter if selected
  if (selectedPlayerIds && selectedPlayerIds.length > 0) {
    query = query.in("user_id", selectedPlayerIds);
  }
  
  const { data, error } = await query;

  if (error) {
    console.error(`[RTN] Error loading count for ${betKey}:`, error);
    return 0;
  }

  // EXACT same count as modal: data.length
  const count = data?.length ?? 0;
  console.info(`[RTN] Badge count for ${betKey}: ${count}`);
  return count;
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
  if (dashboardLoaded && !force) {
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
  let resolvedProfile = currentProfile;
  if (!resolvedProfile || force) {
    resolvedProfile = await fetchProfileWithRetries(currentUser.id, {
      attempts: 5,
      delayMs: 1000,
      timeoutMs: 5000
    });
  }

  if (resolvedProfile) {
    console.info(
      `[RTN] loadDashboard applying profile ${resolvedProfile.id} (credits=${resolvedProfile.credits}, carterCash=${resolvedProfile.carter_cash})`
    );
    const appliedProfile = applyProfileCredits(resolvedProfile, {
      resetHistory: !bankrollInitialized
    });
    const profileForDashboard = appliedProfile ?? resolvedProfile;
    currentProfile = profileForDashboard;
    lastProfileSync = Date.now();
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
    (!prizeImageModal || prizeImageModal.hidden)
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
    adminEditingPrizeId = null;
    adminPrizeCache = [];
    lastProfileSync = Date.now();

  if (dashboardProfileRetryTimer) {
    clearFn(dashboardProfileRetryTimer);
    dashboardProfileRetryTimer = null;
  }

  stats = { hands: 0, wagered: 0, paid: 0 };
  updateStatsUI();

  resetBets();
  lastBetLayout = [];
  currentOpeningLayout = [];
  // Advanced mode is always enabled - no need to initialize toggle
  historyList.innerHTML = "";

  bankroll = INITIAL_BANKROLL;
  handleBankrollChanged();
  updateDashboardCreditsDisplay(0);
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

  setSelectedChip(DENOMINATIONS[0], false);
  resetTable("Select a chip and place your bets in the betting panel.", { clearDraws: true });
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

  // Don't redirect to auth screen if we're on reset-password route (user is resetting password from email)
  const currentHash = typeof window !== "undefined" ? window.location.hash : "";
  const isResettingPassword = currentHash.includes("reset-password") || currentHash.includes("type=recovery");
  
  if (!isResettingPassword) {
    displayAuthScreen({ focus: focusInput });
  }
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
  const { data: userResponse, error: logRunUserError } = await supabase.auth.getUser();
  if (logRunUserError) {
    console.error("[RTN] logGameRun getUser error", logRunUserError);
  }
  const sessionUser = userResponse?.user ?? null;
  if (!sessionUser) {
    throw new Error("User not logged in");
  }
  await supabase.from("game_runs").insert({
    user_id: sessionUser.id,
    score,
    metadata
  });
}

async function logHandAndBets(stopperCard, context, betSnapshots, netThisHand) {
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
      stopper_label: stopperCard?.label ?? null,
      stopper_suit: stopperCard?.suitName ?? null,
      total_cards: context?.totalCards ?? null,
      total_wager: totalWager,
      total_paid: totalPaid,
      net: netThisHand
    };

    const { data: hand, error: handError } = await supabase
      .from("game_hands")
      .insert(handPayload)
      .select()
      .single();

    if (handError) {
      console.error("hand insert failed", handError);
      return;
    }

    if (safeBets.length === 0) {
      return;
    }

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

    const { error: betsError } = await supabase.from("bet_plays").insert(betRows);

    if (betsError) {
      console.error("bet insert failed", betsError);
    }
  } catch (error) {
    console.error("Failed to log hand and bets", error);
  }
  // end logHandAndBets
}

function applyTheme(theme) {
  const next = THEME_CLASS_MAP[theme] ? theme : "blue";
  if (!document.body) {
    currentTheme = next;
    return;
  }
  if (currentTheme === next && document.body.classList.contains(THEME_CLASS_MAP[next])) {
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
  currentTheme = next;
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => drawBankrollChart());
  } else {
    drawBankrollChart();
  }
}

function initTheme() {
  // Always use blue theme
  applyTheme("blue");
}

const bankrollEl = document.getElementById("bankroll");
const carterCashEl = document.getElementById("carter-cash");
const carterCashDeltaEl = document.getElementById("carter-cash-delta");
const handToastContainer = document.getElementById("hand-toast-container");
const betsBody = document.getElementById("bets-body");
const dealButton = document.getElementById("deal-button");
const rebetButton = document.getElementById("rebet-button");
const clearBetsButtons = Array.from(
  document.querySelectorAll('[data-action="clear-bets"]')
);
const drawsContainer = document.getElementById("draws");
const statusEl = document.getElementById("status");
const chipSelectorEl = document.getElementById("chip-selector");
const chipButtons = Array.from(document.querySelectorAll(".chip-choice"));
const betSpotButtons = Array.from(document.querySelectorAll(".bet-spot"));
const betDefinitions = new Map();
const betSpots = new Map();
betSpotButtons.forEach((button) => {
  const key = button.dataset.betKey || button.dataset.rank;
  if (!key) return;
  const type = button.dataset.betType || "number";
  const label = button.dataset.betLabel || button.querySelector(".bet-label")?.textContent?.trim() || key;
  const lockDuringHand = button.dataset.lock === "hand";
  const payout = Number(button.dataset.payout) || 0;
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
  } else {
    announce = label;
  }

  betDefinitions.set(key, {
    key,
    type,
    label,
    lockDuringHand,
    payout,
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
const resetAccountButton = document.getElementById("reset-account");
const menuToggle = document.getElementById("menu-toggle");
const utilityPanel = document.getElementById("utility-panel");
const utilityClose = document.getElementById("utility-close");
const graphToggle = document.getElementById("graph-toggle");
const chartPanel = document.getElementById("chart-panel");
const chartClose = document.getElementById("chart-close");
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
const paytableModal = document.getElementById("paytable-modal");
const paytableForm = document.getElementById("paytable-form");
const paytableApplyButton = document.getElementById("paytable-apply");
const paytableCancelButton = document.getElementById("paytable-cancel");
const paytableCloseButton = document.getElementById("paytable-close");
const resetModal = document.getElementById("reset-modal");
const resetConfirmButton = document.getElementById("reset-confirm");
const resetCancelButton = document.getElementById("reset-cancel");
const resetCloseButton = document.getElementById("reset-close");
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
const authSubmitButton = document.getElementById("auth-submit");
const signupView = document.getElementById("signup-view");
const signupForm = document.getElementById("signup-form");
const signupErrorEl = document.getElementById("signup-error");
const signupSubmitButton = document.getElementById("signup-submit");
const signupFirstInput = document.getElementById("signup-first");
const showSignUpButton = document.getElementById("show-signup");
const showLoginButton = document.getElementById("show-login");
const forgotPasswordView = document.getElementById("forgot-password-view");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotEmailInput = document.getElementById("forgot-email");
const forgotErrorEl = document.getElementById("forgot-error");
const forgotSuccessEl = document.getElementById("forgot-success");
const forgotSubmitButton = document.getElementById("forgot-submit");
const showForgotPasswordButton = document.getElementById("show-forgot-password");
const showLoginFromForgotButton = document.getElementById("show-login-from-forgot");
const resetPasswordView = document.getElementById("reset-password-view");
const resetPasswordForm = document.getElementById("reset-password-form");
const resetPasswordInput = document.getElementById("reset-password");
const resetConfirmInput = document.getElementById("reset-confirm");
const resetPasswordErrorEl = document.getElementById("reset-error");
const resetPasswordSubmitButton = document.getElementById("reset-submit");
const appShell = document.getElementById("app-shell");
const homeView = document.getElementById("home-view");
const playView = document.getElementById("play-view");
const storeView = document.getElementById("store-view");
const dashboardView = document.getElementById("dashboard-view");
const adminView = document.getElementById("admin-view");
const routeViews = {
  home: homeView,
  play: playView,
  store: storeView,
  dashboard: dashboardView,
  admin: adminView
};
const headerEl = document.querySelector(".header");
const chipBarEl = document.querySelector(".chip-bar");
const playLayout = playView ? playView.querySelector(".layout") : null;
const AUTH_ROUTES = new Set(["auth", "signup", "forgot-password", "reset-password"]);
const TABLE_ROUTES = new Set(["home", "play", "store", "admin"]);
const routeButtons = Array.from(document.querySelectorAll("[data-route-target]"));
const signOutButtons = Array.from(document.querySelectorAll('[data-action="sign-out"]'));
const dashboardEmailEl = document.getElementById("dashboard-email");
const dashboardCreditsEl = document.getElementById("dashboard-credits");
const dashboardCarterEl = document.getElementById("dashboard-carter-cash");
const dashboardRunsEl = document.getElementById("dashboard-runs");
const prizeListEl = document.getElementById("prize-list");
const adminNavButton = document.getElementById("admin-nav");
const adminAddButton = document.getElementById("admin-add-button");
const adminSaveButton = document.getElementById("admin-save-button");
const adminPrizeListEl = document.getElementById("admin-prize-list");
const adminPrizeForm = document.getElementById("admin-prize-form");
const adminPrizeMessage = document.getElementById("admin-prize-message");
const adminPrizeImageUrlInput = document.getElementById("prize-image-url");
const adminPrizeImageFileInput = document.getElementById("prize-image-file");
const adminPrizeModal = document.getElementById("admin-prize-modal");
const adminModalTitle = document.getElementById("admin-modal-title");
const adminModalCloseButton = document.getElementById("admin-modal-close");
const adminModalCancelButton = document.getElementById("admin-modal-cancel");
const shippingModal = document.getElementById("shipping-modal");
const shippingForm = document.getElementById("shipping-form");
const shippingSummaryEl = document.getElementById("shipping-summary");
const shippingPhoneInput = document.getElementById("shipping-phone");
const shippingAddressInput = document.getElementById("shipping-address");
const shippingCloseButton = document.getElementById("shipping-close");
const shippingCancelButton = document.getElementById("shipping-cancel");
const shippingSubmitButton = document.getElementById("shipping-submit");
const prizeImageModal = document.getElementById("prize-image-modal");
const prizeImageCloseButton = document.getElementById("prize-image-close");
const prizeImagePreview = document.getElementById("prize-image-preview");
const prizeImageCaption = document.getElementById("prize-image-caption");
const numberBetsModal = document.getElementById("number-bets-modal");
const numberBetsInfoButton = document.getElementById("number-bets-info");
const numberBetsModalClose = document.getElementById("number-bets-modal-close");
const numberBetsModalOk = document.getElementById("number-bets-modal-ok");
const betAnalyticsModal = document.getElementById("bet-analytics-modal");
const betAnalyticsClose = document.getElementById("bet-analytics-close");
const adminTabButtons = document.querySelectorAll(".admin-tab");
const adminPrizesContent = document.getElementById("admin-prizes-content");
const adminAnalyticsContent = document.getElementById("admin-analytics-content");

const THEME_CLASS_MAP = {
  blue: "theme-blue",
  pink: "theme-pink",
  orange: "theme-orange"
};
const ALL_THEME_CLASSES = [
  ...Object.values(THEME_CLASS_MAP),
  "theme-retro",
  "theme-cotton-candy",
  "theme-pastel"
];
const THEME_STORAGE_KEY = "run-the-numbers-theme";

let bankroll = INITIAL_BANKROLL;
let bets = [];
let dealing = false;
let selectedChip = DENOMINATIONS[0];
let bettingOpen = true;
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
  let carterCash = 0;
  let carterCashProgress = 0;
  let carterCashAnimating = false;
  let carterCashDeltaTimeout = null;
  let lastSyncedCarterCash = 0;
  let lastSyncedCarterProgress = 0;
  let advancedMode = true; // Always enabled - all bets always available
  let handPaused = false;
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
let adminEditingPrizeId = null;
let adminPrizeCache = [];
let currentProfile = null;
let suppressHash = false;
let dashboardProfileRetryTimer = null;
let resetModalTrigger = null;

let shippingModalTrigger = null;
let activeShippingPurchase = null;
let adminModalTrigger = null;
let prizeImageTrigger = null;

const MAX_HISTORY_POINTS = 500;
const PROFILE_SYNC_INTERVAL = 15000;

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
}

function updatePlayAreaHeight() {
  if (!playLayout) {
    return;
  }

  if (currentRoute !== "play") {
    clearPlayAreaHeight();
    return;
  }

  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  if (!viewportHeight) {
    return;
  }

  const headerHeight = headerEl ? headerEl.offsetHeight : 0;
  const chipBarHeight = chipBarEl ? chipBarEl.offsetHeight : 0;
  const available = Math.max(viewportHeight - headerHeight - chipBarHeight, 0);
  playLayout.style.setProperty("--play-area-height", `${available}px`);
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
  if (currentProfile) {
    currentProfile.carter_cash = carterCash;
  }
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
    dashboardCreditsEl.textContent = Number(value).toString();
  } else if (typeof value === "string") {
    dashboardCreditsEl.textContent = value;
  } else {
    dashboardCreditsEl.textContent = "0";
  }
}

async function persistBankroll() {
  if (!currentUser) return;

  const updates = {};
  if (Number.isFinite(bankroll) && bankroll !== lastSyncedBankroll) {
    updates.credits = bankroll;
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
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", currentUser.id)
      .select("credits, carter_cash, carter_cash_progress")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      const nextCredits = Number.isFinite(Number(data.credits))
        ? Math.round(Number(data.credits))
        : bankroll;
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
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(updates, "credits")) {
        lastSyncedBankroll = bankroll;
        if (currentProfile) {
          currentProfile.credits = bankroll;
        }
      }
      if (Object.prototype.hasOwnProperty.call(updates, "carter_cash")) {
        lastSyncedCarterCash = carterCash;
        if (currentProfile) {
          currentProfile.carter_cash = carterCash;
        }
      }
      if (Object.prototype.hasOwnProperty.call(updates, "carter_cash_progress")) {
        lastSyncedCarterProgress = carterCashProgress;
        if (currentProfile) {
          currentProfile.carter_cash_progress = carterCashProgress;
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
  if (currentProfile) {
    currentProfile.credits = bankroll;
  }
}

function renderHeaderFromProfile(profile) {
  if (!profile) {
    console.warn("[RTN] renderHeaderFromProfile called without a profile");
    return;
  }

  const numericCredits = Number(profile.credits);
  const nextBankroll = Number.isFinite(numericCredits) ? Math.round(numericCredits) : INITIAL_BANKROLL;
  const numericCarter = Number(profile.carter_cash);
  const nextCarterCash = Number.isFinite(numericCarter) ? Math.round(numericCarter) : 0;
  const numericProgress = Number(profile.carter_cash_progress);
  const nextProgress =
    Number.isFinite(numericProgress) && numericProgress >= 0 ? Number(numericProgress) : 0;

  console.info(
    `[RTN] renderHeaderFromProfile updating header (bankroll=${nextBankroll}, carterCash=${nextCarterCash}, progress=${nextProgress})`
  );

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
}

function applyProfileCredits(profile, { resetHistory = false } = {}) {
  if (!profile) return null;
  console.info(
    `[RTN] applyProfileCredits storing profile ${profile.id} with credits=${profile.credits} carterCash=${profile.carter_cash}`
  );
  currentProfile = profile;
  lastProfileSync = Date.now();
  renderHeaderFromProfile(profile);

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

function refreshBetControls() {
  const chipEnabled = bettingOpen;
  chipSelectorEl.classList.toggle("selector-disabled", !chipEnabled);
  chipButtons.forEach((button) => {
    button.disabled = !chipEnabled;
    button.setAttribute("aria-disabled", String(!chipEnabled));
  });

  betSpotButtons.forEach((button) => {
    const key = button.dataset.betKey || button.dataset.rank;
    const definition = key ? getBetDefinition(key) : null;
    const lockedDuringHand = definition?.lockDuringHand ?? false;
    const disabled = lockedDuringHand ? !bettingOpen : !bettingOpen;

    button.disabled = disabled;
    button.setAttribute("aria-disabled", String(disabled));
  });

  setClearBetsDisabled(!bettingOpen || bets.length === 0);
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
    dealButton.disabled = true;
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
  dealButton.disabled = dealing || !bettingOpen;
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

function formatCurrency(value) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

  const values = bankrollHistory.length ? bankrollHistory : [bankroll];
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
      ctx.fillText(String(index + 1), point.x, baseY + 8);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Hands played: ${Math.max(0, values.length - 1)}`, padding.left, padding.top + 6);
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

function updatePauseButton() {
  if (!pausePlayButton) return;
  const shouldShow = advancedMode && dealing;
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
  if (handPaused) {
    statusEl.textContent = "Dealing paused. Place bust bets or resume play.";
  } else if (dealing) {
    statusEl.textContent = "Dealing...";
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
  const item = document.createElement("li");
  const drawnCards = result.drawnCards || [];
  const cardsList = drawnCards.map(card => {
    if (card.label === "Joker") {
      return "Joker";
    }
    return `${card.label}${card.suit || ""}`;
  }).join(", ");
  
  const handLength = drawnCards.length;
  
  item.innerHTML = `
    <div>${cardsList}</div>
    <div>Hand Length: ${handLength}</div>
  `;
  historyList.prepend(item);
  while (historyList.children.length > 8) {
    historyList.removeChild(historyList.lastChild);
  }
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
  currentHandContext = null;
  setHandPaused(false);
  setBettingEnabled(true);
  dealButton.disabled = bets.length === 0;
  updatePauseButton();
  updateRebetButtonState();
}

async function performAccountReset() {
  bankroll = INITIAL_BANKROLL;
  handleBankrollChanged();
  stats = { hands: 0, wagered: 0, paid: 0 };
  updateStatsUI();
  lastBetLayout = [];
  currentOpeningLayout = [];
  historyList.innerHTML = "";
  resetBets();
  stopCarterCashAnimation();
  carterCash = 0;
  carterCashProgress = 0;
  updateCarterCashDisplay();
  if (currentProfile) {
    currentProfile.carter_cash = carterCash;
    currentProfile.carter_cash_progress = carterCashProgress;
    currentProfile.credits = bankroll;
  }
  await persistBankroll();
  await ensureProfileSynced({ force: true });
  resetTable("Account reset. Select a chip and place your bets in the betting panel.", {
    clearDraws: true
  });
  resetBankrollHistory();
  closeUtilityPanel();
  showToast("Account reset. Bankroll restored to 1,000 units and Carter Cash cleared.", "info");
}

function openResetModal() {
  if (!resetModal) {
    void performAccountReset();
    return;
  }
  if (!resetModal.hidden) {
    return;
  }
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
    (!prizeImageModal || prizeImageModal.hidden)
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
    (!prizeImageModal || prizeImageModal.hidden)
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
      const totalReturn = payout + bet.units;
      bet.paid += totalReturn;
      bankroll += totalReturn;
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

  if (currentProfile) {
    currentProfile.carter_cash = carterCash;
    currentProfile.carter_cash_progress = carterCashProgress;
  }
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
    stopper: stopperCard,
    drawnCards: context.drawnCards || [],
    betSummaries: bets.map((bet) => summarizeBetResult(bet))
  });

  lastBetLayout = currentOpeningLayout.length > 0 ? snapshotLayout(currentOpeningLayout) : [];
  currentOpeningLayout = [];

  dealing = false;
  animateBankrollOutcome(netThisHand);
  recordBankrollHistoryPoint();
  await persistBankroll();
  await ensureProfileSynced({ force: true });
  await logHandAndBets(stopperCard, context, betSnapshots, netThisHand);
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
  currentOpeningLayout = snapshotLayout(bets);
  dealing = true;
  pauseResolvers = [];
  currentHandContext = { nonStopperCount: 0, totalCards: 0, drawnCards: [] };
  setHandPaused(false);
  setBettingEnabled(false);
  dealButton.disabled = true;
  updateRebetButtonState();
  resetBetCounters();
  drawsContainer.innerHTML = "";
  statusEl.textContent = "Dealing...";
  updatePauseButton();

  const deck = createDeck();
  shuffle(deck);

  for (const card of deck) {
    await waitWhilePaused();
    const shouldStop = await processCard(card, currentHandContext);
    if (shouldStop) {
      break;
    }
    await waitForDealDelay();
  }

  currentHandContext = null;
  setHandPaused(false);
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

  if (!bettingOpen && definition.lockDuringHand) {
    statusEl.textContent = `${definition.label} bets are locked while a hand is in progress.`;
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

chipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    const value = Number(button.dataset.value);
    if (!Number.isFinite(value)) return;
    setSelectedChip(value);
  });
});

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
  if (bets.length === 0 || dealing) return;
  dealHand();
});

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

if (authForm) {
  authForm.addEventListener("submit", handleAuthFormSubmit);
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

// Chart filter buttons
document.querySelectorAll(".chart-filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    const period = button.dataset.period;
    
    // Update active state
    document.querySelectorAll(".chart-filter-btn").forEach(btn => {
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
    } else if (targetTab === "analytics") {
      adminPrizesContent.hidden = true;
      adminAnalyticsContent.hidden = false;
      loadPlayerFilter(); // Load player list for filter
      initializeAnalyticsBettingGrid();
      renderOverviewChart("all");
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

// Global variable to store selected player filter
let selectedPlayerIds = null; // null = all players, [] = specific players
let playerEmailMap = {}; // Map of user_id to email for display

// Load all players for filter
async function loadPlayerFilter() {
  if (!supabase) return;
  
  console.info("[RTN] Loading players for filter");
  
  const select = document.getElementById("player-filter-select");
  if (!select) {
    console.warn("[RTN] Player filter select not found");
    return;
  }
  
  // Show loading state
  select.innerHTML = '<option value="all" selected>Loading players...</option>';
  
  // Get all unique user_ids from bet_plays with pagination
  const allUserIds = new Set();
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data: betPlayers, error: betError } = await supabase
      .from("bet_plays")
      .select("user_id")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (betError) {
      console.error("[RTN] Error loading bet players:", betError);
      select.innerHTML = '<option value="all" selected>All Players (Error loading)</option>';
      return;
    }
    
    if (betPlayers && betPlayers.length > 0) {
      betPlayers.forEach(b => allUserIds.add(b.user_id));
      hasMore = betPlayers.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }
  
  const uniqueUserIds = Array.from(allUserIds);
  console.info(`[RTN] Found ${uniqueUserIds.length} unique players with bets`);
  console.info(`[RTN] Unique user IDs:`, uniqueUserIds);
  
  if (uniqueUserIds.length === 0) {
    select.innerHTML = '<option value="all" selected>All Players (No data)</option>';
    return;
  }
  
  // Fetch profiles for these users in batches (in() has a limit)
  const batchSize = 100;
  const allProfiles = [];
  
  for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
    const batch = uniqueUserIds.slice(i, i + batchSize);
    
    console.info(`[RTN] Fetching profiles for batch of ${batch.length} user IDs`);
    
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", batch);
    
    if (profileError) {
      console.error("[RTN] Error loading profiles batch:", profileError);
      console.info(`[RTN] Attempted to fetch profiles for IDs:`, batch);
      continue;
    }
    
    console.info(`[RTN] Received ${profiles?.length ?? 0} profiles from batch`);
    
    if (profiles) {
      allProfiles.push(...profiles);
    }
  }
  
  console.info(`[RTN] Loaded ${allProfiles.length} profiles total`);
  console.info(`[RTN] Profiles:`, allProfiles.map(p => ({ id: p.id.substring(0, 8), username: p.username })));
  
  // Build email map (using username)
  playerEmailMap = {};
  allProfiles.forEach(profile => {
    playerEmailMap[profile.id] = profile.username || `User ${profile.id.substring(0, 8)}`;
  });
  
  // Sort profiles by username
  allProfiles.sort((a, b) => {
    const usernameA = a.username || "";
    const usernameB = b.username || "";
    return usernameA.localeCompare(usernameB);
  });
  
  // Clear and populate select
  select.innerHTML = '<option value="all" selected>All Players</option>';
  
  // Add player options
  allProfiles.forEach(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.username || `User ${profile.id.substring(0, 8)}`;
    select.appendChild(option);
  });
  
  console.info(`[RTN] Populated filter with ${allProfiles.length} players`);
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
  // Reload badges for all existing bet buttons
  document.querySelectorAll(".analytics-bet-spot").forEach(button => {
    const betKey = button.dataset.betKey;
    const badge = button.querySelector('.bet-count-badge');
    
    if (badge && betKey) {
      badge.textContent = "...";
      
      // Load new count with current filter
      loadBetBadgeCount(betKey).then(count => {
        badge.textContent = count.toLocaleString();
      });
    }
  });
  
  // Reload overview chart
  const activeFilterBtn = document.querySelector(".overview-filters .chart-filter-btn.active");
  const period = activeFilterBtn?.dataset.period || "all";
  renderOverviewChart(period);
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
      
      // Load count asynchronously
      loadBetBadgeCount(betKey).then(count => {
        badge.textContent = count.toLocaleString();
      });
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
        
        // Load count asynchronously
        loadBetBadgeCount(betKey).then(count => {
          badge.textContent = count.toLocaleString();
        });
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
      
      // Load count asynchronously
      loadBetBadgeCount(bust.key).then(count => {
        badge.textContent = count.toLocaleString();
      });
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
      
      // Load count asynchronously
      loadBetBadgeCount(bust.key).then(count => {
        badge.textContent = count.toLocaleString();
      });
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
    
    // Load count asynchronously
    loadBetBadgeCount("bust-joker").then(count => {
      jokerBadge.textContent = count.toLocaleString();
    });
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
      
      // Load count asynchronously
      loadBetBadgeCount(count.key).then(betCount => {
        badge.textContent = betCount.toLocaleString();
      });
    }
  }
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
    if (forgotPasswordForm) {
      forgotPasswordForm.reset();
    }
    if (forgotErrorEl) {
      forgotErrorEl.hidden = true;
      forgotErrorEl.textContent = "";
    }
    if (forgotSuccessEl) {
      forgotSuccessEl.hidden = true;
      forgotSuccessEl.textContent = "";
    }
    showAuthView("forgot-password");
    updateHash("forgot-password", { replace: true });
    forgotEmailInput?.focus();
  });
}

if (showLoginFromForgotButton) {
  showLoginFromForgotButton.addEventListener("click", () => {
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
    if (resetModal && !resetModal.hidden) {
      closeResetModal({ restoreFocus: true });
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

  updateAdminVisibility(currentUser);
  updateResetButtonVisibility(currentUser);

initTheme();
setActivePaytable(activePaytable.id, { announce: false });
updatePaytableAvailability();
setSelectedChip(selectedChip, false);
renderBets();
updateBankroll();
updateCarterCashDisplay();
resetTable();
updateStatsUI();
  resetBankrollHistory();
  window.addEventListener("resize", schedulePlayAreaHeightUpdate);
  window.addEventListener("resize", drawBankrollChart);

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

    // If the initial route is an auth route, send them to home instead
    const route = AUTH_ROUTES.has(initialRoute) ? "home" : initialRoute;
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

        const sub = supabase.auth.onAuthStateChange((event, session) => {
          console.info(`[RTN] auth state changed: ${event}`);
          if (event === "PASSWORD_RECOVERY") {
            // User clicked the reset password link in their email
            setRoute("reset-password").catch(() => {});
          } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
            const user = session?.user ?? null;
            if (user) {
              currentUser = user;
              updateAdminVisibility(currentUser);
              updateResetButtonVisibility(currentUser);
              ensureProfileSynced({ force: true }).catch((err) => console.warn(err));
              // If the UI is on auth screen, navigate to home
              if (currentRoute === "auth" || currentRoute === "signup" || currentRoute === "forgot-password") {
                setRoute("home").catch(() => {});
              }
            }
          } else if (event === "SIGNED_OUT" || event === "USER_DELETED") {
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
              console.info("[RTN] received supabase:ready, registering auth listener and attempting bootstrapAuth");
              registerAuthHandler();
              // Try to rehydrate session now that the client is ready.
              await bootstrapAuth(getRouteFromHash());
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
    async function waitForSupabaseReady(timeoutMs = 800) {
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

    const clientReady = await waitForSupabaseReady(800);
    console.info(`[RTN] initializeApp waitForSupabaseReady result=${clientReady}`);

    sessionApplied = await bootstrapAuth(initialRoute);
    console.info(`[RTN] initializeApp bootstrapAuth sessionApplied=${sessionApplied}`);

    if (!sessionApplied) {
      console.info("[RTN] initializeApp showing auth view (no session available; Supabase auth enabled)");
      showAuthView("login");
      updateHash("auth", { replace: true });
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
