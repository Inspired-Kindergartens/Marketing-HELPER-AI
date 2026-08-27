import assert from "node:assert/strict";
import test from "node:test";

import { renderJdAppShell, resolveJdFocusPanelId, VALID_JD_PANEL_IDS } from "../src/ui/jd-app-shell.js";
import { renderJdListPanel } from "../src/ui/jd/jd-list-panel.js";
import { renderJdEditorPanel } from "../src/ui/jd/jd-editor-panel.js";
import { renderJdBlurbPanel } from "../src/ui/jd/jd-blurb-panel.js";
import { buildJdEmailText, buildJdWebsitePageTitle } from "../src/ui/jd/jd-email.js";
import {
  buildImmovableBoilerplateHtml,
  buildJdBlurbSystemPrompt,
  buildJdBlurbUserPrompt,
  buildJdIntroSystemPrompt,
  buildJdIntroUserPrompt,
} from "../src/ai/jd-context.js";
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
  assert.match(html, /data-jd-create-submit/);
  assert.match(html, /data-jd-create-busy/);
  assert.match(html, /Generating job description intro/);
  assert.match(html, /<option value="115">PAENGAROA Kindergarten<\/option>/);
});

test("JD create flow opens the new editor after the server returns the generated JD id", () => {
  const html = renderJdAppShell({
    focusPanelId: null,
    list: { jobDescriptions: [], titleProfiles: [buildTitleProfile()], centreProfiles: [buildCentreProfile()] },
    editor: { jobDescription: null, titleProfiles: [], centreProfiles: [] },
    blurb: { jobDescription: null, boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  });

  assert.match(html, /function postCreate\(url, payload, form\)/);
  assert.match(html, /function setCreateBusy\(form, busy\)/);
  assert.match(html, /form\.setAttribute\("aria-busy", busy \? "true" : "false"\)/);
  assert.match(html, /window\.location\.href = "\/jd\?panel=jd-editor&jd="/);
  assert.match(html, /postCreate\("\/api\/jd", formData\(form\), form\)/);
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

test("JD list panel title-cases the location and collapses the duplicated Kindergarten", () => {
  const html = renderJdListPanel({
    jobDescriptions: [{
      id: 9,
      jobTitle: "Teacher",
      locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten",
      positionType: "Full Time",
      dateAdvertised: "2026-07-14T00:00:00.000Z",
      closingAt: "2026-07-28T04:00:00.000Z",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    }],
    titleProfiles: [],
    centreProfiles: [],
  });

  assert.match(html, /<span class="jd-list__meta">Gwen Rogers Kindergarten · Full Time<\/span>/);
  assert.doesNotMatch(html, /KINDERGARTEN Kindergarten/);
});

test("JD back link title-cases the location and collapses the duplicated Kindergarten", () => {
  const jd = { ...buildJobDescription(), locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten" };
  const html = renderJdAppShell({
    focusPanelId: "jd-blurb",
    list: { jobDescriptions: [], titleProfiles: [], centreProfiles: [] },
    editor: { jobDescription: jd, titleProfiles: [], centreProfiles: [] },
    blurb: { jobDescription: jd, boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  });

  assert.match(html, /Back to Teacher - Gwen Rogers Kindergarten<\/span>/);
  assert.doesNotMatch(html, /Back to [^<]*KINDERGARTEN/);
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

test("JD editor navigation renders in the panel header actions", () => {
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

  assert.match(
    html,
    /<div class="panel__actions">[\s\S]*class="panel-action-link" href="\/jd\?panel=jd-list"[\s\S]*Back to Job Descriptions[\s\S]*class="panel-action-link" href="\/jd\?panel=jd-blurb&jd=1"[\s\S]*Website blurb for this JD/,
  );
});

test("JD list, blurb, and settings navigation render in panel header actions", () => {
  const jd = buildJobDescription({
    id: 17,
    jobTitle: "Teacher",
    locationDisplay: "Gwen Rogers Kindergarten",
  });

  const baseOptions = {
    list: { jobDescriptions: [], titleProfiles: [], centreProfiles: [] },
    editor: { jobDescription: jd, titleProfiles: [], centreProfiles: [] },
    blurb: { jobDescription: jd, boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  };

  const listHtml = renderJdAppShell({ ...baseOptions, focusPanelId: "jd-list" });
  const blurbHtml = renderJdAppShell({ ...baseOptions, focusPanelId: "jd-blurb" });
  const settingsHtml = renderJdAppShell({ ...baseOptions, focusPanelId: "jd-settings" });

  assert.match(
    listHtml,
    /<div class="panel__actions">[\s\S]*class="panel-action-link" href="\/jd\?panel=jd-settings"[\s\S]*Settings/,
  );
  assert.match(
    blurbHtml,
    /<div class="panel__actions">[\s\S]*class="panel-action-link" href="\/jd\?panel=jd-editor&jd=17"[\s\S]*Back to Teacher - Gwen Rogers Kindergarten/,
  );
  assert.match(
    settingsHtml,
    /<div class="panel__actions">[\s\S]*class="panel-action-link" href="\/jd\?panel=jd-list"[\s\S]*Back to Job Descriptions/,
  );
  assert.doesNotMatch(`${listHtml}\n${blurbHtml}\n${settingsHtml}`, /class="jd-back-link"/);
});

test("JD website page title states position type once, pairs Kaiako only for teaching roles, and carries the advertised month", () => {
  const title = (over: Partial<JobDescriptionView>) =>
    buildJdWebsitePageTitle(buildJobDescription({
      jobTitle: "Teacher",
      locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten",
      positionType: "Full Time",
      dateAdvertised: "2026-08-27T00:00:00.000Z",
      ...over,
    }));

  assert.equal(title({}), "Full-time Teacher / Kaiako Position - Gwen Rogers Kindergarten August 2026");
  assert.equal(
    title({ jobTitle: "Head Teacher", positionType: "Part-time", dateAdvertised: "2026-07-14T00:00:00.000Z" }),
    "Part-time Head Teacher / Kaiako Position - Gwen Rogers Kindergarten July 2026",
  );
  // Kaiako means teacher, so a non-teaching role must not be paired with it.
  assert.equal(
    title({ jobTitle: "Administrator" }),
    "Full-time Administrator Position - Gwen Rogers Kindergarten August 2026",
  );
  // A title profile that already carries its own position prefix must not double it.
  assert.equal(
    title({ jobTitle: "Part-time Teacher", positionType: "Part-time" }),
    "Part-time Teacher / Kaiako Position - Gwen Rogers Kindergarten August 2026",
  );
});

test("JD blurb panel offers a Copy Website Page Title action carrying the page title", () => {
  const jd = buildJobDescription({
    jobTitle: "Teacher",
    locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten",
    positionType: "Full Time",
    dateAdvertised: "2026-08-27T00:00:00.000Z",
  });
  const html = renderJdBlurbPanel({ jobDescription: jd, boilerplateHtml: "", versions: [] });

  assert.match(html, /<span>Copy Website Page Title<\/span>/);
  assert.match(
    html,
    /data-blurb-copy-title data-page-title="Full-time Teacher \/ Kaiako Position - Gwen Rogers Kindergarten August 2026"/,
  );
  // Must not hijack the existing copy-to-clipboard button.
  assert.match(html, /<span>Copy to clipboard<\/span>/);
});

test("JD editor Generate Email action opens a corrected mailto draft", () => {
  const html = renderJdAppShell({
    focusPanelId: "jd-editor",
    list: { jobDescriptions: [], titleProfiles: [], centreProfiles: [] },
    editor: {
      jobDescription: buildJobDescription({
        jobTitle: "Full Time Teacher/Kaiako Position",
        locationDisplay: "Gwen Rogers Kindergarten",
        dateAdvertised: "2026-08-20T00:00:00.000Z",
      }),
      titleProfiles: [],
      centreProfiles: [],
    },
    blurb: { jobDescription: buildJobDescription(), boilerplateHtml: "", versions: [] },
    settings: {
      centreProfiles: [],
      titleProfiles: [],
      knowledgeDocs: [],
      agreementStatus: { latest: null, expired: false, expiringSoon: false, daysUntilExpiry: null },
    },
  });
  const hrefMatch = /href="([^"]+)"[^>]*>\s*<i class="bi bi-envelope-plus[\s\S]*?<span>Generate Email<\/span>/.exec(html);

  assert.ok(hrefMatch);
  const href = hrefMatch[1]!.replaceAll("&amp;", "&");
  const [, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  const subject = params.get("subject") ?? "";
  const body = params.get("body") ?? "";

  assert.equal(href.startsWith("mailto:office@ikindergartens.nz?"), true);
  assert.doesNotMatch(href, /\.eml/);
  assert.equal(subject, "Gwen Rogers Kindergarten Full Time Teacher/Kaiako Position Job is Now Live");
  assert.match(body, /Kia ora,/);
  assert.match(
    body,
    /The job application for the Gwen Rogers Kindergarten Full Time Teacher\/Kaiako Position role is now live on the website\./,
  );
  assert.doesNotMatch(body, /GWEN ROGERS/);
  assert.doesNotMatch(body, /Kindergarten Kindergarten/);
  assert.match(
    body,
    /The link for Ed Gazette is\nhttps:\/\/inspiredkindergartens\.nz\/employment-and-careers\/vacancies\/full-time-teacher-kaiako-position-gwen-rogers-kindergarten-august-2026\?utm_source=education_gazette&utm_medium=referral&utm_campaign=gwen_rogers_full_time_teacher_2026/,
  );
});

test("JD email text follows the supplied template with title case and no duplicate Kindergarten", () => {
  const body = buildJdEmailText(buildJobDescription({
    jobTitle: "FULL TIME TEACHER/KAIAKO POSITION",
    locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten",
    dateAdvertised: "2026-08-20T00:00:00.000Z",
  }));

  assert.equal(
    body,
    [
      "Kia ora,",
      "",
      "The job application for the Gwen Rogers Kindergarten Full Time Teacher/Kaiako Position role is now live on the website.",
      "",
      "The link for Ed Gazette is",
      "https://inspiredkindergartens.nz/employment-and-careers/vacancies/full-time-teacher-kaiako-position-gwen-rogers-kindergarten-august-2026?utm_source=education_gazette&utm_medium=referral&utm_campaign=gwen_rogers_full_time_teacher_2026",
    ].join("\n"),
  );
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
  assert.match(css, /\.jd-list__create-spinner/);
  assert.match(css, /@keyframes jd-create-spin/);
  assert.match(css, /pointer-events: auto/);
  assert.match(css, /user-select: text/);
  assert.match(css, /color-scheme: dark/);
});

test("JD editor renders advertised and closing dates in Auckland time, not UTC", () => {
  const html = renderJdEditorPanel({
    jobDescription: buildJobDescription({
      dateAdvertised: "2026-08-25T21:30:00.000Z",
      closingAt: "2026-09-25T04:00:00.000Z",
    }),
    titleProfiles: [],
    centreProfiles: [],
  });

  assert.match(html, /name="dateAdvertised" value="2026-08-26"/);
  assert.match(html, /name="closingAt" value="2026-09-25T16:00"/);
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
    /By applying for this role you acknowledge that you are eligible to work in New Zealand\. If you are not eligible to work in New Zealand then do not apply\./,
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

test("JD blurb boilerplate title-cases the location and collapses the duplicated Kindergarten", () => {
  const jd = { ...buildJobDescription(), locationDisplay: "GWEN ROGERS  KINDERGARTEN Kindergarten" };
  const html = buildImmovableBoilerplateHtml(jd, jdPdfAssetUrl(jd));

  assert.match(
    html,
    /Job Description - Full time - Teacher \/ Kaiako Gwen Rogers Kindergarten<\/a>/,
  );
  // The PDF href keeps its upper-cased published filename; only the link text is reformatted.
  assert.doesNotMatch(html, />[^<]*KINDERGARTEN[^<]*</);
  assert.doesNotMatch(html, /Kindergarten Kindergarten/);
});

test("JD blurb prompt uses fallback blurbs as style examples only when centre history is empty", () => {
  const userPrompt = buildJdBlurbUserPrompt({
    jobDescription: buildJobDescription({ introParagraph: "" }),
    centreName: "Paengaroa Kindergarten",
    genericDoc: null,
    currentServiceDoc: null,
    oldServiceDoc: null,
    priorBlurbs: [],
    fallbackBlurbs: [{ id: 8, contentHtml: "<p>Other centre operates 8am to 3pm with a roll of 44.</p>", savedAt: "2026-07-10T00:00:00.000Z" }],
    isEnviroschool: false,
  });
  const systemPrompt = buildJdBlurbSystemPrompt(false);

  assert.match(userPrompt, /No previously saved blurb exists for this centre/);
  assert.match(userPrompt, /style\/structure examples/);
  assert.match(userPrompt, /operating hours \/ roll source: not supplied/);
  assert.match(systemPrompt, /Never invent centre operating data such as FTE, opening hours/);
  assert.match(systemPrompt, /Do not copy their centre facts/);
});

test("JD intro prompt only allows centre operating facts from Infocare or selected-centre website references", () => {
  const userPrompt = buildJdIntroUserPrompt({
    jobDescription: buildJobDescription({ introParagraph: "" }),
    centreName: "Paengaroa Kindergarten",
    currentServiceDoc: null,
    oldServiceDoc: null,
    infocareFacts: {
      snapshotDate: "2026-08-26",
      enrolledCount: 39,
      enrolledFteCount: 34.5,
      licensedCapacity: 43,
      licensedUnder2Capacity: null,
      licensedOver2Capacity: 43,
    },
    centreExamples: [],
    fallbackExamples: [
      {
        id: 2,
        centreKey: 999,
        centreName: "Other Kindergarten",
        introParagraph: "This kindergarten operates Monday to Friday 8:00am to 3:00pm with a roll of 44.",
        source: "job-description",
      },
    ],
  });
  const systemPrompt = buildJdIntroSystemPrompt();

  assert.match(systemPrompt, /Never invent centre operating data such as FTE, opening hours/);
  assert.match(systemPrompt, /Use roll\/capacity\/enrolment only from Infocare facts/);
  assert.match(userPrompt, /Infocare facts for this centre/);
  assert.match(userPrompt, /No selected-centre website reference was supplied/);
  assert.match(userPrompt, /other-centre intro paragraphs for structure and tone only, not facts/);
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
