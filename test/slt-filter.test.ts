import assert from "node:assert/strict";
import test from "node:test";

import { buildEnrolmentQualityRows } from "../src/analytics/enrolment-quality.js";
import { filterBySlt, listSltNames, resolveSlt, sltTotalName } from "../src/analytics/slt-filter.js";
import type { ServiceAnalyticsSnapshot } from "../src/infocare/models.js";
import type { LatestSnapshotSet } from "../src/storage/analytics-store.js";
import type { CentreContact } from "../src/storage/centre-contact-store.js";
import { analyticsPdfFilename } from "../src/ui/analytics-pdf.js";
import { renderAppShell } from "../src/ui/app-shell.js";
import { enrolmentQualityPdfFilename } from "../src/ui/enrolment-quality-pdf.js";
import { renderEnrolmentQualityBody, renderEnrolmentQualityHeaderActions } from "../src/ui/enrolment-quality-panel.js";

const contact = (kindergarten: string, keySeniorTeacher: string): CentreContact => ({
  kindergarten,
  headTeacher: "Head",
  administrator: "Admin",
  keySeniorTeacher,
  email: `${kindergarten.toLowerCase()}@example.test`,
});

const contacts = [
  contact("Brookfield", "Marion Dekker"),
  contact("Arataki", "Vilna"),
  contact("Waihi", "Haylee/Vilna"),
  contact("Paeroa", "Marion"),
];

const windowCounts = (value: number) => ({ "1W": value, "2W": value, "3W": value, "1M": value, "2M": value, "3M": value, "6M": value, "12M": value });

function snapshot(centreKey: number, serviceName: string): ServiceAnalyticsSnapshot {
  return {
    centreKey,
    serviceName,
    date: "2026-05-12",
    enrolledCount: 20,
    enrolledFteCount: 10,
    bookedAverageDailyCount: 18,
    bookedUtilisationRatio: 0.45,
    enrolledUnder2Count: 0,
    enrolledOver2Count: 20,
    licensedCapacity: 40,
    licensedUnder2Capacity: null,
    licensedOver2Capacity: 40,
    enrolmentRatio: 0.5,
    waitlistCount: 0,
    waitlistUnder2Count: 0,
    waitlistUnder5Count: 0,
    waitlistTurning5ThisYearCount: 0,
    waitlistAged5PlusCount: 0,
    waitlistUnknownAgeCount: 0,
    waitlistOldestEntryDays: null,
    waitlistAverageEntryDays: null,
    knownLeavingCount: 0,
    knownLeavingCountsByWindow: windowCounts(0),
    agedOutCount: 0,
    approachingFiveCount: 0,
    approachingFiveCountsByWindow: windowCounts(0),
    replacementPressure: 0,
    waitlistCoverRatio: 0,
    urgencyScore: 0,
    urgencyBand: "Stable",
  };
}

test("SLT names come from the contact list by first name; a shared centre belongs to both", () => {
  assert.deepEqual(listSltNames(contacts), ["Haylee", "Marion", "Vilna"]);
  assert.equal(resolveSlt("marion", contacts), "Marion");
  assert.equal(resolveSlt("Nobody", contacts), null);
  assert.equal(resolveSlt("", contacts), null);

  const centres = ["Brookfield Kindergarten", "Arataki Kindergarten", "Waihi Kindergarten", "Paeroa Kindergarten", "Unlisted Kindergarten"];
  const name = (value: string) => value;
  assert.deepEqual(filterBySlt(centres, name, "Marion", contacts), ["Brookfield Kindergarten", "Paeroa Kindergarten"]);
  assert.deepEqual(filterBySlt(centres, name, "Vilna", contacts), ["Arataki Kindergarten", "Waihi Kindergarten"]);
  assert.deepEqual(filterBySlt(centres, name, "Haylee", contacts), ["Waihi Kindergarten"]);
  assert.deepEqual(filterBySlt(centres, name, null, contacts), centres);
  assert.equal(sltTotalName("Marion"), "Marion's kindergartens");
});

test("Infocare Analytics: filters sit in the body below the title, with an SLT filter", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-12T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-12T00:00:00.000Z",
    snapshots: [snapshot(1, "Brookfield Kindergarten"), snapshot(2, "Arataki Kindergarten"), snapshot(3, "Waihi Kindergarten")],
  };

  const all = renderAppShell(snapshotSet, { centreContacts: contacts, selectedCentreKey: 1 });
  // The filter row is in the panel body (inside the table shell), not the header.
  const header = all.slice(all.indexOf('data-panel-id="analytics"'), all.indexOf("analytics-table-shell"));
  assert.doesNotMatch(header, /analytics-toolbar/);
  assert.match(all, /analytics-table-shell[^>]*>\s*<div class="analytics-toolbar">/);
  assert.match(all, /analytics-toolbar__window analytics-toolbar__window--active" href="\/app\?centre=1&amp;window=3M" aria-current="true">All SLT</);
  // Choosing an SLT drops the selected centre.
  assert.match(all, /href="\/app\?window=3M&amp;slt=Marion">Marion</);
  assert.match(all, /data-row-href="\/app\?centre=2&amp;window=3M"/);

  const marion = renderAppShell(snapshotSet, { centreContacts: contacts, selectedCentreKey: 1, slt: "marion", serviceSort: "asc" });
  assert.match(marion, /analytics-toolbar__window--active" href="\/app\?window=3M&amp;sort=asc&amp;slt=Marion" aria-current="true">Marion</);
  assert.match(marion, /data-row-href="\/app\?centre=1&amp;window=3M&amp;sort=asc&amp;slt=Marion"/);
  assert.doesNotMatch(marion, /data-row-href="\/app\?centre=2/);
  assert.doesNotMatch(marion, /data-row-href="\/app\?centre=3/);
  // Window, sort and the PDF keep the SLT.
  assert.match(marion, /href="\/app\?centre=1&amp;window=6M&amp;sort=asc&amp;slt=Marion">6M</);
  assert.match(marion, /href="\/api\/analytics\/pdf\?window=3M&amp;sort=asc&amp;slt=Marion" download/);

  // No contact list: no SLT filter, every centre listed.
  const none = renderAppShell(snapshotSet, { slt: "Marion" });
  assert.doesNotMatch(none, /data-slt-filter/);
  assert.match(none, /data-row-href="\/app\?centre=2&amp;window=3M"/);
});

test("Enrolment Quality: SLT filter links carry the whole view", () => {
  const rows = buildEnrolmentQualityRows({
    centres: [{ centreKey: 1, name: "Brookfield Kindergarten" }],
    months: [],
    capacities: [],
    windowKey: "3M",
    currentMonth: "2026-11",
  });
  const view = {
    rows,
    windowKey: "3M" as const,
    sort: "latest" as const,
    currentMonth: "2026-11",
    progress: { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null },
    slt: "Marion",
    sltOptions: ["Haylee", "Marion", "Vilna"],
  };
  const html = renderEnrolmentQualityBody(view);
  assert.match(html, /data-roll-slt="Marion"/);
  assert.match(html, /analytics-toolbar__window--active" href="\/app\?rollWindow=3M&rollSort=latest&rollSlt=Marion" data-roll-query="rollWindow=3M&rollSort=latest&rollSlt=Marion" aria-current="true">Marion</);
  assert.match(html, /data-roll-query="rollWindow=3M&rollSort=latest">All SLT</);
  assert.match(html, /data-roll-query="rollWindow=6M&rollSort=latest&rollSlt=Marion"/);
  assert.match(renderEnrolmentQualityHeaderActions(view), /\/api\/enrolment-quality\/pdf\?rollWindow=3M&amp;rollSort=latest&amp;rollSlt=Marion"/);

  // The download is named after the SLT.
  const now = new Date("2026-11-13T00:00:00.000Z");
  assert.equal(enrolmentQualityPdfFilename(view, now), "Enrolment-Quality-3M-Marion-2026-11-13.pdf");
  assert.equal(enrolmentQualityPdfFilename({ ...view, slt: null }, now), "Enrolment-Quality-3M-2026-11-13.pdf");
  assert.equal(analyticsPdfFilename("6M", now, "Vilna"), "Infocare-Analytics-6M-Vilna-2026-11-13.pdf");
  assert.equal(analyticsPdfFilename("6M", now), "Infocare-Analytics-6M-2026-11-13.pdf");

  const unfiltered = renderEnrolmentQualityBody({ ...view, slt: null });
  assert.doesNotMatch(unfiltered, /data-roll-slt=/);
  assert.match(unfiltered, /analytics-toolbar__window--active" href="\/app\?rollWindow=3M&rollSort=latest" data-roll-query="rollWindow=3M&rollSort=latest" aria-current="true">All SLT</);
});
