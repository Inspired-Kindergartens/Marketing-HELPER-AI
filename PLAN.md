# PLAN — Enrolment Quality panel

## Goal
A new accordion panel, **Enrolment Quality**, directly below **Infocare Analytics**
on `/app`. It shows each centre's **% full roll** month by month, so a trend
(a centre doing well, then slipping) is easy to see. It replaces the busy
"Roll Returns" PDF (`docs/20261110090648858.pdf`), where trends had to be marked
by hand with highlighter and smiley faces. The app shows the numbers and does
not explain them (e.g. a new head teacher).

## Definitions (agreed 2026-11-10)
- **Placements** = children booked in each open day's busier session (am or pm), averaged over the month
  (changed 2026-11-10 from distinct children per day: a morning-only and an afternoon-only child share a place).
  Children on part weeks share a place: Kimmy (Tue, Wed, Fri) + Joe (Mon, Thu) = one placement.
- **% full roll** = placements / **operating capacity**. Over 100% is possible and expected.
- **Operating capacity** = the places a centre actually runs at (can be below its licence;
  Arataki: licence 45, runs at 40). Set by the user per centre with an "effective from" month;
  the licence is used before the first entry or when there is none.
- **Staffing suggestion** = staff on `Contact` duty at 10:00 on a typical open day (job `Other` excluded)
  × 10 (× 15 when sessional), capped at the licence. A suggestion only; the user's figure wins.
- **Avg am / pm** = children booked starting before 12:00 / ending after 13:00, per open day.
- **Open day** = licence `max_children` > 0 and at least one booking.
- Nothing to do with Finance; no financial-year logic.

## Data (tested 2026-11-10)
- Read-only Infocare modes added: `get_attendance_list` (a whole centre's bookings per date range,
  one call per centre-month instead of one per child), `get_roster_list`, `get_staff_list`.
- Infocare keeps these back to at least Nov 2021, so 5 years is fetched.

## Build order

- [x] 0. Staffing data check: `get_staff_list` and `get_roster_list` exist (read-only); `get_attendance_list` found as well
- [x] 1. Monthly roll calculation (`src/analytics/enrolment-quality.ts`)
  - [x] licence days + attendance + roster → open days, avg placements, avg am/pm, avg licence, contact staff, sessional
  - [x] reuses `parseTimeToMinutes` from `src/infocare/extraction.ts` (exported, not copied)
  - [x] tests (`test/enrolment-quality.test.ts`): Kimmy + Joe = 1, am/pm split, closed days, mid-month licence change, over 100%, staffing, capacity by month, sort/flags, grounding, panel HTML, trend gaps
- [x] 2. Storage
  - [x] `CentreMonthlyRoll` and `CentreOperatingCapacity` (migration `20261110010000_add_enrolment_quality`, applied)
  - [x] `src/storage/enrolment-quality-store.ts`; both tables are in the pg_dump backup; no new env vars, so the transfer check is unchanged
- [x] 3. Fetching from Infocare (`src/infocare/roll-history.ts`)
  - [x] per centre: staff list once, licence per year, attendance + roster per month; 650 ms spacing; raw replies captured
  - [x] resumable: complete months skipped; newest month first; failed months retried next run
  - [x] current month refetched each run and shown "to date"
  - [x] first 5-year fetch finished 2026-11-10: 1,560/1,560 centre-months, none failed (Dec 2021 - Nov 2026)
- [x] 4. Scheduling: server loop 3 minutes after startup, then daily (`startRollHistorySyncLoop`); the launcher starts the server, so no extra task. "Update from Infocare" button with progress
- [x] 5. Panel (`src/ui/enrolment-quality-panel.ts`, `PANEL_DEFINITIONS` entry after `analytics`)
  - [x] `3M` · `6M` · `12M` (default) · `2Y` · `3Y` · `5Y` buttons in the Infocare Analytics style; kept in the URL (`rollWindow`)
  - [x] sort: Worst change (default, by Change, biggest fall first) · A-Z · Z-A (`rollSort`)
  - [x] row: centre · trend (arrow + line coloured rise/fall/steady, scaled per centre, dashed 100%) · start · latest · change (%) · am/pm · capacity
  - [x] click a row: month table + operating capacity editor (history, remove, staffing suggestion with "Use")
  - [x] months with no data break the trend line instead of being invented
  - [x] fragment swapped in place (no reload); checked in headless Chrome in Default, Light and Dark
  - [x] "Worst latest" sort; Start/Latest/monthly % banded (90%+ green, 80-89% grey, <80% red); Capacity shows the number only, with a pencil that opens the editor
  - [x] no explanatory text in the panel or editor (user request 2026-11-10)
  - [x] PDF button: A4, summary table + change chart + one chart per centre for the selected period and order; capacity as `operating {licence}` with a note
  - [x] padding fix for the capacity card
  - [x] under-2 centres (OPEYS, Maunganui All Day, Tai o Fenua): % stays combined; operating capacity has a second "Under-2" field; staffing suggestion counts under-2s at 1:5 (2026-11-10)
- [x] 6. Highlighting: colour and arrow by direction (steady within 3%) replace the highlighter and smileys; Flag column removed at the user's request (2026-11-10)
- [ ] 7. Check against the PDF
  - [x] all 25 PDF centres, Jan-Jul 2026: am within ±1 for 172/175 centre-months, pm 166/175 (Katikati pm is ~16 vs the PDF's 20)
  - [x] placements changed to the busier session per day (Wairakei had afternoon-only children); 1,560 months rebuilt from the stored replies
  - [x] user confirms each centre's implied operating capacity before any is entered (approved 2026-11-10; see 12)
- [x] 8. AI grounding: roll/enrolment/capacity/trend questions add the 10 most concerning centres (+ the selected one), last 6 months, to `extraGrounding`; fail soft; `AI_CHAT_MODEL` only
- [x] 9. Docs: `docs/USER-GUIDE.md` and `README.md` (Enrolment Quality section, data sources, development map)
- [x] 10. Beep Beep opening summary: one roll sentence for the selected centre (latest %, band, capacity, change over the panel's period) (2026-11-10)
- [x] 11. Infocare Analytics priority order (user approved 2026-11-10)
  - [x] urgency score: uncovered leavers 40, empty places from last month's % full roll 35 (licence fallback), year-on-year roll fall 10, no waitlist 15; bands unchanged
  - [x] roll figures attached at read time (`withRollSignals`) for the table, bands, opening summary and both dashboard chats
  - [x] opening summary reasons: low roll, falling roll; licence-based over-2 gap dropped where roll data exists
  - [x] help article `knowledge/infocare/dashboard-infocare-metrics.md` updated
- [x] 12. Operating capacities from the PDF entered as user-defined operating capacities (user approved 2026-11-10): 15 centres from Jan-26, Maarawaewae 40 from Jun-26 and 44 from Jul-26, Matua 40 from Jul-26
- [x] 13. "All kindergartens" row pinned at the top of the Enrolment Quality table (all columns, month table, no editor); first in the PDF and the AI grounding; shaded with `--color-row-total` (2026-11-10)
- [x] 14. "Update from Infocare" keeps the download icon, the same as every other data-pull button (refresh icon tried and reverted at the user's request, 2026-11-10)
- [x] 15. Automatic Enrolment Quality fetch once a month: finished months only, no Infocare calls mid-month; the button still fetches the month to date (2026-11-10)
