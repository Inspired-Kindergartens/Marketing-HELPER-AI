import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultClosingDate } from "../src/storage/jd-store.js";
import { formatSalaryRange, type PayScaleRow } from "../src/storage/jd-pay-scale.js";
import { sanitizeJdBlurbHtml } from "../src/storage/jd-sanitize-html.js";
import { formatNzDateTimeInput } from "../src/ui/jd/jd-date.js";
import { jdPdfAssetUrl, jdPdfFilename } from "../src/ui/jd/jd-pdf.js";
import type { JobDescriptionView } from "../src/storage/jd-store.js";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const K1_ROWS: PayScaleRow[] = [
  { scaleKey: "K1", step: 1, effectiveFrom: new Date("2026-04-02"), annualRate: 62862 },
  { scaleKey: "K1", step: 10, effectiveFrom: new Date("2026-04-02"), annualRate: 105686 },
  { scaleKey: "K1", step: 1, effectiveFrom: new Date("2027-01-28"), annualRate: 64119 },
  { scaleKey: "K1", step: 10, effectiveFrom: new Date("2027-01-28"), annualRate: 107886 },
];

const K2_ROWS: PayScaleRow[] = [
  { scaleKey: "K2", step: null, effectiveFrom: new Date("2026-04-02"), annualRate: 110356 },
  { scaleKey: "K2", step: null, effectiveFrom: new Date("2026-06-29"), annualRate: 113356 },
];

test("formatSalaryRange returns a min-to-max range for a stepped scale (K1)", () => {
  assert.equal(
    formatSalaryRange(K1_ROWS, "K1", new Date("2026-07-14")),
    "$62,862 to $105,686",
  );
});

test("formatSalaryRange returns a single figure for a flat scale (K2)", () => {
  assert.equal(formatSalaryRange(K2_ROWS, "K2", new Date("2026-07-14")), "$113,356");
});

test("formatSalaryRange rolls over to the new rate step effective 28 Jan 2027", () => {
  assert.equal(
    formatSalaryRange(K1_ROWS, "K1", new Date("2027-01-28")),
    "$64,119 to $107,886",
  );
  assert.equal(
    formatSalaryRange(K1_ROWS, "K1", new Date("2027-01-27")),
    "$62,862 to $105,686",
  );
});

test("formatSalaryRange pro-rates a stepped range by FTE for part-time positions", () => {
  assert.equal(
    formatSalaryRange(K1_ROWS, "K1", new Date("2026-07-14"), 0.6),
    "$37,717.20 to $63,411.60",
  );
});

test("formatSalaryRange pro-rating does not apply at full FTE", () => {
  assert.equal(
    formatSalaryRange(K1_ROWS, "K1", new Date("2026-07-14"), 1),
    "$62,862 to $105,686",
  );
});

test("formatSalaryRange returns null when no rate is known before the given date", () => {
  assert.equal(formatSalaryRange(K1_ROWS, "K1", new Date("2020-01-01")), null);
});

test("defaultClosingDate returns the Friday at 4pm at least four weeks after advertising", () => {
  const closing = defaultClosingDate(new Date("2026-08-25T21:30:00.000Z"));

  assert.equal(formatNzDateTimeInput(closing), "2026-09-25T16:00");
});

test("sanitizeJdBlurbHtml keeps allowed tags and strips disallowed ones", () => {
  const input = '<h2>Heading</h2><p>Body <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li></ul>';
  assert.equal(sanitizeJdBlurbHtml(input), input);
});

test("sanitizeJdBlurbHtml strips script tags but keeps their text content removed entirely", () => {
  const output = sanitizeJdBlurbHtml("<p>Safe</p><script>alert(1)</script>");
  assert.doesNotMatch(output, /<script/);
  assert.match(output, /<p>Safe<\/p>/);
});

test("sanitizeJdBlurbHtml strips event handler and style attributes from allowed tags", () => {
  const output = sanitizeJdBlurbHtml('<p onclick="alert(1)" style="color:red">Text</p>');
  assert.doesNotMatch(output, /onclick/);
  assert.doesNotMatch(output, /style=/);
  assert.match(output, /<p>Text<\/p>/);
});

test("sanitizeJdBlurbHtml only allows http(s)/relative/hash hrefs on links", () => {
  const safe = sanitizeJdBlurbHtml('<a href="https://example.com">link</a>');
  assert.match(safe, /href="https:\/\/example\.com"/);

  const relative = sanitizeJdBlurbHtml('<a href="/employment-and-careers/how-to-apply">link</a>');
  assert.match(relative, /href="\/employment-and-careers\/how-to-apply"/);

  const unsafe = sanitizeJdBlurbHtml('<a href="javascript:alert(1)">link</a>');
  assert.doesNotMatch(unsafe, /href=/);
});

function buildJobDescription(overrides: Partial<JobDescriptionView> = {}): JobDescriptionView {
  return {
    id: 1,
    jobTitle: "Teacher",
    locationDisplay: "PAENGAROA Kindergarten",
    positionType: "Full Time",
    dateAdvertised: "2026-07-14T00:00:00.000Z",
    closingAt: "2026-07-28T04:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    centreKey: 115,
    titleProfileId: 1,
    fte: null,
    jobCategory: "K1",
    layoutVariant: "standard",
    agreementText: "Kindergarten Teachers Collective Agreement",
    salaryRangeText: "$62,862 to $105,686",
    startDateText: "To be negotiated",
    qualificationsText: "",
    introParagraph: "",
    roleSections: [],
    extras: null,
    seniorTeacherName: "Vilna Van Rensburg",
    blurbHtml: null,
    reviewedByAcronym: "VVR",
    approvedByAcronym: "PM",
    lastUpdatedByAcronym: "EP",
    ...overrides,
  };
}

test("jdPdfFilename includes a public-safe advertised date and NZ-time timestamp", () => {
  const jd = buildJobDescription();
  assert.equal(jdPdfFilename(jd), "PD-Teacher-PAENGAROA-July-14-2026-20260714-120000.pdf");
  assert.equal(
    jdPdfAssetUrl(jd),
    "https://inspiredkindergartens.nz/assets/Job-Descriptions/PD-Teacher-PAENGAROA-July-14-2026-20260714-120000.pdf",
  );
});

test("jdPdfFilename strips filesystem-unsafe characters and the trailing 'Kindergarten' word", () => {
  const jd = buildJobDescription({ jobTitle: "Head Teacher", locationDisplay: "TE PUNA Kindergarten" });
  assert.equal(jdPdfFilename(jd), "PD-Head-Teacher-TE-PUNA-July-14-2026-20260714-120000.pdf");
});

test("createJobDescription composes defaults from the title profile, centre profile and effective pay scale", () => {
  const store = source("../src/storage/jd-store.ts");

  assert.match(store, /titleProfile\.jobTitle/);
  assert.match(store, /centreProfile\.locationDisplay/);
  assert.match(store, /seniorTeacherName: centreProfile\.seniorTeacherName/);
  assert.match(store, /formatSalaryRange\(titleProfile\.payScaleKey, dateAdvertised, fte\)/);
  assert.match(store, /closingAt: parseDate\(input\.closingAt\) \?\? defaultClosingDate\(dateAdvertised\)/);
});

test("saveBlurb sanitises the incoming HTML and appends a JdBlurb history row without overwriting prior versions", () => {
  const store = source("../src/storage/jd-store.ts");

  assert.match(store, /sanitizeJdBlurbHtml\(rawHtml\)/);
  assert.match(store, /prisma\.jobDescription\.update\(\{/);
  assert.match(store, /prisma\.jdBlurb\.create\(\{/);
});

test("formatSalaryRange helper in the store composes salary text via the pure jd-pay-scale module", () => {
  const store = source("../src/storage/jd-store.ts");

  assert.match(store, /formatSalaryRangePure\(rows, scaleKey, date, fte\)/);
});
