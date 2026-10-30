// Transfer / new-machine readiness check: `npm run transfer:check`.
//
// 1. Lists every setting the app reads (the manifest below is the single source
//    of truth - keep .env.example in step), shows which are set or missing
//    WITHOUT printing values, and says where to obtain each one.
// 2. Checks the git-ignored files, local tools and the Windows scheduled task.
// 3. Makes one small read-only call to each external service to prove the
//    credentials work from this machine. `--offline` skips step 3.
//
// Exits 1 when anything required is missing or failing, so it can gate a cutover.
import "../src/load-env.js";
import { parse as parseDotenv } from "dotenv";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { findPgTool } from "../src/backup.js";
import { GoogleAnalyticsClient } from "../src/google-analytics/client.js";
import { getGoogleAnalyticsConfig } from "../src/google-analytics/config.js";
import { getMailchimpConfig } from "../src/mailchimp/config.js";
import { canSeal, isMachineSealed, isSealed, isSecretKey } from "../src/secrets.js";

const exec = promisify(execFile);
const offline = process.argv.includes("--offline");
const root = process.cwd();

type Setting = { key: string; required: boolean; purpose: string; source: string };

export const SETTINGS: Setting[] = [
  { key: "DATABASE_URL", required: true, purpose: "PostgreSQL database", source: "Your own choice when PostgreSQL is installed (restore-backup.ps1 creates the login/database from it)" },
  { key: "INFOCAREUSER", required: true, purpose: "Infocare API login", source: "Infocare (Digiweb) API user - ask Infocare support / the account admin" },
  { key: "INFOCAREPASS", required: true, purpose: "Infocare API password", source: "As above" },
  { key: "INFOCARE_BASE_URL", required: true, purpose: "Infocare API endpoint for our organisation", source: "Infocare - copy from the current .env" },
  { key: "INFOCARE_LOGIN_UPDATED_AT", required: false, purpose: "When the Infocare login was last changed in the app (not secret)", source: "Set automatically by the Infocare Login page" },
  { key: "AI_PROVIDER", required: false, purpose: "AI backend (ollama)", source: "Leave as ollama" },
  { key: "AI_BASE_URL", required: false, purpose: "Local Ollama address", source: "Default http://127.0.0.1:11434" },
  { key: "AI_CHAT_MODEL", required: false, purpose: "Beep Beep chat model", source: "Copy from current .env; downloaded by npm run ai:setup" },
  { key: "AI_CHAT_MODEL_FALLBACK", required: false, purpose: "Rollback model", source: "Set automatically by Update AI model" },
  { key: "AI_EMBED_MODEL", required: false, purpose: "Help-library embedding model", source: "Default nomic-embed-text" },
  { key: "AI_TIMEOUT_MS", required: false, purpose: "AI request timeout", source: "Copy from current .env" },
  { key: "META_USER_ID", required: false, purpose: "Meta Ads", source: "Meta Business Manager" },
  { key: "META_USER_NAME", required: false, purpose: "Meta Ads (label only)", source: "Meta Business Manager" },
  { key: "META_AD_ACCOUNT_ID", required: false, purpose: "Meta Ads account", source: "Meta Ads Manager > account ID" },
  { key: "META_ACCESS_TOKEN", required: false, purpose: "Meta Ads API token (expires ~60 days unless System User)", source: "developers.facebook.com/tools/explorer then extend in the Access Token Debugger" },
  { key: "GOOGLE_ANALYTICS_PROPERTY_ID", required: false, purpose: "GA4 property", source: "Google Analytics > Admin > Property details" },
  { key: "GOOGLE_ANALYTICS_OAUTH_PATH", required: false, purpose: "GA OAuth client file (default OAuth.json)", source: "Google Cloud console > Credentials (project marketing-helper-ai)" },
  { key: "GOOGLE_ANALYTICS_TOKEN_PATH", required: false, purpose: "Where npm run google:oauth writes a new token (default google-oauth-token.json; moved into .env on next start)", source: "Default" },
  { key: "GOOGLE_ANALYTICS_REFRESH_TOKEN", required: false, purpose: "GA refresh token", source: "npm run google:oauth, then start the app - it moves the token here" },
  { key: "POSTMARK_SERVER_TOKEN", required: false, purpose: "Postmark API (not used in this deployment)", source: "Postmark server > API Tokens (via Blacksheep)" },
  { key: "POSTMARK_WEBHOOK_BASIC_AUTH", required: false, purpose: "Password Postmark uses on the live webhook", source: "Copy from current .env (must match what Blacksheep configured)" },
  { key: "CLOUDFLARE_SYNC_URL", required: false, purpose: "Cloudflare Worker buffering Postmark events", source: "Cloudflare dashboard > Workers > postmark-webhook-events" },
  { key: "CLOUDFLARE_SYNC_TOKEN", required: false, purpose: "X-Sync-Token for the Worker", source: "Cloudflare Worker secret - copy from current .env" },
  { key: "MAILCHIMP_API_KEY", required: false, purpose: "Mailchimp campaigns", source: "Mailchimp > Profile > Extras > API keys" },
  { key: "MAILCHIMP_SERVER_PREFIX", required: false, purpose: "Mailchimp data centre (e.g. us14)", source: "Suffix of the API key" },
  { key: "FORMSTACK_API_TOKEN", required: false, purpose: "Formstack forms/submissions", source: "Formstack > Account > API" },
  { key: "AUTO_WEEKLY_SNAPSHOT", required: false, purpose: "Weekly analytics snapshot on/off", source: "Copy from current .env" },
  { key: "HOST", required: false, purpose: "Listen address", source: "Default 127.0.0.1" },
  { key: "PORT", required: false, purpose: "Listen port", source: "Default 3000" },
];

const FILES = [
  { path: "OAuth.json", purpose: "Google Analytics OAuth client" },
  { path: "centre-contact-list.xlsx", purpose: "Centre contact list (Upload Contacts page recreates it)" },
];

let failures = 0;
const mark = (ok: boolean | null) => (ok === null ? "  -  " : ok ? " OK  " : "FAIL ");

function line(ok: boolean | null, label: string, detail = "") {
  if (ok === false) failures += 1;
  console.log(`${mark(ok)} ${label}${detail ? ` - ${detail}` : ""}`);
}

const val = (key: string) => (process.env[key] ?? "").trim();

async function check(label: string, required: boolean, fn: () => Promise<string>) {
  try {
    line(true, label, await fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) line(false, label, message.slice(0, 200));
    else console.log(`WARN  ${label} - ${message.slice(0, 200)}`);
  }
}

async function getJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

console.log("\n== Settings (.env) ==");
// Raw file values, to report whether each credential is stored encrypted.
const stored = parseDotenv(existsSync(join(root, ".env")) ? readFileSync(join(root, ".env"), "utf8") : "");
for (const s of SETTINGS) {
  const set = val(s.key).length > 0;
  if (set && isSecretKey(s.key) && canSeal && !isSealed(stored[s.key])) console.log(`WARN  ${s.key} - stored as plain text; run npm run secrets:seal`);
  else if (set && isSecretKey(s.key) && !isMachineSealed(stored[s.key])) console.log(`WARN  ${s.key} - encrypted for one Windows account only; restart the app to re-encrypt for this computer`);
  else if (set) line(true, s.key, isSecretKey(s.key) && isSealed(stored[s.key]) ? `${s.purpose} (encrypted)` : s.purpose);
  else if (s.required) line(false, s.key, `MISSING. ${s.purpose}. Get it from: ${s.source}`);
  else console.log(`  -   ${s.key} - not set (optional). ${s.purpose}. Source: ${s.source}`);
}

console.log("\n== Files ==");
for (const f of FILES) {
  const ok = existsSync(join(root, f.path));
  if (ok) line(true, f.path, f.purpose);
  else console.log(`WARN  ${f.path} - missing. ${f.purpose}`);
}

console.log("\n== Local tools ==");
await check("Node.js", true, async () => process.version);
await check("pg_dump (for Back up data)", true, async () => (await exec(findPgTool("pg_dump"), ["--version"])).stdout.trim());
// A source file hidden by .gitignore builds here but is missing from a fresh clone.
await check("All source files tracked in git", true, async () => {
  const { stdout } = await exec("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "src", "test", "scripts", "prisma"]);
  const hidden = stdout.split(/\r?\n/).filter(Boolean);
  if (hidden.length) throw new Error(`ignored by .gitignore, so missing from GitHub: ${hidden.join(", ")}`);
  return "none ignored";
});
await check("Built app (dist/)", true, async () => {
  if (!existsSync(join(root, "dist", "src", "server.js"))) throw new Error("run npm run build");
  return "present";
});
if (process.platform === "win32") {
  // Shell property, readable without admin rights: 1 on, 3 encrypting, 5 suspended, 6 locked.
  await check(`BitLocker drive encryption (${root.slice(0, 2)})`, false, async () => {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(New-Object -ComObject Shell.Application).NameSpace('${root.slice(0, 2)}').Self.ExtendedProperty('System.Volume.BitLockerProtection')`]);
    const state = Number.parseInt(stdout.trim(), 10);
    if (state === 1 || state === 3 || state === 6) return "on";
    throw new Error("off - a lost or stolen computer exposes the database and files; turn on BitLocker (Settings > Privacy & security > Device encryption / BitLocker)");
  });
  await check("Scheduled task 'Marketing Helper AI Server'", false, async () => {
    await exec("schtasks.exe", ["/Query", "/TN", "Marketing Helper AI Server"]);
    return "registered";
  });
}

console.log("\n== Database ==");
await check("PostgreSQL connection + migrations", true, async () => {
  const client = new pg.Client({ connectionString: val("DATABASE_URL").replace(/\?.*$/, "") });
  await client.connect();
  try {
    const tables = await client.query("select count(*)::int as n from pg_tables where schemaname = 'public'");
    const applied = await client.query("select count(*)::int as n from _prisma_migrations where finished_at is not null");
    const expected = readdirSync(join(root, "prisma", "migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    if (applied.rows[0].n < expected) throw new Error(`${applied.rows[0].n}/${expected} migrations applied - run npx prisma migrate deploy`);
    return `${tables.rows[0].n} tables, ${applied.rows[0].n}/${expected} migrations`;
  } finally {
    await client.end();
  }
});

if (offline) {
  console.log("\n(--offline: skipping live service checks)");
} else {
  console.log("\n== Live services (read-only calls) ==");

  await check("Infocare login", true, async () => {
    const response = await fetch(val("INFOCARE_BASE_URL"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: val("INFOCAREUSER"), password: val("INFOCAREPASS"), mode: "get_centre_list", parameters: {} }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (/invalid|denied|unauthori[sz]ed|incorrect/i.test(text.slice(0, 500))) throw new Error("login rejected - check user/password, or whether Infocare restricts by IP address");
    return "centre list returned";
  });

  await check("Ollama + models", false, async () => {
    const tags = await getJson(`${(val("AI_BASE_URL") || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/tags`);
    const names = ((tags.models as { name: string }[]) ?? []).map((m) => m.name);
    const wanted = [val("AI_CHAT_MODEL") || "llama3.1:8b", val("AI_EMBED_MODEL") || "nomic-embed-text"];
    const missing = wanted.filter((w) => !names.some((n) => n === w || n === `${w}:latest`));
    if (missing.length) throw new Error(`not downloaded: ${missing.join(", ")} - run npm run ai:setup`);
    return wanted.join(", ");
  });

  if (val("GOOGLE_ANALYTICS_PROPERTY_ID")) {
    await check("Google Analytics", false, async () => {
      const ga = new GoogleAnalyticsClient(getGoogleAnalyticsConfig(process.env));
      await ga.runReport({ dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }], metrics: [{ name: "sessions" }] });
      return "report OK (refresh token valid)";
    });
  }

  if (val("META_ACCESS_TOKEN")) {
    await check("Meta Ads token", false, async () => {
      const token = encodeURIComponent(val("META_ACCESS_TOKEN"));
      const debug = await getJson(`https://graph.facebook.com/v23.0/debug_token?input_token=${token}&access_token=${token}`);
      const data = (debug.data ?? {}) as { is_valid?: boolean; expires_at?: number };
      if (!data.is_valid) throw new Error("token invalid or expired - generate a new one");
      if (!data.expires_at) return "valid, never expires";
      const days = Math.floor((data.expires_at * 1000 - Date.now()) / 86400000);
      if (days < 14) throw new Error(`valid but expires in ${days} days - extend it`);
      return `valid, expires in ${days} days`;
    });
  }

  if (val("CLOUDFLARE_SYNC_URL") && val("CLOUDFLARE_SYNC_TOKEN")) {
    await check("Cloudflare Postmark buffer", false, async () => {
      const url = new URL("/api/postmark/events", val("CLOUDFLARE_SYNC_URL"));
      url.searchParams.set("after_id", "999999999");
      await getJson(url.toString(), { headers: { "X-Sync-Token": val("CLOUDFLARE_SYNC_TOKEN") } });
      return "token accepted";
    });
  }

  if (val("POSTMARK_SERVER_TOKEN")) {
    await check("Postmark API", false, async () => {
      await getJson("https://api.postmarkapp.com/server", { headers: { Accept: "application/json", "X-Postmark-Server-Token": val("POSTMARK_SERVER_TOKEN") } });
      return "token accepted";
    });
  }

  if (val("MAILCHIMP_API_KEY")) {
    await check("Mailchimp", false, async () => {
      const mc = getMailchimpConfig(process.env);
      await getJson(`${mc.baseUrl}/ping`, { headers: { Authorization: `Basic ${Buffer.from(`anystring:${mc.apiKey}`).toString("base64")}` } });
      return "ping OK";
    });
  }

  if (val("FORMSTACK_API_TOKEN")) {
    await check("Formstack", false, async () => {
      await getJson("https://www.formstack.com/api/v2025/forms", { headers: { Authorization: `Bearer ${val("FORMSTACK_API_TOKEN")}`, Accept: "application/json" } });
      return "token accepted";
    });
  }

  await check("GitHub access (git ls-remote origin)", false, async () => {
    await exec("git", ["ls-remote", "--exit-code", "origin", "HEAD"], { timeout: 30000 });
    return "reachable";
  });
}

console.log(failures === 0 ? "\nAll required checks passed." : `\n${failures} required check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
