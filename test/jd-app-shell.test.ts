import assert from "node:assert/strict";
import test from "node:test";

import { renderJdAppShell, resolveJdFocusPanelId, VALID_JD_PANEL_IDS } from "../src/ui/jd-app-shell.js";
import { renderJdListPanel } from "../src/ui/jd/jd-list-panel.js";
import { renderJdEditorPanel } from "../src/ui/jd/jd-editor-panel.js";
import { renderJdBlurbPanel } from "../src/ui/jd/jd-blurb-panel.js";
import { buildImmovableBoilerplateHtml } from "../src/ai/jd-context.js";
import { jdPdfAssetUrl } from "../src/ui/jd/jd-pdf.js";
import { readFileSync } from "node:fs";
import type { JobDescriptionView, JdTitleProfileView, JdCentreProfileView } from "../src/storage/jd-store.js";

function buildTitleProfile(overrides: Partial<JdTitleProfileView> = {}): JdTitleProfileView {
  return {
    id: 1,
    jobTitle: "Teacher",
    sortOrder: 1,
    jobCategory: "K1",
    payScaleKey: "K1",
    layoutVariant: "standard",
    defaultPositionType: "Full Time",
    agreementText: "Kindergarten Teachers Collective Agreement",
    qualificationsText: "A Diploma of Teaching ECE (or equivalent) is a minimum.",
    roleSections: [],
    extras: null,
    ...overrides,
  };
}

function buildCentreProfile(overrides: Partial<JdCentreProfileView> = {}): JdCentreProfileView {
  return {
    centreKey: 115,
    centreName: "Paengaroa  Kindergarten",
    locationDisplay: "PAENGAROA Kindergarten",
    introParagraph: "",
    seniorTeacherName: "Vilna Van Rensburg",
    seniorTeacherAcronym: "VVR",
    ...overrides,
  };
}

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
    qualificationsText: "A Diploma of Teaching ECE (or equivalent) is a minimum.",
    introParagraph: "",
    roleSections: [{ heading: "FUNDAMENTALS", bullets: [{ text: "Embody Inspired Kindergarten values" }] }],
    extras: null,
    seniorTeacherName: "Vilna Van Rensburg",
    blurbHtml: null,
    reviewedByAcronym: "VVR",
    approvedByAcronym: "PM",
    lastUpdatedByAcronym: "EP",
    ...overrides,
  };
}

test("resolveJdFocusPanelId only accepts known JD panel ids", () => {
  assert.equal(resolveJdFocusPanelId("jd-editor"), "jd-editor");
  assert.equal(resolveJdFocusPanelId("jd-blurb"), "jd-blurb");
  assert.equal(resolveJdFocusPanelId("bogus"), null);
  assert.equal(resolveJdFocusPanelId(undefined), null);
  assert.deepEqual(
    [...VALID_JD_PANEL_IDS].sort(),
    ["jd-blurb", "jd-editor", "jd-list", "jd-settings"].sort(),
  );
});

test("JD list panel renders the Job Title dropdown in the specified order: Teacher, Head Teacher, Administrator, Part-time Teacher", () => {
  const html = renderJdListPanel({
    jobDescriptions: [],
    titleProfiles: [
      buildTitleProfile({ id: 1, jobTitle: "Teacher", sortOrder: 1 }),
      buildTitleProfile({ id: 2, jobTitle: "Head Teacher", sortOrder: 2 }),
      buildTitleProfile({ id: 3, jobTitle: "Administrator", sortOrder: 3 }),
      buildTitleProfile({ id: 4, jobTitle: "Part-time Teacher", sortOrder: 4 }),
    ],
    centreProfiles: [buildCentreProfile()],
  });

  const teacherIndex = html.indexOf(">Teacher<");
  const headTeacherIndex = html.indexOf(">Head Teacher<");
  const administratorIndex = html.indexOf(">Administrator<");
  const partTimeIndex = html.indexOf(">Part-time Teacher<");

  assert.ok(teacherIndex < headTeacherIndex);
  assert.ok(headTeacherIndex < administratorIndex);
  assert.ok(administratorIndex < partTimeIndex);
});

test("JD list panel's create form posts job title profile id and centre key", () => {
  const html = renderJdListPanel({
    jobDescriptions: [],
    titleProfiles: [buildTitleProfile()],
    centreProfiles: [buildCentreProfile()],
  });

  assert.match(html, /data-jd-create/);
  assert.match(html, /name="jobTitleProfileId"/);
  assert.match(html, /name="centreKey"/);
  assert.match(html, /<option value="115">PAENGAROA Kindergarten<\/option>/);
});

test("JD list panel shows PDF, duplicate, and delete actions per row", () => {
  const html = renderJdListPanel({
    jobDescriptions: [{
      id: 9,
      jobTitle: "Teacher",
      locationDisplay: "PAENGAROA Kindergarten",
      positionType: "Full Time",
      dateAdvertised: "2026-07-14T00:00:00.000Z",
      closingAt: "2026-07-28T04:00:00.000Z",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    }],
    titleProfiles: [],
    centreProfiles: [],
  });

  assert.match(html, /data-jd-action="pdf" data-jd-id="9"/);
  assert.match(html, /data-jd-action="duplicate" data-jd-id="9"/);
  assert.match(html, /data-jd-action="delete" data-jd-id="9"/);
});

test("JD editor panel renders the standard layout's full field table for a Teacher JD", () => {
  const html = renderJdEditorPanel({
    jobDescription: buildJobDescription(),
    titleProfiles: [buildTitleProfile()],
    centreProfiles: [buildCentreProfile()],
  });

  assert.match(html, /name="jobCategory"/);
  assert.match(html, /name="agreementText"/);
  assert.match(html, /name="dateAdvertised"/);
  assert.match(html, /name="salaryRangeText"/);
  assert.match(html, /name="closingAt"/);
  assert.match(html, /name="seniorTeacherName"/);
  assert.doesNotMatch(html, /name="titleProfileId"/);
  assert.doesNotMatch(html, /name="centreKey"/);
  assert.doesNotMatch(html, /name="layoutVariant"/);
  assert.doesNotMatch(html, /extras\[positionHours\]/);
});

test("JD editor panel keeps only the JD field-table controls visible", () => {
  const html = renderJdEditorPanel({
    jobDescription: buildJobDescription({
      layoutVariant: "administrator",
      jobTitle: "Administrator",
      jobCategory: "Administration",
      extras: { positionHours: "12 Hours (as per Employment Agreement)", reportsTo: "Head Teacher" },
    }),
    titleProfiles: [],
    centreProfiles: [],
  });

  assert.match(html, /name="agreementText"/);
  assert.match(html, /name="salaryRangeText"/);
  assert.match(html, /name="seniorTeacherName"/);
  assert.doesNotMatch(html, /extras\[positionHours\]/);
  assert.doesNotMatch(html, /extras\[reportsTo\]/);
  assert.doesNotMatch(html, /name="layoutVariant"/);
});

test("JD editor panel exposes role add/remove controls without profile or extras fields", () => {
  const html = renderJdEditorPanel({
    jobDescription: buildJobDescription(),
    titleProfiles: [buildTitleProfile()],
    centreProfiles: [buildCentreProfile()],
  });

  assert.doesNotMatch(html, /name="titleProfileId"/);
  assert.doesNotMatch(html, /name="centreKey"/);
  assert.doesNotMatch(html, /extras\[remunerationText\]/);
  assert.doesNotMatch(html, /extras\[contractManagerName\]/);
  assert.doesNotMatch(html, /extras\[subjectLine\]/);
  assert.doesNotMatch(html, /Bold lead-in/);
  assert.doesNotMatch(html, /jd-editor__bullet-lead/);
  assert.doesNotMatch(html, /boldLeadIn/);
  assert.match(html, /data-jd-add-role-section/);
  assert.match(html, /data-jd-add-role-bullet/);
  assert.match(html, /data-jd-remove-role-section/);
  assert.match(html, /data-jd-remove-role-bullet/);
});

test("JD editor panel shows the Download PDF and Save buttons", () => {
  const html = renderJdEditorPanel({
    jobDescription: buildJobDescription(),
    titleProfiles: [],
    centreProfiles: [],
  });

  assert.match(html, /data-jd-action="pdf" data-jd-id="1"/);
  assert.match(html, /jd-editor__save/);
  assert.match(html, /data-jd-edit data-jd-id="1"/);
});

test("JD editor date fields are text-editable with native picker buttons", () => {
  const html = renderJdAppShell({
    focusPanelId: "jd-editor",
    list: { jobDescriptions: [], titleProfiles: [], centreProfiles: [] },
    editor: { jobDescription: buildJobDescription(), titleProfiles: [], centreProfiles: [] },
    blurb: { jobDescription: buildJobDescription(), boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  });
  const css = readFileSync("src/ui/app.css", "utf8");

  assert.match(html, /<input type="text" name="dateAdvertised"[^>]*data-jd-date-text/);
  assert.match(html, /<input type="text" name="closingAt"[^>]*data-jd-date-text/);
  assert.match(html, /<input type="date" class="jd-editor__date-picker"[^>]*data-jd-date-picker/);
  assert.match(html, /<input type="datetime-local" class="jd-editor__date-picker"[^>]*data-jd-date-picker/);
  assert.match(html, /data-jd-open-date-picker/);
  assert.match(html, /syncDatePickerValue/);
  assert.doesNotMatch(html, /Bold lead-in/);
  assert.doesNotMatch(html, /jd-editor__bullet-lead/);
  assert.doesNotMatch(html, /boldLeadIn/);
  assert.match(css, /\.jd-editor__date-combo/);
  assert.match(css, /pointer-events: auto/);
  assert.match(css, /user-select: text/);
  assert.match(css, /color-scheme: dark/);
});

test("JD blurb panel renders the WYSIWYG toolbar (headings, bold, italic, bullets, link) and copy/generate buttons", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Boilerplate</p>",
    versions: [],
  });

  assert.match(html, /data-blurb-cmd="formatBlock" data-blurb-value="H1"/);
  assert.match(html, /data-blurb-cmd="formatBlock" data-blurb-value="H2"/);
  assert.match(html, /data-blurb-cmd="formatBlock" data-blurb-value="H3"/);
  assert.match(html, /data-blurb-cmd="bold"/);
  assert.match(html, /data-blurb-cmd="italic"/);
  assert.match(html, /data-blurb-cmd="insertUnorderedList"/);
  assert.match(html, /data-blurb-cmd="createLink"/);
  assert.match(html, /data-blurb-generate/);
  assert.match(html, /data-blurb-copy/);
});

test("JD blurb panel renders the boilerplate as a locked block separate from the editable editor", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Start Date: To be negotiated</p>",
    versions: [],
  });

  assert.match(html, /data-blurb-editor contenteditable="true"/);
  assert.match(html, /data-blurb-boilerplate[^>]*>\s*<p>Start Date: To be negotiated<\/p>/);
});

test("JD blurb boilerplate applies fixed bold and italic emphasis", () => {
  const jd = buildJobDescription();
  const html = buildImmovableBoilerplateHtml(jd, jdPdfAssetUrl(jd));

  assert.match(
    html,
    /<p><em>The terms and conditions of the Kindergarten Teachers Collective Agreement will apply\./,
  );
  assert.match(
    html,
    /href="https:\/\/inspiredkindergartens\.nz\/assets\/Job-Descriptions\/PD-Teacher-PAENGAROA-July-14-2026-20260714-120000\.pdf"/,
  );
  assert.match(
    html,
    /href="https:\/\/inspiredkindergartens\.nz\/employment-and-careers\/how-to-apply\/how-to-apply-kindergarten"/,
  );
  assert.match(html, /<p><strong>Start Date: To be negotiated<\/strong><\/p>/);
  assert.match(html, /<p><strong>Closing Date: 28\/07\/2026 at 4pm<\/strong><\/p>/);
  assert.match(
    html,
    /<p><strong><em>Be at the cutting edge &ndash; come work for Inspired Kindergartens<\/em><\/strong><\/p>/,
  );
});

test("JD blurb editor resizes to fit typed and generated content", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Boilerplate</p>",
    versions: [],
  });

  assert.match(html, /function resizeEditor\(\)/);
  assert.match(html, /editor\.style\.height = "auto"/);
  assert.match(html, /editor\.style\.height = editor\.scrollHeight \+ "px"/);
  assert.match(html, /editor\.addEventListener\("input", function\(\)/);
});

test("JD blurb editor pastes clipboard content as plain text", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Boilerplate</p>",
    versions: [],
  });

  assert.match(html, /defaultParagraphSeparator", false, "p"/);
  assert.match(html, /editor\.addEventListener\("paste", function\(event\)/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /getData\("text\/plain"\)/);
  assert.match(html, /function insertPlainText\(text\)/);
  assert.match(html, /document\.createElement\("p"\)/);
  assert.match(html, /paragraph\.textContent = cleanText/);
  assert.match(html, /insertPlainText\(text\)/);
});

test("JD blurb editor normalizes browser-created div blocks to paragraphs", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Boilerplate</p>",
    versions: [],
  });

  assert.match(html, /function normalizeEditorMarkup\(\)/);
  assert.match(html, /container\.querySelectorAll\("div"\)/);
  assert.match(html, /document\.createElement\("p"\)/);
  assert.match(html, /div\.replaceWith\(paragraph\)/);
  assert.match(html, /normalizeEditorMarkup\(\);\s*resizeEditor\(\);/);
});

test("JD blurb editor wraps loose AI text nodes in paragraphs and exports cleaned HTML", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "<p>Boilerplate</p>",
    versions: [],
  });

  assert.match(html, /function normalizeContainerMarkup\(container\)/);
  assert.match(html, /container\.childNodes/);
  assert.match(html, /node\.nodeType !== Node\.TEXT_NODE/);
  assert.match(html, /node\.replaceWith\(fragment\)/);
  assert.match(html, /function cleanEditorClone\(\)/);
  assert.match(html, /body: JSON\.stringify\(\{ html: cleanEditorClone\(\)\.innerHTML \}\)/);
  assert.match(html, /var cleanEditor = cleanEditorClone\(\)/);
});

test("JD blurb panel lists prior saved versions with a restore control", () => {
  const html = renderJdBlurbPanel({
    jobDescription: buildJobDescription(),
    boilerplateHtml: "",
    versions: [
      { id: 5, contentHtml: "<p>First version</p>", savedAt: "2026-07-10T00:00:00.000Z" },
      { id: 6, contentHtml: "<p>Second version</p>", savedAt: "2026-07-12T00:00:00.000Z" },
    ],
  });

  assert.match(html, /data-blurb-restore="5"/);
  assert.match(html, /data-blurb-restore="6"/);
});

test("JD app shell wires the nav-rail JD link and titles the page", () => {
  const html = renderJdAppShell({
    focusPanelId: null,
    list: { jobDescriptions: [], titleProfiles: [], centreProfiles: [] },
    editor: { jobDescription: null, titleProfiles: [], centreProfiles: [] },
    blurb: { jobDescription: null, boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  });

  assert.match(html, /<title>Marketing Helper - Job Descriptions<\/title>/);
  assert.match(html, /nav-rail__item nav-rail__item--current" href="\/jd"/);
});
