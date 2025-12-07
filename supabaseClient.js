// supabaseClient.js
// This file will create a real Supabase client when `window.SUPABASE_URL` and
// `window.SUPABASE_ANON_KEY` are provided (set them in `index.html` before
// loading the app), otherwise it falls back to a local offline stub for
// development.

let liveClient = null;

const SUPABASE_URL = typeof window !== "undefined" ? window.SUPABASE_URL || null : null;
const SUPABASE_ANON_KEY = typeof window !== "undefined" ? window.SUPABASE_ANON_KEY || null : null;

async function createRealClient(url, key) {
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    const { createClient } = module;
    return createClient(url, key);
  } catch (err) {
    console.error("[RTN] Failed to load Supabase client from CDN", err);
    return null;
  }
}

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  // attempt to create a live client
  (async () => {
    const client = await createRealClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (client) {
      liveClient = client;
      console.info("[RTN] Supabase client initialized (live mode)");
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('supabase:ready'));
        }
      } catch (e) {
        /* ignore */
      }
    }
  })();
}

// Offline stub fallback (synchronous) — used while live client loads or when
// credentials are not provided.
const mockUser = {
  id: "guest-user",
  email: "guest@example.com",
  user_metadata: {
    full_name: "Guest Player",
    first_name: "Guest",
    last_name: "Player"
  }
};

const mockProfile = {
  id: mockUser.id,
  username: "Guest",
  credits: 1000,
  carter_cash: 0,
  carter_cash_progress: 0,
  first_name: "Guest",
  last_name: "Player"
};

const mockDatabase = {
  profiles: [mockProfile],
  runs: [],
  prizes: [],
  game_runs: [],
  bet_plays: []
};

// Persist mock database to localStorage so offline changes survive reloads
const MOCK_DB_KEY = "rtn:mockdb:v1";
function loadMockDatabase() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const raw = window.localStorage.getItem(MOCK_DB_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      // shallow merge arrays if available
      Object.keys(parsed).forEach((k) => {
        if (Array.isArray(parsed[k])) {
          mockDatabase[k] = parsed[k];
        }
      });
      console.info("[RTN] Loaded offline mock database from localStorage");
    }
  } catch (e) {
    console.warn("[RTN] Unable to load mock database from localStorage", e);
  }
}

function saveMockDatabase() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(MOCK_DB_KEY, JSON.stringify(mockDatabase));
  } catch (e) {
    console.warn("[RTN] Unable to save mock database to localStorage", e);
  }
}

// attempt to hydrate mock DB from storage
loadMockDatabase();

function cloneRow(row) {
  return row ? JSON.parse(JSON.stringify(row)) : row;
}

function createQuery(table) {
  let rows = mockDatabase[table] || [];

  const query = {
    select() {
      return query;
    },
    eq(field, value) {
      rows = rows.filter((row) => row && row[field] === value);
      return query;
    },
    order() {
      return query;
    },
    limit(count) {
      const slice = typeof count === "number" ? rows.slice(0, count) : rows;
      return Promise.resolve({ data: cloneRow(slice), error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: cloneRow(rows[0] || null), error: null });
    },
    single() {
      return Promise.resolve({ data: cloneRow(rows[0] || null), error: null });
    },
    insert(payload) {
      const items = Array.isArray(payload) ? payload : [payload];
      const tableRows = mockDatabase[table];
      if (Array.isArray(tableRows)) {
        for (const item of items) {
          tableRows.push(cloneRow(item));
        }
      }
      // persist changes
      try {
        saveMockDatabase();
      } catch (e) {
        /* ignore */
      }
      return Promise.resolve({ data: cloneRow(items), error: null });
    },
    update(values) {
      return {
        eq(field, value) {
          rows.forEach((row) => {
            if (row && row[field] === value) {
              Object.assign(row, values);
            }
          });
          // persist changes
          try {
            saveMockDatabase();
          } catch (e) {
            /* ignore */
          }
          return Promise.resolve({ data: cloneRow(rows), error: null });
        }
      };
    },
    delete() {
      return {
        eq() {
          rows = [];
          mockDatabase[table] = rows;
          try {
            saveMockDatabase();
          } catch (e) {
            /* ignore */
          }
          return Promise.resolve({ error: null });
        }
      };
    }
  };

  return query;
}

const offlineStub = {
  // Lightweight in-memory auth stub so the app can sign in while the
  // CDN-based real client is unavailable. This mirrors the supabase-js
  // API surface used by the app: getSession, getUser, onAuthStateChange,
  // signInWithPassword, signUp, signOut.
  _stubCurrentUser: null,
  auth: {
    async getSession() {
      return { data: { session: this._stubCurrentUser ? { user: this._stubCurrentUser } : null }, error: null };
    },
    async getUser() {
      return { data: { user: this._stubCurrentUser }, error: null };
    },
    onAuthStateChange(callback) {
      // Call the callback immediately with current state so UI can react.
      try {
        const event = this._stubCurrentUser ? "SIGNED_IN" : "SIGNED_OUT";
        const session = this._stubCurrentUser ? { user: this._stubCurrentUser } : null;
        // follow supabase-js callback shape: (event, session) => {}
        setTimeout(() => callback(event, session), 0);
      } catch (e) {
        /* ignore */
      }
      const subscription = { unsubscribe() {} };
      return { data: { subscription }, error: null };
    },
    async signInWithPassword({ email, password } = {}) {
      // In offline mode we accept any password and return a mock user.
      // Populate an in-memory session so subsequent getUser/getSession
      // calls return a real user object.
      this._stubCurrentUser = { ...mockUser, email: email || mockUser.email };
      return { data: { user: this._stubCurrentUser }, error: null };
    },
    async signUp({ email } = {}) {
      this._stubCurrentUser = { ...mockUser, email: email || mockUser.email };
      return { data: { user: this._stubCurrentUser }, error: null };
    },
    async signOut() {
      this._stubCurrentUser = null;
      return { error: null };
    }
  },
  from(table) {
    return createQuery(table);
  },
  rpc() {
    return Promise.resolve({ data: null, error: null });
  },
  storage: {
    from() {
      return {
        async upload() {
          return { error: new Error("Storage is disabled in offline mode") };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: path ? `/${path}` : "" }, error: null };
        }
      };
    }
  },
  functions: {
    async invoke() {
      return { data: null, error: null };
    }
  }
};

// Export a proxy that forwards to the live client when ready, otherwise uses
// the offline stub. This lets the rest of the app import `supabase` and use
// it synchronously.
export const supabase = new Proxy(
  {},
  {
    get(_, prop) {
      if (liveClient) return liveClient[prop];
      return offlineStub[prop];
    },
    apply(_, thisArg, args) {
      if (typeof liveClient === "function") return liveClient.apply(thisArg, args);
      return undefined;
    }
  }
);

console.info("[RTN] Supabase client module loaded (live will be used if credentials provided)");
