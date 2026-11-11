import assert from "node:assert/strict";
import test from "node:test";

import {
  centreOpenedLabel,
  mergeOpening,
  NO_OPENING,
  openedLabel,
  readEroOpening,
  recentLicenceThreshold,
  reportPdfUrl,
  type EroOpening,
} from "../src/sector/ero.js";

// ERO institution pages, cut down to the parts the reader uses. The wording is
// from real 2021-2026 reports.
const NOW = new Date("2026-11-11T00:00:00Z");

function page(body: string): string {
  return `<html><body><nav>Home Review Reports</nav><div>Education institution number: 47560 School type: Free Kindergarten Total roll: 32</div>${body}<p>Print</p><footer>Page updated: 12:21AM 28 September 2026</footer></body></html>`;
}

test("a report that says when the service opened is read as stated", () => {
  const html = page(
    "<h2>Otamarakau Kindergarten - June 2021</h2><p>Background Otamarakau Kindergarten was established in August 2018 with connections to Otamarakau School.</p>" +
      "<p>Date of this report 10 June 2021</p><p>Most recent ERO report(s) First ERO review of the service</p>",
  );
  const opening = readEroOpening(html, true, "Otamarakau Kindergarten", NOW);
  assert.equal(opening.basis, "stated");
  assert.equal(opening.year, 2018);
  assert.equal(opening.month, 8);
  assert.equal(openedLabel(opening), "Aug 2018");
});

test("'the service', 'which opened' and a year without a month all count; a building or team opening does not", () => {
  const html = page(
    "<h2>Te Rua Kopere - September 2025</h2><p>The new nursery building opened in 2024.</p><p>The teaching team was established in 2022.</p>" +
      "<p>This is the first ERO review of the service which opened in January 2023.</p>",
  );
  const opening = readEroOpening(html, true, "Te Rua Kopere Whare Kohungahunga", NOW);
  assert.deepEqual([opening.basis, opening.year, opening.month], ["stated", 2023, 1]);

  const yearOnly = readEroOpening(page("<h2>Little Parrots - June 2026</h2>"), true, "Little Parrots", NOW, "3 About the Service Little Parrots opened in 2024 and is one of two services under the same ownership.");
  assert.equal(openedLabel(yearOnly), "2024", "the report PDF's text is read too");

  const building = readEroOpening(page("<h2>Sunny Days - May 2024</h2><p>The service's new infant room opened in 2023.</p>"), true, "Sunny Days", NOW);
  assert.notEqual(building.basis, "stated");
  const relicensed = readEroOpening(page("<h2>Sunny Days - May 2024</h2><p>The centre was re-licensed in 2023 after a change of owner.</p>"), true, "Sunny Days", NOW);
  assert.notEqual(relicensed.basis, "stated");
});

test("a stated year later than an older ERO report is ignored: the report dates win", () => {
  const html = page(
    "<h2>Busy Kids - May 2025</h2><p>Busy Kids opened in 2021 at its new site.</p><p>Most recent ERO report(s) Education Review, August 2015</p><p>On this page</p>",
  );
  const opening = readEroOpening(html, true, "Busy Kids", NOW);
  assert.deepEqual([opening.basis, opening.year], ["earliest-review", 2015]);
  assert.equal(openedLabel(opening), "2015 or earlier");
});

test("a first ERO review gives an approximate year; old and new wording", () => {
  const old = readEroOpening(page("<h2>Tai O Fenua Kindergarten - July 2022</h2><p>This is its first ERO review.</p><p>Date of this report 25 July 2022</p>"), true, "Tai O Fenua Kindergarten", NOW);
  assert.deepEqual([old.basis, old.year, old.month, openedLabel(old)], ["first-review", 2022, 7, "c. 2022"]);
  const fresh = readEroOpening(page("<h2>Future Focus - August 2025</h2>"), true, "Future Focus", NOW, "Most recent ERO report (s) These are available at www.ero.govt.nz First ERO report of the service");
  assert.equal(fresh.basis, "first-review");
});

test("otherwise the earliest report the page mentions, including the Past Reports list and 'the 2018 ERO report'", () => {
  const html = page(
    "<h2>New Shoots - Tauranga - June 2024</h2><p>Most recent ERO report(s) Akanuku | Assurance Review, June 2021; Education Review, August 2015</p>" +
      "<p>Past Reports New Shoots - Tauranga July 2021 View this report</p>",
  );
  assert.deepEqual(readEroOpening(html, true, "New Shoots - Tauranga", NOW), { basis: "earliest-review", year: 2015, month: 8, evidence: "Earliest ERO report, August 2015" });
  const yearOnly = readEroOpening(page("<h2>Kowhai - December 2023</h2><p>The kindergarten has made progress since the 2018 ERO report.</p>"), true, "Kowhai", NOW);
  assert.deepEqual([yearOnly.year, yearOnly.evidence], [2018, "Earliest ERO report, 2018"]);
});

test("no ERO page means no review yet; a governing organisation's page says nothing about the centre", () => {
  const none = readEroOpening("", false, "Brookfield Montessori", NOW);
  assert.equal(none.basis, "no-review");
  assert.equal(openedLabel(none), "Recent");
  const group = page("<p>Best Start Educare Limited September 2025 This service is part of a larger group of early childhood services operated by one organisation.</p>");
  assert.deepEqual(readEroOpening(group, true, "BestStart Hillcrest", NOW), NO_OPENING);
});

test("readings merge: better evidence is kept when ERO publishes a newer report, an older report always wins", () => {
  const stated: EroOpening = { basis: "stated", year: 2018, month: 8, evidence: "x" };
  const first: EroOpening = { basis: "first-review", year: 2022, month: 7, evidence: "x" };
  const earliest = (year: number): EroOpening => ({ basis: "earliest-review", year, month: 1, evidence: "x" });
  const recent: EroOpening = { basis: "no-review", year: null, month: null, evidence: "x" };

  assert.equal(mergeOpening(first, earliest(2025)), first, "the next report no longer says 'first', but the first review stays");
  assert.equal(mergeOpening(stated, NO_OPENING), stated);
  assert.equal(mergeOpening(recent, first), first, "a centre with no review gets its first");
  assert.deepEqual(mergeOpening(earliest(2021), earliest(2018)).year, 2018);
  assert.deepEqual(mergeOpening(earliest(2018), earliest(2021)).year, 2018);
  assert.deepEqual(mergeOpening(first, earliest(2015)).year, 2015, "an older report means it was not really the first");
  assert.equal(centreOpenedLabel({ openedBasis: "", openedYear: null, openedMonth: null }), "");
});

test("no ERO page only means 'recent' from the lowest licence number ERO dates to the last three years", () => {
  const centres = [
    { eceId: 47905, openedBasis: "first-review", openedYear: 2022 }, // too long ago to set the line
    { eceId: 48160, openedBasis: "stated", openedYear: 2023 },
    { eceId: 47925, openedBasis: "first-review", openedYear: 2025 },
    { eceId: 46364, openedBasis: "earliest-review", openedYear: 2025 }, // a bound, not a date
    { eceId: 5207, openedBasis: "no-review", openedYear: null },
  ];
  assert.equal(recentLicenceThreshold(centres, NOW), 47925);
  assert.equal(recentLicenceThreshold([{ eceId: 5207, openedBasis: "no-review", openedYear: null }], NOW), null);
});

test("the report PDF is the page's own report, not ERO's guidance documents", () => {
  const html = page(
    '<a href="https://ero.govt.nz/sites/default/files/media-documents/2024-07/Improvement%20Framework%20%28teacher-led%20services%29.pdf">Framework</a>' +
      '<a href="/sites/default/files/media-documents/2025-09/Click%20here%20to%20view%20report_4.pdf">Report</a>',
  );
  assert.equal(reportPdfUrl(html), "https://www.ero.govt.nz/sites/default/files/media-documents/2025-09/Click%20here%20to%20view%20report_4.pdf");
  assert.equal(reportPdfUrl(page('<a href="https://evil.example/report.pdf">x</a>')), null, "only ERO's own site");
});
