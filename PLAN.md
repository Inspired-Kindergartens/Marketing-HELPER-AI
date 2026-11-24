# PLAN — Info Sheets

## Goal
A **Info Sheets** page (`/one-pager`) that makes the one-page A4 PDF for each kindergarten from one shared
template. Each kindergarten's text and photos are stored in Postgres, filled in first from what the app
already knows, and can then be edited section by section. The PDF is built by the app (pdfmake, as every
other PDF here), so all kindergartens look the same and a change to the template reaches every one of them.

Reference designs: `docs/One Pager/Avenues Kindergarten 1 Pager v10 Aug 2023.pdf` and
`docs/One Pager/Arataki Kindergarten 1 Pager v4_Aug 2023.pdf`.

## The template (read from the two reference PDFs)
One A4 portrait page, top to bottom:

| # | Section | Same for all / per kindergarten | Filled in from |
|---|---------|---------------------------------|----------------|
| 1 | Inspired Kindergartens logo with "Ngā Kōhungahunga Manawanui", top centre | same for all | `src/assets/one-pager/logo.png` |
| 2 | ~~Callout badge, top right (cloud: "Extended hours available!")~~ dropped 2026-11-17 | | |
| 3 | Teal band with the kindergarten's name | per kindergarten | `CentreReference.name` |
| 4 | Row of three photos | per kindergarten | uploaded |
| 5 | Orange brush stroke with "Making the early years count" | same for all | shared text |
| 6 | **About us** (left column, paragraphs and bullet list) | per kindergarten | typed, or AI draft from notes |
| 7 | Team photo with caption ("Back row: … Front row: …") | per kindergarten | uploaded + typed |
| 8 | **Contact us**: address, phone, email, website | per kindergarten | `SectorCentre` (our own centres) |
| 9 | **Hours** | per kindergarten | typed (not held anywhere) |
| 10 | **How much does it cost?** | shared text, can be overridden | shared text |
| 11 | **Are the teachers trained?** | shared text, can be overridden | shared text |
| 12 | **How do I enrol my child?** | shared text, can be overridden | shared text |
| 13 | Decorations: butterfly, fern, teal half-circle, column rule | same for all | template artwork |

## Decisions (the user said "go with your recommendations", 2026-11-15)
- [x] **Artwork**: pulled out of the Avenues PDF (no originals supplied). Replace the files in `src/assets/one-pager` if originals turn up.
- [x] **Fonts**: the PDFs use Calibri throughout (tagline: Myriad Pro Bold → Calibri Bold). Read from the Windows fonts folder; no font added to the app.
- [x] **Photos**: real uploaded photos only. The AI image model is not used and no photo is sent to OpenAI.
- [x] **Shared sections**: cost, teachers and enrolment text written once, with a per-kindergarten override.
- [x] **Versions**: downloads named `<Name> Info Sheet v<N> <Mon YYYY>.pdf`; **Save version** keeps each PDF.
- [x] **Which kindergartens**: every open, not-ignored centre in `CentreReference` (26).

## Naming update (2026-11-17)
- [x] Renamed the feature to **Info Sheets** across the landing tile, navigation, page title, preview labels, PDF metadata, messages and documentation.
- [x] New PDF downloads and saved versions use `<Name> Info Sheet v<N> <Mon YYYY>.pdf`. Existing saved files retain their original names.
- [x] Kept `/one-pager`, API routes, database models and storage paths unchanged for compatibility.

## Crop, AI upscale, badge look (2026-11-24)
- [x] Crop step shows the whole photo with a crop box: drag a corner to resize, drag inside to move
- [x] Tick box **Fix crop to the PDF's photo shape** (on when the dialog opens) for all four photos; unticked, the box is any shape
- [x] Photo caption saves itself as it is typed (no Save caption button); label "Photo caption" in sentence case
- [x] Upload is the box's own pixels, never enlarged (`OUTPUT_WIDTH` 2400)
- [x] Too few pixels for the slot at 300 dpi (`onePagerPhotoDpi`) → upload answers `upscale: true`
- [x] Upscale asks "Does this image contain real children?" first; Yes sends nothing; No → `POST .../images/:slot/upscale`
- [x] Upscale goes through the regenerate code: same gate, same single `editImage` caller, `UPSCALE_PROMPT`
- [x] Result flagged AI generated; cropped photo kept for Revert; team photo never upscaled
- [x] Preview badges: black box, green border, green 15 pt words (`badgeBox`)
- [x] Tests, both readmes, build, server restarted; crop box checked in headless Chrome, badges as a picture
- [ ] run one real upscale once the OpenAI key works, and check nothing in the photo changed

## Notes panel (2026-11-19)
- [x] **Notes** panel for the selected kindergarten, after Photos (`renderOnePagerNotes`, fragment `notes`)
- [x] Shows the kindergarten's existing notes (Meta notes storage, every note on the centre), newest first; no new table
- [x] **Add note** → `POST /api/one-pager/:centreKey/notes`, kept under `info-sheet-<centreKey>` as sent emails are
- [x] A sent email appears in the panel at once (`email-note` answers with the `notes` fragment)
- [x] Tests, both readmes, build, server restarted, panel checked live

## Preview badges over the team photo (2026-11-19)
- [x] **Staff photo needed** badge while the team photo task is open
- [x] **Email sent** badge once a Staff photo email is sent, until a new team photo is put in (`teamPhotoBadges`)
- [x] A Staff photo email's note is the short line "Email sent for staff photo update"; earlier ones known by the ready-made subject
- [x] Drawn into the preview PDF only (`?badges=1`); downloads never carry them (test)
- [x] A sheet with no team photo (never put in, removed, or its file gone) gets **Staff photo needed** in the preview and **Team photo due** in the list, with no task open (`teamPhotoMissing`, 2026-11-24)
- [x] Removing a team photo raises its task as In progress unless one is open (`raiseMissingTeamPhotoTask`); `scripts/one-pager-missing-team-photo-tasks.ts` for sheets already without one (2026-11-24)
- [x] Tests, both readmes, build, server restarted, preview checked as a picture

## Head teacher and administrator from Infocare (2026-11-24)
- [x] Head teacher and administrator come from Infocare's stored staff list (jobs `Head Teacher` / `Administrator`, current on the day); never from the uploaded workbook, never guessed from another job.
- [x] Greeting: head teacher alone when there is no administrator; the service's name when there is neither (Marketing emails, Info Sheets email, job description approval).
- [x] Email address comes from the Info Sheet.
- [x] Upload Contacts kept for the senior teacher only: needs just `Kindergarten` and `Key Senior Teacher`; the app works without the workbook.
- [x] Staff list fetched from Infocare once a day (`runStaffListSync`), read-only.
- [x] Tests, both readmes, build, server restarted, Gwen Rogers checked.
- [x] Landing footer **Centre Staff** button opens a dialog (replaces the Upload Contacts page): **Upload** the Senior Teacher workbook, **Download** the PDF of each kindergarten's head teacher, administrator and other staff.

## Versions removed, people columns (2026-11-18)
- [x] Removed saved versions: Versions panel, **Save version**, the list's Version column, both version routes, `OnePagerVersion` and `OnePager.version` (migration `20261118020000_one_pager_drop_versions`).
- [x] Downloads are named `<Name> Info Sheet <Mon YYYY>.pdf`.
- [x] Kindergartens list: **Senior leader** column and **Head Teacher / Administrator** column, from the centre contact list.

## Collated originals, service models and AI images (2026-11-17)

- [x] 1. Import the collated originals (`docs/One Pager`, 26 files)
  - [x] 23 more sheets read into `scripts/one-pager-import-data.json` (text, photo boxes); 25 of 26 kindergartens now have text and four photos in the database
  - [x] OPEYS not imported: the file named for it is Matua's sheet (contact details only)
  - [x] two-page originals: only page 1 is read; every sheet renders on one page (test)
  - [x] where a sheet and the directory disagree on contact details, the sheet's wording is used
- [x] 2. Tai o Fenua: the only exception to the template is its own logo beside ours (`ownLogo`, `tai-o-fenua-header.png`)
  - [x] the earlier Tai-only layout changes (no About us heading, no tagline, bold greeting) removed; test holds the exception to the logo
- [x] 3. Service models (migration `20261117010000_one_pager_service_model_ai_flag`)
  - [x] `OnePager.serviceModel`: kindergarten (donations) or all-day (fees); **Service type** in the Text panel
  - [x] All Day shared cost and enrolment text (`allDayCostText`, `allDayEnrolText`), seeded from Maunganui's sheet; Maunganui and OPEYS are All Day
  - [x] hours stay per service, with no shared text
  - [x] bullet-typed right-hand sections (the fees) are set as a list
- [x] 4. AI generated images
  - [x] `OnePagerImage.aiGenerated` + `aiPrompt`; **AI generated** tick box on each photo, set by the app only
  - [x] **Generate with AI** on each slot: sends the typed description only (`createSlotImageGenerator`, `src/image-ai/photo-slot.ts`)
  - [x] uploads and imports are never flagged; uploading over a generated picture clears the flag
  - [x] `assertAiGenerated` gate for any future route that sends a picture; rule written into `CLAUDE.md`; tests
  - [x] checked in headless Chrome (ticks, dialog, All Day placeholder)
  - [ ] live generation failed: OpenAI answered 401 "did not accept the API key" (2026-11-17). The user checks `OPENAI_API_KEY`
- [x] 5. `npm test` 512/512; build clean; server restarted; both readmes updated

## Team photo upkeep and editing (2026-11-17)

- [x] 1. Fern mirrored and hard left in the template
- [x] 2. Text panel: Contact us and Questions groups; Save pinned to the bottom; team caption moved to the Team photo card (**Save caption**)
- [x] 3. Team photo task (`src/one-pager/staff-photo.ts`, `src/storage/staff-photo-store.ts`, migration `20261117020000_one_pager_staff_photo_task`)
  - [x] a teacher or head teacher starting or leaving (stored Infocare staff list), or a full-time teacher advert one month after its closing date
  - [x] raises one task per kindergarten in Tasks, due in 14 days, with the reasons; no second task while it is open
  - [x] **Team photo due** badge in the Kindergartens list; button on the Team photo card opens the task
  - [x] runs when the page opens and daily; dry run on live data raised nothing (changes count from when each photo went on, 15-17 Nov 2026)
  - [x] `npm test` 520/520
  - [ ] expected first tasks: Tai o Fenua, Waihi and Whangamata around 18 Dec 2026 (adverts closing 18 Nov)
  - [x] decided 2026-11-17: yes, once (see the one-off audit below)

## Hours from Infocare and the Kindergartens panel (2026-11-17)

- [x] 1. Hours inferred from Infocare bookings (`src/one-pager/hours.ts`, `scripts/one-pager-hours.ts`)
  - [x] reads stored `get_attendance_list` replies only; Infocare is not called or changed
  - [x] sessions per weekday, weekdays with the same sessions on one line, in the sheets' wording
  - [x] notes Infocare cannot know (holiday programmes, closures, playgroup, OSCAR) kept
  - [x] applied: 22 sheets updated; Te Puke already matched
  - [x] not applied: Maunganui and OPEYS (All Day: bookings 7:30am - 5pm, sheets say 5:30pm) and Karamuramu (mixed Thursday/Friday bookings)
  - [ ] the user checks the differences from the old sheets (list in the last reply), especially Wairakei's Wednesday and Avenues' session names
- [x] 2. Kindergartens panel: each kindergarten is a standard button (a GET form), no links; the open one has an arrow
- [x] 3. `npm test` 517/517; checked in headless Chrome
- [ ] 4. OpenAI key still refused (401) on 2026-11-17: the value in `.env` does not start with `sk-`

## OPEYS and Regenerate (2026-11-17)

- [x] 1. OPEYS imported from `OPEYS Kindergarten 1 Pager v2 18.2.21.pdf`: text and three photos; all 26 kindergartens now loaded
  - [x] its team photo is a placeholder (another kindergarten's team, "Team photo to come!"): not taken, caption left empty
  - [x] its sheet lists no fees ("What ages do you care for?" instead): it shows the All Day shared fees
- [x] 2. The rule, refined by the user: never upload an image of real children (a real photo with no children may be sent)
  - [x] `assertNoRealChildren(image, answer)` replaces `assertAiGenerated`; the AI generated flag skips the question
  - [x] `CLAUDE.md` rule rewritten; `/images/edits` added to the pinned endpoints in `test/ai-model-design.test.ts`
- [x] 3. **Regenerate** button on photo 1-3 (not the team photo)
  - [x] asks "Does this image contain real children?"; **Yes** stops and sends nothing; **No** goes on
  - [x] request box; when empty, the **If left empty** choice is used (two or three children, one child, a busy group, children with a teacher)
  - [x] description sent: keep the scene; mix of New Zealand children, about half Polynesian New Zealanders, modern play clothes; the word "Māori" never sent
  - [x] result replaces the slot's picture and is flagged AI generated; regenerating it again skips the question
  - [x] `npm test` 514/514; dialog walked in headless Chrome (Yes: nothing posted; No: request step)
  - [ ] run one real regeneration once the OpenAI key works, with a photo that has no children in it, and check the children it draws
- [ ] 4. Later, with the user: UI detail and context injection for the request

## Email the kindergarten and the one-off team photo audit (2026-11-17)

- [x] 1. **Email kindergarten** button above the preview (`src/one-pager/email.ts`), the Marketing page's email flow
  - [x] types: **Approve changes** (PDF downloaded to attach), **Staff photo**, **New**; subject and body can be edited
  - [x] sent to the service email; greets the head teacher and administrator (centre contact list); reply within three working days
  - [x] "Did you send the email?" **Yes** keeps it as a note on the kindergarten (`POST /api/one-pager/:centreKey/email-note`, Meta notes storage, id `info-sheet-<centreKey>`)
  - [x] tests: the emails, the button, the note route
  - [x] checked in headless Chrome (Arataki: choice dialog, Staff photo email, Cancel); fixed the subject and body boxes overhanging the dialog
  - [ ] the user sends one real email and answers **Yes**, to see the mail app open and the note appear
- [x] 2. One-off audit of the imported team photos (`scripts/one-pager-team-photo-audit.ts`)
  - [x] caption names against today's staff in the stored Infocare staff list; kindergartens with no team photo
  - [x] fixed: two full names on two lines with the comma lost were read as one person (Matua)
  - [x] applied once, 2026-11-17: 18 tasks (ids 22-39): 17 where the names differ and OPEYS (no team photo); a second run skips them
  - [x] no task: Arataki and Matua (names match); Karamuramu, Otamarakau, Paengaroa, Papamoa, Papamoa Coast, Waihi (photo but no caption to check)
- [x] 3. `npm test` 523/523; build clean; server restarted; both readmes updated

## Nav rail order (2026-11-17)

- [x] Every page's nav rail runs in the landing page's order: Landing, Marketing, Tasks, Info Sheets, Communications, Job Descriptions, Budget, then Code, Links, Sector Insight, General Chat, WIKI (where a page shows them)
- [x] test holds each rail to the landing order; `npm test` 524/524; build clean; server restarted

## Breakout designs in the old sheets (2026-11-17)

- [x] 1. All 27 originals gone through; the breakouts named for the user (one template, differences are stored words and photos)
- [x] 2. Logo replaced on every sheet with the newer one ("Ngā Kōhungahunga Manawanui" under it)
  - [x] drawn from the vector artwork in Matua's 2024 sheet (`scripts/one-pager-logo-artwork.ts`), 6 pixels a point
- [x] 3. Cloud badge dropped from the template (only Avenues used it)
  - [x] field, Text panel box, PDF drawing and artwork step removed; migration `20261117030000_one_pager_drop_callout`
  - [x] `src/assets/one-pager/cloud.png` deleted
- [x] 4. Otamarakau: the team slot holds a photo of a child; left as it is, team photo task raised (id 40, `scripts/one-pager-otamarakau-task.ts`)
- [x] 5. `npm test` 524/524; build clean; server restarted; live Avenues sheet checked as a picture; both readmes updated
- [x] 6. Decided 2026-11-17: Tai o Fenua's own logo stays the only exception to the template design
  - [x] its hibiscus added in the teal half-circle at the foot (`tai-o-fenua-hibiscus.png`, cut from its old sheet by `scripts/one-pager-tai-artwork.ts`); same single check as the logo; `npm test` 524/524; live sheet checked as a picture
- [ ] 7. Not carried by the template, for the user to compare and decide:
  - [x] heavier heading and title typeface of the newer sheets: now on all 26 as a template change (Arial Bold for the name, tagline, About us and right-hand headings; text stays Calibri); all 26 still fit one page; `npm test` 524/524; server restarted
  - [ ] own question headings (Maungaarangi "Are the teachers qualified?", Maunganui "What does it cost?", OPEYS 2021 "What ages do you care for?")
  - [ ] taller or wider photos in the top row (Avenues, Maungaarangi, Brookfield, Papamoa Coast, Maunganui, Thames Coast)
  - [ ] portrait team photos (Papamoa, Waihi)
  - [ ] bold or italic text inside sections (Tai o Fenua, Matua); orange sub-heading and two-column bullets in About us (Gwen Rogers)
  - [ ] Matua's own web address in Contact us (`inspiredkindergartens.nz/matua`)

## Build order

- [x] 1. Template assets and fonts
  - [x] `scripts/one-pager-extract.ts` (pictures + text positions from a PDF) and `scripts/one-pager-assets.ts` → `src/assets/one-pager/` (logo, band, brush, butterfly, fern, cloud)
  - [x] Calibri registered beside Arial (`FONTS` in `src/ui/jd/jd-pdf.ts`)
  - [x] positions, sizes and leadings measured from the reference in points
- [x] 2. Storage (migration `20261115010000_add_one_pager` applied; `src/storage/one-pager-store.ts`)
  - [x] `OnePagerTemplate` (single row), `OnePager`, `OnePagerImage` (one per slot), `OnePagerVersion`
  - [x] tables are in the pg_dump backup; `uploads/` is in the `.mhbak` backup (`src/backup.ts`); no new env vars
- [x] 3. Fill in from what we know (`src/one-pager/prefill.ts`, `scripts/one-pager-seed.ts`)
  - [x] name from `CentreReference` (double spaces tidied); address, phone, email from `SectorCentre` by licence number
  - [x] hours are not held anywhere → start empty
  - [x] Avenues and Arataki seeded fully from their PDFs (text + four photos each); spelling slips in the originals corrected
  - [x] seed run live 2026-11-15: 26 kindergartens; a second run changes nothing; Thames Coast has no directory record
  - [x] prefill never overwrites a field that has something in it
- [x] 4. About us draft (`src/ai/one-pager-context.ts`)
  - [x] sources: the text in the About us box (notes), stored website text, JD intro, Enviroschool flag
  - [x] runs on `AI_CHAT_MODEL` the way the JD intro does (`runLocalChat`, `think: false`); no model named; `test/ai-model-design.test.ts` unchanged
  - [x] draft goes into the box; nothing saved until **Save**
  - [x] changed from the plan: no stored website text exists for any kindergarten, so the box's own text is the source; a single reply rather than a stream (matches the JD intro)
  - [x] changed after live tests: other kindergartens' About us removed from the prompt (the model copied their values); third live draft added nothing
- [x] 5. PDF (`src/ui/one-pager-pdf.ts`)
  - [x] fixed background layer (artwork, name, callout, photos, tagline) + two columns
  - [x] photos fill their slot (cropped, never stretched)
  - [x] one page always: team photo shrinks, then text; right column tightens spacing, then text
  - [x] overflow reported per column in lines; Save version refused
  - [x] empty slots / no callout / empty About us keep the layout
  - [x] Avenues and Arataki rendered and compared with the originals as images (`scripts/one-pager-sample.ts`)
- [x] 6. Info Sheets page (`/one-pager`, `src/ui/one-pager-app-shell.ts`, `src/one-pager/routes.ts`)
  - [x] Kindergartens list: version, photos n/4, last edited
  - [x] Text panel: one form, **Draft with AI**, **Fill from what we know**, **Use shared text**, **Save**
  - [x] Photos panel: upload / replace / remove; drag-and-zoom crop to the slot's shape in the browser
  - [x] Versions panel: **Save version**, list with downloads
  - [x] Shared Text panel
  - [x] preview = the real PDF, refreshed in place; print icon downloads it
  - [x] upload checks: JPEG/PNG by content, 12 MB, app-generated names
  - [x] checked in headless Chrome: Default, Light, Dark; crop, upload and remove exercised on the live server (test photo removed again)
  - [ ] **Download all** as one zip (only if wanted)
- [x] 7. Landing page and navigation
  - [x] **Info Sheets** tile in General Chat's place (third, primary)
  - [x] **General Chat** small button after **Sector Insight**
  - [x] Info Sheets added to all ten nav rails
- [x] 8. Docs: `docs/USER-GUIDE.md` (Info Sheets section, landing buttons, backup) and `README.md` (Main Pages, Info Sheets, backup)
- [x] 9. Build, `npm test` (505/505, 24 new in `test/one-pager.test.ts`), server restarted, `/one-pager` and landing checked live
- [ ] 10. Commit and push (when told)

## Open, for the user
- [ ] Check the 2023 wording still holds before any info sheet goes out: "$6 per part day session or $8 for a full day", "up to 30 hours ECE free per week", "enrol from two years of age" (Shared Text), and Avenues' extended-hours fee ($10)
- [x] Website line is `www.inspiredkindergartens.nz` (the 2023 files said `.co.nz`); the user confirmed `.nz` on 2026-11-17
- [ ] OPEYS: add a team photo and caption; confirm its fees (its sheet lists none, so it shows the All Day shared fees from Maunganui)
- [ ] Check the fees and donation amounts carried over from each sheet, and the All Day shared fees (from Maunganui: $6.50 per hour, 20 hours free for 3-5 year olds)
- [ ] 25 kindergartens carry the photos from their existing sheets, which show children (see the task "Create a plan to phase out Images of Children"); replace with **Generate with AI** once the OpenAI key works
- [ ] Six sheets had no team caption (Karamuramu, Otamarakau, Paengaroa, Papamoa Coast, Papamoa, Waihi)
- [ ] The landing page now has nine small buttons; with the reminders column showing, WIKI wraps to a second row
- [ ] Should "Draft with AI" read each kindergarten's page on the Inspired website itself, instead of needing the text pasted in?

## Carried over from the Budget plan
- [ ] the user sets $20,000 additional budget on Office Signage for 2026-27
