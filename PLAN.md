# PLAN — Wiki page redesign (/wiki)

## Goal
Make the category hierarchy immediately legible, strip the row down to title
only, and fill the empty right-hand panel with the existing AI chat.

## Build order

- [x] 1. Category heading hierarchy — make headings unmistakable
  - [x] `wiki-list__group-heading`: drop muted colour + small size; use
        `--color-text-strong`, larger than body, accent rule under it
  - [x] Keep the count badge but demote it visually
- [x] 2. Strip the row down (`wiki-list-panel.ts` + CSS)
  - [x] Remove the tag badges (`wiki-list__badges` / `wiki-list__tag`) from rows
  - [x] Remove the `Updated …` meta line
  - [x] Remove the inline summary; move it to a hover popup on the row
  - [x] Delete the now-dead CSS (`__badges`, `__tag`, `__meta`, `__summary` as
        inline block) and the `formatUpdated` helper
- [x] 3. Summary hover popup
  - [x] Render summary as a `wiki-list__tip` element inside the row
  - [x] CSS-only reveal on row hover/focus-within, positioned so it never
        pushes layout; falls back gracefully when there is no summary
  - [x] Keep the "Tagging…" pending signal somewhere (row title affordance)
- [x] 4. Right-hand AI chat panel
  - [x] Add `{ id: "chat", title: "AI Chat with Beep Beep", className: "panel--chat" }`
        to `PANEL_DEFINITIONS` in `wiki-app-shell.ts` (layout already routes
        `panel--chat` to `app-shell__right`)
  - [x] Reuse the tasks/comms `chat-shell` markup + script verbatim, pointed at
        `/api/ai/chat/stream` (the endpoint already carrying wiki grounding)
  - [x] Make sure the chat panel is exempt from the article/editor
        visible-panel filter, and from the focus-panel id set
- [x] 5. Build + restart + verify
  - [x] `npm run build`
  - [x] kill :3000 so the supervisor respawns
  - [x] Load /wiki and confirm hierarchy, hover popup, chat panel
