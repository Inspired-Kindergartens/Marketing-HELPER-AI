# PLAN: Things To Know (marketing wiki) — rework

The wiki exists at `/wiki` (list + editor panels, CRUD, keyword retrieval into
both AI chats). This plan covers the follow-up work: AI-assigned categories and
tags, Ollama auto-start on the page, a two-panel browse UI, WYSIWYG everywhere,
and a one-off seed from `README.md`.

The previous JD plan is archived at `OLD.PLAN.JD.md`.

---

## Decisions

**Categories are app-defined, not user-defined.** A user never invents a
category. The local AI picks exactly one from a fixed list held in code
(`WIKI_CATEGORIES`). That keeps the left panel's structure stable and
predictable no matter who writes the article.

**Tags are AI-generated and free-form.** Many per article, lower-cased and
de-duplicated by the existing `normalizeWikiTags`. They drive both the AI
retrieval scoring (tag hits weight 8) and the right-hand filter panel.

So: category = one, from a closed list, for structure. Tags = many, open, for
discovery and retrieval. Both are generated for the user; both stay editable
because a local model will occasionally misfile something.

**Starting category list** (revise once README seeding shows what is actually
needed): Advertising · Enrolment · Brand & Voice · Communications ·
Job Descriptions · Analytics & Reporting · Systems & Process · General.

**Ollama auto-start is non-blocking.** `/wiki` renders immediately and warms
the model in the background; tag generation is unavailable for those few
seconds and the UI says so.

**README seeding is one-off.** It runs once, never re-syncs, so later edits are
never overwritten.

---

## Build order

### 1. AI category + tag generation

- [x] Add `src/ai/wiki-context.ts` with `WIKI_CATEGORIES` (the closed list),
      `buildWikiTaggingChatMessages(title, bodyText)`, and a
      `parseWikiTaggingResponse` that reads the model's JSON reply and falls
      back safely (category → `General`, tags → `[]`) on any parse failure.
- [x] System prompt: return **only** JSON `{"category": "...", "tags": [...]}`;
      category MUST be one of the listed values verbatim; 3–8 tags; tags are
      lower-case noun phrases; never invent facts not in the text.
- [x] Reject a category the model invents — snap it to the closest listed value
      or `General`, so a hallucinated category can never reach the database.
- [x] `generateWikiTagsForArticle(id)` in `src/storage/wiki-store.ts`: reads the
      article, flattens `contentHtml` via the existing `wikiHtmlToPlainText`,
      calls `runLocalChat`, writes back category + tags.
- [x] Route `POST /api/wiki/:id/generate-tags` returning the new values as JSON.
- [x] Auto-generate on content save when the article has no tags yet, in the
      background (do not block the save response), mirroring how a new JD kicks
      off its blurb generation.
- [x] "Regenerate tags" button in the editor, with a spinner while it runs.
- [x] Tests: prompt shape; parser accepts valid JSON; parser rejects an invented
      category; parser survives malformed/empty model output.

### 2. Ollama auto-start when visiting `/wiki`

- [x] Add `src/ai/runtime.ts`: `isAiReady()` (probe `/api/tags`) and
      `ensureAiRunning()` that spawns the Ollama server if the probe fails.
      Port the executable-discovery order from `scripts/open-marketing-helper.ps1`
      (PATH → `.local\ollama\ollama.exe` → `%LOCALAPPDATA%\Programs\Ollama`).
- [x] Guard with an in-flight promise so concurrent visits spawn at most one
      process; no-op when `AI_PROVIDER=builtin`.
- [x] Fire it (unawaited) from the `/wiki` route so the page never blocks.
- [x] `GET /api/ai/status` → `{ ready, provider, model }` for the client poll.
- [x] Status line in the wiki UI: "Starting local AI…" → "AI ready", polling
      until ready, and disable tag generation while it is not.
- [x] Reuse the same route hook on `/chat` and `/app` so every AI-dependent page
      behaves identically — this is the standard behaviour, not a wiki special.
- [x] Tests: probe/spawn logic is guarded and idempotent; builtin provider skips.

### 3. Two-panel browse UI

- [x] **Left panel** — articles grouped under category headings, matching the
      current `renderGroups`. Each row stays clickable through to the editor.
- [x] **Right panel** — tag list with per-tag counts, ordered by count then
      alphabetically. Clicking a tag filters the left list; clicking again
      clears. Use the existing `sidePanel: true` layout flag (as `/jd` Settings
      does) rather than inventing a new layout.
- [x] Filter state travels in the query string (`?tag=`), so it survives reload
      and is linkable — consistent with `?panel=` / `?jd=` elsewhere.
- [x] **Title-field search + add** — the search input sits in the panel header
      with the "New Article" button beside it, replacing today's separate create
      form and search row.
- [x] Show active filter as a removable chip; empty states for "no articles" and
      "no articles with this tag".
- [x] `listWikiTagCounts()` in the store.
- [x] Tests: grouping, tag counts, tag filtering, active-filter chip, empty
      states, search + tag combined.

### 4. WYSIWYG everywhere

- [x] Every article body is edited through the existing contenteditable toolbar
      (headings, bold, italic, lists, links) — no plain-textarea path anywhere.
- [x] Extract the editor's toolbar + normalisation script into one shared
      helper so the create flow and the edit flow use the identical component
      rather than two variants.
- [x] New articles open straight into the WYSIWYG editor after creation.
- [x] Everything stays server-sanitised on write via `sanitizeJdBlurbHtml`.
- [x] Tests: create and edit paths both emit the same toolbar markup.

### 5. Seed the wiki from README.md

- [x] `scripts/seed-wiki-from-readme.mjs`, run once, refusing to run when the
      wiki already has rows (so it cannot clobber real content).
- [x] Parse `README.md` by heading: each `##` is a section; each `###` under it
      becomes an article. A `##` with body text but no `###` children becomes an
      article in its own right.
- [x] Convert the markdown body to the sanitiser's allow-list HTML (`marked` is
      already a dependency) — headings, paragraphs, lists, bold/italic, links.
- [x] Map each README section to a starting category; let the AI assign tags per
      article afterwards in one pass.
- [x] Skip pure-navigation sections (`Running The App`, `Development Map`,
      `Environment`) that document the repo rather than marketing knowledge.
- [x] Report a summary: articles created, skipped, and any that failed tagging.
- [x] Wire into `package.json` as `seed:wiki`.
- [x] Tests: heading parser splits sections correctly; markdown → allowed HTML;
      the empty-wiki guard actually blocks a second run.

### 6. Verify

- [x] `npx tsc --noEmit` clean.
- [x] `npm test` — no new failures beyond the 5 pre-existing ones
      (analytics row clicks, email confirmation, GA month filters, print
      actions, ai chat lead).
- [x] `npm run build`, then restart the server and health-check it.
- [x] Manual: visit `/wiki` with Ollama stopped and confirm it starts on its own
      and the page never blocks.
- [x] Manual: create an article, confirm category + tags are generated, and
      confirm the tag filter narrows the left list.
- [x] Manual: ask both chats a question answerable only from a seeded README
      article and confirm the answer cites it.

---

## Notes / risks

- **Category drift.** A local model will sometimes return a category outside the
  list. The snap-to-closest-or-General step in step 1 is what keeps the left
  panel from sprouting one-off categories, so it is not optional.
- **Tagging latency.** Generation takes a few seconds on qwen3:8b. It runs in
  the background after save so typing is never blocked; the row shows
  "Tagging…" until it lands.
- **Seeding volume.** The README has ~60 headings. Tagging each one is a few
  minutes of model time — the seed script should tag sequentially with progress
  output rather than firing 60 concurrent requests at Ollama.
- **README is developer documentation.** Some sections explain the app rather
  than marketing practice. The skip-list in step 5 is a first pass; expect to
  prune more articles by hand after seeing the result.
