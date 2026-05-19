# PLAN.md — Landing Page + Demo Mode

This phase adds two things:

1. A **landing page** at `/` that acts as a personal hub for showcasing the Marketing Helper AI dashboard and (later) bolting on additional tools.
2. A **demo mode** of the existing dashboard that swaps real Infocare / Meta / GA data for anonymised fixtures, so the dashboard can be shown without exposing real centre data.

The app remains local-only. The demo is something the user drives in-person or via screen-share. The local-host safety check in `src/server.ts` stays as it is.

---

## Phase A — Landing Page Skeleton

**Goal:** `/` becomes a landing page. The current dashboard moves to `/app`. The landing page has a clear "Open Dashboard" link and a "Demo Mode" link, plus space to add tiles for future tools.

### A1. Route shuffle
- Move the existing `/` handler in `src/server.ts:364` to `/app` (preserve all querystring types and behavior verbatim — do not rewrite the handler body).
- Add a new `/` handler that renders the landing page.
- Update any in-app links, redirects, or refresh-action `reply.redirect("/...")` calls that currently point to `/` so they point to `/app` (audit `src/server.ts` and `src/ui/app-shell.ts` for hard-coded `/?...` patterns).

### A2. Landing page renderer
- Create `src/ui/landing-page.ts` that exports `renderLandingPage()`.
- Follow the same rendering style as `src/ui/app-shell.ts` (server-rendered HTML string, reuse `/app.css`).
- **Design the page around the ASCII art from `README.md`** (the large multi-block ASCII at the top — the silhouette panel plus the `MARKETING HELPER AI` lettering blocks). The ASCII is the centrepiece of the landing page:
  - Render the ASCII art inside a `<pre>` block, centred, monospace, with whitespace preserved.
  - Read the ASCII art block from `README.md` at server start (or paste it into a constant in `src/ui/landing-page.ts` — preferred, so the landing page is not coupled to README parsing).
  - Buttons sit **below** the ASCII art in a single horizontal row.
- Page content:
  - Header strip (small, top of page) — just the app name in a compact font.
  - ASCII art hero block (the visual centrepiece).
  - Tagline beneath the ASCII art, one line.
  - **Three primary buttons** in a row beneath the tagline:
    1. **Online Marketing** → `/app` (the existing dashboard — this is the live tool).
    2. **Demo** → `/app?demo=1` (Phase B wires up the data swap).
    3. **Read Me** → `/readme` (renders the README — see A3).
  - Below the buttons, a **placeholder tile grid** (3–6 empty "Coming soon" slots) so future tools have a visible home.
- Style the buttons consistently with the existing app — reuse button styles from `app.css` where possible; add new `.landing-*` classes for landing-specific layout (hero, button row, tile grid).
- Keep all CSS additions in `src/ui/app.css` (do not create a second stylesheet).

### A3. Wire up
- Import `renderLandingPage` in `src/server.ts` and use it for the new `/` handler.
- Add a new `/readme` route in `src/server.ts`:
  - Read `README.md` from disk on each request (small file, no perf issue).
  - Render it inside a minimal HTML wrapper with the same `<link rel="stylesheet" href="/app.css">` so styling is consistent.
  - Render the markdown server-side. Simplest path: wrap the raw markdown in a `<pre class="readme-raw">` block (preserves the ASCII art and is zero-dependency). If a nicer rendering is wanted later, add `marked` as a dependency in a follow-up.
  - Include a back link to `/` at the top of the page.
- Add a small "← Landing" link in the dashboard header (in `src/ui/app-shell.ts`) so it's easy to get back from `/app` to `/`.

### A4. Verify
- Restart the dev server (kill PID on :3000, re-run `npm run dev` in background).
- Visit `/` → landing page renders with the ASCII art hero and three buttons: **Online Marketing**, **Demo**, **Read Me**.
- Click **Online Marketing** → `/app` → existing dashboard renders unchanged.
- Click **Read Me** → `/readme` → README contents render with the ASCII art intact.
- Click **Demo** → `/app?demo=1` (will show the real dashboard until Phase B is done; that's expected at this stage).
- `npm test` and `npm run typecheck` both pass.

---

## Phase B — Demo Mode Plumbing

**Goal:** When `?demo=1` is set (or a sticky cookie is on), the dashboard renders from fixture data instead of hitting Infocare / Meta / GA / the database. Real data is never read in demo mode.

### B1. Demo flag detection
- Add a single source of truth: `src/demo/demo-flag.ts` exporting `isDemoRequest(request)`.
- Resolution order:
  1. `?demo=1` querystring → on for this request, and set the cookie.
  2. `?demo=0` querystring → explicitly off, clear the cookie.
  3. Cookie `mh_demo=1` → sticky until the user clicks "Exit Demo".
- The dashboard renderer receives a `demo: boolean` flag and passes it down to every data-load call site.

### B2. Demo banner + exit control
- When `demo === true`, render a persistent banner at the top of `/app` ("DEMO MODE — fixture data, no live sources") with an "Exit Demo" button that clears the cookie and redirects to `/app`.
- Style the banner so it is obvious in screen-shares (high-contrast bar across the top of the page).

### B3. Fixture data module
- Create `src/demo/fixtures/` with these files:
  - `centres.ts` — 8–12 anonymised centres ("Sunrise Early Learning", "Maple Grove", "Riverbend", etc.) with realistic but synthetic enrolment / capacity / waitlist numbers.
  - `meta-ads.ts` — a believable spread of active / learning / completed / not-delivering ads matched to fixture centres.
  - `google-analytics.ts` — fixture page-level traffic and summary cards.
  - `waitlist-report.ts` — fixture waitlist age distribution + DOB profile.
  - `index.ts` — re-exports a single `loadDemoDashboard(window, centreKey)` that returns a shape matching what the real handler currently passes into `renderAppShell`.
- Numbers should tell a clear story: at least one centre needs ads, one is over-covered, one has stale waitlist, one has high `Near 5` pressure — so the demo demonstrates each recommendation state from the README.

### B4. Branch the data layer
- In the `/app` handler (formerly `/`), before each data-load call (`readLatestAnalyticsSnapshotSet`, `readMetaAdsDashboardData`, GA reads, waitlist reads, etc.), branch on `demo`:
  - `demo === true` → pull the corresponding slice from `loadDemoDashboard(...)`.
  - `demo === false` → existing behavior, untouched.
- Do **not** restructure the real path. The cleanest pattern is a thin wrapper at the top of the handler: `const data = demo ? loadDemoDashboard(...) : await loadRealDashboard(...)` where `loadRealDashboard` is the existing inline code extracted into a function.
- Demo mode must **never** trigger refresh actions against Infocare / Meta / GA. The `/actions/refresh-*` handlers should return a no-op + flash message when called with `demo=1`.

### B5. AI Chat in demo mode
- `/api/ai/chat` must also branch on `demo`:
  - `demo === true` → build the AI context from `loadDemoDashboard`, not from the real DB. Keep the rest of the chat pipeline identical (same prompt builder, same model call).
  - This ensures the AI panel works in the demo without leaking real centre context into the prompt.

### B6. Verify
- Restart dev server.
- Visit `/` → click Demo → `/app?demo=1` renders with fixture data and demo banner.
- Click through every panel (Infocare, Waitlist, Meta, GA, AI Chat) and confirm no real centre names or numbers appear.
- Switch windows (`1W`–`12M`), sort options, and selected centre — fixtures should respond.
- Click "Exit Demo" → cookie cleared, dashboard returns to real data.
- Confirm refresh buttons in demo mode do not call external APIs (check network/logs).
- `npm test` and `npm run typecheck` pass.

---

## Phase C — Landing Page Polish (optional, do after B is working)

- Add a small "Recent activity" tile on the landing page showing last snapshot timestamps (real data, not demo).
- Reserve a `src/ui/landing-tiles/` directory pattern so future tool tiles can be dropped in without touching the main landing renderer.
- Add a favicon-sized logo block to the landing page header (the repo already has `assets/images/favico.png`).

---

## Out Of Scope

- Public hosting / deploying the demo somewhere reachable from outside this machine.
- Removing the local-host check in `src/server.ts`.
- Marketing site, contact form, pricing page.
- Authentication / multi-user — single local user.

---

## Files Touched (expected)

- `src/server.ts` — route shuffle, `/readme` route, demo flag branching, refresh-action guards.
- `src/ui/app-shell.ts` — header link back to landing, demo banner.
- `src/ui/app.css` — landing page styles (hero ASCII art, button row, tile grid) + demo banner styles + `.readme-raw` style.
- `src/ui/landing-page.ts` — **new** (ASCII art constant + button row + tile grid).
- `src/ui/readme-page.ts` — **new** (minimal wrapper that reads README.md and serves it).
- `src/demo/demo-flag.ts` — **new**.
- `src/demo/fixtures/*.ts` — **new**.
- `test/` — add a fixture-shape test, a `/?demo=1` smoke test, and a `/` + `/readme` smoke test.

---

## Acceptance

- `/` shows the landing page, designed around the README ASCII art, with three buttons: **Online Marketing**, **Demo**, **Read Me**.
- `/app` shows the real dashboard. `/app?demo=1` shows the demo dashboard with fixture data and a demo banner.
- `/readme` renders the README contents with the ASCII art intact.
- No real centre names, ad copy, GA pages, or contact emails are reachable while `demo=1` or the demo cookie is set.
- Demo mode never makes outbound requests to Infocare, Meta, or GA.
- All existing tests pass; new tests cover the demo branch and the new routes.
