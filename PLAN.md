# PLAN — Online Communications breakout app

Implementation plan for the second breakout app inside Marketing Helper AI.

**Scope:** Postmark + Mailchimp + Formstack, built as its **own breakout app** — its own landing-page button, its own route (`/comms`), its own shell file (`comms-app-shell.ts`), its own AI chat endpoint. It is a sibling of the existing **Online Marketing** app, not a panel added inside it.

**Design rule:** every breakout app follows the same shell **pattern** — nav-rail icon, panel layout via `renderLayout`, focus-panel pattern, AI chat panel at the bottom of the panel stack, demo-mode parity via `?demo=1`. This plan reuses the existing primitives (functions, CSS, scripts) wherever possible, but the Online Communications app is a distinct app with its own files and routes.

---

## Phase 0 — Pre-work

- [ ] Confirm with stakeholders that Postmark, Mailchimp, and Formstack are all in-scope for v1 (vs. shipping one at a time).
- [x] Get API credentials into a sealed location and add placeholder env vars to `.env.example`:
  - [x] `POSTMARK_SERVER_TOKEN` unavailable from provider; Webmail v1 operates from webhooks only.
  - [x] `POSTMARK_ACCOUNT_TOKEN` (optional, for account-wide stats)
  - [x] `MAILCHIMP_API_KEY` and `MAILCHIMP_SERVER_PREFIX` (the `usX` data-centre prefix)
  - [x] `FORMSTACK_API_TOKEN` (OAuth bearer or personal access token)
- [x] Decide on the route prefix (recommendation: `/comms`) and the nav-rail icon (recommendation: `bi-envelope-paper` or `bi-chat-square-text`).
- [x] Decide whether centre attribution for emails uses Postmark **tags** or **metadata** (recommendation: tags, since tag-level stats are first-class in the Postmark API).

---

## Phase 1 — Scaffold the breakout app shell

- [x] Add a `commsLanding` tile to `src/ui/landing-page.ts` so the landing page exposes the new app. Keep it `primary: true` once it's usable; until then leave it in the "Coming soon" placeholder grid.
- [x] Add a nav-rail entry in `src/ui/app-shell.ts` next to the Online Marketing one, linking to `/comms` (and `/comms?demo=1` when demo is on). Mirror the title/aria-label pattern.
- [x] Create `src/ui/comms-app-shell.ts` — the equivalent of `app-shell.ts` for the comms app. Start by re-using `renderLayout`, `renderBreakoutScript`, and `renderAiChatScript` from the existing shell; only the panel content differs.
- [x] Add `GET /comms` and `GET /comms?demo=1` routes in `src/server.ts` that render the new shell. Mirror the existing `/app` route handler structure.
- [x] Add a `commsBreakout` toggle test in `test/app-shell.test.ts` to assert the nav-rail and routes exist.

---

## Phase 2 — Database schema

- [x] Add Prisma models for raw + snapshot data (mirror the meta-store / google-analytics-store pattern):
  - [x] `PostmarkOutboundSnapshot` — daily row per server: sent, delivered, opened, clicked, bounced, spam-complained, suppressed.
  - [x] `PostmarkOutboundSnapshotByTag` — daily row per (server, tag). Tag will carry the centre key/name.
  - [x] `PostmarkMessageEvent` (optional v1, useful v2) — per-message event log if we ingest webhooks.
  - [x] `MailchimpCampaign` — id, list_id, subject, send_time, status. Panui is organisation-wide and is not matched to centres.
  - [x] `MailchimpCampaignReport` — opens, unique_opens, clicks, unique_clicks, unsubscribes, bounces, abuse_reports, send_time, fetched_at.
  - [x] `MailchimpListGrowthSnapshot` — daily list size per list, member churn.
  - [x] `FormstackForm` — id, name, folder, centre_key (matched), submission_count.
  - [x] `FormstackSubmission` — id, form_id, submitted_at, payload (JSON), centre_key (matched).
- [x] Run `npm run prisma:migrate` to create the migration; commit the migration files.
- [x] Run `npm run prisma:generate`.

---

## Phase 3 — Service clients

Mirror the structure of `src/meta/client.ts` and `src/google-analytics/client.ts`.

### Postmark

- [ ] `src/postmark/config.ts` — read env, expose typed config object.
- [ ] `src/postmark/client.ts` — minimal fetch wrapper with the `X-Postmark-Server-Token` header, exponential backoff on 429/5xx.
- [ ] `src/postmark/stats.ts` — pulls for `/stats/outbound`, `/stats/outbound/opens`, `/stats/outbound/clicks`, `/stats/outbound/bounces`, scoped by date range and optional tag.
- [ ] `src/postmark/refresh.ts` — orchestrator that runs daily and writes snapshots via the storage layer.
- [x] `src/storage/postmark-store.ts` — Prisma reads/writes; `readPostmarkDashboardData({ fromDate, toDate })`.
- [x] Centre matcher: tag → centre via `matchMetaNameToCentre`-style fuzzy match in `src/postmark/centre-match.ts`.

### Mailchimp

- [x] `src/mailchimp/config.ts`
- [x] `src/mailchimp/client.ts` — basic-auth with `anystring:API_KEY`, base URL derived from `MAILCHIMP_SERVER_PREFIX`.
- [ ] `src/mailchimp/campaigns.ts` — list campaigns, fetch report per campaign, fetch click details.
- [ ] `src/mailchimp/lists.ts` — list growth snapshot, segment membership counts.
- [x] `src/mailchimp/refresh.ts` — orchestrator (daily by default; campaigns refreshed for 30 days after send).
- [x] `src/storage/mailchimp-store.ts` — `readMailchimpDashboardData({ fromDate, toDate })`.

### Formstack

- [x] `src/formstack/config.ts`
- [x] `src/formstack/client.ts` — bearer token, paginated GETs.
- [ ] `src/formstack/forms.ts` — list forms, fetch form metadata.
- [ ] `src/formstack/submissions.ts` — paginate submissions since last cursor; store raw payload.
- [x] `src/formstack/refresh.ts` — incremental sync (cursor-based) so we don't re-pull historical submissions every run.
- [x] `src/storage/formstack-store.ts` — `readFormstackDashboardData({ fromDate, toDate })`.
- [x] `src/formstack/centre-match.ts` — folder name → centre, fallback to a designated field in the submission payload.

---

## Phase 4 — Sync scheduling

- [ ] Extend the existing background snapshot scheduler (`src/analytics/background-snapshot.ts` pattern) to include Postmark/Mailchimp/Formstack refreshes.
- [x] Decide cadence (recommendation: hourly for Formstack submissions, daily for Postmark stats and Mailchimp reports).
- [ ] Add an audit-log entry per refresh for visibility — reuse `src/infocare/audit-log.ts` if it's general enough, otherwise add `src/storage/comms-audit-log.ts`.
- [x] Surface "last successful pull" + "last error" timestamps in the dashboard header (mirrors how Meta + GA do it).

---

## Phase 5 — Comms dashboard UI

Each panel mirrors the look/feel of the Online Marketing panels (analytics table, header strip, focus-panel mode).

- [ ] **Header strip:** centre selector (reuse the existing component), date-range selector (default last 30 days).
- [ ] **Postmark panel** (`src/ui/comms/postmark-panel.ts`):
  - [ ] Top row tiles: emails sent, delivery rate, open rate, click rate, bounce rate, spam-complaint rate.
  - [ ] Trend chart: sent vs. delivered vs. opened over selected range.
  - [ ] Top-clicked links table.
  - [ ] Suppression list growth (count + delta).
- [x] **Mailchimp panel** (`src/ui/comms/mailchimp-panel.ts`):
  - [x] Recent campaigns table: subject, sent count, open rate, CTR, unsub rate, sent date, centre.
  - [x] Audience growth chart per list.
  - [ ] Click-detail drilldown when a campaign row is focused.
- [x] **Formstack panel** (`src/ui/comms/formstack-panel.ts`):
  - [x] Submissions per form table (filtered by centre).
  - [ ] Weekly submission trend chart.
  - [x] Latest submissions list (last 20) with payload preview.
  - [ ] "Time to waitlist" metric where the submission's centre matches an Infocare waitlist entry created within N days.
- [x] **Cross-source "Funnel" panel** (`src/ui/comms/funnel-panel.ts`):
  - [ ] Per centre: form submission → email engagement (Postmark+Mailchimp) → Infocare waitlist entry → tour scheduled.
  - [ ] This is the panel that justifies the whole app — it ties the three services together with data we already have.
- [ ] Reuse `renderBreakoutScript` for the existing multi-screen pop-out behaviour.
- [x] Reuse the print stylesheet additions from the Online Marketing app.

---

## Phase 6 — AI chat for comms

- [x] Create `src/ai/comms-context.ts` — equivalent of `src/ai/context.ts` but the JSON describes the comms world:
  - [ ] `generatedAt`, `selectedRangeStart`, `selectedRangeEnd`, `selectedCentre` (re-used from snapshot)
  - [ ] `postmark`: sends, delivery rate, open/click rate, top clicked links, bounce reasons, suppression delta
  - [ ] `mailchimp`: recent campaigns (subject, send time, open/CTR/unsub), audience growth per list
  - [ ] `formstack`: submissions per form (last range), weekly submission count, last-N submissions summary
  - [ ] `funnel`: per-centre funnel counts (submissions → engaged → waitlist → tour)
- [x] `buildCommsSystemPrompt()` in the same file, modelled on `buildDashboardSystemPrompt()`. Same Beep Beep persona, same "answer only from named fields" rule, but tuned to email/forms language.
- [x] Add `POST /api/comms/ai/chat` and `POST /api/comms/ai/chat/stream` in `src/server.ts`. Mirror the `/api/ai/chat` handler — only the context builder and system prompt differ.
- [x] Reuse `runLocalChat`, `streamLocalChat`, `sanitizeChatHistory`, and `buildAiChatMessages` unchanged.
- [x] Build a `renderCommsAiChatPanel` in `src/ui/comms-app-shell.ts` that mirrors `renderAiChatPanel` — same shell, same composer, same data attributes. The existing `renderAiChatScript` is parametric enough; if it isn't, generalise it (don't fork it) by adding a `data-ai-chat-endpoint` attribute on `.chat-shell`.
- [ ] Add deterministic guardrails where the answer is structural (e.g. "which centre has the lowest open rate" — compute it server-side and force it into the answer), mirroring `buildCampaignTimingGuardrail`.

---

## Phase 7 — Demo mode

- [x] Add fixtures:
  - [ ] `src/demo/fixtures/postmark.ts` — 90 days of plausible send/open/click/bounce numbers per centre tag.
  - [ ] `src/demo/fixtures/mailchimp.ts` — 10–15 fake campaigns across the centres, with reports.
  - [ ] `src/demo/fixtures/formstack.ts` — a "Tour request" form per centre with 30–80 submissions over 90 days.
- [x] Wire the fixtures through `src/demo/fixtures/index.ts` and respect the existing `isDemoBody` / `?demo=1` flag in the new routes and chat endpoints.
- [x] Add a demo-mode banner to the comms shell using the existing `data-demo` attribute pattern.

---

## Phase 8 — Tests

- [x] Extend `test/app-shell.test.ts` (or add `test/comms-app-shell.test.ts`):
  - [x] Comms shell renders without throwing for empty data.
  - [x] Nav-rail contains the Online Communications entry.
  - [x] AI chat panel is present and has the expected `data-` attributes.
- [x] Add unit tests for each centre matcher (`postmark/centre-match.ts`, `formstack/centre-match.ts`).
- [x] Add a unit test for `buildCommsAiDashboardContext` that asserts shape and field names (since the AI prompt references them by name).
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

## Data retention rule — confirmed 2026-05-26

- Every external API response and authenticated webhook payload received by the application must be retained as an append-only raw capture record, whether or not the current UI uses it.
- Every dashboard snapshot is a timestamped immutable record. Refreshes insert a new record; they do not update, replace or delete earlier snapshots.
- Mutable current-state projections may exist for dashboard convenience, but they do not replace the raw capture history or snapshot history.
- The live application database must never be reset, truncated or destroyed to resolve migrations.
- Applied on 2026-05-26 with `prisma migrate deploy` after explicit approval: `prisma/migrations/20260526020000_add_append_only_external_api_capture/` adds raw capture storage and relaxes only overwrite-forcing uniqueness indexes; it does not delete or rewrite existing data.
- Post-application verification confirmed existing centre records, Meta recommendation notes and Google Analytics snapshots remained present.
- Code captures future Infocare, Meta, Google Analytics, Mailchimp and Postmark responses/payloads in `ExternalApiCapture`, and changes Google Analytics, Infocare computed snapshots and Mailchimp report/list snapshots to append new rows instead of replacing previous records.

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
  - `POSTMARK_SERVER_TOKEN` — declared for a possible later API integration; unavailable for this deployment, so Webmail must operate from webhooks only.
- **End-to-end smoke test (local):** Delivery, Bounce (uses `Email` not `Recipient`), Open, Click all stored with correct timestamp field mapping (`DeliveredAt` / `BouncedAt` / `ReceivedAt`). Unsupported `RecordType` returns 200 but skips the DB write. Test rows cleared.

### Blocked / waiting on webdev

- Configure the webhook on the Postmark Server. The full URL to give them:
  ```
  https://webhooks:<POSTMARK_WEBHOOK_BASIC_AUTH>@webhooks.inspiredkindergartens.net/webhooks/postmark/events
  ```
  Tick **Delivery, Bounce, Open, Click** in the Server's webhook settings. Provide the password out-of-band, not in the PR.
- No Server Token is available for this deployment. Use incoming webhook events only; historical Postmark Activity and `Processed` records cannot be imported.
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
- **Attribution:** Panui campaigns are organisation-wide staff newsletters and are deliberately not matched to centres.
- **Refresh orchestrator:** `src/mailchimp/refresh.ts` — pulls campaigns + reports + list-growth, upserts via storage module, idempotent per day (`ensureDailyMailchimpSnapshot` short-circuits if today's list-growth snapshot already exists).
- **Storage:** `src/storage/mailchimp-store.ts` — `upsertMailchimpCampaign`, `upsertMailchimpCampaignReport`, `upsertMailchimpListGrowthSnapshot`, `readMailchimpDashboardData({fromDate,toDate,serverPrefix})`, `readLatestMailchimpPulledAt`.
- **Server wiring:** env schema extended, refresh route `/actions/refresh-mailchimp`, daily snapshot fired non-blocking at startup, `describeIntegrationError` extended for the Mailchimp source, config warning logged when env is missing.
- **Env:** `.env.example` updated — `MAILCHIMP_SERVER_PREFIX` example fixed (was a URL, now documented as bare prefix `us14`, optional because the key suffix is used).

### Retry pending

- **Migration applied on 2026-05-26:** `prisma/migrations/20260526000000_add_mailchimp_postmark_snapshots_formstack/` was applied with `prisma migrate deploy`, creating the Mailchimp tables plus the declared `PostmarkOutboundSnapshot`, `PostmarkOutboundSnapshotByTag`, `FormstackForm`, and `FormstackSubmission` tables without resetting existing data.
- **Data preservation verified after application:** stored centre records, Meta recommendation notes, Google Analytics snapshots and Postmark events remained available after the additive migration.
- On server restart, watch for the `"Mailchimp daily snapshot ready"` log line. If `MAILCHIMP_API_KEY` is empty the snapshot will skip with a warning (expected).

### Not yet built

- **Dashboard data import:** the Mailchimp panel now renders campaign summary metrics, recent campaign performance and audience snapshot tables from `readMailchimpDashboardData`.
- **AI context** (Phase 6) — Mailchimp fields in `buildCommsAiDashboardContext`.
- **Demo fixtures** (Phase 7) — `src/demo/fixtures/mailchimp.ts`.
- **Tests** — campaign dashboard rendering and storage round-trip.

---

## Communications non-Postmark delivery - current state (2026-05-26)

This section supersedes earlier Mailchimp implementation wording above where it conflicts with the append-only retention rule.

### Completed

- **Mailchimp UI:** campaign/report and audience snapshot data render in `/comms`, with sent campaigns shown latest-to-oldest and unsent items after dated campaigns.
- **Mailchimp retention correction:** campaign reports and audience growth pulls now insert historical snapshots; raw Mailchimp responses are appended to `ExternalApiCapture`.
- **Formstack integration:** implemented against the Formstack V2025 read-only API using the configured Personal Access Token, with `GET /forms` and `GET /forms/{formId}/submissions`.
- **Formstack retention:** every Formstack API response is first appended to `ExternalApiCapture`; `FormstackForm` and `FormstackSubmission` are queryable current-resource projections for the dashboard.
- **Formstack UI:** `/comms` now renders imported forms, stored submission totals, latest submissions and centre matching, with an explicit refresh action at `/actions/refresh-formstack`.
- **Centre Activity panel:** renders Postmark webhook events, Mailchimp activity and Formstack submissions aligned by matched centre and explicitly does not claim individual conversion attribution.
- **Communications chat:** context, routes and UI are wired for imported Mailchimp and Formstack data; if the optional local model is unavailable, an evidence-only built-in summary is used.
- **Demo and tests:** Communications demo fixtures and focused tests cover Mailchimp ordering, Formstack matching, Formstack/Funnel rendering, Communications context and external-response capture requirements.

### Initial Formstack import

- On 2026-05-26, the approved initial Formstack import stored 12 forms and 1,572 submissions.
- The import stored 25 immutable Formstack raw capture rows, including the initial V2 `401` response that exposed the need to switch to the configured V2025 Personal Access Token endpoint.
- **Webmail / Postmark webhook dashboard:** webhook events are now arriving and are rendered from `PostmarkMessageEvent`; the first stored events are one Delivery and one Open event tagged `welcome-email`.
- **Webmail retention:** raw webhook payloads remain append-only in `ExternalApiCapture`, while event projections are inserted immutably; the read path does not alter stored webhook history.
- **Centre matching:** future Postmark events first use any confidently matching tag, then fall back to the recipient mailbox name before `@` (for example `paengaroa@ikindergartens.nz` -> Paengaroa) where it maps uniquely to an open centre. Ambiguous/generic recipients remain unmatched; already stored webhook events are not rewritten.
- **Webhook-only operation (confirmed 2026-05-27):** production Webmail monitoring must operate without a Postmark API token. The endpoint stores future webhook events received after configuration; Postmark webhooks do not backfill existing Activity rows. Delivery, Open, Click and Bounce are sufficient for current event tracking; Spam Complaint and Subscription Change may be enabled if suppression visibility is wanted.
- **Unavailable without a Postmark token:** Postmark's `Processed` Activity rows and historical message/subject retrieval require `/messages/outbound`. Since the server token is not being provided, the dashboard must not promise those fields or historical imports.
- **Verification remaining:** confirm the webhook is saved on `Inspired Kindergartens` -> `Default Transactional Stream` (`outbound`), then trigger one new transactional message after configuration and verify its new webhook event reaches the app.
- **Message consolidation:** Postmark webhook `MessageID` is stored on every supported message event. The Webmail table groups future Delivery, Open, Click and Bounce events by message ID and renders their statuses as badges on one message row; immutable event records remain unchanged.
