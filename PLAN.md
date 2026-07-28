# PLAN: Job Descriptions (JD)

An AI-driven top-level section for creating Job Descriptions unique to each
kindergarten. Two outputs per JD:

1. **Website blurb** — AI-generated rich text (WYSIWYG-editable) based on
   previous blurbs for that service, influenced by an Inspired Kindergartens
   generic base text; **copy to clipboard** (HTML + plain text).
2. **PDF download** — matches the current template
   (`PD Teacher PAENGAROA July 2026.pdf`): header logo, field table
   (Job Title / Job Category / Location / Collective Agreement / Position Type /
   Date advertised / Level-Salary Range / Closing Date / Senior Teacher /
   Start Date), "Applications only accepted by" + Qualifications block,
   Job Description intro paragraph, ROLE AND RESPONSIBILITIES bullet sections,
   footer table (Reviewed By / Approved By / Last Updated By with Date/Time).

Architecture follows existing conventions: Prisma models in
`prisma/schema.prisma`, persistence in `src/storage/jd-store.ts`, AI context in
`src/ai/jd-context.ts` (using `runLocalChat` from `src/ai/client.ts`), page in
`src/ui/jd-app-shell.ts` composed of `src/ui/jd/*-panel.ts` panels, routes in
`src/server.ts`, styles in `src/ui/app.css`. Mirrors how Tasks/Comms were built.

---

## Field-driving rules (extracted from current + archive JDs)

- **Job Title** dropdown (this order): Teacher; Head Teacher; Administrator;
  Part-time Teacher. (Senior Teacher dropped from scope — the "Senior
  Teacher" *field* per centre remains, as it names the centre's senior
  teacher on every JD.) Title drives Job Category, Level/Salary Range,
  Qualifications, Role & Responsibilities, Position Type default, and the
  **PDF layout variant**:
  - *Standard KTCA layout* (Teacher, Head Teacher, Part-time Teacher): full
    field table as in `PD Teacher PAENGAROA July 2026.pdf`.
  - *Administrator layout* (per `Job Description Administrator template.pdf`):
    short field table — Job Title / Job Category `Administration` / Location /
    **Position Hours** (text, e.g. `12 Hours (as per Employment Agreement)`);
    no salary, collective agreement, senior teacher or advert dates; sections
    are ROLE AND RESPONSIBILITIES (intro sentence + **Core duties** +
    **Other duties**, bold lead-in bullets), REQUIRED SKILLS, and
    **REPORTS TO: Head Teacher**; same footer review table.
  - *Professional/contract roles* (e.g. Speech Language Therapist, from the
    `SLT` examples): currently free-form docs that **should conform to the
    standard tabular layout** — field mapping: Job Category `Professional`,
    Agreement `Contract for Services`, Remuneration text (e.g. `Competitive
    (to be negotiated)`) instead of a pay scale, **Contract Manager** in place
    of Senior Teacher, plus an email **Subject Line** in the applications
    block. (Pending confirmation whether this becomes a fifth dropdown title —
    see Open inputs.)
- **Location** dropdown: open, non-ignored `CentreReference` names in CAPS
  ending "Kindergarten" (e.g. `PAENGAROA Kindergarten`). Location drives the
  Job Description intro paragraph (operating hours + max roll), Senior Teacher
  name, and Reviewed By (senior teacher acronym).
- **Position Type**: Full Time (default); Part-time. Part-time takes an FTE
  (e.g. 0.6) and pro-rates the salary range (archive example: 0.6 FTE shown as
  `$36,797.40 to $61,851.60`).
- **Job Category / Level-Salary Range**: K1 = Teacher / Part-time Teacher,
  K2 = Head Teacher. Salary Range shows the **actual dollar range** currently
  in effect (see scales below). K3/K4 (Senior Teacher) rates are documented
  below for reference but not seeded — the Senior Teacher job title is out of
  scope.
- **Date advertised**: date input, default today. **Closing Date**: date +
  time, rendered `28/07/2026 at 4pm` (default time 4pm). **Start Date**: text
  field, default `To be negotiated`.
- **Collective Agreement**: fixed `Kindergarten Teachers Collective Agreement`.
- **Applications block**: fixed — E-mail / Appointments Secretary /
  `office@ikindergartens.nz`.
- **Footer**: Reviewed By = senior teacher acronym (e.g. VVR, HD);
  Approved By = PM; Last Updated By = user acronym + date/time.

## KTCA 2026–2028 pay scales (seed data; agreement expires 28 Dec 2028)

| Scale | Effective 2 Apr 2026 | 29 Jun 2026 | 28 Jan 2027 | 29 Jun 2027 |
|-------|---------------------|-------------|-------------|-------------|
| K1 steps 1–10 | $62,862 – $105,686 | (same) | $64,119 – $107,886 | (same) |
| K2 Head Teacher | $110,356 | $113,356 | $115,736 | $116,736 |
| K2R Relieving HT | $108,356 | $111,356 | $113,736 | $114,736 |
| K3 Senior Teacher | $116,148 | $119,148 | $121,650 | $122,650 |
| K4 Senior Teacher (manages ST team) | $125,638 | $128,638 | $131,340 | $132,340 |

K1 full step table (2 Apr 2026 → 28 Jan 2027): 1: 62,862→64,119;
2: 65,685→66,999; 3: 68,251→69,616; 4: 72,548→73,999; 5: 77,224→78,768;
6: 82,230→83,874; 7: 88,276→90,042; 8: 93,234→95,099; 9: 100,368→102,475;
10: 105,686→107,886.

---

## 1. Data model (`prisma/schema.prisma`)
- [x] `JdPayScale` — scaleKey (K1/K2/K2R), step (nullable for flat scales),
      effectiveFrom, annualRate, sourceDocument, importedAt. Seeded from the
      table above (K1 + K2 + K2R only); selectable-by-date so ranges roll
      over automatically on 28 Jan 2027 / 29 Jun 2027.
- [x] `JdAgreement` — one row per imported KTCA document: name, fileName,
      effectiveFrom, expiresOn (28/12/2028), importedAt. Drives the yearly
      startup check.
- [x] `JdTitleProfile` — jobTitle (unique), sortOrder, jobCategory,
      payScaleKey?, layoutVariant (`standard` | `administrator` |
      `professional`), defaultPositionType, agreementText,
      qualificationsText, roleSections (JSON: `[{heading, intro?, bullets[]}]`
      — bullets support a bold lead-in for the Administrator style),
      extras JSON (positionHours, reportsTo, remunerationText,
      contractManagerName, subjectLine — used by non-standard variants).
      Seeds: Teacher + Head Teacher from current PDFs; **Part-time Teacher
      reuses the Teacher qualifications/roles** (K1, Position Type defaults to
      Part-time with FTE); **Administrator** from
      `Job Description Administrator template.pdf` (category Administration,
      Position Hours field, core/other duties, required skills, reports to
      Head Teacher, no pay scale).
- [x] `JdCentreProfile` — extends the existing centre list: centreKey
      (unique, FK `CentreReference`), locationDisplay (CAPS +
      "Kindergarten"), introParagraph (operating hours + max roll),
      seniorTeacherName, seniorTeacherAcronym. Back-relation on
      `CentreReference`; seeded with a row per open, non-ignored centre
      (known values filled: PAENGAROA, OPEYS, Maungatapu; the rest edited in
      the settings panel).
- [x] `JobDescription` — jobTitle, centreKey, positionType, fte,
      jobCategory, salaryRangeText (frozen at generation), dateAdvertised,
      closingAt, startDateText, qualificationsText, introParagraph,
      roleSections JSON, blurbHtml, reviewedByAcronym, approvedByAcronym
      (default PM), lastUpdatedByAcronym, createdAt/updatedAt. Field values
      copied from profiles at creation so each JD is editable independently.
- [x] `JdBlurb` — blurb history: centreKey, jobDescriptionId?, contentHtml,
      savedAt. **A new row on every save** (user may hand-edit; all versions
      kept as future AI reference corpus).
- [x] `JdKnowledgeDoc` — blurb information base: kind (`generic` |
      `service`), centreKey?, label (`current` | `old` | doc name),
      contentHtml, updatedAt. Schema + CRUD (`upsertKnowledgeDoc`,
      `listKnowledgeDocsForCentre`, `getGenericKnowledgeDoc`) done, editable
      via the JD Settings panel.
  - [ ] **Still pending: seed from the two supplied documents** —
        `D:\iK\Documents\JD\Current Kindergarten Website Blurbs.pdf` (all 26
        open services) and `OLD Kindergarten Website Blurbs.pdf` (22
        services). Blocked on PDF→HTML extraction tooling (the local
        `pdftoppm`/poppler renderer isn't installed, and the doc is too large
        for direct text-layer extraction in one pass) — needs a follow-up
        pass with a proper PDF text/HTML extractor, preserving
        headings/bold/bullets/links, matched by centreKey (not name — the
        blurb docs spell "Maraawaewae", the DB has "Maarawaewae").
  - [ ] **Still pending:** seed the `generic` doc with the immovable
        boilerplate text (captured in §4 below) so it's editable in Settings
        from day one instead of only living in `jd-context.ts`.
- [x] Migration `add_job_descriptions` + seed script
      (`prisma/seed-jd.ts`) for pay scales, Teacher/Head Teacher/
      Administrator/Part-time Teacher title profiles, and known centre
      profiles (PAENGAROA, OPEYS, Maungatapu).

## 2. Pay-scale startup check (yearly KTCA update)
- [x] On server start (same pattern as other background refreshes in
      `src/server.ts`): resolve currently-effective rates by date, refresh any
      stored display ranges, and log the active scale window.
- [x] Warn when the newest `JdAgreement.expiresOn` is past or within 90 days:
      banner on the JD page (+ landing reminder strip entry) prompting an
      updated KTCA import.
- [x] KTCA import flow (partial): upload new KTCA PDF via
      `POST /api/jd/settings/ktca-import` (accepted, stored in memory only).
  - [ ] **Still pending:** AI-assisted extraction of K1 steps / K2 / K2R rate
        tables + effective dates, and the review screen to confirm parsed
        rates before inserting `JdPayScale` rows + `JdAgreement`. Currently
        the upload just acknowledges receipt and prompts manual entry via
        the pay-scale table in Settings.

## 3. Storage layer (`src/storage/jd-store.ts`)
- [x] Pay-scale helpers: `getEffectiveRates(date)`,
      `formatSalaryRange(scaleKey, date, fte?)` → e.g.
      `K1: $62,862 to $105,686`, flat scales `K2: $113,356`, part-time
      pro-rated (`fte × rate`, 2 dp, "to" range for stepped scales).
- [x] Title/centre profile CRUD (`listTitleProfiles`, `upsertCentreProfile`,
      `listCentreProfiles` joined to `CentreReference`).
- [x] `JobDescription` CRUD; `createJobDescription` composes defaults from
      title profile + centre profile + effective pay scale.
- [x] Blurb helpers: `saveBlurb` (writes `JobDescription.blurbHtml` **and**
      appends a `JdBlurb` history row), `listBlurbsForCentre` (AI corpus).
- [x] Knowledge-doc CRUD (scaffold).
- [x] Server-side HTML sanitiser for WYSIWYG input (allow: h1–h3, p, strong,
      em, ul/ol/li, a[href], br; strip everything else).

## 4. AI blurb generation (`src/ai/jd-context.ts`)
- [x] Context builder: IK generic base text (`JdKnowledgeDoc` kind=generic) +
      the centre's `current` (primary) and `old` (secondary) website blurbs
      (kind=service for centreKey) + most recent N previously generated/saved
      blurbs for that centre (`JdBlurb`) + the JD's fields (title, position
      type, centre intro). Subtle variation on the centre's own voice — keep
      its established taglines, pou/values, whakataukī and factual claims
      (hours, free-hours offer, Enviroschools status) verbatim unless the JD
      fields contradict them.
- [x] Blurb template = **variable editorial section + immovable boilerplate**
      (structure verified on the live vacancy pages for Tai o Fenua + OPEYS,
      `inspiredkindergartens.nz/employment-and-careers/vacancies/...`):
      1. *Variable (AI-generated)*: headline (e.g. "Kindergarten Teacher
         Wanted"), service-specific body in the centre's own voice — setting,
         values, who we're looking for / you-will bullets. Style precedents:
         the live pages + the "Advertisement Copy" section in
         `SLT/Job Description+SLT+8.12.2025.pdf`.
      2. *Immovable (appended verbatim, never sent through the AI)*:
         - "The terms and conditions of the Kindergarten Teachers Collective
           Agreement will apply. Inspired Kindergartens offers excellent
           employment conditions, supportive colleagues and a wide range of
           professional learning opportunities."
         - Link: "Job Description - Full time - Teacher / Kaiako
           <SERVICE>" → the generated JD PDF (site hosts under
           `/assets/Job-Descriptions/…`)
         - Link: "Please apply online here" →
           `/employment-and-careers/how-to-apply/how-to-apply-kindergarten`
         - "Start Date: <JD startDateText>"
         - "Closing Date: <JD closingAt formatted>"
         - "Be at the cutting edge – come work for Inspired Kindergartens"
      Prompt instructs the AI **not** to repeat the boilerplate sentences in
      the editorial section (the live pages currently duplicate the KTCA
      sentence — avoid that), and never to invent facts about the centre.
- [x] `POST /api/jd/:id/blurb/generate` uses `runLocalChat`
      (`src/ai/client.ts`), sanitises the returned HTML, saves via
      `saveBlurb`, returns HTML for the editor.
- [x] Regenerate keeps prior versions in `JdBlurb` (nothing overwritten).

## 5. JD section UI (`src/ui/jd-app-shell.ts`, `src/ui/jd/`)
- [x] `jd-app-shell.ts` — `PANEL_DEFINITIONS`, `VALID_JD_PANEL_IDS`,
      `renderJdAppShell` via `renderLayout` (same as tasks/comms shells).
- [x] `jd-list-panel.ts` — existing JDs (title, location, dates advertised/
      closing), open/duplicate/delete; "New Job Description" form with the
      driving dropdowns (Job Title in the specified order; Location from
      centre profiles).
- [x] `jd-editor-panel.ts` — full field editor: dropdowns/date/date-time/text
      inputs per the field rules; Role & Responsibilities section editor
      (headings + bullet lists); Qualifications text; footer acronyms.
      Buttons: **Download PDF**, **Save**.
  - [ ] **Still pending:** auto-fill on title/location change after creation
        (currently the driving dropdowns only apply at JD creation time via
        `createJobDescription`; changing Job Title/Location on an existing
        JD in the editor does not re-pull the new profile's defaults).
- [x] `jd-blurb-panel.ts` — WYSIWYG editor (custom `contenteditable`
      component, no new heavy deps): toolbar for headings (H1/H2/H3),
      normal paragraph, **bold**, *italic*, bullets, hyperlinks;
      **Generate with AI** button; **Copy to clipboard** writing both
      `text/html` and `text/plain` via `ClipboardItem`; blurb version history
      list (restore a previous version). The immovable boilerplate renders as
      a locked (non-editable) block below the editable section, with Start/
      Closing Date auto-filled from the JD fields; copy-to-clipboard includes
      both parts.
- [x] `jd-settings-panel.ts` — centre profiles table (intro paragraph, senior
      teacher name + acronym per kindergarten), title profiles
      (qualifications per job title), knowledge docs (generic text +
      per-service docs), pay-scale table with agreement status +
      "Import new KTCA" upload.
  - [ ] **Still pending:** role-section editing lives in the JD Editor panel
        per JD, not per title profile in Settings, as originally scoped.

## 6. PDF generation
- [x] Add `pdfmake` (declarative tables — fits this table-heavy template;
      pure JS, works server-side in Fastify). Note: this pdfmake version
      ships no bundled fonts/standard-14 fallback — fonts are read from the
      local Windows Arial install (`C:\Windows\Fonts`), since this app is
      local-only and Windows-only.
- [x] Extract the Inspired Kindergartens logo from an existing JD PDF into
      `src/assets/ik-logo.jpg` (extracted via PyMuPDF from the embedded JPEG
      in `PD Teacher PAENGAROA July 2026.pdf`), embedded as base64.
- [x] `src/ui/jd/jd-pdf.ts` — builds the document definition matching the
      current template: logo top-right; bordered 4-column field table; grey
      "Applications only accepted by" band with E-mail block +
      QUALIFICATIONS AND EDUCATION REQUIREMENTS side by side; grey "Job
      Description" band; intro paragraph; ROLE AND RESPONSIBILITIES sections
      with bullet lists; footer review table (Reviewed By / Approved By /
      Last Updated By with Date and Date/Time). Verified against the
      reference PDF — layout matches closely.
  - [ ] **Still pending:** explicit page-2 continuation with a repeated
        "ROLE AND RESPONSIBILITIES" heading — currently relies on pdfmake's
        default flow/pagination rather than an explicit repeat-heading rule.
- [x] Layout variants driven by `JdTitleProfile.layoutVariant`: Administrator
      (short field table with Position Hours, bold lead-in duty bullets,
      REQUIRED SKILLS, REPORTS TO, "Private and Confidential" page
      header/footer — updated to "Inspired Kindergartens 'Private and
      Confidential'" per user decision, replacing the legacy "Tauranga
      Region Kindergartens" wording).
  - [ ] **Deferred (per user decision):** Professional/contract layout
        variant (Agreement/Remuneration/Contract Manager/Subject Line) — the
        schema supports `layoutVariant: "professional"` but no title profile
        is seeded for it and the PDF generator doesn't yet special-case it.
- [x] `GET /api/jd/:id/pdf` → `application/pdf` download, filename
      `PD <Job Title> <LOCATION> <Month Year>.pdf` (matches current naming).
- [x] Visual check against `PD Teacher PAENGAROA July 2026.pdf` side by
      side — confirmed matching field table, applications block, and
      footer layout via a rendered test PDF.

## 7. Routes (`src/server.ts`)
- [x] `GET /jd` (+ `?panel=` panel param, same pattern as `/tasks`).
- [x] JD API: create / update / delete / duplicate.
- [ ] Blurb API: generate (AI), save (records history), list versions,
      restore version.
- [ ] Settings API: centre profile upsert, title profile update, knowledge
      doc CRUD, KTCA import (multipart upload → parse → confirm).
- [x] `GET /api/jd/:id/pdf` download.

## 8. Landing page
- [x] `Job Descriptions` tile → `/jd` (same tile component/behaviour as
      existing tiles — no bespoke styling).
- [x] KTCA-expiry warning surfaces in the existing reminders strip when due.

## 9. Styles (`src/ui/app.css`)
- [x] `.jd-*` classes reusing existing panel/card/form patterns; WYSIWYG
      toolbar + editor styles; blurb version list.

## 10. Tests
- [x] `test/jd-store.test.ts` — real unit tests for pure helpers:
      `formatSalaryRange` (K1 range, K2 flat, effective-date rollover on
      28 Jan 2027, part-time FTE pro-rating), HTML sanitiser, PDF filename
      formatting; source-pattern assertions for Prisma-backed store functions
      (repo convention — no test DB).
- [x] `test/jd-app-shell.test.ts` — panel selection guard, field-driving
      rules rendered (title order in dropdown, defaults), blurb toolbar +
      copy button present.
- [x] **Wired both into `test/run-tests.ts`**. Full suite: 139 passing / 2
      pre-existing unrelated failures (confirmed failing identically before
      this feature's changes).
- [x] Landing tile test added to `test/landing-page.test.ts`.

## 11. Docs
- [x] `README.md` — `## Job Descriptions` section (blurb + PDF workflow,
      settings, KTCA import).
- [x] `ROADMAP.md` — note the JD feature and its relationship to existing
      apps.

## 12. Open inputs needed from user
- [x] Qualifications: Part-time Teacher reuses the Teacher text.
- [x] Administrator: profile taken from
      `Job Description Administrator template.pdf` (own layout variant, no
      pay scale).
- [x] Senior Teacher job title: **dropped from scope** (the per-centre
      Senior Teacher name/acronym fields remain).
- [x] Centre fields: extend the existing centre list (`CentreReference`) via
      the new `JdCentreProfile` schema; values maintained in the settings
      panel.
- [x] **SLT clarification resolved**: deferred. The professional/contract
      layout variant is not seeded and does not appear in the Job Title
      dropdown yet; only Teacher/Head Teacher/Administrator/Part-time
      Teacher ship in this pass.
- [x] Administrator PDF page header/footer resolved: updated to
      "Inspired Kindergartens 'Private and Confidential'" (legacy
      "Tauranga Region Kindergartens" wording replaced).
- [ ] Senior teacher name + acronym and intro paragraph (hours, max roll) for
      the remaining centres — editable in settings; known and seeded:
      PAENGAROA + Maungatapu → Vilna Van Rensburg (VVR), OPEYS → Haylee
      Dumbar (HD). Remaining ~23 centres are unseeded (empty in
      `JdCentreProfile`) and need editing in the settings panel.
- [x] **Blurb source documents received**: Current (26/26 open services —
      complete) + OLD (22 services) Kindergarten Website Blurbs PDFs
      confirmed in hand at `D:\iK\Documents\JD\`. No service is missing from
      the source material.
  - [ ] **Not yet seeded into `JdKnowledgeDoc`** — see the pending item
        under §1 above (blocked on PDF extraction tooling).
- [x] IK **generic/immovable text**: captured from the live vacancy pages
      (Tai o Fenua + OPEYS) — KTCA terms sentence, JD PDF link, "apply online"
      link, Start/Closing Date lines, "Be at the cutting edge" tagline;
      implemented as `buildImmovableBoilerplateHtml` in `src/ai/jd-context.ts`
      (see §4 for the exact wording). Not yet mirrored into a `JdKnowledgeDoc`
      `generic` row for Settings-panel editing (see §1).
- [x] Logo asset extracted from `PD Teacher PAENGAROA July 2026.pdf` via
      PyMuPDF → `src/assets/ik-logo.jpg`.
