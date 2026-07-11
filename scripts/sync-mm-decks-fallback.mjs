#!/usr/bin/env node
// ============================================================================
// Sync the hardcoded fallback decks in games/monkey-moonshine.html with the
// live values in the Supabase `mm_decks` table.
//
// The game loads deck weights from mm_decks on boot and only uses the hardcoded
// CONFIG.DECKS object if that fetch fails. This script pulls the live weights
// and rewrites those fallback lines so they never drift after an admin re-tune.
//
// Usage:  node scripts/sync-mm-decks-fallback.mjs           (writes the file)
//         node scripts/sync-mm-decks-fallback.mjs --check    (exit 1 if drifted)
//
// The anon key below is the same public client key the game already ships.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAME_FILE = join(ROOT, "games", "monkey-moonshine.html");

const SUPABASE_URL = "https://jfqdjqhqumoqcoivjwbi.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcWRqcWhxdW1vcWNvaXZqd2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTY1MDAsImV4cCI6MjA3Nzc3MjUwMH0.zLGqQ5gjH4fIdyG-K3vbOGL7dvCchbCFlnm11Txt8gs";

// Column order the fallback lines use (order is cosmetic — sampling is weight-based).
const KEY_ORDER = ["coconut", "cherry", "banana", "lemon", "apple", "peach", "dragonfruit", "mango", "pineapple"];
const CHECK = process.argv.includes("--check");

function fmtDeck(deck) {
  return "{ " + KEY_ORDER.map((k) => `${k}:${Number(deck[k]) || 0}`).join(", ") + " }";
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/mm_decks?select=wild,deck`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
if (!res.ok) { console.error(`[sync] mm_decks fetch failed: HTTP ${res.status}`); process.exit(2); }
const rows = await res.json();
if (!Array.isArray(rows) || !rows.length) { console.error("[sync] mm_decks returned no rows"); process.exit(2); }

let src = readFileSync(GAME_FILE, "utf8");
const changes = [];

for (const row of rows) {
  const wild = row.wild;
  if (!wild || !row.deck) continue;
  // Match the fallback line:  `    cherry:      { coconut:4311, ... },`
  const re = new RegExp(`^(\\s*)${wild}:(\\s*)\\{[^}]*\\}(,?)`, "m");
  const m = src.match(re);
  if (!m) { console.error(`[sync] could not find fallback line for "${wild}" — aborting, no changes written.`); process.exit(3); }
  const rebuilt = `${m[1]}${wild}:${m[2]}${fmtDeck(row.deck)}${m[3]}`;
  if (rebuilt !== m[0]) changes.push(wild);
  src = src.replace(re, rebuilt.replace(/\$/g, "$$$$")); // escape $ for replace()
}

if (!changes.length) {
  console.log("[sync] fallback decks already match the live mm_decks table — nothing to do.");
  process.exit(0);
}

if (CHECK) {
  console.error(`[sync] DRIFT: ${changes.length} deck(s) differ from the DB: ${changes.join(", ")}`);
  process.exit(1);
}

writeFileSync(GAME_FILE, src);
console.log(`[sync] updated fallback decks to match mm_decks: ${changes.join(", ")}`);
console.log("[sync] remember to bump the game cache-buster + commit (or run: npm run sync-mm-decks && git commit).");
