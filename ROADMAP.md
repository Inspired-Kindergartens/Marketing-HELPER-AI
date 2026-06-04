# Marketing Helper AI — Integration Roadmap

This roadmap captures the marketing tools that are in-scope for future breakout apps inside Marketing Helper AI, given the existing iK infrastructure (Microsoft 365, Adobe, Mailchimp, Formstack, Postmark) and the centre/waitlist data already flowing through Infocare, Meta Ads, and Google Analytics.

Each entry lists why it fits, the API surface to integrate against, the data we'd want to pull, and the breakout app it most likely belongs to.

---

## App boundaries

The landing page already reserves five "Coming soon" tiles below the primary buttons (`src/ui/landing-page.ts`). Each future breakout app is one of those tiles and follows the same shell as the existing **Online Marketing** dashboard:

- Top-right nav rail icon → routes to a dedicated path (e.g. `/comms`, `/local-seo`, `/assets`)
- Same panel layout (`renderLayout`) with a focus-panel pattern
- AI chat panel wired in via `/api/ai/chat` and `/api/ai/chat/stream`, grounded on a context object built per app
- Demo-mode parity (`?demo=1`) using a fixture set under `src/demo/fixtures/`

Planned breakout apps:

1. **Online Marketing** — existing. Centres, waitlists, Meta Ads, Google Analytics.
2. **Online Communications** — Postmark + Mailchimp + Formstack. Email + form funnel.
3. **Local Presence** — Google Business Profile + Google Search Console + Meta Page insights (organic).
4. **Workspace & Calendar** — Microsoft 365 Graph (Outlook, Bookings, SharePoint, Teams).
5. **Creative & Assets** — Adobe Creative Cloud / Express asset library.
6. **Job Tracking** — internal job/work tracker for signage, adverts, and other marketing jobs per centre, with relationship metadata on the people involved.

---

## 1. Online Communications

**Status:** next in build queue. See `PLAN.md`.

### Postmark (transactional + broadcast email)

- **Why it fits:** iK already sends through Postmark, so deliverability data is authoritative — opens, clicks, bounces, spam complaints, suppressions. Pairs naturally with waitlist follow-ups and tour-confirmation flows.
- **API:** Postmark Server API (`https://api.postmarkapp.com`). Auth via `X-Postmark-Server-Token` header.
- **Endpoints of interest:**
  - `GET /stats/outbound` — sent, delivered, bounced, opened, clicked per range
  - `GET /stats/outbound/opens`, `/clicks`, `/bounces`, `/spam` — breakdowns
  - `GET /messages/outbound` — message-level history, searchable by tag/recipient
  - `GET /bounces` and `GET /suppressions` — deliverability hygiene
  - Webhooks for `Delivery`, `Open`, `Click`, `Bounce`, `SpamComplaint`
- **Data to surface:** send volume per centre (via tag), delivery rate, open/click rate trend, bounce reasons, suppression list growth, top-clicked links per campaign.
- **Centre matching:** push a `centreKey` (or service name) into Postmark message tags/metadata at send time so every event can be attributed back to a centre.

### Mailchimp (audience + broadcast campaigns)

- **Why it fits:** newsletter, drip nurture, and centre-specific announcements run through Mailchimp. The Reports API gives campaign-level open/CTR/unsubscribe figures and audience growth.
- **API:** Mailchimp Marketing API v3.0 (`https://<dc>.api.mailchimp.com/3.0`). Auth via API key or OAuth.
- **Endpoints of interest:**
  - `GET /campaigns` — list and filter by status/date
  - `GET /reports/{campaign_id}` — opens, clicks, unsubs, bounces, forwards
  - `GET /reports/{campaign_id}/click-details` — link-level CTR
  - `GET /reports/{campaign_id}/email-activity` — per-recipient events
  - `GET /lists/{list_id}/growth-history` — subscriber count over time
  - `GET /lists/{list_id}/segments` — segments per centre
- **Data to surface:** campaign-level performance, audience growth/churn per list, segment performance by centre, link clicks tied to centre landing pages.
- **Centre matching:** Mailchimp segments or merge fields keyed on `centre_key` (or service name); fall back to segment-name regex when missing.

### Formstack (forms + submissions)

- **Why it fits:** enquiry forms, tour requests, and other lead-capture forms are all built in Formstack. Submissions are the top-of-funnel signal that complements Infocare waitlist (which is mid-funnel).
- **API:** Formstack REST API v2 (`https://www.formstack.com/api/v2`). Auth via OAuth or API token.
- **Endpoints of interest:**
  - `GET /form.json` — list forms (filter by folder per centre)
  - `GET /form/{id}.json` — form metadata, fields, submission count
  - `GET /form/{id}/submission.json` — paginated submissions
  - `GET /submission/{id}.json` — individual submission detail
  - Webhooks on submit — push directly into our DB
- **Data to surface:** submissions per form per centre, conversion rate (views vs. submits if available), drop-off by required field, weekly enquiry trend, time-to-waitlist (form submit → Infocare waitlist match).
- **Centre matching:** form folder name, hidden field `centre_key`, or fuzzy match on the centre field in the submission payload.

---

## 2. Local Presence

### Google Business Profile (per centre)

- **Why it fits:** childcare is hyper-local. Parents search "kindergarten near me" — GBP is where they convert from search to a call/direction request. We have a profile per centre.
- **API:** Google Business Profile API v1 (`mybusinessbusinessinformation.googleapis.com`, `mybusinessaccountmanagement.googleapis.com`, `businessprofileperformance.googleapis.com`). Auth via OAuth (same Google account already used for GA4).
- **Endpoints of interest:**
  - `GET accounts/{account}/locations` — one per centre
  - `GET locations/{location}:fetchMultiDailyMetricsTimeSeries` — views, calls, direction requests, website clicks
  - `GET locations/{location}/reviews` — review text, rating, response status
  - `GET locations/{location}/localPosts` — current "post" content
- **Data to surface:** views/calls/directions/website-clicks per centre per week; unanswered reviews; rating trend; post freshness ("last post 47 days ago").
- **Note:** GBP API requires location verification + ownership of the Google account.

### Google Search Console

- **Why it fits:** complements GA4 by exposing what queries bring parents to each centre page before they convert. Particularly useful for content/SEO work on centre-specific landing pages.
- **API:** Search Console API v1 (`searchconsole.googleapis.com/webmasters/v3`). Auth via OAuth.
- **Endpoints of interest:**
  - `POST /sites/{siteUrl}/searchAnalytics/query` — clicks, impressions, CTR, average position by query/page/country/device
- **Data to surface:** top queries per centre URL, rising queries, CTR vs. position outliers (low CTR at high position = title/meta opportunity), pages losing impressions.

### Meta Page Insights (organic, distinct from Ads)

- **Why it fits:** we have a Page per centre. Organic reach/engagement is a separate signal from paid (which we already track). Useful for content cadence decisions.
- **API:** Meta Graph API `/page/{page-id}/insights`. Auth via the same Page access token already used for Ads.
- **Endpoints of interest:**
  - `page_impressions`, `page_post_engagements`, `page_fans`, `page_views_total`
  - `/{page-id}/posts` + per-post insights for engagement breakdowns
- **Data to surface:** organic reach/engagement trend, post performance, follower growth.

---

## 3. Workspace & Calendar (Microsoft 365)

### Microsoft 365 — Graph API

- **Why it fits:** internal collaboration and tour scheduling already happen in M365. Surfacing the relevant slices inside the dashboard avoids context switching and creates an audit trail for marketing-driven activity.
- **API:** Microsoft Graph (`https://graph.microsoft.com/v1.0`). Auth via Azure AD app registration with delegated or application permissions.
- **Capabilities of interest:**
  - **Outlook Calendar** (`/users/{id}/events`) — centre tours scheduled, tour density per centre per week
  - **Microsoft Bookings** (`/solutions/bookingBusinesses/{id}`) — if used for tour booking, pulls confirmed appointments directly
  - **SharePoint / OneDrive** (`/sites/{id}/drive/items`, `/me/drive`) — marketing collateral library; surface "latest brochure version" per centre
  - **Teams** (`/teams/{id}/channels/{id}/messages`) — post a weekly digest of the dashboard's key recommendations into a Marketing channel
  - **Excel** (`/me/drive/items/{id}/workbook`) — read/write rows if any operational sheets need to stay in sync
  - **To Do / Planner** (`/me/todo/lists/{id}/tasks`, `/planner/tasks`) — propose next-action tasks from the AI chat into a real M365 task list (with user confirmation)
- **Data to surface:** tours-this-week per centre, asset library age, "post weekly digest to Teams" action, "create Planner task for centre X" action.

---

## 4. Creative & Assets (Adobe)

### Adobe Creative Cloud / Express

- **Why it fits:** ad creative, social tiles, and centre brochures are produced in Adobe. Linking a centre's recommended action to the asset that supports it removes the manual lookup.
- **API options:**
  - **Adobe Express Embed SDK + Adobe IO APIs** — programmatic asset library access, render templates
  - **Creative Cloud Libraries API** — list/get assets from shared libraries (covers logos, palette, ad templates)
- **Data to surface:** asset library inventory tagged by centre / campaign, "latest creative for centre X", template-driven generation of a new ad/email header.
- **If Adobe Analytics or Marketo is on the licence:** those add another integration layer (multi-channel attribution and marketing automation), but only worth doing once we know they're in use.

### Adobe Acrobat Sign (optional)

- **Why it fits:** if enrolment confirmations or tour follow-ups need a signed document, Sign integrates with M365 and could close the loop from waitlist → tour → enrolment.
- **API:** Adobe Sign REST API v6.

---

## 5. Job Tracking

**Status:** scoped, not started. Source: `D:\iK\Documents\Future Work.txt`.

Internal tracker for marketing jobs (signage, adverts, and other categories) attached to kindergartens or other entities. Unlike the other breakout apps, this is a first-party system — no upstream SaaS API — so it owns its own schema in Postgres and lives entirely behind the existing auth/UI shell.

### Scope

- **Job categories:** Signage, Adverts, and an open-ended "Other" bucket. Categories are first-class so new ones (e.g. Print, Web, Event) can be added without migrations.
- **Entity attachment:** every job belongs to either a `centreKey` (kindergarten) or a generic "other" entity (e.g. head office, supplier). Reuse the same centre matcher used elsewhere so jobs can be cross-referenced with waitlist, Meta, GA, and Mailchimp data.
- **Lifecycle:** status field (e.g. `requested → in-progress → review → done → cancelled`), assignee, due date, and a free-form notes/activity log. Keep it boring — Trello-card level of detail, not Jira.
- **People metadata (the differentiator):**
  - Per-person profile recording how easy/difficult they are to work with (e.g. 1–5 scale or named tiers).
  - Communication sensitivity ("walk on eggshells") flag with a short note on *why* and *how* to manage them.
  - Preferred channel / cadence / tone notes.
  - Stored against a `Person` record that can be linked to one or more centres or jobs, so the same notes follow them across jobs.

### Data model (sketch)

- `Job` — id, category, title, description, entity (centreKey or other-entity ref), status, assignee (User), createdAt, dueAt, completedAt.
- `JobCategory` — id, name, colour/icon (seeded with Signage, Adverts).
- `Person` — id, name, role, organisation, contact channels.
- `PersonProfile` — personId, difficultyTier, sensitivityFlag, managementNotes (markdown), preferredChannel, updatedAt, updatedBy. Versioned so we don't lose prior context when notes change.
- `JobPerson` — many-to-many: jobId, personId, role-on-job (requester, approver, supplier, etc.).
- `JobEvent` — append-only activity log (status changes, comments, attachments).

### UI

- New tile on the landing page → `/jobs`.
- Job board view (columns by status) and list view (filter by centre/category/person).
- Person directory with the relationship/sensitivity notes surfaced inline on every job they appear on.
- AI chat panel grounded on `buildJobsContext` — answers questions like "what's overdue for centre X" or "remind me how to approach this person".

### Cross-links with existing apps

- A job can reference a Mailchimp campaign, Postmark broadcast, Formstack form, or Meta ad set as an "output" — the job is the brief, the comms/marketing tools are the execution. Use a soft link (external URL + service tag), not a hard FK, since the upstream IDs are owned by those SaaS providers.
- People records can be reused as Postmark/Mailchimp recipient hints (fuzzy match on email) — but the source of truth for that person's contact stays in Postmark/Mailchimp; the job tracker only holds the working-relationship notes.

### Privacy / handling

- Difficulty and sensitivity notes are subjective and sensitive. Restrict read access to authenticated users; never expose via demo mode. Log every edit (who/when) and surface the audit trail on the profile.
- No export endpoint by default — these notes shouldn't leave the app.

---

## Cross-cutting concerns

These apply to every new integration:

- **Local-first:** every API call goes through a `src/<service>/client.ts` module that respects existing `.env` config patterns. No SaaS-side proxying.
- **Centre matching:** every external record gets matched to a `centreKey` using the same `matchMetaNameToCentre`-style fuzzy matcher already used for Meta. Store the match alongside the raw payload.
- **Snapshot model:** prefer the snapshot pattern already used for GA4 and Meta (`storage/<service>-store.ts` → daily/periodic snapshot rows) over live API calls on every page load.
- **AI context:** each breakout's `buildAiDashboardContext` produces a JSON object the chat panel uses as ground truth. Keep the object compact (≤ ~2 KB) and named-field oriented.
- **Demo mode:** every integration ships with a `src/demo/fixtures/<service>.ts` fixture set so the demo landing tile keeps working.
- **OAuth tokens:** stored encrypted at rest in Postgres; refresh via the same scheduled-task pattern as Meta/GA.

---

## Out of scope (for now)

- Public-facing customer portals
- CDP / customer data platform builds
- Anything that writes back to a parent's record without an explicit user confirmation step
- Replacing Infocare, Mailchimp, Formstack, or Postmark — Marketing Helper AI augments them, it doesn't supersede them
