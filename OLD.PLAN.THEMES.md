# PLAN — Selectable UI themes

## Goal
Each user can pick the app's look from a drop-down menu: **Default** (the
original dark, green, uppercase "matrix" look), **Light** or **Dark** (both
contemporary: rounded, softer, sentence-case). Default stays the default; the
choice is remembered the next time the app is opened.

## Build order

- [x] 1. Inline styling moved to CSS
  - [x] data-driven values passed as `data-*` and read with typed `attr()`: waitlist threshold bars and GA bars (`data-percent`), Gantt bars (`data-position`), recent-demand chart height (`data-chart-rows`)
  - [x] task description/note fields and the JD blurb editor size to their content with `field-sizing: content` (the JS height-setting is gone)
  - [x] copy-to-clipboard fallbacks use a `.clipboard-buffer` class instead of `style`
  - [x] kept inline on purpose (content that leaves the app): the Postmark RSS item, the wiki's Word/Outlook clipboard HTML
- [x] 2. Classes established for alike code (`app.css` "Shared building blocks")
  - [x] surfaces: `card`, `stat-tile`, `note-box`, `panel--scroll`
  - [x] headings: `section-header`, `section-title`, `subheading`
  - [x] tables: `table-frame`, `data-table`, `data-table__numeric`
  - [x] lists, forms, buttons: `list-row`, `badge`, `field-label`, `form-control`, `button-sm|md|icon|remove|danger`
  - [x] rich text: `rich-text`, `rich-text--editable`, `format-toolbar`
  - [x] layout/text utilities for the most repeated single declarations
  - [x] theme tokens added (radius, shadow, label case, panel title, alert tones, chart colours) with Default values = the original look
- [x] 3. Classes applied to the DOM elements (and duplicated declarations removed from the component rules)
  - [x] verified by computed-style comparison of every element on 33 pages (desktop), 12 pages (700px) and 6 pages (print): Default renders the same, except the deliberate changes below
  - [x] deliberate changes: task text fields fit their content exactly (12px shorter when empty); the checklist add-row calendar button matches the row buttons (28×28); a wiki article's last paragraph has no trailing margin (as in the editors)
  - [x] tests updated to the new markup; no new failures (10 pre-existing failures unchanged; `task-store.test.ts` imports a removed `taskTimeMinutes`)
- [x] 4. Light and Dark themes designed (`src/ui/themes.css`, served at `/themes.css`, linked after `app.css` on every page)
  - [x] Light palette, Dark palette, shared contemporary shape/type
  - [x] waitlist charts read colours from the theme tokens
  - [x] landing animation blended into each theme's background
  - [x] checked on landing, dashboard (+ focus panels), comms, tasks, JD, wiki, chat, sector, snippets, readme, and at 700px
- [x] 5. Theme picker (`src/ui/theme.ts`)
  - [x] **Look** drop-down (Default / Light / Dark) at the end of the landing page footer, standard `form-control` select
  - [x] choice kept in `localStorage` (`marketing-helper-theme`); `THEME_HEAD_SCRIPT` in all 13 page heads applies it before the body is drawn, and follows changes made in other tabs
  - [x] `themechange` event; the waitlist charts destroy and redraw with the new colours
  - [x] tests (`test/theme.test.ts`): picker in the footer, head-script contract, every page head carries it, charts listen
  - [x] docs: `docs/USER-GUIDE.md` (Appearance + landing footer) and `README.md` (Choosing a theme)
  - [x] build + restart + verified in Chrome: pick, remember across pages, no flash on load, open dashboard tab follows and redraws charts, Default clears the choice
