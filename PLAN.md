# PLAN — Online Communications breakout app

Implementation plan for the second breakout app inside Marketing Helper AI.

**Scope:** Postmark + Mailchimp + Formstack, built as its **own breakout app** — its own landing-page button, its own route (`/comms`), its own shell file (`comms-app-shell.ts`), its own AI chat endpoint. It is a sibling of the existing **Online Marketing** app, not a panel added inside it.

**Design rule:** every breakout app follows the same shell **pattern** — nav-rail icon, panel layout via `renderLayout`, focus-panel pattern, AI chat panel at the bottom of the panel stack, demo-mode parity via `?demo=1`. This plan reuses the existing primitives (functions, CSS, scripts) wherever possible, but the Online Communications app is a distinct app with its own files and routes.

---

## Phase 0 — Pre-work

- [ ] Confirm with stakeholders that Postmark, Mailchimp, and Formstack are all in-scope for v1 (vs. shipping one at a time).
- [ ] Get API credentials into a sealed location and add placeholder env vars to `.env.example`:
  - [ ] `POSTMARK_SERVER_TOKEN`
  - [ ] `POSTMARK_ACCOUNT_TOKEN` (optional, for account-wide stats)
  - [ ] `MAILCHIMP_API_KEY` and `MAILCHIMP_SERVER_PREFIX` (the `usX` data-centre prefix)
  - [ ] `FORMSTACK_API_TOKEN` (OAuth bearer or personal access token)
- [ ] Decide on the route prefix (recommendation: `/comms`) and the nav-rail icon (recommendation: `bi-envelope-paper` or `bi-chat-square-text`).
- [ ] Decide whether centre attribution for emails uses Postmark **tags** or **metadata** (recommendation: tags, since tag-level stats are first-class in the Postmark API).

---

## Phase 1 — Scaffold the breakout app shell

- [ ] Add a `commsLanding` tile to `src/ui/landing-page.ts` so the landing page exposes the new app. Keep it `primary: true` once it's usable; until then leave it in the "Coming soon" placeholder grid.
- [ ] Add a nav-rail entry in `src/ui/app-shell.ts` next to the Online Marketing one, linking to `/comms` (and `/comms?demo=1` when demo is on). Mirror the title/aria-label pattern.
- [ ] Create `src/ui/comms-app-shell.ts` — the equivalent of `app-shell.ts` for the comms app. Start by re-using `renderLayout`, `renderBreakoutScript`, and `renderAiChatScript` from the existing shell; only the panel content differs.
- [ ] Add `GET /comms` and `GET /comms?demo=1` routes in `src/server.ts` that render the new shell. Mirror the existing `/app` route handler structure.
- [ ] Add a `commsBreakout` toggle test in `test/app-shell.test.ts` to assert the nav-rail and routes exist.

---

## Phase 2 — Database schema

- [ ] Add Prisma models for raw + snapshot data (mirror the meta-store / google-analytics-store pattern):
  - [ ] `PostmarkOutboundSnapshot` — daily row per server: sent, delivered, opened, clicked, bounced, spam-complained, suppressed.
  - [ ] `PostmarkOutboundSnapshotByTag` — daily row per (server, tag). Tag will carry the centre key/name.
  - [ ] `PostmarkMessageEvent` (optional v1, useful v2) — per-message event log if we ingest webhooks.
  - [ ] `MailchimpCampaign` — id, list_id, subject, send_time, status, centre_key (matched).
  - [ ] `MailchimpCampaignReport` — opens, unique_opens, clicks, unique_clicks, unsubscribes, bounces, abuse_reports, send_time, fetched_at.
  - [ ] `MailchimpListGrowthSnapshot` — daily list size per list, member churn.
  - [ ] `FormstackForm` — id, name, folder, centre_key (matched), submission_count.
  - [ ] `FormstackSubmission` — id, form_id, submitted_at, payload (JSON), centre_key (matched).
- [ ] Run `npm run prisma:migrate` to create the migration; commit the migration files.
- [ ] Run `npm run prisma:generate`.

---

## Phase 3 — Service clients

Mirror the structure of `src/meta/client.ts` and `src/google-analytics/client.ts`.

### Postmark

- [ ] `src/postmark/config.ts` — read env, expose typed config object.
- [ ] `src/postmark/client.ts` — minimal fetch wrapper with the `X-Postmark-Server-Token` header, exponential backoff on 429/5xx.
- [ ] `src/postmark/stats.ts` — pulls for `/stats/outbound`, `/stats/outbound/opens`, `/stats/outbound/clicks`, `/stats/outbound/bounces`, scoped by date range and optional tag.
- [ ] `src/postmark/refresh.ts` — orchestrator that runs daily and writes snapshots via the storage layer.
- [ ] `src/storage/postmark-store.ts` — Prisma reads/writes; `readPostmarkDashboardData({ fromDate, toDate })`.
- [ ] Centre matcher: tag → centre via `matchMetaNameToCentre`-style fuzzy match in `src/postmark/centre-match.ts`.

### Mailchimp

- [ ] `src/mailchimp/config.ts`
- [ ] `src/mailchimp/client.ts` — basic-auth with `anystring:API_KEY`, base URL derived from `MAILCHIMP_SERVER_PREFIX`.
- [ ] `src/mailchimp/campaigns.ts` — list campaigns, fetch report per campaign, fetch click details.
- [ ] `src/mailchimp/lists.ts` — list growth snapshot, segment membership counts.
- [ ] `src/mailchimp/refresh.ts` — orchestrator (daily by default; campaigns refreshed for 30 days after send).
- [ ] `src/storage/mailchimp-store.ts` — `readMailchimpDashboardData({ fromDate, toDate })`.
- [ ] `src/mailchimp/centre-match.ts` — segment name / merge-field based.

### Formstack

- [ ] `src/formstack/config.ts`
- [ ] `src/formstack/client.ts` — bearer token, paginated GETs.
- [ ] `src/formstack/forms.ts` — list forms, fetch form metadata.
- [ ] `src/formstack/submissions.ts` — paginate submissions since last cursor; store raw payload.
- [ ] `src/formstack/refresh.ts` — incremental sync (cursor-based) so we don't re-pull historical submissions every run.
- [ ] `src/storage/formstack-store.ts` — `readFormstackDashboardData({ fromDate, toDate })`.
- [ ] `src/formstack/centre-match.ts` — folder name → centre, fallback to a designated field in the submission payload.

---

## Phase 4 — Sync scheduling

- [ ] Extend the existing background snapshot scheduler (`src/analytics/background-snapshot.ts` pattern) to include Postmark/Mailchimp/Formstack refreshes.
- [ ] Decide cadence (recommendation: hourly for Formstack submissions, daily for Postmark stats and Mailchimp reports).
- [ ] Add an audit-log entry per refresh for visibility — reuse `src/infocare/audit-log.ts` if it's general enough, otherwise add `src/storage/comms-audit-log.ts`.
- [ ] Surface "last successful pull" + "last error" timestamps in the dashboard header (mirrors how Meta + GA do it).

---

## Phase 5 — Comms dashboard UI

Each panel mirrors the look/feel of the Online Marketing panels (analytics table, header strip, focus-panel mode).

- [ ] **Header strip:** centre selector (reuse the existing component), date-range selector (default last 30 days).
- [ ] **Postmark panel** (`src/ui/comms/postmark-panel.ts`):
  - [ ] Top row tiles: emails sent, delivery rate, open rate, click rate, bounce rate, spam-complaint rate.
  - [ ] Trend chart: sent vs. delivered vs. opened over selected range.
  - [ ] Top-clicked links table.
  - [ ] Suppression list growth (count + delta).
- [ ] **Mailchimp panel** (`src/ui/comms/mailchimp-panel.ts`):
  - [ ] Recent campaigns table: subject, sent count, open rate, CTR, unsub rate, sent date, centre.
  - [ ] Audience growth chart per list.
  - [ ] Click-detail drilldown when a campaign row is focused.
- [ ] **Formstack panel** (`src/ui/comms/formstack-panel.ts`):
  - [ ] Submissions per form table (filtered by centre).
  - [ ] Weekly submission trend chart.
  - [ ] Latest submissions list (last 20) with payload preview.
  - [ ] "Time to waitlist" metric where the submission's centre matches an Infocare waitlist entry created within N days.
- [ ] **Cross-source "Funnel" panel** (`src/ui/comms/funnel-panel.ts`):
  - [ ] Per centre: form submission → email engagement (Postmark+Mailchimp) → Infocare waitlist entry → tour scheduled.
  - [ ] This is the panel that justifies the whole app — it ties the three services together with data we already have.
- [ ] Reuse `renderBreakoutScript` for the existing multi-screen pop-out behaviour.
- [ ] Reuse the print stylesheet additions from the Online Marketing app.

---

## Phase 6 — AI chat for comms

- [ ] Create `src/ai/comms-context.ts` — equivalent of `src/ai/context.ts` but the JSON describes the comms world:
  - [ ] `generatedAt`, `selectedRangeStart`, `selectedRangeEnd`, `selectedCentre` (re-used from snapshot)
  - [ ] `postmark`: sends, delivery rate, open/click rate, top clicked links, bounce reasons, suppression delta
  - [ ] `mailchimp`: recent campaigns (subject, send time, open/CTR/unsub, centre), audience growth per list
  - [ ] `formstack`: submissions per form (last range), weekly submission count, last-N submissions summary
  - [ ] `funnel`: per-centre funnel counts (submissions → engaged → waitlist → tour)
- [ ] `buildCommsSystemPrompt()` in the same file, modelled on `buildDashboardSystemPrompt()`. Same Beep Beep persona, same "answer only from named fields" rule, but tuned to email/forms language.
- [ ] Add `POST /api/comms/ai/chat` and `POST /api/comms/ai/chat/stream` in `src/server.ts`. Mirror the `/api/ai/chat` handler — only the context builder and system prompt differ.
- [ ] Reuse `runLocalChat`, `streamLocalChat`, `sanitizeChatHistory`, and `buildAiChatMessages` unchanged.
- [ ] Build a `renderCommsAiChatPanel` in `src/ui/comms-app-shell.ts` that mirrors `renderAiChatPanel` — same shell, same composer, same data attributes. The existing `renderAiChatScript` is parametric enough; if it isn't, generalise it (don't fork it) by adding a `data-ai-chat-endpoint` attribute on `.chat-shell`.
- [ ] Add deterministic guardrails where the answer is structural (e.g. "which centre has the lowest open rate" — compute it server-side and force it into the answer), mirroring `buildCampaignTimingGuardrail`.

---

## Phase 7 — Demo mode

- [ ] Add fixtures:
  - [ ] `src/demo/fixtures/postmark.ts` — 90 days of plausible send/open/click/bounce numbers per centre tag.
  - [ ] `src/demo/fixtures/mailchimp.ts` — 10–15 fake campaigns across the centres, with reports.
  - [ ] `src/demo/fixtures/formstack.ts` — a "Tour request" form per centre with 30–80 submissions over 90 days.
- [ ] Wire the fixtures through `src/demo/fixtures/index.ts` and respect the existing `isDemoBody` / `?demo=1` flag in the new routes and chat endpoints.
- [ ] Add a demo-mode banner to the comms shell using the existing `data-demo` attribute pattern.

---

## Phase 8 — Tests

- [ ] Extend `test/app-shell.test.ts` (or add `test/comms-app-shell.test.ts`):
  - [ ] Comms shell renders without throwing for empty data.
  - [ ] Nav-rail contains the Online Communications entry.
  - [ ] AI chat panel is present and has the expected `data-` attributes.
- [ ] Add unit tests for each centre matcher (`postmark/centre-match.ts`, `mailchimp/centre-match.ts`, `formstack/centre-match.ts`).
- [ ] Add a unit test for `buildCommsAiDashboardContext` that asserts shape and field names (since the AI prompt references them by name).
- [ ] Add a unit test for any deterministic guardrails added in Phase 6.

---

## Phase 9 — Verification

- [ ] Restart the dev server and load `/comms` — confirm the shell, all three panels, and the AI chat render in a fresh browser session.
- [ ] Load `/comms?demo=1` — confirm fixtures populate every panel and chat answers cite fixture centre names.
- [ ] Run an AI chat question against the real data: "Which centre's email open rate dropped the most in the last 30 days?" — confirm the answer cites a real centre name and a real number from the context JSON.
- [ ] Confirm print stylesheet works on the new panels.
- [ ] Confirm pop-out (`renderBreakoutScript`) opens each panel on a second screen.

---

## Phase 10 — Polish + ship

- [ ] Update the landing page tile to mark Online Communications as `primary: true`.
- [ ] Bump version in `package.json` (target: 0.10.0 — first major after the Online Marketing 0.9.x line).
- [ ] Update README to describe the new app and required env vars.
- [ ] Commit each phase as its own PR-sized change where possible; never bundle schema + UI + AI in one commit.
- [ ] Tag the release.

---

## Out of scope for v1 (defer to a follow-up plan)

- Sending email from the dashboard (we read from Postmark/Mailchimp; we don't trigger sends).
- Building new Formstack forms from the dashboard.
- Webhook ingestion for Postmark events — v1 polls the stats endpoints. v2 can move to event-level fidelity.
- Two-way write-back to Mailchimp segments based on Infocare waitlist state — desirable but its own design problem.

---

## Postmark webhook ingestion — current state (2026-05-22)

Webhooks turned out to be the only viable path for the use case, so the v2 webhook ingestion has been brought forward and partially built. **Blocked on:** webdev needs to attach the production webhook URL on the Postmark Server.

### Done

- **Cloudflare Tunnel** ("Beep Beep", id `37b734c8-4768-480f-a043-b9c978953b0d`) installed as a Windows service on the local machine (`cloudflared` 2026.5.0). Auto-starts on boot, outbound-only, no inbound firewall rule.
- **Public hostname** `https://webhooks.inspiredkindergartens.net/webhooks/postmark/events` → routes through the tunnel to `127.0.0.1:3000`. DNS resolves; tunnel verified live with curl from outside (returns 401 without auth, 403 with auth but non-Postmark IP — both correct).
- **Database:** `PostmarkMessageEvent` table migrated (`prisma/migrations/20260521000000_add_postmark_message_event/`). Indexed on `(serverToken, occurredAt)`, `(centreKey, occurredAt)`, `(tag, occurredAt)`; uniqueness on `(serverToken, messageId, eventType, occurredAt)`.
- **Endpoint:** `POST /webhooks/postmark/events` in `src/server.ts` — Basic Auth check (timing-safe compare), Postmark source-IP allowlist via `cf-connecting-ip`, normalises Delivery/Bounce/Open/Click into one schema, upserts into `PostmarkMessageEvent`. Always returns 200 after auth+IP pass so Postmark stops retrying; errors are logged.
- **Webhook handler module:** `src/postmark/webhook.ts` — pure functions for verification + ingestion; reused by the route.
- **Env vars:**
  - `POSTMARK_WEBHOOK_BASIC_AUTH` — generated 32-char URL-safe password, in `.env` only (also placeholder in `.env.example`).
  - `POSTMARK_SERVER_TOKEN` — declared in schema; **still empty**, fill once webdev provides it.
- **End-to-end smoke test (local):** Delivery, Bounce (uses `Email` not `Recipient`), Open, Click all stored with correct timestamp field mapping (`DeliveredAt` / `BouncedAt` / `ReceivedAt`). Unsupported `RecordType` returns 200 but skips the DB write. Test rows cleared.

### Blocked / waiting on webdev

- Configure the webhook on the Postmark Server. The full URL to give them:
  ```
  https://webhooks:<POSTMARK_WEBHOOK_BASIC_AUTH>@webhooks.inspiredkindergartens.net/webhooks/postmark/events
  ```
  Tick **Delivery, Bounce, Open, Click** in the Server's webhook settings. Provide the password out-of-band, not in the PR.
- Provide the **Server Token** so it can be stored in `.env` as `POSTMARK_SERVER_TOKEN`. Once present it's stored on every webhook event row (so multiple Postmark Servers can be distinguished later).
- Confirm the centre-tagging convention being used at send time. The endpoint reads `Tag` straight off the payload — the centre match (Phase 3 bullet "Centre matcher: tag → centre") still has to be wired before events get a `centreKey`.

### Not yet built (next pass once events start flowing)

- Centre matcher for `tag → centreKey` (Phase 3, `src/postmark/centre-match.ts`). Until then `centreKey` stays null on every row.
- Read path: `readPostmarkDashboardData` over `PostmarkMessageEvent` (replaces / complements the polled snapshot tables this plan originally specced).
- Postmark dashboard panel (Phase 5) — currently nothing renders this data.
- Cloudflare WAF rule restricting POST to Postmark's IPs at the edge (currently enforced only in app code — defense-in-depth, low priority).

---

## Mailchimp daily snapshot — current state (2026-05-22)

Phase 3 (Mailchimp) was built in this session. Daily snapshot wired into server startup, refresh action available at `/actions/refresh-mailchimp`.

### Done

- **Schema:** `MailchimpCampaign`, `MailchimpCampaignReport`, `MailchimpListGrowthSnapshot` already declared in `prisma/schema.prisma` (relations on `CentreReference` for centre matching).
- **Service client:** `src/mailchimp/client.ts` — Basic-auth (`anystring:API_KEY`), base URL from data-centre prefix, 429/5xx exponential backoff with `Retry-After` honouring, paginated list helper (`count`/`offset`, 100 per page, 50-page cap).
- **Config:** `src/mailchimp/config.ts` — `MAILCHIMP_API_KEY` + `MAILCHIMP_SERVER_PREFIX`. Server prefix is auto-extracted from the API key suffix (`-us14`) if the env var is omitted, and accepts bare prefix / hostname / URL forms.
- **Centre matcher:** `src/mailchimp/centre-match.ts` — wraps `matchMetaNameToCentre`, scoring subject → title → preview → segment → list name in order so a subject-level match isn't drowned by generic list copy.
- **Refresh orchestrator:** `src/mailchimp/refresh.ts` — pulls campaigns + reports + list-growth, upserts via storage module, idempotent per day (`ensureDailyMailchimpSnapshot` short-circuits if today's list-growth snapshot already exists).
- **Storage:** `src/storage/mailchimp-store.ts` — `upsertMailchimpCampaign`, `upsertMailchimpCampaignReport`, `upsertMailchimpListGrowthSnapshot`, `readMailchimpDashboardData({fromDate,toDate,serverPrefix})`, `readLatestMailchimpPulledAt`.
- **Server wiring:** env schema extended, refresh route `/actions/refresh-mailchimp`, daily snapshot fired non-blocking at startup, `describeIntegrationError` extended for the Mailchimp source, config warning logged when env is missing.
- **Env:** `.env.example` updated — `MAILCHIMP_SERVER_PREFIX` example fixed (was a URL, now documented as bare prefix `us14`, optional because the key suffix is used).

### Retry pending

- **Run `npm run prisma:migrate -- --name add_mailchimp_postmark_snapshots_formstack`** to create the Mailchimp tables (plus the also-declared `PostmarkOutboundSnapshot`, `PostmarkOutboundSnapshotByTag`, `FormstackForm`, `FormstackSubmission`). On 2026-05-22 the startup snapshot logged `The table public.MailchimpListGrowthSnapshot does not exist in the current database` because the schema was edited but never migrated. Kill the dev server before running so Prisma can hold the lock.
- After migration: restart `npm run dev`, watch for the `"Mailchimp daily snapshot ready"` log line. If `MAILCHIMP_API_KEY` is empty the snapshot will skip with a warning (expected).

### Not yet built

- **Dashboard panel** (Phase 5) — `src/ui/comms/mailchimp-panel.ts` to render `readMailchimpDashboardData`.
- **AI context** (Phase 6) — Mailchimp fields in `buildCommsAiDashboardContext`.
- **Demo fixtures** (Phase 7) — `src/demo/fixtures/mailchimp.ts`.
- **Tests** — unit test for `matchMailchimpCampaignToCentre` candidate ordering; storage round-trip.
