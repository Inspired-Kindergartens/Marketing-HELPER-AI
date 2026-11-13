import assert from "node:assert/strict";
import test from "node:test";

import {
  addMonths,
  buildEnrolmentQualityGrounding,
  buildEnrolmentQualityRows,
  capacityFromAmPm,
  capacityEntryForMonth,
  resolveCapacityForMonth,
  resolveRollSort,
  resolveRollWindowKey,
  rollBand,
  sortEnrolmentQualityRows,
  suggestCapacityFromStaffing,
  summariseRollMonth,
  trendDirection,
  windowMonths,
  withOperatingCapacity,
  type StoredRollMonth,
} from "../src/analytics/enrolment-quality.js";
import { monthsToFetch } from "../src/infocare/roll-history.js";
import { renderEnrolmentQualityBody, renderEnrolmentQualityHeaderActions, renderEnrolmentQualityScript, renderSparkline } from "../src/ui/enrolment-quality-panel.js";
import { generateEnrolmentQualityPdfBuffer, renderCentreChartSvg, renderChangeChartSvg } from "../src/ui/enrolment-quality-pdf.js";

const licence = (date: string, max = 40, extra: Record<string, unknown> = {}) => ({ date, max_children: max, ...extra });
const booking = (child_key: number, date: string, booked_from = "08:45", booked_to = "14:45") => ({ child_key, date, booked_from, booked_to });

test("part-week children share a placement (Kimmy Tue/Wed/Fri + Joe Mon/Thu = 1)", () => {
  const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]; // Mon-Fri
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: week.map((date) => licence(date)),
    attendance: [
      booking(1, week[1]!), booking(1, week[2]!), booking(1, week[4]!), // Kimmy
      booking(2, week[0]!), booking(2, week[3]!), // Joe
    ],
  });
  assert.equal(summary.openDays, 5);
  assert.equal(summary.avgPlacements, 1);
  assert.equal(summary.avgLicence, 40);
});

test("morning and afternoon split: before noon is am, after 1pm is pm", () => {
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-06")],
    attendance: [
      booking(1, "2026-07-06", "08:45", "14:45"), // both
      booking(2, "2026-07-06", "08:45", "12:00"), // am only
      booking(3, "2026-07-06", "12:30", "15:00"), // pm only
    ],
  });
  // Child 2 (morning only) and child 3 (afternoon only) share one place.
  assert.equal(summary.avgPlacements, 2);
  assert.equal(summary.avgAm, 2);
  assert.equal(summary.avgPm, 2);
});

test("placements are the busier session of each day", () => {
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-06"), licence("2026-07-07")],
    attendance: [
      ...[1, 2, 3, 4].map((child) => booking(child, "2026-07-06", "08:30", "12:00")), // 4 am only
      booking(5, "2026-07-06", "12:30", "15:00"), // 1 pm only
      booking(6, "2026-07-07", "12:00", "12:45"), // midday only: neither session
    ],
  });
  assert.equal(summary.avgPlacements, (4 + 1) / 2);
});

test("closed and unbooked days are not open days; bad times are ignored", () => {
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-04", 0), licence("2026-07-06"), licence("2026-07-07"), licence("2026-06-30")],
    attendance: [
      booking(1, "2026-07-04"), // licence 0 (weekend)
      booking(1, "2026-07-06"),
      booking(2, "2026-07-06", "", ""), // no booking times
      booking(3, "2026-06-30"), // other month
    ],
  });
  assert.equal(summary.openDays, 1);
  assert.equal(summary.avgPlacements, 1);
});

test("over 100% is kept, and a mid-month licence change is averaged", () => {
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-06", 40), licence("2026-07-07", 30)],
    attendance: [42, 43].flatMap((n, i) => Array.from({ length: n }, (_, child) => booking(child + 1, i === 0 ? "2026-07-06" : "2026-07-07"))),
  });
  assert.equal(summary.avgLicence, 35);
  assert.equal(summary.avgPlacements, 42.5);
  const capacity = resolveCapacityForMonth("2026-07", summary.avgLicence, []);
  assert.deepEqual(capacity, { capacity: 35, under2: null, source: "licence" });
});

test("staffing: contact staff at 10am, typical day, non-teaching staff excluded", () => {
  const contact = (start: string, end: string) => ({ start, end, type: "Contact" });
  const roster = ["2026-07-06", "2026-07-07"].flatMap((date) => [
    { date, staff_key: 1, work_list: [contact("08:00", "16:00")] },
    { date, staff_key: 2, work_list: [contact("08:00", "16:00")] },
    { date, staff_key: 3, work_list: [contact("08:00", "16:00")] },
    { date, staff_key: 4, work_list: [contact("08:00", "16:00")] },
    { date, staff_key: 5, work_list: [contact("08:00", "16:00")] }, // admin ("Other")
    { date, staff_key: 6, work_list: [{ start: "08:00", end: "16:00", type: "Away" }] },
    { date, staff_key: 7, work_list: [contact("12:00", "16:00")] }, // not on at 10am
  ]);
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-06", 45), licence("2026-07-07", 45)],
    attendance: [booking(1, "2026-07-06"), booking(1, "2026-07-07")],
    roster,
    staff: [{ staff_key: 5, job: "Other" }, { staff_key: 1, job: "Head Teacher" }],
  });
  assert.equal(summary.contactStaff, 4);
  assert.equal(suggestCapacityFromStaffing(summary), 40); // 4 x 1:10, under the licence of 45
  assert.equal(suggestCapacityFromStaffing({ ...summary, avgLicence: 30 }), 30); // capped at licence
  assert.equal(suggestCapacityFromStaffing({ ...summary, sessional: true }), 45); // 4 x 1:15 = 60, capped at 45
  assert.equal(suggestCapacityFromStaffing({ ...summary, contactStaff: null }), null);
});

test("am / pm places: a first figure covers all history; later figures apply from their month on", () => {
  const at = (day: string) => `${day}T00:00:00.000Z`;
  // The only figure (set today, From month this month) also covers every earlier month.
  const only = [{ id: 1, centreKey: 1, effectiveFrom: "2026-11", changedAt: at("2026-11-11"), capacity: 40, amCapacity: 40, pmCapacity: 30, under2Capacity: null, note: null }];
  assert.deepEqual(resolveCapacityForMonth("2022-01", 45, only), { capacity: 40, under2: null, source: "operating", am: 40, pm: 30 });
  assert.equal(resolveCapacityForMonth("2026-11", 45, only)?.capacity, 40);

  // A rise from 2027-02: earlier months keep 40, from February on use 44.
  const rise = [...only, { id: 2, centreKey: 1, effectiveFrom: "2027-02", changedAt: at("2026-12-01"), capacity: 44, under2Capacity: null, note: "extra teacher" }];
  assert.equal(resolveCapacityForMonth("2022-01", 45, rise)?.capacity, 40);
  assert.equal(resolveCapacityForMonth("2027-01", 45, rise)?.capacity, 40);
  assert.equal(resolveCapacityForMonth("2027-02", 45, rise)?.capacity, 44);
  assert.equal(resolveCapacityForMonth("2028-06", 45, rise)?.capacity, 44);

  // Two saves for the same month: the later save applies, the earlier stays in the history.
  const corrected = [...rise, { id: 3, centreKey: 1, effectiveFrom: "2027-02", changedAt: at("2026-12-02"), capacity: 42, under2Capacity: null, note: "typo" }];
  assert.equal(resolveCapacityForMonth("2027-03", 45, corrected)?.capacity, 42);
  assert.equal(capacityEntryForMonth("2027-03", corrected)?.id, 3);

  // A first figure (stored "from the start") and a change from 2026-06: before June the first, from June the change.
  const firstThenChange = [
    { id: 4, centreKey: 1, effectiveFrom: "2000-01", changedAt: at("2026-11-11"), capacity: 30, amCapacity: 30, pmCapacity: 20, under2Capacity: null, note: null },
    { id: 5, centreKey: 1, effectiveFrom: "2026-06", changedAt: at("2026-11-12"), capacity: 34, amCapacity: 34, pmCapacity: 20, under2Capacity: null, note: null },
  ];
  assert.equal(resolveCapacityForMonth("2026-05", 35, firstThenChange)?.capacity, 30);
  assert.equal(resolveCapacityForMonth("2026-06", 35, firstThenChange)?.capacity, 34);

  // No figures: the licence.
  assert.deepEqual(resolveCapacityForMonth("2026-07", 45, []), { capacity: 45, under2: null, source: "licence" });
  assert.equal(resolveCapacityForMonth("2026-07", 0, []), null);

  // In the panel rows: each month gets its own figure; the history keeps every save.
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [month(1, "2026-09", 36, 45), month(1, "2026-10", 36, 45), month(1, "2026-11", 36, 45)],
    capacities: [
      { id: 1, centreKey: 1, effectiveFrom: "2026-01", changedAt: at("2026-11-10"), capacity: 40, under2Capacity: null, note: null },
      { id: 2, centreKey: 1, effectiveFrom: "2026-11", changedAt: at("2026-11-11"), capacity: 36, under2Capacity: null, note: null },
    ],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  assert.deepEqual(rows[0]!.points.map((point) => point.capacity), [40, 40, 36]);
  assert.equal(rows[0]!.currentCapacity?.capacity, 36);
  assert.deepEqual(rows[0]!.capacities.map((entry) => entry.id), [1, 2]);
});

test("windows, months and option parsing", () => {
  assert.equal(resolveRollWindowKey("5Y"), "5Y");
  assert.equal(resolveRollWindowKey("YTD"), "12M");
  assert.equal(resolveRollSort("asc"), "asc");
  assert.equal(resolveRollSort("x"), "interest");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(windowMonths("2026-11", "3M"), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(windowMonths("2026-11", "5Y").length, 60);
  assert.deepEqual(monthsToFetch("2026-11", new Set(["2026-10"]), 3), ["2026-11", "2026-09"]);
  // The monthly check: finished months only, so nothing to do mid-month once
  // last month is stored, and one month per centre after a month ends.
  assert.deepEqual(monthsToFetch("2026-11", new Set(["2026-10", "2026-09"]), 3, false), []);
  assert.deepEqual(monthsToFetch("2026-12", new Set(["2026-10", "2026-09"]), 3, false), ["2026-11"]);
});

function month(centreKey: number, monthKey: string, placements: number, licenceMax = 40): StoredRollMonth {
  return { centreKey, month: monthKey, openDays: 20, avgPlacements: placements, avgAm: placements, avgPm: placements / 2, avgLicence: licenceMax, avgLicenceU2: 0, contactStaff: 4, sessional: false };
}

test("default order is Change, biggest fall first; direction rise/fall/steady; no data last", () => {
  const months = [
    // Brookfield: 100% -> 75%: falling.
    month(1, "2026-09", 40), month(1, "2026-10", 34), month(1, "2026-11", 30),
    // Arataki: steady 100%.
    month(2, "2026-09", 40), month(2, "2026-10", 40), month(2, "2026-11", 40),
    // Karamuramu: low but rising from 60% to 70%.
    month(3, "2026-09", 24), month(3, "2026-10", 26), month(3, "2026-11", 28),
  ];
  const rows = buildEnrolmentQualityRows({
    centres: [
      { centreKey: 1, name: "Brookfield Kindergarten" },
      { centreKey: 2, name: "Arataki Kindergarten" },
      { centreKey: 3, name: "Karamuramu Kindergarten" },
      { centreKey: 4, name: "Thames Coast Kindergarten" },
    ],
    months,
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const sorted = sortEnrolmentQualityRows(rows, "interest");
  // Brookfield -25, Arataki 0, Karamuramu +10, Thames Coast (no data) last.
  assert.deepEqual(sorted.map((row) => row.centreKey), [1, 2, 3, 4]);
  const brookfield = rows.find((row) => row.centreKey === 1)!;
  assert.equal(brookfield.direction, "fall");
  assert.equal(Math.round(brookfield.change!), -25);
  assert.equal(brookfield.latest?.monthToDate, true);
  assert.equal(rows.find((row) => row.centreKey === 2)!.direction, "steady");
  assert.equal(rows.find((row) => row.centreKey === 3)!.direction, "rise");
  assert.equal(rows.find((row) => row.centreKey === 4)!.direction, null);
  assert.equal(trendDirection(2.4), "steady");
  assert.equal(trendDirection(-2.9), "fall"); // shown as -3%
  assert.equal(trendDirection(-3), "fall");
  assert.equal(trendDirection(3), "rise");
  assert.deepEqual(sortEnrolmentQualityRows(rows, "asc").map((row) => row.centreKey), [2, 1, 3, 4]);

  // An operating capacity re-colours history without refetching.
  const withCapacity = buildEnrolmentQualityRows({
    centres: [{ centreKey: 3, name: "Karamuramu Kindergarten" }],
    months,
    capacities: [{ centreKey: 3, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 28, under2Capacity: null, note: null }],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  assert.equal(Math.round(withCapacity[0]!.latestPercent!), 100);
  assert.equal(withCapacity[0]!.currentCapacity?.source, "operating");

  const grounding = buildEnrolmentQualityGrounding(rows, "3M", { maxCentres: 1, includeCentreKeys: [3] })!;
  assert.match(grounding, /Brookfield Kindergarten: latest 75%, change -25% \(fall\)/);
  assert.match(grounding, /Karamuramu Kindergarten/); // included because it was asked about
  assert.doesNotMatch(grounding, /Arataki/);
  assert.doesNotMatch(grounding, /Thames Coast/); // no data

  const view = {
    rows: sorted,
    windowKey: "3M" as const,
    sort: "interest" as const,
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  };
  const html = renderEnrolmentQualityBody(view);
  assert.match(html, /data-enrolment-quality/);
  assert.match(html, /enrolment-quality__trend--fall/);
  assert.match(html, /bi-arrow-down-right/);
  assert.match(html, />-25%</);
  assert.doesNotMatch(html, />Flag</);
  assert.doesNotMatch(html, / pts</);
  // No explanatory paragraph in the panel. The PDF (print icon) and Update
  // from Infocare buttons are in the panel header, not the filter row.
  assert.doesNotMatch(html, /% full roll = placements/);
  assert.doesNotMatch(html, /enrolment-quality\/pdf|data-roll-fetch/);
  const actions = renderEnrolmentQualityHeaderActions(view);
  assert.match(actions, /class="panel-action-button action-print" href="\/api\/enrolment-quality\/pdf\?rollWindow=3M&amp;rollSort=interest"/);
  assert.match(actions, /bi-printer/);
  assert.doesNotMatch(actions, />PDF</);
  assert.match(actions, /data-roll-fetch/);

  const changeSvg = renderChangeChartSvg(rows);
  assert.equal(changeSvg.match(/<rect [^>]*rx=/g)?.length, 3); // one bar per centre with a change
  assert.match(renderCentreChartSvg(brookfield.points, "#d92d20"), /<polyline/);
  assert.match(renderCentreChartSvg(rows.find((row) => row.centreKey === 4)!.points, "#999"), /No figures/);
  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/app\?rollWindow=3M/);
  assert.match(html, /data-roll-capacity-form data-centre-key="1"/);
  assert.doesNotMatch(html, /style=/);
});

test("trend line breaks at months with no data instead of inventing them", () => {
  const point = (percent: number | null) => ({ month: "2026-01", percent, avgPlacements: 0, avgAm: 0, avgPm: 0, openDays: 0, capacity: null, capacitySource: null, placesAm: null, placesPm: null, licence: null, monthToDate: false });
  const svg = renderSparkline([point(90), point(95), point(null), point(80), point(85)], "trend");
  assert.equal(svg.match(/<polyline/g)?.length, 2);
});

test("PDF: a multi-page A4 document for the chosen period", async () => {
  const months = ["2026-09", "2026-10", "2026-11"].flatMap((m, i) => [month(1, m, 40 - i * 4), month(2, m, 38)]);
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }, { centreKey: 2, name: "Arataki Kindergarten" }],
    months,
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const buffer = await generateEnrolmentQualityPdfBuffer({
    rows: sortEnrolmentQualityRows(rows, "interest"),
    windowKey: "3M",
    sort: "interest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  const pages = buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
  assert.equal(pages, 4); // cover, summary, change chart, centres
  const raw = buffer.toString("latin1");
  assert.match(raw, /\/PrintScaling \/None/);
  assert.match(raw, /\/Duplex \/Simplex/);
  assert.match(raw, /\/NumCopies 7/);
});

test("bands, Worst latest sort, capacity shown without 'lic' and editable", () => {
  assert.equal(rollBand(89.6), "good"); // shown as 90%
  assert.equal(rollBand(89.4), "watch");
  assert.equal(rollBand(80), "watch");
  assert.equal(rollBand(79.4), "low");
  assert.equal(rollBand(null), null);
  assert.equal(resolveRollSort("latest"), "latest");

  const months = [
    month(1, "2026-10", 38), month(1, "2026-11", 34), // 95% -> 85%
    month(2, "2026-10", 30), month(2, "2026-11", 30), // 75% steady
    month(3, "2026-10", 40), month(3, "2026-11", 40), // 100%
  ];
  const rows = buildEnrolmentQualityRows({
    centres: [
      { centreKey: 1, name: "Brookfield Kindergarten" },
      { centreKey: 2, name: "Waihi Kindergarten" },
      { centreKey: 3, name: "Arataki Kindergarten" },
    ],
    months,
    capacities: [{ centreKey: 3, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 40, under2Capacity: null, note: null }],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  assert.deepEqual(sortEnrolmentQualityRows(rows, "latest").map((row) => row.centreKey), [2, 1, 3]);
  assert.deepEqual(sortEnrolmentQualityRows(rows, "interest").map((row) => row.centreKey), [1, 2, 3]);

  const html = renderEnrolmentQualityBody({
    rows,
    windowKey: "3M",
    sort: "latest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  assert.doesNotMatch(html, / lic</);
  assert.match(html, /data-roll-edit-capacity="3"/);
  assert.match(html, /enrolment-quality__band--low">75%</);
  assert.match(html, /enrolment-quality__band--watch">85%</);
  assert.match(html, /enrolment-quality__band--good">100%</);
  assert.match(html, /analytics-toolbar__window--active" href="\/app\?rollWindow=3M&rollSort=latest"/);
});

test("under-2 places: licence split, operating override, staffing at 1:5", () => {
  // OPEYS-like licence: 60 in total, of which up to 18 under-2.
  const summary = summariseRollMonth({
    month: "2026-07",
    licenceDays: [licence("2026-07-06", 60, { max_u2: 18, max_o2: 60 })],
    attendance: [booking(1, "2026-07-06")],
  });
  assert.equal(summary.avgLicenceU2, 18);

  // Licence only: under-2 comes from the licence.
  assert.deepEqual(resolveCapacityForMonth("2026-07", 60, [], 18), { capacity: 60, under2: 18, source: "licence" });
  // Operating capacity 60, of which 10 under-2 (the licence allows 18).
  const opeys = [{ centreKey: 1, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 60, under2Capacity: 10, note: null }];
  assert.deepEqual(resolveCapacityForMonth("2026-07", 60, opeys, 18), { capacity: 60, under2: 10, source: "operating", am: 60, pm: 60 });
  // An operating capacity without an under-2 figure keeps the licence's.
  const noSplit = [{ centreKey: 1, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 55, under2Capacity: null, note: null }];
  assert.deepEqual(resolveCapacityForMonth("2026-07", 60, noSplit, 18), { capacity: 55, under2: 18, source: "operating", am: 55, pm: 55 });

  // 4 teachers: 40 over-2s, but 10 under-2s take 2 teachers -> 10 + 2 x 10 = 30.
  const staff = { contactStaff: 4, sessional: false, avgLicence: 60 };
  assert.equal(suggestCapacityFromStaffing(staff), 40);
  assert.equal(suggestCapacityFromStaffing(staff, 10), 30);
  // Under-2 places beyond what the team can cover are limited to 5 per teacher.
  assert.equal(suggestCapacityFromStaffing(staff, 30), 20);
  // OPEYS: 9 teachers, 10 under-2 -> 10 + 7 x 10 = 80, capped at the licence.
  assert.equal(suggestCapacityFromStaffing({ contactStaff: 9, sessional: false, avgLicence: 60 }, 10), 60);

  // % full roll stays combined: placements / total, whatever the age mix.
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "OPEYS All Day Kindergarten" }],
    months: [{ ...month(1, "2026-11", 51, 60), avgLicenceU2: 18 }],
    capacities: opeys,
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  assert.equal(Math.round(rows[0]!.latestPercent!), 85);
  assert.equal(rows[0]!.licenceU2, 18);
  assert.equal(rows[0]!.currentCapacity?.under2, 10);

  const html = renderEnrolmentQualityBody({
    rows,
    windowKey: "3M",
    sort: "interest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  assert.match(html, /name="under2Capacity"[^>]*value="10"/);
  assert.match(html, /under-2 up to 18/);
  assert.match(html, /60 \(under-2 10\)/);
  assert.match(buildEnrolmentQualityGrounding(rows, "3M")!, /operating capacity, busier of am 60 \/ pm 60; licence 60, of which 10 under-2/);
});

test("am / pm places: capacity is the busier session, licence in curly brackets", () => {
  assert.equal(capacityFromAmPm(40, 30), 40);
  assert.equal(capacityFromAmPm(0, 25), 25);
  const places = [{ centreKey: 1, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 40, amCapacity: 40, pmCapacity: 30, under2Capacity: null, note: null }];
  assert.deepEqual(resolveCapacityForMonth("2026-07", 50, places), { capacity: 40, under2: null, source: "operating", am: 40, pm: 30 });

  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [month(1, "2026-11", 36, 50)],
    capacities: places,
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  // % full roll divides by the busier session: 36 / 40.
  assert.equal(Math.round(rows[0]!.latestPercent!), 90);

  const html = renderEnrolmentQualityBody({
    rows,
    windowKey: "3M",
    sort: "interest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  // The table shows the user's places (with the pencil) next to the capacity they give.
  assert.match(html, />40 \/ 30 <button[^>]*data-roll-edit-capacity="1"/);
  assert.match(html, /<\/button><\/td>\s*<td class="data-table__numeric nowrap"[^>]*>40 \{50\}<\/td>/);
  assert.match(html, /Booked am \/ pm/);
  assert.match(html, /name="amCapacity"[^>]*value="40"/);
  assert.match(html, /name="pmCapacity"[^>]*value="30"/);
  assert.match(html, /40 \/ 30/);
  assert.doesNotMatch(html, /name="capacity"/);
  assert.doesNotMatch(html, /Operating capacity/);
  // From month defaults to this month; the save date is recorded automatically.
  assert.match(html, /name="effectiveFrom" required value="2026-11"/);
  // The only figure covers the whole history: no From month shown for it.
  assert.match(html, /from the start, changed 1 Jan 2026/);
  // Removing only marks an entry; changes are sent together on Save (or put back by Cancel).
  assert.match(html, /data-roll-capacity-entry=""/);
  assert.match(html, /data-roll-capacity-remove aria-pressed="false"[^>]*title="Remove when saved"/);
  assert.match(html, /<button type="reset" class="button-sm">Cancel<\/button>/);
  const script = renderEnrolmentQualityScript();
  assert.doesNotMatch(script, /capacity\/delete/);
  assert.match(script, /removeIds: removeIds,\s*add: add,/);
  assert.match(script, /input\.value !== input\.defaultValue/);
});

test("centres without under-2 places get no under-2 field", () => {
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 2, name: "Arataki Kindergarten" }],
    months: [month(2, "2026-11", 40, 45)],
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  assert.equal(rows[0]!.licenceU2, null);
  const html = renderEnrolmentQualityBody({
    rows,
    windowKey: "3M",
    sort: "interest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  assert.doesNotMatch(html, /under2Capacity/);
});

test("Beep Beep opening summary gets one roll sentence from the panel's figures", async () => {
  const { buildRollGuidance } = await import("../src/ui/app-shell.js");
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [month(1, "2026-09", 40), month(1, "2026-10", 34), month(1, "2026-11", 30)],
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const view = {
    rows,
    windowKey: "3M" as const,
    sort: "interest" as const,
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  };
  assert.equal(
    buildRollGuidance(rows[0], view),
    "Roll: <strong>75% full</strong> in Nov-26 so far (low), of 40 licensed places; down 25% over 3M from 100%.",
  );
  assert.equal(buildRollGuidance(undefined, view), null);
});

test("urgency score: roll replaces enrolled/licence for empty places and adds a year-on-year fall", async () => {
  const { calculateUrgencyScore } = await import("../src/analytics/compute.js");
  const base = { licensedCapacity: 42, availablePlaces: 0, scopedLeavingCount: 0, actionableWaitlist: 2 };
  // No roll data: enrolled 42/42 counts as full, as before.
  assert.equal(calculateUrgencyScore(base), 0);
  // Brookfield-like: fully enrolled, but the roll is 73% (27% empty -> full 35).
  assert.equal(calculateUrgencyScore({ ...base, rollPercent: 73 }), 35);
  // Plus a 6-point fall on a year ago: 6/10 of 10.
  assert.equal(calculateUrgencyScore({ ...base, rollPercent: 73, rollYearAgoPercent: 79 }), 41);
  // A rise never scores; a full roll scores nothing for empty places.
  assert.equal(calculateUrgencyScore({ ...base, rollPercent: 100, rollYearAgoPercent: 90 }), 0);
  // Uncovered leavers (40), empty (35), falling (10) and no waitlist (15) make 100.
  assert.equal(
    calculateUrgencyScore({ licensedCapacity: 40, availablePlaces: 0, scopedLeavingCount: 10, actionableWaitlist: 0, rollPercent: 60, rollYearAgoPercent: 80 }),
    100,
  );
});

test("roll signal: newest complete month (not month to date) and the same month a year earlier", async () => {
  const { rollSignalForRow } = await import("../src/analytics/enrolment-quality.js");
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [month(1, "2025-10", 36), month(1, "2026-10", 30), month(1, "2026-11", 20)],
    capacities: [],
    windowKey: "2Y",
    currentMonth: "2026-11",
  });
  assert.deepEqual(rollSignalForRow(rows[0]!), { rollMonth: "2026-10", rollPercent: 75, rollYearAgoPercent: 90 });
});

test("All kindergartens row: totals across centres, pinned first whatever the sort", async () => {
  const { buildOrganisationRollRow } = await import("../src/analytics/enrolment-quality.js");
  const rows = buildEnrolmentQualityRows({
    centres: [
      { centreKey: 1, name: "Arataki Kindergarten" },
      { centreKey: 2, name: "Brookfield Kindergarten" },
      { centreKey: 3, name: "Thames Coast Kindergarten" },
    ],
    // Thames Coast opens in November: it adds to the latest month only.
    months: [
      month(1, "2026-09", 40), month(1, "2026-11", 36),
      month(2, "2026-09", 30), month(2, "2026-11", 28),
      month(3, "2026-11", 10, 20),
    ],
    capacities: [{ centreKey: 2, effectiveFrom: "2026-01", changedAt: "2026-01-01T00:00:00.000Z", capacity: 40, under2Capacity: null, note: null }],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const all = buildOrganisationRollRow(rows)!;
  // Sep: 70 / 80 = 87.5%. Nov: 74 / 100 = 74%. Oct has no data.
  assert.equal(all.points[0]!.percent, 87.5);
  assert.equal(all.points[1]!.percent, null);
  assert.equal(all.latestPercent, 74);
  assert.equal(all.change, -13.5);
  assert.equal(all.direction, "fall");
  assert.equal(all.latest!.avgAm, 74);
  assert.deepEqual(all.currentCapacity, { capacity: 100, under2: null, source: "operating" });
  assert.equal(all.licence, 100);

  const html = renderEnrolmentQualityBody({
    rows: sortEnrolmentQualityRows(rows, "desc"),
    organisation: all,
    windowKey: "3M",
    sort: "desc",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  const firstRow = html.match(/data-roll-row="(\d+)"/)![1];
  assert.equal(firstRow, "0");
  assert.match(html, /All kindergartens/);
  // No capacity editor for the organisation row.
  assert.doesNotMatch(html, /data-roll-edit-capacity="0"/);
  assert.match(buildEnrolmentQualityGrounding(rows, "3M")!, /- All kindergartens: latest 74%/);
});

test("am / pm boxes stay empty until the user saves some (the licence is never copied in)", () => {
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [month(1, "2026-11", 36, 45)],
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const html = renderEnrolmentQualityBody({
    rows,
    windowKey: "3M",
    sort: "interest",
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
  });
  assert.match(html, />- <button[^>]*data-roll-edit-capacity="1"/);
  assert.match(html, />45 \{45\}<\/td>/);
  // First figure: no From month to choose, it covers the whole history.
  assert.match(html, /<input type="hidden" name="effectiveFrom" value="2000-01" \/>/);
  assert.doesNotMatch(html, /From month/);
  assert.match(html, /name="amCapacity"[^>]*value=""/);
  assert.match(html, /name="pmCapacity"[^>]*value=""/);
});

test("Infocare Analytics snapshots use the Enrolment Quality capacity for their month", () => {
  const snapshot = {
    date: "2026-10-05",
    enrolledCount: 40,
    bookedAverageDailyCount: 30,
    licensedCapacity: 45,
    licensedUnder2Capacity: null,
    licensedOver2Capacity: 45,
    enrolmentRatio: 40 / 45,
    bookedUtilisationRatio: 30 / 45,
  };
  const entry = (effectiveFrom: string, capacity: number, under2Capacity: number | null = null) => ({
    centreKey: 1, effectiveFrom, changedAt: "2026-11-01T00:00:00.000Z", capacity, under2Capacity, note: null,
  });

  // No figures: the Infocare licence stays.
  assert.deepEqual(withOperatingCapacity(snapshot, []), snapshot);

  const applied = withOperatingCapacity(snapshot, [entry("2000-01", 40), entry("2026-11", 35)]);
  assert.equal(applied.licensedCapacity, 40); // October: the November rise does not apply yet
  assert.equal(applied.licensedOver2Capacity, 40);
  assert.equal(applied.enrolmentRatio, 1);
  assert.equal(applied.bookedUtilisationRatio, 0.75);

  const november = withOperatingCapacity({ ...snapshot, date: "2026-11-09" }, [entry("2000-01", 40), entry("2026-11", 35, 5)]);
  assert.equal(november.licensedCapacity, 35);
  assert.equal(november.licensedUnder2Capacity, 5);
  assert.equal(november.licensedOver2Capacity, 30);

  // No bookings: utilisation stays "not known" (0).
  assert.equal(withOperatingCapacity({ ...snapshot, bookedAverageDailyCount: 0, bookedUtilisationRatio: 0 }, [entry("2000-01", 40)]).bookedUtilisationRatio, 0);
});
