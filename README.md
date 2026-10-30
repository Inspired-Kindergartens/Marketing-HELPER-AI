# Marketing Helper AI

```text
                                                                                                                         
                          ^.                                                   nwwmmmZZC_   :nUUYYYn !vUUYYYUJUUUYvi     
                          ;]                                                   0$$$$$$$$$U }%$$$$$$ax@$$$$$$$$$$$$$$Q.   
                           j|                                                  0$$$$$$$$$%<&$$$$$$$W%$$$$$$$$$$$$$$$$X   
                            n?                                                 0$$$$$$$$$$W$$$$$$$$$$$$$$$$$$$$$$$$$$Wl  
                            >b<                                                0$$%?  u@$$$$$Bt^^""a$$8?^^""b$$&,<#$$$\  
                            .cb_        '>vZC"',I!il:^'.                       0$$%?  ^B$$$$$ol    k$$w`    d$$&. +@$$Y  
                             :hbt{jz0##MMkbcQm###o##**a*#M&hUx<.               0$$B0cco$$@c@$@pXXXcr$$@0XXXnb$$&. ;B$$J  
                            .fM8&&&a*bQu/k*o#*&&W&WW&M&&W&WW#kddqn:            O$$$$$$$$$0.d@$$$$$8'*$$$$$$*k$$&. t$$$v  
                          !p%&*#dwwuLaW&WMW&&M8&&8888%%&zl^                    O$$$$$$$$$Q.X@$$$$$&'m@$$$$$*k$$@*#@$$@]  
                      .{Q*#booOQLa&&&8&&888&888888WJ1^                         O$$$$$$$$$@X@$$$$$$&\@$$$$$$*k$$$$$$$$b,  
                    lwho*00udW88%%%8%%%%%%%%8&#O[.                l<i"         O$$%?  .#$$$$$Bt""""o$$8]""""b$$$$$$$@}   
                   "mQrb*W88%%%BBB%%8%%%%%&q<.                   ~pB@%O>       O$$%-   Q$$$$$oI   '8$$m`    b$$$$$$#!    
                 iZa&W&&8%BBBBBBBB%8%%&w("                       +#$Mmbqj ^    O$$BX//f%$$$$$@0rrrr%$$BYrrrj#$$&:"`      
               ;wWMM&88%%B%B%%%%%88*UI                           iLwdB$@Wr]`   O$$$$$$$$$$@$$$$$$$$$$$$$$$$$$$$W.        
             .U##WW&%%%%%%%%%%%8W('                               [W@$$$@m_?   O$$$$$$$$$@_8$$$$$$$#B$$$$$$$$$$W.        
            _a**M8%%%88%%%888a\"                                  ^w@@@@8p+'   O$$$$$$$$$j -W$$$$$$k\B$$$$$$$$$W.        
           t#**M8%%8888&&&#X,                                       tOZZwL`i   ;!ii>><<!     +11))([ .-11))(){{}         
         .C###W8%8888&&Wb>                                           .[n~ ?<                                             
         cah*W8888&W&Wv"                                                ILU.   ^,,""""^'                    ..           
       .z**#W8&&W&W*\                                                 ~m#k`    0$$$$$$$$8> ,q$$$$$$wi#$$$$$$$$$$$$$dI    
       {a*MWW8W&&#1                                               .lUMM*L      0$$$$$$$$$a^h$$$$$$$w#$$$$$$$$$$$$$$$$~   
       Lb#W&&88Wr                   ';(vjn|>                   `>Jo&MM&f.      0$$$$$$$$$@w@$$$$$$$@$$$$$$$$$$$$$$$$$q^  
      ;ok*&888b!                 ljk@&Ovj}]<               ',{C#&&knoai        0$$@p00&$$$$$$@MkhhhB$$@*khhhB$$Bk*@$$B~  
      [kh#M8&q^                ^COX!                    ^~\a88&WC.n&1          0$$%?  "B$$$$$a;    M$$Z'    o$$*  X$$$f  
      \oaa#&wl<                "<"                  "[xmM&88Wv!{p&f'           0$$%?  )@$$%$$W+    p$$h,    o$$*  <@$$c  
      ]oha*a?`"[[        ";`                    .;tO#888&wj;1mJ_1              O$$$$$$$$$*~B$$$$$$#~B$$$$$$bo$$*  }$$$n  
      ^kdoop~    .`i-<nvL0cz?>.            .'`}a&8888#x',JkC'}l                O$$$$$$$$$) /@$$$$$# U@$$$$$bo$$#`IW$$@{  
       )-ca#Lt/ucrzUYULJUXzuXc|'        '(LoW&88Wv+^+Cap{+J}`                  O$$$$$$$$$&~8$$$$$$#lB$$$$$$bo$$$$$$$$*;  
       "]_v*L|XuvXvcncu()<-,      "_|Z#88&888%88cdWmLtXQJ?                     O$$@qQQO@$$@$$@Whhhwb$$@#hhhQo$$$$$$$$c   
        '|1mam".".       .'`"}Z*&888&W&8888&W&W&WWWMqo0J`                      O$$%-   0$$$$$a;   ^%$$Z'    *$$$$$$@0    
         '}*M#aqYvzUQqbh*MMMWW&W&W&&WWWWMMMWMMWhh*ppkY:                        O$$%-   k$$$$$M>   ,B$$b^    *$$%OOv!     
            <Y#WW##M*#*M#M#MM#*#WoM####WM*oaqbdphOCr`                          O$$$@@@@$$$$$$$$$$$$$$$$$$$$$$$$o         
                lnd*MMWM#WMMMMWWWMohmn~:>}()?>:'                               O$$$$$$$$$@h@$$$$$$$@@$$$$$$$$$$o         
                      .`^",""^`.                                               O$$$$$$$$$b^O@$$$$$$Ob$$$$$$$$$$o         
                                                                               Xhhhaaaahc` 'r#888%%L^YM888%%8&8k         
                                                                                                                         
```

Marketing Helper AI is a local Fastify dashboard for reading childcare centre demand, capacity, waitlist quality, Meta advertising coverage, and Google Analytics traffic in one place.

The app is designed to answer practical marketing and enrolment questions:

- Which centres have space that needs attention?
- Which centres have demand but may not need more advertising?
- Which waitlists are healthy, stale, or distorted by older children?
- Which Meta ads are active, learning, blocked, or no longer needed?
- Which website pages are getting attention from families?

The dashboard is local-only. `src/server.ts` refuses to start on a non-local host, so it is intended for internal analysis rather than public hosting.

## Main Data Sources

- **Infocare** supplies open centres, enrolled children, waiting list children, licence capacities, bookings, starting dates, leaving dates, birth dates, and waitlist application dates where available.
- **Manual capacity overrides** fill missing Infocare licence capacity values, including optional under-2 and over-2 capacity splits.
- **Meta Ads** supplies campaign/ad/ad set status, spend, results, impressions, budgets, and end dates.
- **Google Analytics** supplies site totals and page-level traffic for the selected range.
- **Ministry of Education ECE directory** (data.govt.nz) and **competitor websites** supply Sector Insight's centre list, promotions, meals and transport.

## Running The App

Install dependencies and generate the Prisma client:

```bash
npm install
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

Start the local server:

```bash
npm run dev
```

Beep Beep works out of the box with the built-in dashboard reasoning engine. To add an optional local language model runtime:

```bash
npm run ai:setup
```

Check whether the local model runtime is installed, reachable, and has the configured model:

```bash
npm run ai:doctor
```

Build and run the compiled server:

```bash
npm run build
npm start
```

Run the compiled server persistently, with automatic restart after failures:

```bash
npm run run:build
```

Start the compiled server in a background supervisor:

```bash
npm run server:background
```

By default the app runs on `http://127.0.0.1:3000`.

Useful checks:

```bash
npm test
npm run typecheck
```

## Main Pages

The landing page links to the main local tools:

- **Marketing** (`/app`) - Infocare analytics, waitlist quality, Meta Ads, Google Analytics, and the dashboard-specific AI panel.
- **Tasks** (`/tasks`) - local task and project tracking.
- **General Chat** (`/chat`) - a general-purpose local AI chat with retained conversations and groups.
- **Communications** (`/comms`) - Postmark, Mailchimp, Formstack, and communications-focused AI help.
- **Job Descriptions** (`/jd`) - AI-drafted website vacancy blurbs and PDF job descriptions per kindergarten.
- **Things To Know** (`/wiki`) - the marketing team wiki; articles are AI-categorised and ground the AI chats.
- **Code Snippets** (`/snippets`) - reusable code (tracking tags, embeds, email HTML) with one-click copy and an AI snippet helper.
- **Links** (`/subscriptions`) - categorised links, such as the services the team subscribes to and the newsletter links under the "Panui Tools" category (no AI chat). Shown as "Links"; the route, tables and code still use the original name "Subscriptions".
- **Sector Insight** (`/sector`) - competitors and other ECE services with their promotions, meals and transport, a monthly crawler, and an AI chat that answers from the exact matching rows. See [Sector Insight](#sector-insight).
- **Upload Contacts** (`/contacts/upload`) - replaces the centre contact workbook used by the dashboard's Email column. Linked from the landing page footer, alongside Infocare Login, Restart server and Back up data.
- **Infocare Login** (`/settings/infocare`) - write-only form to change `INFOCAREUSER`/`INFOCAREPASS`. See [Credentials And Secrets](#credentials-and-secrets).
- **Read Me** (`/readme`) - the plain-language user guide, rendered from `docs/USER-GUIDE.md`.

### Documentation

There are two readmes, and every change to the app should update both:

- `README.md` (this file) - the technical readme for the repository.
- `docs/USER-GUIDE.md` - the user guide shown by the landing page's **Read Me** button, in simple language with links to each page.

## Styling And Themes

All styling lives in two stylesheets, linked from every page head in this order:

- `src/ui/app.css` (`/app.css`) - the **Default** theme (the original dark, square, uppercase look) and every layout rule.
- `src/ui/themes.css` (`/themes.css`) - the **Light** and **Dark** themes. They apply only while the root element carries `data-theme="light"` or `data-theme="dark"`; with no attribute the page is the Default theme.

There is no inline styling in the markup. Values that come from data are passed as `data-*` attributes and read by CSS with typed `attr()` (Chrome/Edge 133+): `data-percent` (waitlist threshold bars, Google Analytics bars), `data-position` (Gantt bars) and `data-chart-rows` (recent-demand chart height). Task description/note fields and the JD blurb editor grow to fit their content with CSS (`field-sizing: content`), not script. Two inline styles remain on purpose, both for content that leaves the app: the Postmark RSS item (RSS readers ignore our stylesheet) and the wiki's copy-to-clipboard HTML (Word and Outlook ignore stylesheets).

`app.css` is organised as:

1. **Tokens** on `html`: colours, font sizes, and theme hooks (`--radius-*`, `--shadow-*`, `--text-transform-label`, `--color-panel-title`, warning/danger alert tones, chart colours). The Default values reproduce the original look exactly; themes change the look by overriding tokens.
2. **Base** element, panel and button rules.
3. **Shared building blocks** - classes for patterns that recur across pages, applied in the markup next to the component class:
   - surfaces: `card` (+ `card--inset`, `card--quiet`), `stat-tile`, `note-box`, `panel--scroll`
   - headings: `section-header`, `section-title`, `subheading`
   - tables: `table-frame` (+ `table-frame--scroll`), `data-table`, `data-table__numeric`
   - lists: `list-row`, `badge` (+ `badge--warning`, `badge--accent`)
   - forms: `field-label`, `form-control` (+ `form-control--sm` for the compact Tasks fields)
   - buttons (size/layout only - colour always comes from the standard button): `button-sm`, `button-md`, `button-icon`, `button-remove`, `button-danger`
   - rich text: `rich-text` (+ `rich-text--editable`), `format-toolbar`
   - utilities: `flex`, `inline-flex`, `grid`, `flex-col`, `flex-wrap`, `items-*`, `justify-*`, `gap-4`...`gap-16`, `min-w-0`, `nowrap`, `text-small`, `font-strong`, `label-case`, `text-body`/`text-strong`/`text-muted`/`text-ghost`/`text-empty`/`text-accent`
4. **Component rules** per page, holding only what is specific to each component.
5. **Shared states** last (`.button-danger:hover`), so they win over component hovers.

`themes.css` holds one token block per theme (Light, Dark) and a shared block of shape and type refinements for both (rounded corners, soft shadows, sentence-case labels, focus rings). Its selectors use `:where()` so `app.css`'s more specific rules still apply. The waitlist charts read their colours from the same tokens (`--color-chart-grid`, `--color-chart-text`, `--color-wait-*`) when they render, so they follow the active theme.

### Choosing a theme (`src/ui/theme.ts`)

- The **Look** drop-down (Default / Light / Dark) sits at the end of the landing page footer.
- The choice is stored per browser in `localStorage` under `marketing-helper-theme` (no entry = Default), so each person's computer remembers its own look.
- `THEME_HEAD_SCRIPT` sits in every page `<head>` right after the two stylesheet links. It sets `data-theme` before the body is drawn, so a page never flashes the wrong look. It also defines `window.setAppTheme(theme)` (used by the drop-down) and follows a change made in another tab through the `storage` event.
- Every change fires a `themechange` event on `document`; the waitlist charts destroy and redraw themselves on it, so an open dashboard picks up the new colours.

## Sector Insight

`/sector` (landing tile next to **Links**) holds every competitor and other early childhood service around Inspired's centres, with their promotions/incentives, meals and transport.

### Data model (`prisma/schema.prisma`)

- `SectorCentre` - one service. `eceId` is the Ministry of Education licence number (unique; null for a centre only known from the CSV). Directory fields (type, ownership, address, district, coordinates, licensed / under-2 places, roll, 20 Hours ECE) are refreshed every update; `operator`, `website`, `promotionUrl`, `meals`/`providesMeals`, `transport`/`providesTransport` (null = not known) and `notes` are editable. `isOwn` is set when the licence number equals an Inspired `CentreReference.licenseNumber`; own centres get operator "Inspired Kindergartens" and are excluded from every competitor count. `inDirectory = false` with an `eceId` means the service has dropped out of the directory (closed/relicensed).
- `SectorPromotion` - per centre, unique on `(centreId, text)`; `category` (free_period / discount / free_hours / gift / other), `origin` (csv / crawl / manual), `active`, `firstSeenAt` / `lastSeenAt` / `endedAt`.
- `SectorCrawlRun` - one update: trigger, status and counts, shown in the page's Update History.

### Sources and the update (`src/sector/sync.ts`)

1. **Ministry of Education ECE directory** (`src/sector/ece-directory.ts`) via the data.govt.nz CKAN datastore API (dataset `directory-of-educational-institutions`, the `ecedirectory` resource, refreshed daily). Scope: `Regional_Council = Bay of Plenty Region`, plus every service in the territorial authorities of Inspired centres outside it (Hauraki, Thames-Coromandel).
2. **CSV seed** (first run only, when the table is empty): the newest `docs/Bay_of_Plenty_ECE_Competitor_Promotions_*.csv`. Excel saves it as Windows-1252; `decodeCsvBytes` maps the 0x80-0x9F block itself because Node's `TextDecoder("windows-1252")` decodes it as Latin-1. The export turned macron vowels into `?`, which `namesMatch` treats as a one-letter wildcard, so rows link to their directory entry and take its correctly spelled name. "Unverified" operators are stored as `""`.
3. **Directory refresh**: updates linked services, links CSV-only rows that turn out to be a directory service (same town, loose name match), adds new services, and marks missing ones `inDirectory = false` (only when the pull returned at least 100 services). Unverified centres whose name starts with a group's shared opening ("BestStart …", "Busy Bees …"; two words, or one distinctive word) are filed under that group. Centres with no website get their group's most common website, else their email domain when it isn't a free-mail provider.
4. **Website crawl**: centres are grouped by URL (`promotionUrl`, `website`), so a group page shared by 30 centres is read once. Per site: robots.txt honoured, one request at a time with a delay, the page plus up to three same-site links about offers/fees/meals/transport. `src/sector/page-text.ts` builds a ≤7,000-character excerpt from the visible text **and** embedded JSON payloads (Nuxt `__NUXT_DATA__` devalue arrays are unflattened; BestStart renders its offers that way). An offer listing participating centres is kept only if one of ours is listed, and says which. On a group's "find a centre" page each of our centres' own lines ("Busy Bees Katikati / 20 Hours ECE / Meals provided") are kept as a window.
5. **Extraction** (`src/sector/extract.ts`): `runLocalJson` (`src/ai/client.ts`) calls Ollama with a JSON schema, `think: false`, temperature 0. The reply is then checked: every number and most words of an offer must be on the page (`isSupportedByPage`), ended/past offers and the plain government 20 Hours ECE are dropped, hedged statements ("some centres provide meals") are ignored, and on a centre list meals/transport only apply to a centre whose own window mentions them.
6. **Applying it**: a found offer matches an existing one by token overlap with equal numbers (`promotionSimilarity`), refreshing `lastSeenAt`; otherwise it is added. An offer from this site that wasn't found again is ended, unless its wording is still on the page. Manual offers are never ended. A "yes" for meals/transport always wins; a "no" only fills an unknown. When the local AI is off or fails for a site, that site is left unchanged.

The server checks daily (first check 2 minutes after startup) and runs when the last **complete** run is over 30 days old (`sync-cursor` key `sector:completed-at`) or there is no data. **Update now** (`POST /api/sector/sync`) starts one in the background; the page polls `GET /api/sector/sync/status`. A run left "running" by a restart is marked failed at startup and re-run by the next check. The first run read ~180 sites at roughly 25 seconds each on the 4 GB GPU, since most of the 8B model runs on the CPU.

### Chat (`src/ai/sector-context.ts`, `src/sector/query.ts`)

The local model has a 4,096-token window, far too small for ~400 centres, so the app decides which centres answer a question and the model only words the reply. `parseSectorQuestion` turns the question into filters: named centres, operators (by alias, e.g. "BestStart", "Learning Adventures"), places (town, suburb or district, so "Tauranga" covers Pāpāmoa and the Mount), service types ("free kindergarten" is a type, never an offer), meals / transport (with negation), promotions and their categories ("offer" as a verb is not a promotion), under-2s, Inspired-only or include. Own and closed centres are excluded unless asked for. The page table lists competitors only (own and closed rows are not rendered) and starts filtered to centres running a promotion. A follow-up ("which of those…") is read together with the previous question; on a centre's page, "it"/"this centre" questions are about that centre.

`POST /api/sector/ai/chat/stream` sends a `results` SSE event first (the exact matching rows, up to 200, listed under the reply with links), then the model's summary grounded on a sector overview plus the matching rows (≤6,000 characters; full records when 1-3 match). Without the model, the reply is a deterministic sentence and the list still shows.

### Other routes

`GET /sector[?centre=id]`, `POST /api/sector/centres/:id` (edit), `POST /api/sector/centres/:id/promotions` (add), `POST /api/sector/promotions/:id/end|delete` (both return the refreshed promotions table HTML, swapped in place), `GET /api/sector/export.csv` (UTF-8 with BOM; the spreadsheet's columns first, then directory fields).

## Tasks & Projects

`/tasks` is a local task and project tracker, independent of the Infocare/Meta/GA dashboard.

### Tasks

Each task has a title/description, a **status** (`To do` / `In progress` / `Completed`, stored as `todo` / `in_progress` / `done`), an optional due date, an optional checklist, and time tracking. The Task Board shows one column per status with the newest task at the top of each column (`listTasks` orders by `createdAt desc`):

- **Estimated minutes** - a manual estimate.
- **Logged minutes** - the running total, built from manual time entries plus stopped timer sessions.
- **Timer** - starting a timer stamps `timerStartedAt`; stopping it folds the elapsed minutes into the logged total and records a `TimeEntry` row. Reading a task's logged time while a timer is running includes the live elapsed minutes without writing anything.

Checklist items are reordered by dragging the grip at the left of a row; the new order is posted to `POST /api/tasks/:id/checklist/reorder` as a list of item ids and saved to `ChecklistItem.position`. Ticking, adding, editing and deleting checklist items also save without a page reload: the page re-fetches itself and swaps in only the checklist rows, its done count and the board card's badges, so the Task Detail panel keeps its scroll position.

The Projects and Members panels render only on the board view (`/tasks`); with a task selected (`/tasks?task=<id>`) the shell leaves them out, since the page is about that one task.

Moving a task's status to `Done` stamps `completedAt`; moving it back out of `Done` clears it.

A task can optionally carry a project/group, a centre, and an assignee (from the Members directory). It can also hold file attachments and a draft email (subject/body/recipient) that hands off to the user's mail client via a `mailto:` link — Postmark/Mailchimp are not involved, this is a local compose convenience only.

### Reminders

The landing page shows a reminders strip for tasks that are **overdue** or **due soon** (not-done tasks with a due date, partitioned by whether the due date has already passed). The section is hidden entirely when there is nothing due. Each reminder links straight to that task's detail panel.

### Projects

A project consolidates tasks into named **groups**, tracks a member roster drawn from the **Members** directory, and renders a **timeline**: each scheduled task becomes a horizontal bar positioned by due date across the project's date range, grouped by task group. Tasks without a due date fall into an "Unscheduled" lane. If a project has no usable dates yet, the timeline falls back to a simple status breakdown (todo/in progress/done counts).

### Members

A simple directory of people who can be assigned to tasks and added to projects (name, optional email/role, active/inactive).

## Job Descriptions

`/jd` creates and maintains kindergarten-specific Job Descriptions (JDs). Each JD produces two outputs: an AI-drafted website vacancy blurb and a downloadable PDF matching the current template.

### Job Title, Location, and field-driving rules

Creating a JD starts with two dropdowns:

- **Job Title** - `Teacher`, `Head Teacher`, `Administrator`, or `Part-time Teacher` (in that order). The title selects a `JdTitleProfile`, which supplies the Job Category, qualifications text, Role & Responsibilities sections, default Position Type, and which **PDF layout variant** to use:
  - *Standard* (Teacher, Head Teacher, Part-time Teacher) - the full field table (Job Title / Job Category / Location / Collective Agreement / Position Type / Date advertised / Level-Salary Range / Closing Date / Senior Teacher / Start Date).
  - *Administrator* - a shorter field table (Job Title / Job Category / Location / Position Hours), no pay scale, and Core duties / Other duties / Required Skills / Reports To sections.
- **Location** - any open, non-ignored kindergarten (`JdCentreProfile`, extending `CentreReference`). Location supplies the intro paragraph (operating hours, max roll), Senior Teacher name/acronym, and the Reviewed By acronym.

Selecting both composes a new `JobDescription` by copying every field from the title/centre profiles at that moment - editing the JD afterwards never touches the shared profiles, and re-generating the profiles later doesn't retroactively change existing JDs.

In the JD Editor, changing **Position Type** rewrites any `full time` / `part time` (space, hyphen or joined; casing kept) in the intro paragraph to match, client-side in `syncIntroPositionType` (`src/ui/jd-app-shell.ts`), before the change autosaves the form.

### Job Positions folder and Settings layout

The Job Descriptions panel header and the website blurb panel header (`/jd?panel=jd-blurb&jd=…`) both have a **Job Positions** button (shared markup in `renderPanelActions` in `src/ui/jd-app-shell.ts`, same delegated click handler). Browsers will not follow `file://` links from an `http://` page, so the button POSTs to `/api/jd/open-folder`, and the server (which runs on this PC) runs `explorer.exe <folder>`. The route only opens the stored setting and never a path from the request, and it returns 404 with a message if the folder is missing. The folder is `JdGlobalSetting.jobPositionsFolder`, edited under **Settings > Folder shortcuts**. When blank it falls back to `DEFAULT_JOB_POSITIONS_FOLDER` (`D:\Apps\Inspired Kindergartens\IK Data - Documents\Communications\Job Positions`) in `src/storage/jd-store.ts`. `/api/jd/settings/global` (GET/POST) does a partial update: each field is changed only if it is sent.

The Settings panel is one exclusive `<details name="jd-settings-sections">` accordion, using the same `wiki-list__group--collapsible` markup as the Links page. Settings forms save in place with `postSilent` and show a "Saved." line instead of reloading, so the open section stays open. **Add job type** still reloads, because it adds a row.

### Pay scales (KTCA)

Salary ranges are computed from `JdPayScale` rows (K1 stepped scale, K2/K2R flat rates), each with an `effectiveFrom` date. `formatSalaryRange` picks the latest rate not after the JD's advertised date, so ranges roll forward automatically as new KTCA rate steps take effect (e.g. the 28 Jan 2027 step). Part-time positions pro-rate the range by FTE.

On every server start, the app logs the currently-effective KTCA agreement and warns (in the log and via a landing-page reminder) when the imported `JdAgreement.expiresOn` is past or within 90 days - a prompt to import the next collective agreement. The **Import new KTCA** control in JD Settings accepts a new agreement PDF; full AI-assisted rate-table extraction is not yet implemented, so pay-scale rows are reviewed and entered manually after upload.

### Website blurb

The **Website Blurb** panel is a custom `contenteditable` WYSIWYG editor (headings, bold/italic, bullet lists, links - no external rich-text dependency). **Generate with AI** calls the local model with context built from: the IK generic base text, the centre's current and old website blurbs (seeded from the supplied blurb PDFs), and the centre's previously saved blurbs - so new drafts stay in that centre's established voice rather than reinventing it.

Only the *variable, editorial* section is AI-generated. A fixed, non-editable **boilerplate** block is appended verbatim below the editor and is never sent through the AI, so the model cannot paraphrase or drop it. It contains, in order: the italic KTCA terms sentence (which also states the New Zealand work-eligibility requirement - "By applying for this role you acknowledge that you are eligible to work in New Zealand. If you are not eligible to work in New Zealand then do not apply."), the JD title as plain text (not linked), the **Please apply online here** link, Start Date, Closing Date, and the "Be at the cutting edge" tagline. **Copy to clipboard** copies both the editorial section and the boilerplate together, as both HTML and plain text.

The apply link (`buildJdApplicationFormUrl` in `src/ai/jd-context.ts`) points at Formstack. Teaching roles (job title contains "Teacher") use `job_application_form_2026` prefilled with the centre (minus "Kindergarten") and role (minus any Full/Part-time prefix), e.g. `https://inspiredkindergartens.formstack.com/forms/job_application_form_2026?service_location=Gwen%20Rogers&role=Teacher`. Every other role uses the generic `https://inspiredkindergartens.formstack.com/forms/job_application_form_copy`.

Every save (AI-generated or hand-edited) appends a new `JdBlurb` history row rather than overwriting - all prior versions stay available to restore and double as future AI reference material for that centre.

### Publishing to the website and Ed Gazette

Advertising a vacancy involves three pieces that must agree with each other: the **page title** you give the website, the **page URL** the website generates from that title, and the **link you send to Ed Gazette**. The app derives all three from the same job description so they cannot drift apart.

**Copy Website Page Name** (Website Blurb panel toolbar) copies the exact title to paste into the website when creating the vacancy page, for example:

```
Full-time Teacher / Kaiako Position - Gwen Rogers Kindergarten August 2026
```

The title is assembled from the JD, not typed by hand:

- **Position type** comes from the JD's Position Type field and is stated once, at the front. `Full Time` is written as `Full-time`. If the job title already carries its own prefix (the `Part-time Teacher` title profile), it is not repeated.
- **Role** is the job title, paired with `/ Kaiako` for teaching roles only - `Administrator` is never paired with it, since *kaiako* means teacher.
- **Location** is title-cased, and a duplicated trailing "Kindergarten" is collapsed, so a stored `GWEN ROGERS  KINDERGARTEN Kindergarten` reads `Gwen Rogers Kindergarten`.
- **Month and year** come from the JD's **Date Advertised**.

The month and year exist to keep each posting unique. The website builds a vacancy page's URL automatically from its title, so re-advertising the same role at the same centre in a later month produces a distinct page instead of colliding with the previous one.

**Generate Email** (JD Editor panel) opens a pre-filled mail draft to `office@ikindergartens.nz` announcing that the vacancy is live, containing the link to send on to Ed Gazette (shown wrapped here for readability - it is a single unbroken URL in the email):

```
https://inspiredkindergartens.nz/employment-and-careers/vacancies/full-time-teacher-kaiako-position-gwen-rogers-kindergarten-august-2026?utm_source=education_gazette&utm_medium=referral&utm_campaign=gwen_rogers_teacher_2026
```

That link *is* the live vacancy page URL, so its path is the slugified page title above - the same string **Copy Website Page Name** gives you. The `utm_` parameters tag arriving traffic as an Ed Gazette referral so those visits are attributable in Google Analytics; the campaign tag combines centre, role, and the Date Advertised year.

**Two things to watch:**

- The link only resolves once the vacancy page actually exists on the website, and only if the page was created with the copied title unchanged. Editing the title on the website changes the URL the site generates and breaks the emailed link. Publish the page first, then send the email.
- Changing a JD's **Date Advertised**, **Position Type**, **Job Title**, or **Location** changes the title, and therefore the URL. If the page is already published, update it on the website too, or any link already sent out will 404.

### PDF

**Download PDF** (`GET /api/jd/:id/pdf`) renders the JD with `pdfmake`, matching the layout of the existing PD PDFs: the Inspired Kindergartens logo, the bordered field table, the "Applications only accepted by" band with qualifications alongside, the Role & Responsibilities sections, and a footer review table (Reviewed By / Approved By / Last Updated By). The filename follows the existing convention, hyphen-separated and ending in a timestamp so each regeneration is distinct: `PD-<Job-Title>-<LOCATION>-<Month>-<Day>-<Year>-<YYYYMMDD-HHMMSS>.pdf` (e.g. `PD-Teacher-GWEN-ROGERS-KINDERGARTEN-August-27-2026-20260827-235731.pdf`). The location keeps its stored upper-case form here, because this is the published asset filename on the website - only on-screen and in-document text is title-cased. Because this app is local-only and Windows-only, the PDF fonts are read straight from the OS Arial install (`C:\Windows\Fonts`) rather than bundling font files into the repo.

### Settings

JD Settings maintains the shared profiles editors draw from: per-centre intro paragraph and Senior Teacher name/acronym, per-title qualifications text, the blurb knowledge base (generic IK text plus per-centre current/old website blurbs), and the KTCA pay-scale/agreement status.

## Backup And Moving To Another Machine

All persistent state lives in **one PostgreSQL database** (`DATABASE_URL`; the `SHADOW_DATABASE_URL` database is Prisma's throwaway migration scratch DB and holds nothing) plus a handful of git-ignored files. **Back up data** in the landing footer opens `/backup` (`src/ui/backup-page.ts`), which asks for a passphrase (minimum 12 characters, typed twice). `POST /actions/backup { passphrase }` (`src/backup.ts`) bundles everything into `backups/marketing-helper-backup-YYYYMMDD-HHMM.mhbak` on disk and returns only the saved path. The file is **never served over HTTP** (see [Credentials And Secrets](#credentials-and-secrets)); copy it from the `backups` folder.

The `.mhbak` file is a zip encrypted with **AES-256-GCM** under a key derived from the passphrase with **scrypt** (N=2^16, r=8, p=1). Layout: `MHBAK1` | salt(16) | iv(12) | ciphertext | tag(16). Nothing inside is readable without the passphrase, a wrong passphrase or any tampering fails the GCM check, and **a lost passphrase cannot be recovered**. Keep it in the organisation's password manager. The zip inside contains:

- `database.dump` - `pg_dump --format=custom --no-owner --no-privileges` of the whole database (all tables, including help-KB embeddings and Sector Insight data).
- `files/` - `.env` **with credentials decrypted** (the at-rest DPAPI seal only works on this computer, so the backup carries plain values under the passphrase and the restore re-seals them), `OAuth.json`, the Google service-account JSON, `centre-contact-list.xlsx`, `uploads/` (task attachments), `INFOCARE/`, `META/`, `logs/` (landing-feed snapshots, Infocare audit log).
- `MANIFEST.json` - timestamp and the file list.

Not included (rebuilt or re-downloaded): `node_modules`, `dist`, `generated/prisma` (`npm run build`), and the Ollama models in `.local/` (~6.6 GB, `npm run ai:setup`). Everything else is in git.

`npm run backup` (`scripts/backup.ts`) makes the identical file from the command line, which works while the server is stopped (use this at cutover). It asks for the passphrase without echoing it, or reads `MH_BACKUP_PASSPHRASE` for unattended use.

`pg_dump` is found via `PG_BIN`, then the newest `C:\Program Files\PostgreSQL\<ver>\bin`, then `PATH`. The inner zip is written with Windows' bundled `tar.exe -a` to a staging file that is deleted once the encrypted copy exists.

To restore on a new machine:

1. Install PostgreSQL (same or newer major version, currently 18), Node.js, and Git; clone the repo; `npm install`.
2. With the app stopped, run `powershell -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -Backup C:\path\to\marketing-helper-backup-....mhbak`. It:
   1. Asks for the passphrase (hidden) and decrypts with `scripts/backup-decrypt.ts`. The passphrase reaches the decryptor only through its environment, never the command line.
   2. Copies `files/` back into the project, saving any existing `.env` as `.env.before-restore`.
   3. Creates the role and database named in the restored `DATABASE_URL` if missing. It prompts for the `postgres` superuser password; override the superuser with `-PostgresSuperuser`.
   4. Runs `pg_restore --clean --if-exists --no-owner` as the app's own login.
   5. Runs `scripts/seal-secrets.ts` to encrypt the credentials for the new computer.
3. `npm run build`, `npm run ai:setup`, then `npm run transfer:check`, then start with `scripts\open-marketing-helper.ps1` (and `npm run server:install` for the persistent scheduled task).

Verified 2026-10-30: a backup restored into a scratch database reproduced all 57 tables and 110,262 rows exactly. An encrypted backup made through the app decrypted with the right passphrase, failed with a wrong one, and contained no plain text. The full `restore-backup.ps1` run has not yet been exercised on a second computer.

### Transferring to a new machine

The full step-by-step checklist (account ownership checks, cutover order, post-move verification, retiring the old machine) is **[docs/TRANSFER-PLAN.md](docs/TRANSFER-PLAN.md)**.

How settings and credentials move:

- **All settings live in `.env`** (git-ignored), loaded by `dotenv` with `override: true`. `.env.example` is the complete, commented list of every key the app reads; the authoritative list with the purpose and source of each key is `SETTINGS` in `scripts/transfer-check.ts`. Keep the two in step when adding a setting.
- **On a transfer, `.env` travels inside the passphrase-encrypted backup**, alongside the Google OAuth client file. None of the credentials are tied to this machine at the service end, so the integrations keep working from the new one without being re-issued:
  - **Infocare** - username/password API login. Not known to be IP-restricted; `transfer:check` proves it from the new machine.
  - **Google Analytics** - installed-app OAuth client (`OAuth.json`) + refresh token (encrypted `GOOGLE_ANALYTICS_REFRESH_TOKEN`). Portable; if it ever stops working, `npm run google:oauth` issues a new token. It writes `google-oauth-token.json`, which the next app start moves into `.env` (encrypted) and deletes.
  - **Meta** - System User access token (non-expiring).
  - **Postmark** - Postmark posts webhooks to the **Cloudflare Worker**, not to this machine (the app listens on `127.0.0.1` only), so no Postmark/Blacksheep change is needed. Events sent while the app is down queue in the Worker; the pull cursor lives in the database (`SyncCursor`), so the restored app resumes exactly where the old one stopped.
  - **Cloudflare, Mailchimp, Formstack** - static tokens; portable.
- **Machine-bound pieces** are re-created rather than copied: Ollama + models (`npm run ai:setup`), the `Marketing Helper AI Server` scheduled task (`npm run server:install`), the desktop shortcut, and GitHub push access (per-repo SSH deploy key via local `core.sshCommand`; the new machine needs its own key).
- **Do not run two copies.** Both would pull the Cloudflare buffer and write to separate databases. Stop and disable the old scheduled task at cutover.

`npm run transfer:check` (`scripts/transfer-check.ts`) is the readiness gate. It:

1. Lists every setting as OK / MISSING (required) / not set (optional) **without printing values**, with where to obtain each missing one. This doubles as the requirements-gathering list if `.env` has to be rebuilt from scratch.
2. Checks the git-ignored files, Node, `pg_dump`, the built `dist/`, the scheduled task, the database connection and that every Prisma migration is applied.
3. Makes one small read-only call per service: Infocare `get_centre_list`, Ollama models present, a one-day GA report, Meta `debug_token` (validity and days to expiry), the Cloudflare Worker with the sync token, Postmark (if a server token is set), Mailchimp `/ping`, Formstack `/forms`, and `git ls-remote origin`. `--offline` skips this step.

It exits non-zero if anything required fails. It also fails if any file under `src/`, `test/`, `scripts/` or `prisma/` is hidden by `.gitignore`. Root-level ignore rules must be anchored with `/`, because `core.ignorecase` on Windows made the old unanchored `INFOCARE-*`/`META-*` rules silently exclude `src/ai/infocare-live.ts` and the `src/storage/meta-*.ts` stores from git until 2026-10-30.

## Credentials And Secrets

Rules: credential values never reach the browser and never reach the AI.

- **Infocare login is write-only from the UI.** `GET /settings/infocare` (`src/ui/infocare-login-page.ts`) renders only "Set / Not set" and the last-changed time (`INFOCARE_LOGIN_UPDATED_AT`), with empty, non-prefilled inputs. `POST /api/settings/infocare` takes `{ username, password }` and:
  1. Checks each value can be stored in `.env` and read back identically (`formatDotenvLine` picks a quote character the value doesn't contain and round-trips it through `dotenv.parse`).
  2. Tests the candidate login with a read-only `get_centre_list` call through `createInfocareClient({ env })`. If Infocare rejects it, nothing is written, and the response is a fixed message: Infocare's own error text is never relayed, because it could echo the submitted details.
  3. Writes both keys with `setDotenvValues` (BOM-safe, so line 1 is replaced rather than duplicated) and updates `process.env`. Infocare clients read `process.env` per request, so the change is live without a restart.
  4. Appends `{ event: "infocare_login_change", outcome }` (no values) to `logs/infocare-audit.log`. Responses carry only `ok`/`error`.
- **Backups are passphrase-encrypted and disk-only.** See above; `/actions/backup` returns the saved path, never the file, and its error response is generic (details go to the server log).
- **The AI has no route to the environment.** Nothing under `src/ai/` reads `process.env` (except `LOCALAPPDATA` to locate Ollama), the `.env` file, or names any credential key; the help knowledge base indexes only `knowledge/`, `docs/metric-contracts.md` and one `INFOCARE/` notes file. Infocare live chat calls run server-side through the client, and the model only ever sees returned data. `test/secrets-isolation.test.ts` enforces all of this and that the Infocare page never contains the current login.
- **At rest, credentials in `.env` are encrypted with Windows DPAPI** (`src/secrets.ts`). The keys in `SECRET_KEYS` (Infocare user and password, Meta token, Google refresh token, Postmark tokens, Cloudflare sync token, Mailchimp key, Formstack token) are stored as `dpapi:<base64>` and only decrypt **on this computer**.
  - **Scope is LocalMachine, not CurrentUser.** The app runs under the work (Azure AD) sign-in while admin terminals use a local account, and per-user sealing locked the server out of its own settings. Any account on this computer that can read the folder can decrypt; a copy of `.env` on any other computer cannot.
  - **`src/load-env.ts` must be the first import** of anything that reads the environment (it is in `server.ts`, `db.ts` and the scripts). On every start it:
    1. Seals any credential typed in as plain text, and moves a fresh `google-oauth-token.json` into `.env`, deleting the file only after the sealed copy is proven to decrypt.
    2. Loads `.env`.
    3. Decrypts the sealed values into `process.env` for that process only.
    4. Re-seals at machine scope any value still sealed per-user. A DPAPI blob's `dwFlags` at byte 40 carries `CRYPTPROTECT_LOCAL_MACHINE`.
  - **`setDotenvValues` (`src/env-file.ts`) always seals `SECRET_KEYS`**, so the Infocare Login page saves an encrypted login. `npm run secrets:seal` seals by hand; `transfer:check` reports each credential as encrypted, plain text, or per-user.
  - The DPAPI call is one `powershell.exe` per batch, with values passed over stdin/stdout, never the command line.
  - **Not encrypted:** `DATABASE_URL` (Prisma CLI and the pg tools read it directly; the database only listens on localhost), `OAuth.json` (an installed-app client secret, which Google does not treat as confidential), and the Google service-account JSON (not used by the app at runtime).
  - **Not protected against** software already running on this computer with access to the folder, since the app itself must decrypt. **BitLocker** protects the stolen-disk case for everything including the database; `transfer:check` warns when it is off.
- `test/secrets-encryption.test.ts` covers backup round-trip, wrong passphrase and tampering, machine-scope sealing, BOM-safe writes, and awkward password characters.

## Environment

The app reads `.env` through `dotenv`. Required core values are:

- `DATABASE_URL` - PostgreSQL connection string.
- `INFOCAREUSER` and `INFOCAREPASS` - Infocare credentials.
- `INFOCARE_BASE_URL` - Infocare API URL, with a default in the server config.

Optional integrations:

- `META_USER_ID`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`. Generate the token via Graph API Explorer (`developers.facebook.com/tools/explorer`, scopes `ads_read` and `business_management`), then extend it to 60 days in the Access Token Debugger.
- `GOOGLE_ANALYTICS_PROPERTY_ID`.
- `GOOGLE_ANALYTICS_OAUTH_PATH`, `GOOGLE_ANALYTICS_TOKEN_PATH`, or `GOOGLE_ANALYTICS_REFRESH_TOKEN`.
- `POSTMARK_SERVER_TOKEN`, `POSTMARK_WEBHOOK_BASIC_AUTH` - Postmark email send token and the basic-auth password Postmark presents to the live webhook endpoint. The webhook itself is configured in Postmark by the web host (Blacksheep), not by us — see [Postmark Webhook Alerts](#postmark-webhook-alerts-amber--red).
- `CLOUDFLARE_SYNC_URL`, `CLOUDFLARE_SYNC_TOKEN` - Cloudflare Worker that buffers Postmark webhook events while the app is offline, and the `X-Sync-Token` used to read from it. See [Postmark Event Sync](#postmark-event-sync).

## Postmark Event Sync

Postmark delivery, open, click, and bounce events are captured two ways:

- **Live webhook** - Postmark posts events to `/webhooks/postmark/events` whenever the app is running and reachable. These are authenticated by basic auth (`POSTMARK_WEBHOOK_BASIC_AUTH`) and a source-IP allowlist, then stored in the `PostmarkMessageEvent` table.
- **Cloudflare Worker buffer** - a Cloudflare Worker receives the same webhooks and stores them in its own database continuously, including while this app is turned off. This guarantees no events are lost during downtime.

On `/comms`, Recent messages shows each message's **Sent** date (its Delivery event, `sentAt`) and **Read** date (its first Open event, `openedAt`) as separate date-only columns. Last Sent in Email Count by Service also uses Delivery events, so the two tables agree. `latestOccurredAt` (latest event of any type) is still used for AI context and the RSS feed, not for display.

When the app starts, and then **once every hour** while it runs, it pulls any new events from the Worker and ingests them into the local database. The flow is:

1. Read the persisted cursor (`SyncCursor` table, key `postmark:cloudflare`) holding the highest Worker event id already ingested.
2. `GET {CLOUDFLARE_SYNC_URL}/api/postmark/events?after_id={lastSeenId}` with header `X-Sync-Token: {CLOUDFLARE_SYNC_TOKEN}`.
3. For each returned row, parse its `payload` (the raw Postmark webhook body) and ingest it through the same path the live webhook uses, so centre matching and de-duplication behave identically.
4. Advance the cursor to the highest id seen.

The sync is safe to run repeatedly: ingestion de-duplicates against the existing `PostmarkMessageEvent` rows, and the cursor only moves forward, so an overlapping pull stores nothing twice. A failed pull is logged and retried on the next hourly tick; the cursor means nothing is missed in the meantime. If `CLOUDFLARE_SYNC_URL` or `CLOUDFLARE_SYNC_TOKEN` is unset, the loop logs a warning and stays idle.

A one-off CSV export from Postmark can also be imported via `importPostmarkActivityCsv` in `src/postmark/csv-import.ts`, which writes through the same de-duplicated storage path.

## Postmark Webhook Alerts (amber / red)

The landing page shows a banner at the top when Postmark webhook events stop arriving:

| Alert | Trigger | Meaning |
| --- | --- | --- |
| **Amber** — "Postmark webhooks look quiet" | No event received for **3+ days** | Possibly just a quiet period with no email sent. Worth checking. |
| **Red** — "Postmark webhooks have stopped" | No event received for **7+ days**, or none ever received | Something is almost certainly broken. Act on it. |

No banner appears while events are current. The banner links to the Webmail panel at `/comms?panel=postmark`.

Thresholds are `POSTMARK_ALERT_AMBER_DAYS` / `POSTMARK_ALERT_RED_DAYS` in `src/ui/landing-page.ts`; the level is derived in `getPostmarkAlert()` in `src/server.ts` from the `latestReceivedAt` of `readPostmarkWebhookCheck()`.

**Why this matters:** there is no Postmark server token for this deployment, so webhooks are the *only* source of email event data, and **Postmark does not backfill** — events missed while the webhook is misconfigured are lost permanently (only a manual CSV export can recover them). A red alert is genuinely urgent.

### Access constraint — Postmark changes go through Blacksheep

**We do not have permission to edit the webhook in Postmark ourselves.** The Postmark account is administered by the web host, **Blacksheep**. Any change to the webhook URL, the events subscribed, or the stream it is attached to must be requested from them.

Everything on the Cloudflare side (tunnel, DNS, Worker) is ours and can be changed without them.

### Diagnosing a red alert

Work through these in order — most are ours to fix, and only the last needs Blacksheep.

**1. Is the app actually running and reachable?**

```powershell
Get-Service Cloudflared              # expect Status = Running
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing   # expect HTTP 200
```

If the service is stopped: `Start-Service Cloudflared`. The tunnel ("Beep Beep", id `37b734c8-4768-480f-a043-b9c978953b0d`, `cloudflared` 2026.5.0) is installed as a Windows service, auto-starts on boot, and is outbound-only — no inbound firewall rule is involved.

**2. Is the public endpoint answering through the tunnel?**

```bash
curl -i https://webhooks.inspiredkindergartens.net/webhooks/postmark/events
```

Expected results, from outside the network:

- **401** with no credentials — correct, the endpoint is alive and auth is enforced.
- **403** with correct credentials but from a non-Postmark IP — also correct; the source-IP allowlist is doing its job.
- **Connection failure / 502 / 530** — the tunnel or DNS is broken. This is ours to fix in the Cloudflare dashboard: check the tunnel is healthy and the public hostname still maps to `http://127.0.0.1:3000`.

**3. Has the Cloudflare Worker buffer also gone quiet?**

```bash
curl -H "X-Sync-Token: $CLOUDFLARE_SYNC_TOKEN" \
  "$CLOUDFLARE_SYNC_URL/api/postmark/events?after_id=0" | head
```

This distinguishes the two failure modes, because the Worker receives the same webhooks independently of this app:

- **Worker has recent events, local database does not** — the tunnel/live webhook is fine and the *hourly sync* is failing. Check the app log for "Cloudflare Postmark sync failed" and confirm `CLOUDFLARE_SYNC_URL` / `CLOUDFLARE_SYNC_TOKEN` in `.env`. No Blacksheep involvement; the buffered events will ingest once the sync works, and nothing is lost.
- **Worker is empty too** — Postmark has stopped sending altogether. Continue to step 4.

**4. Confirm email was actually sent.** If no transactional email went out in the alert window, there is nothing wrong — the alert is doing its job on a genuinely quiet period. Verify before escalating.

**5. Escalate to Blacksheep.** If the endpoint answers correctly, the Worker is empty, and mail *was* sent, the webhook configuration in Postmark has been changed, disabled, or moved to another stream.

### What to ask Blacksheep for

Give them all of this — it is what they need to restore the webhook without a follow-up round trip:

> On the **Inspired Kindergartens** Postmark server, under the **Default Transactional Stream** (`outbound`), please confirm/restore the webhook:
>
> **URL:** `https://webhooks:<POSTMARK_WEBHOOK_BASIC_AUTH>@webhooks.inspiredkindergartens.net/webhooks/postmark/events`
>
> **Events to tick:** Delivery, Bounce, Open, Click
> (Spam Complaint and Subscription Change are also supported if suppression visibility is wanted.)

**Send the password out-of-band** — it is the `POSTMARK_WEBHOOK_BASIC_AUTH` value in `.env`. Never paste it into a ticket, PR, or email thread alongside the URL.

Ask them to confirm which stream the webhook ended up on. A webhook saved against the wrong stream looks correctly configured in Postmark but sends nothing for transactional mail — a silent failure this alert would keep flagging.

### After it is fixed

1. Trigger one real transactional email.
2. Watch for the event to arrive — either wait for the hourly sync or restart the app to force an immediate pull.
3. The landing-page banner clears on its own once an event lands (it is computed per page load, so just refresh).
4. Any events missed while the webhook was down are **not** recoverable through the Worker if Postmark never sent them. Request a CSV activity export from Blacksheep and import it via `importPostmarkActivityCsv` in `src/postmark/csv-import.ts`.

If the source-IP allowlist is the problem (a 403 in the logs for genuine Postmark traffic), Postmark's sending IPs are hardcoded in `POSTMARK_WEBHOOK_IPS` in `src/postmark/webhook.ts` — currently `3.134.147.250`, `50.31.156.6`, `50.31.156.77`, `18.217.206.57`. If Postmark adds an IP, that set needs updating.

## Dashboard Panels

The app is split into five panels:

- **Infocare Analytics** - the main centre-by-centre operational table.
- **Waitlist Quality** - waitlist age, staleness, and age-profile checks.
- **META Ads** - active and recent advertising coverage, delivery state, spend, and recommendations.
- **Google Analytics** - website traffic totals and page-level interest.
- **Notes** - notes kept against Meta recommendations.
- **AI Chat** - selected-centre guidance and follow-up questions grounded in the current dashboard context and the help knowledge base.

## Infocare Analytics

This is the primary table. Each row is one centre. The default sort is the app's urgency ranking, with the highest-priority centres first. You can also sort the service name A-Z or Z-A.

The window buttons (`1W`, `2W`, `3W`, `1M`, `2M`, `3M`, `6M`, `12M`) change the time horizon used for forward-looking counts such as children leaving and children turning five. The default is `3M`.

### Service

The centre name from Infocare. Clicking a row selects that centre and updates the AI summary panel.

### ENROL/MAX

Format:

```text
enrolled children / licensed capacity utilisation%
```

Example:

```text
42/50 84%
```

The first number is **enrolled headcount**, not FTE. It is the number of currently enrolled children returned by Infocare.

The second number is the centre's **licensed maximum child capacity**. The app uses Infocare licence `max_children` when available. If Infocare does not provide a usable capacity, the app can use the manual capacity table.

The percentage after `ENROL/MAX` is **booked daily utilisation**, not enrolled FTE. It is calculated as:

```text
average booked children per day / licensed capacity
```

`average booked children per day` is built from booking records. If 45 child-days are booked across 5 distinct booking dates, the average booked children per day is `9`.

Interpretation:

- `42/50 84%` means 42 enrolled children, 50 licensed places, and average booked daily attendance equal to about 84% of licensed capacity.
- The percentage can differ from `42 / 50` because enrolled children may attend different day patterns.
- This percentage is **not FTE**. FTE is calculated separately as weekly booked minutes divided by a 50-hour full-time week.
- A centre can look full by headcount while still having usable gaps on specific days, or look below max by headcount while booked utilisation is high.

### EST

Estimated open places based on bookings, not just enrolled headcount.

Calculation:

```text
licensed capacity - average booked children per day
```

The result is rounded and never shown below zero. `-` means the app does not have enough booking/capacity data to estimate this.

Interpretation:

- A higher `EST` suggests there may be practical room in the weekly booking pattern.
- Treat this as a planning signal, not a promise of available licence places on every day.
- `EST` is also used as a small factor in the default priority listing, but it is weighted below known Leaving pressure.

### U2

Under-2 enrolment against under-2 capacity.

Format:

```text
enrolled under-2 children / licensed under-2 capacity
```

Example:

```text
8/10
```

The enrolled count is based on each enrolled child's birth date at the snapshot date. The capacity comes from Infocare licence `max_u2` or a manual capacity override. If capacity is unknown, the table shows the enrolled count against `-`.

Interpretation:

- `8/10` means two apparent under-2 places remain by headcount.
- Age-band capacity should be checked operationally because staffing, ratios, rooms, and booked days can still constrain availability.

### O2

Over-2 enrolment against over-2 capacity.

Format and interpretation match `U2`, but for children aged two or older.

### Waitlist

Format:

```text
estimated actionable waitlist / total waitlist
```

Example:

```text
12/30
```

The total is the raw Infocare waiting list count for the centre.

The first number estimates entries in the short-to-typical wait range. The current estimate uses the observed waitlist profile constants in `src/analytics/waitlist-profile.ts`: 212 short-or-typical entries out of 549 dated entries. That is about 38.6% of the eligible waitlist. For centres with no under-2 (`U2`) capacity, under-two waitlist children are first removed from the eligible count before this estimate is applied, because those children are not currently serviceable by that centre.

Interpretation:

- `12/30` means 30 total waitlist records, with roughly 12 estimated to be more actionable based on the wait-age distribution and age-band eligibility.
- A big raw waitlist is not automatically strong demand. Older, stale, duplicated, or no-longer-relevant entries can inflate it.
- The Waitlist Quality panel gives more detail about whether the queue looks fresh or stale.

### Age 5+

Number of currently enrolled children who are already five or older at the snapshot date.

Interpretation:

- These children may create near-term replacement pressure, because they are at or past the age where transition to school is expected.
- This is not window-based. It is a current count.
- This column is independent of `Leaving`, so the same child can appear in both `Age 5+` and `Leaving`.

### Near 5

Number of enrolled children who will turn five within the selected time window.

Example: if `3M` is selected, `Near 5` counts children whose fifth birthday falls within the next 90 days.

Interpretation:

- Higher values mean future vacancies may be coming even if the centre looks full now.
- Read this with `Leaving` and `Waitlist`; high near-five pressure plus low actionable waitlist is a warning sign.
- This column is independent of `Leaving`, so the same child can appear in both `Near 5` and `Leaving`.

### Leaving

Number of enrolled children with a known future leaving date inside the selected time window.

Interpretation:

- This is based on explicit Infocare `leaving_date` values.
- It only counts future leaving dates. Past leaving dates are ignored.
- A high value means the centre may need follow-up or marketing before spaces open.
- This column is independent of `Age 5+` and `Near 5`, so a child can appear in `Leaving` as well as one of the age columns.

### Replacement Pressure Overlap

The `Age 5+`, `Near 5`, and `Leaving` table columns are source-signal counts, not mutually exclusive child lists. They are useful for seeing why pressure exists, but they can overlap.

The AI Chat panel and Meta recommendation detail use **replacement pressure**, which deduplicates those signals by child for the selected window. For example, one enrolled child who is turning five soon and has a known future leaving date counts once in replacement pressure, even though they can appear in both `Near 5` and `Leaving` in the table.

### Email

Shows an email action when the centre can be matched to a contact from the centre contact list. It is intended for quickly emailing the centre about Facebook advertising or enrolment follow-up.

## Urgency Ranking

The default table order is not alphabetical. The Infocare Analytics priority listing is weighted toward centres with known children leaving and low actionable waitlist cover. The current priority-listing weights are:

- **65%** - Leaving vs actionable waitlist gap. This is the number of selected-window `Leaving` children not covered by the estimated actionable waitlist.
- **20%** - Raw selected-window `Leaving` count.
- **10%** - `EST`, the estimated booked-day open places. This is capped at 20 estimated places so it can influence the list without dominating it.
- **5%** - Low waitlist signal. The estimated actionable waitlist is the main input, with total raw waitlist also considered when it is low.

The selected window (`1W` through `12M`) changes the Leaving count used in this priority listing.

Separately, each centre has an **urgency score** from 0 to 100 (`calculateUrgencyScore` in `src/analytics/compute.ts`). It is recomputed for the selected window whenever it is read, never stored, so the table, the AI chat and the band always agree. It adds three parts:

- **Uncovered leavers** (up to 45) - children leaving in the window minus the actionable waitlist, measured against 10% of licensed capacity.
- **Empty places** (up to 40) - available places as a share of licensed capacity; a quarter empty scores the full 40.
- **No resilience** (15) - added when the actionable waitlist is zero.

Bands are:

- **Critical** - 70 or above.
- **High** - 45 to 69.
- **Moderate** - 20 to 44.
- **Stable** - below 20.

The score is absolute, not a ranking: every centre can be Stable in a healthy week or Critical in a bad one, and nothing depends on how other centres are doing.

## FTE Meaning

FTE is used in the centre narrative, not directly displayed as the `ENROL/MAX` percentage.

The app defines one full-time equivalent child place as:

```text
50 hours per week
```

Calculation:

```text
sum of enrolled children's booked weekly minutes / 3,000 minutes
```

Example:

- A child booked 25 hours per week counts as `0.5` FTE.
- A child booked 50 hours per week counts as `1.0` FTE.
- Two children booked 25 hours each count as `1.0` FTE.

Use FTE to understand booked-hours load. Use `ENROL/MAX` to understand headcount and daily booked utilisation.

## Waitlist Quality

The Waitlist Quality panel checks whether raw waitlist totals are reliable demand signals.

For centres that do not offer under-2 (`U2`) places, under-two waitlist children are excluded from the actionable waitlist estimate before the short-plus-typical wait profile is applied. The raw total remains visible as the denominator.

### `<163d/Total`

Estimated or reported count of entries under 163 days old, shown against total waitlist.

The 163-day threshold comes from the short-plus-typical wait profile. Entries below this threshold are treated as more likely to be current/actionable.

### `163+d/Total`

Estimated or reported count of entries 163 days or older, shown against total waitlist.

Interpretation:

- A high `163+d` share can mean the waitlist is stale or needs cleaning.
- It does not mean every older entry is invalid, but it makes the raw total less reliable.

### Starting Date

When a full waitlist report is available, this shows how many waitlist records had usable starting-date information. In snapshot fallback mode it shows `snapshot`, meaning the panel is using stored analytics snapshots rather than the full waitlist discovery report.

For waitlist age, the preferred source is `application_date`. `starting_date` is only a fallback when `application_date` is unavailable.

### Oldest

The oldest waitlist entry age in days.

Interpretation:

- Very high values suggest stale records or families that may no longer be active prospects.
- Use this with the long-running wait table, not as a standalone decision.

### Median

Median waitlist age in days when a full waitlist report is available. A lower median means the list is generally fresher.

### Waitlist By Distribution Days

Chart of short, typical, long-running, and very-long-running waitlist entries.

When the full report is not available, the app falls back to an estimated split using the observed short-plus-typical share.

### Waitlist Quality Hierarchy

Ranks centres by long-running and very-long-running waitlist pressure.

Columns:

- **Centre** - centre name.
- **Long-running wait** - older waitlist entries.
- **Very long-running wait** - the oldest/stalest waitlist category where report data is available.
- **Max days** - age of the oldest waitlist entry for that centre.

### DOB Profile By Wait Category

Shows the age profile of waitlist records by wait category:

- **Under 5** - likely still age-relevant for early childhood enrolment.
- **Turning 5** - turns five in the current calendar year.
- **Aged 5+** - already five or older.
- **Unknown DOB** - no usable birth date.
- **Total** - all records in that wait category.

Interpretation:

- A waitlist with many aged-five-plus children may overstate real younger-child demand.
- Unknown DOB counts reduce confidence because age relevance cannot be checked.

### Recent Demand

Compares recent new enrolments with new waitlist entries over one, two, and three-month views when the report data is available.

Interpretation:

- More new waitlist entries than enrolments can signal rising demand.
- More enrolments than waitlist entries can signal the centre is filling places but may need future pipeline building.

## META Ads

The Meta Ads panel compares advertising activity with centre demand.

### Summary Cards

- **Active** - ads considered healthy and currently delivering.
- **Learning** - active ads still in Meta's optimisation period or with insufficient lead volume.
- **Learning Limited** - delivery is constrained and usually needs review.
- **Completed** - ads/ad sets that have ended.
- **Not Delivering** - something is preventing spend or delivery.
- **Rejected** - policy/disapproval issue.
- **Amount spent** - spend for the selected dashboard period.

### Ads In Period

Columns:

- **Centre** - matched centre name. If no centre match exists, the app falls back to ad set, campaign, or ad name.
- **Advert** - ad name plus optimisation/ad type where available.
- **Delivery** - normalised Meta delivery state.
- **Results** - primary result count, preferring landing page views, link clicks, leads, website leads, or pixel leads depending on what Meta returns.
- **Impressions** - number of times ads were shown.
- **Amount spent** - spend in NZD for the selected period.
- **CPR** - cost per result, calculated as spend divided by result count.
- **Budget** - daily or lifetime ad set budget, converted from Meta's minor units.
- **Ends** - ad set end date.

Interpretation:

- `Learning` is not automatically bad, especially for newer ads.
- `Learning Limited`, `Not Delivering`, and `Rejected` are stronger review signals.
- High spend with strong waitlist coverage may mean spend should be reviewed.
- No active ads with open places and low actionable waitlist may mean a campaign is needed.

### Recommendations

Recommendations combine Infocare demand with matched Meta coverage.

Labels include:

- **Needs ads** - open places, very low actionable waitlist, and no active campaign.
- **Ads active, monitor** - open places and active spending are present.
- **Review spend** - demand appears covered while ads are still active.
- **Prepare campaign** - upcoming replacement pressure exists but no active campaign is present.
- **Covered by ads** or **Watch** - lower-priority states.

Recommendation detail shows:

```text
open places, actionable waitlist / total waitlist, replacement pressure, active campaigns, spend
```

Replacement pressure is:

```text
deduplicated count of children in Age 5+, Near 5 in selected window, or Leaving in selected window
```

The visible table columns can overlap; replacement pressure counts each child once.

### Notification History

Stores generated recommendation notifications and their status. Notes can be added to recommendations, and dismissed recommendations are retained in history.

## Google Analytics

The Google Analytics panel reports website traffic for the selected date range. The default range is the current month to today.

### Summary Cards

- **Active users** - distinct active users in the selected range.
- **Sessions** - visits/sessions in the selected range.
- **Engaged sessions** - sessions that met Google Analytics engaged-session criteria.
- **Views** - page/screen views.
- **Conversions** - configured conversion events.
- **Revenue** - total revenue reported by GA, if any.
- **Engagement rate** - engaged sessions divided by sessions.
- **Avg session** - average session duration.

When multiple stored snapshots are aggregated, counts are summed and rate/duration metrics are weighted by sessions.

### Most Visited Pages

Columns:

- **Page** - page title/path.
- **Views** - page views.
- **Users** - active users for the page.
- **Sessions** - sessions for the page.
- **Volume** - a visual bar showing relative traffic compared with other listed pages.

Interpretation:

- High views on centre pages can indicate family interest.
- Low users with high views may mean repeated viewing by a smaller audience.

### Meta Ad Centre Pages

Matches active Meta ad centres to Google Analytics pages using centre/ad text tokens.

Columns:

- **Centre** - centre matched from Infocare/Meta.
- **Ads** - count of active/relevant ads.
- **Delivery** - delivery states for those ads.
- **Matched page** - GA page matched to the centre/ad.
- **Views** - page views.
- **Users** - active users.
- **Engagement** - page engagement rate.

Interpretation:

- Ads with matched page traffic suggest families are reaching relevant pages.
- Active ads with little matched traffic may need creative, link, targeting, or landing-page review.

## AI Chat Panel

The panel shows a generated summary for the selected centre and includes an interactive local AI composer named Beep Beep. The summary combines:

- urgency band,
- open places,
- booked-hours/FTE guidance,
- waitlist strength,
- waitlist age quality,
- selected-window leaving and near-five pressure,
- annual/centre history when available,
- manual capacity notes,
- latest stored Meta Ads notes for the selected centre.

The composer streams from `/api/ai/chat/stream`, sends the selected centre and selected window, and keeps a short in-browser history so follow-up questions have conversational context. Answers are grounded in a fresh dashboard context built on each request from Infocare analytics, Meta Ads, Google Analytics, and centre-level recommendation data, plus the Things To Know wiki and excerpts from the [help knowledge base](#help-knowledge-base-rag) (Infocare, Meta and Google Analytics sources). A **Sources** line under each answer names the help pages used.

## General Chat Page

`/chat` is a standalone general-help chat page for Beep Beep. It is not grounded in a selected centre or marketing dashboard context. Use it for general writing, planning, explanation, troubleshooting, and technical help.

General Chat persists its data in Postgres:

- `GeneralChatGroup` stores conversation groups.
- `GeneralChatConversation` stores each saved conversation and its group assignment.
- `GeneralChatMessage` stores user and assistant messages.

The page supports:

- creating conversations,
- continuing existing conversations,
- creating, renaming, filtering by, and deleting groups,
- deleting individual messages,
- live message-count updates while a streamed answer is saved.

Deleting a group keeps its conversations and moves them out of that group. Deleting a message removes only that message from the retained conversation.

The installed local model currently reports a `131,072` token context length for `llama3.1:8b`. The app stores full conversations, but it does not send every retained message forever. For long threads, it sends a conservative latest working window of about `24,000` characters plus the system prompt so the local model remains responsive and avoids context-limit failures.

Local AI configuration is controlled through `.env`:

- `AI_PROVIDER=builtin`
- `AI_BASE_URL=http://127.0.0.1:11434`
- `AI_CHAT_MODEL=llama3.1:8b`
- `AI_TIMEOUT_MS=60000`
- `AI_EMBED_MODEL=nomic-embed-text` - the embedding model for the help knowledge base (see below).

### Landing news and weather feed refresh

`src/landing-intelligence.ts` rebuilds the feed on server start and then every 15 minutes (`startLandingIntelligenceFeedLoop`). Page loads only read the in-memory feed. Adding or removing a search text forces a rebuild. Only one refresh runs at a time (`refreshInFlight`). The whole refresh races `REFRESH_DEADLINE_MS` (10 min), so an await that never settles can't hold that slot for ever (that happened on 2026-10-28 and froze the feed for a day). On timeout, the previous items stay, status becomes `error`, and the log line names the sources still pending (`news`, `weather`, `brand mentions`) or the stage it stopped at. The next tick starts a fresh refresh. Each run appends to `logs/landing-intelligence-feed.jsonl`, so a stale last-write time on that file means no refresh has finished.

How news is judged relevant (`assessNewsCandidate`):
- **NZ/AU check uses the publisher, not the link.** Google News links all go to `news.google.com`, so `parseRss` keeps the `<source url>` as `sourceUrl`, and `publisherHostname` uses it. Without this, 1News, SunLive and Stuff results were rejected as "not NZ/AU".
- **ECE relevance doesn't have to be in the headline.** Results of the user's saved search texts are marked `eceConfirmed`. Results of `ECE_TERMS` queries are not: Google matches those on page chrome, which let in cricket and election stories (tried and reverted on 2026-10-29). Scraped listing headlines that fail the ECE check but hint at children or teaching (`ECE_HEADLINE_HINT_PATTERN`) get the article fetched. The meta description and first 8 paragraphs are checked (`articleHtmlMentionsEce`), and the result is cached per URL. The whole page isn't checked because site navigation mentions ECE everywhere.
- **Scraped sections:** RNZ Education and Crime and Justice; NZ Herald Education, NZ and **Bay of Plenty Times**; Stuff NZ and Education; SunLive news.
- **Headlines lose the publisher suffix.** Google News titles end in ` - <publisher>`; `parseRss` strips it with `stripPublisherSuffix` (exact match on the `<source>` name only), because the publisher is shown separately. The card's publisher text is capped at 40% of the width so a long name (e.g. ABC's) can't hide the headline.
- **Saved search texts** (`logs/landing-intelligence-search-texts.json`, managed from the landing page) score +100 and skip the 80-candidate cap.
- **Brand queries** (`BRAND_QUERIES`, `SECTOR_WATCH_QUERIES`, and one per owned centre) still require the term in the headline or summary (`isGroundedMatch`), because Google's phrase matching is loose.

The ticker is a CSS animation (`landing-feed-scroll`). Dragging it scrubs: the landing-page script sets the animation's `currentTime` from the drag distance (Web Animations API), so the ticker carries on from where it was dropped. A drag of 4px or more swallows the following click, so dropping on a story doesn't open it. Listeners are delegated on `document` because the feed fragment is swapped in place on refresh.

### Updating the local AI model

The landing page footer has **Update AI model** (shown when `RECOMMENDED_MODEL` in `src/landing-intelligence.ts` differs from `AI_CHAT_MODEL`; the model actually pulled is `RECOMMENDED_AI_CHAT_MODEL` in `src/server.ts`, so keep the two in step) and **Rollback AI model**. An update pulls the recommended model with `ollama pull`, moves the current model to `AI_CHAT_MODEL_FALLBACK`, switches `AI_CHAT_MODEL`, and warms the new model up. It then runs `ollama rm` on the model that was the fallback *before* the update, since it is no longer needed, unless it is still in use as the active model, the new fallback, the Job Description model (`JD_INTRO_AI_MODEL`, always `llama3.1:8b`) or the embedding model (`AI_EMBED_MODEL`). A removal failure is logged and never fails the update. Rollback swaps `AI_CHAT_MODEL` and `AI_CHAT_MODEL_FALLBACK`.

Leave `AI_PROVIDER` unset, or set it to `builtin`, when you want Beep Beep to run with no external model dependency. Set `AI_PROVIDER=ollama` only when you want the optional local LLM path. `npm run ai:setup` downloads Ollama's standalone Windows runtime into `.local/ollama`, stores model files under `.local/ollama-models`, starts the local runtime, and pulls the configured model. Use `npm run ai:doctor` if the Ollama-backed chat path reports that the local AI is unavailable.

## Things To Know

`/wiki` is the team's marketing wiki. Each article has a title and rich-text body; on save the local model assigns one category from the managed list (never free text), writes 3-8 tags and a one-sentence summary. Categories are managed (renamed, re-ordered, deleted) from the Categories modal; deleting one moves its articles to General. Archived articles are hidden and excluded from AI grounding. Pinned articles are always included in grounding.

The dashboard and General Chat are grounded on the wiki: `selectWikiGrounding` in `src/storage/wiki-store.ts` sends an index of every article plus the full text of the best keyword matches within a character budget.

## Code Snippets and Links

Two list pages share one design (the wiki's list, modal and editor styles):

- **Code Snippets** (`/snippets`, tables `CodeSnippet` / `CodeSnippetCategory`) - clicking a row copies the code. The AI snippet helper sees the snippet open in the editor, and any fenced code block it writes gets a **Save as snippet** button.
- **Links** (`/subscriptions`, tables `Subscription` / `SubscriptionCategory`) - titled links; clicking a row opens the link in a new tab. No chat; the single panel uses the layout's full-width focus mode. Categories render as an exclusive `<details name="subscription-groups">` accordion; only the category of the most recently used link starts open. `Subscription.lastUsedAt` is set on create, edit and duplicate, and by `POST /api/subscriptions/:id/used` when a link is opened or copied from the list. Never-used links fall back to `updatedAt`. Deleting a link removes its row in place, so the open category stays open. The former Panui Tools page (`/panui`, tables `PanuiTool` / `PanuiToolCategory`, and its newsletter-drafting chat) was retired on 2026-10-20: migration `20261020010000_merge_panui_tools_into_links` moved its links here under the "Panui Tools" category and dropped its tables.

Each has a protected **General** category. Categories are stored by name on the item, so a rename re-files items in one transaction. Link URLs are normalised by `src/storage/link-url.ts` (http/https only; a bare domain gets `https://`).

## Help Knowledge Base (RAG)

The dashboard and Communications chats are grounded on a shared help knowledge base (tables `HelpArticle` / `HelpChunk`):

| Source | Content | Refresh |
| --- | --- | --- |
| `mailchimp` | Mailchimp help centre, from the `mailchimp.com/main.xml` sitemap (~650 articles) | weekly |
| `google-analytics` | GA4 articles from `support.google.com/analytics`, found by following links (no sitemap; `[UA]` articles skipped) | monthly |
| `infocare` | In-house guide `knowledge/infocare/`, `docs/metric-contracts.md`, `INFOCARE/INFOCARE-LICENSE.md` | daily check |
| `meta` | In-house guide `knowledge/meta/` | daily check |

Meta's help centre and developer docs refuse automated requests, and Infocare has no public help centre, so those two are built from local documents. Any `.md`, `.txt`, `.html` or `.pdf` dropped into `knowledge/<source>/` is indexed (see `knowledge/README.md`).

How it works:

- **Chunking** - documents are split at their headings (`src/help-kb/parse.ts`); short sections are merged, long ones split, so each chunk is one topic.
- **Embeddings** - Ollama `nomic-embed-text`, always with `num_gpu: 0` so it runs on the CPU and never evicts the 8B chat model from the 4 GB GPU. If the embedder is down, chunks are stored for full-text search and embedded on the next sync.
- **Retrieval** - `buildHelpGrounding` in `src/storage/help-kb-store.ts` merges four ranked lists by weighted reciprocal rank fusion: vector similarity (2), Postgres full-text (0.5), an in-house-guide hybrid list (1), and exact-phrase matches such as "Review spend" (1.5). Help is only added when the best match reaches 0.68 cosine similarity or the question matches the source's topic pattern.
- **Budgets** - the chat model runs with Ollama's default 4,096-token window, so the dashboard and Communications chats get two short excerpts (~2,000 characters), or four when the Communications prompt carries no Postmark data.
- **Sync** - `startHelpKbSyncLoop` runs 60 seconds after startup and then daily: local documents are re-read every time, and a help centre is re-crawled when its last *complete* crawl (`SyncCursor` key `help-kb:<source>:completed-at`) is older than its refresh period, so a crawl cut short by a restart resumes. Crawls fetch one page at a time with a pause between.
- **Tuning** - `scripts/help-kb-eval.mts` runs questions with known answers through retrieval. Re-run it after changing the fusion weights, the chunking, or a guide (`npx tsx scripts/help-kb-eval.mts`).

The launcher (`scripts/open-marketing-helper.ps1`) pulls the embedding model in the background if it is missing, and `npm run ai:setup` pulls it alongside the chat model.

## Important Interpretation Rules

- **Do not treat raw waitlist as clean demand.** Use actionable waitlist, waitlist age, DOB profile, and oldest/median wait.
- **Do not treat `ENROL/MAX` percentage as FTE.** It is booked daily utilisation. FTE is weekly booked minutes divided by 50 hours.
- **Do not treat estimated places as a booking guarantee.** It is a mathematical estimate from average booked child-days and licence capacity.
- **Use the selected window deliberately.** `Near 5` and `Leaving` change when the selected window changes.
- **Read advertising against demand.** An ad is not good or bad by itself; it matters whether the centre has open places, future pressure, and enough waitlist cover.
- **Check data freshness.** Each panel shows pull/snapshot timestamps. Old snapshots can make the recommendations stale.

## Data Quality Notes

- Waitlist age should use `application_date` where available.
- Waitlist `starting_date` is only a fallback and should not be treated as equivalent without saying so.
- The waitlist report is intended to cover every open, non-ignored centre. Partial source data should not be treated as complete truth.
- Centres with missing licence capacity may require manual capacity overrides before they appear correctly in analytics.

## Development Map

- `src/server.ts` - Fastify server, routes, refresh actions, local-host safety.
- `src/analytics/compute.ts` - Infocare analytics calculations.
- `src/analytics/waitlist-profile.ts` - actionable waitlist estimate constants.
- `src/analytics/windows.ts` - selectable time windows.
- `src/ui/app-shell.ts` - dashboard HTML rendering and panel logic.
- `src/storage/*` - Prisma-backed persistence and view models.
- `src/infocare/*` - Infocare client, extraction, sync, and waitlist reports.
- `src/meta/*` - Meta API config, refresh, and centre matching.
- `src/google-analytics/*` - GA config, refresh, and client.
- `src/ui/wiki-app-shell.ts`, `src/ui/wiki/*` - Things To Know pages; `src/storage/wiki-store.ts` - wiki storage and grounding.
- `src/ui/snippets-app-shell.ts`, `src/ui/subscriptions-app-shell.ts` - the list pages; matching stores in `src/storage/`.
- `src/help-kb/*` - help knowledge base sources and parsers; `src/storage/help-kb-store.ts` - its sync and retrieval.
- `src/ai/embeddings.ts` - Ollama embedding client.
- `knowledge/*` - in-house help guides and drop folders for the knowledge base.
- `docs/USER-GUIDE.md` - the user guide shown at `/readme`.
- `docs/metric-contracts.md` - metric rules that should be treated as data contracts.
