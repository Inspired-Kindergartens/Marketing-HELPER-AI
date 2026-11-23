import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import Fastify from "fastify";
import multipart from "@fastify/multipart";

import {
  buildOnePagerAboutMessages,
  buildOnePagerAboutSystemPrompt,
  cleanOnePagerAboutDraft,
  hasOnePagerAboutSource,
  type OnePagerAboutInput,
} from "../src/ai/one-pager-context.js";
import { BACKUP_PATHS } from "../src/backup.js";
import { AI_IMAGE_DIR } from "../src/image-ai/routes.js";
import { contactFromKnown, fillEmptyFields, formatOnePagerAddress, formatOnePagerPhone } from "../src/one-pager/prefill.js";
import { ONE_PAGER_IMAGE_DIR, registerOnePagerRoutes, sniffOnePagerImage } from "../src/one-pager/routes.js";
import {
  DEFAULT_ONE_PAGER_TEMPLATE,
  EMPTY_ONE_PAGER_FIELDS,
  cleanOnePagerFields,
  defaultOnePagerServiceModel,
  resolveOnePagerServiceModel,
  onePagerFilename,
  parseAboutUs,
  resolveOnePagerContent,
  type OnePagerFields,
  type OnePagerTemplateText,
} from "../src/one-pager/template.js";
import type { OnePagerCentre, OnePagerImageRecord, OnePagerRecord, OnePagerStore } from "../src/storage/one-pager-store.js";
import { renderLandingPage } from "../src/ui/landing-page.js";
import { renderOnePagerAppShell, renderOnePagerFragments, type OnePagerPageData } from "../src/ui/one-pager-app-shell.js";
import { ONE_PAGER_PRINT_DPI, describeOnePagerFit, onePagerPhotoDpi, renderOnePagerPdf } from "../src/ui/one-pager-pdf.js";
import { ONE_PAGER_REFERENCES } from "../scripts/one-pager-reference.js";
import {
  captionNames,
  checkStaffPhotos,
  compareCaptionWithStaff,
  findStaffPhotoReasons,
  isFullTimeTeacherAdvert,
  isTeachingJob,
  type StaffPhotoCentre,
  type StaffPhotoDeps,
  type StaffRow,
  type TeacherAdvert,
} from "../src/one-pager/staff-photo.js";
import { describeWeekdays, formatClock, inferOperatingHours, keepHoursNotes, mergeHours, normaliseTime, type BookingRow } from "../src/one-pager/hours.js";
import {
  REAL_CHILDREN_QUESTION,
  REGENERATION_OPTIONS,
  UPSCALE_PROMPT,
  assertNoRealChildren,
  buildRegenerationPrompt,
  createSlotImageRegenerator,
  type SlotImageRegenerator,
} from "../src/image-ai/photo-slot.js";
import { ONE_PAGER_FIELD_MAX } from "../src/one-pager/template.js";
import { addBusinessDays, buildOnePagerEmail, joinGreetingNames, onePagerEmailNote, teamPhotoBadges } from "../src/one-pager/email.js";

test("supplied info sheets cover all 26 centres and leave out the mislabelled OPEYS file", () => {
  assert.equal(ONE_PAGER_REFERENCES.length, 26);
  assert.equal(new Set(ONE_PAGER_REFERENCES.map(r => r.centreName)).size, 26);
  // The "OPEYS ... Infosheet A4_PRINT" file is Matua's sheet; OPEYS comes from its own.
  assert.ok(!ONE_PAGER_REFERENCES.some(r => /Infosheet A4_PRINT/i.test(r.pdf)));
  const opeys = ONE_PAGER_REFERENCES.find(r => r.centreName === "OPEYS All Day Kindergarten")!;
  assert.match(opeys.fields.aboutUs, /^OPEYS All Day Kindergarten/);
  // Its team photo was a placeholder (another kindergarten's team), so none is taken.
  assert.equal(opeys.photoBoxes?.team, undefined);
  assert.equal(opeys.fields.teamCaption, "");
  for (const reference of ONE_PAGER_REFERENCES) {
    assert.ok(existsSync(reference.pdf), reference.pdf);
    assert.ok(reference.fields.aboutUs && reference.fields.hours && reference.fields.email, reference.centreName);
    for (const [key, max] of Object.entries(ONE_PAGER_FIELD_MAX)) {
      const value = reference.fields[key as keyof OnePagerFields];
      assert.ok(value.length <= max, `${reference.centreName}: ${key} would be truncated on Save`);
      assert.ok(!value.includes("\ufffd"), `${reference.centreName}: undecoded PDF text`);
    }
  }
});

test("source-specific fees and enrolment survive shared text changes", () => {
  const customTemplate = { ...DEFAULT_ONE_PAGER_TEMPLATE, costText: "NEW SHARED COST", teachersText: "NEW SHARED TEACHERS", enrolText: "NEW SHARED ENROLMENT" };
  const tai = ONE_PAGER_REFERENCES.find(r => r.centreName === "Tai o Fenua Kindergarten")!;
  const content = resolveOnePagerContent(tai.centreName, tai.fields, customTemplate);
  assert.equal(content.ownLogo, "tai-o-fenua");
  assert.match(content.sections.find(s => s.heading === "How do I enrol my child?")!.text, /12 months/);
  assert.match(content.sections.find(s => s.heading === "How much does it cost?")!.text, /free transport/);
  assert.match(content.sections.find(s => s.heading === "Are the teachers trained?")!.text, /cultural expertise/);
  // The All Day service has no text of its own: it follows the All Day shared text.
  const maunganui = ONE_PAGER_REFERENCES.find(r => r.centreName === "Maunganui All Day Kindergarten")!;
  const allDay = resolveOnePagerContent(maunganui.centreName, maunganui.fields, customTemplate);
  assert.match(allDay.sections.find(s => s.heading === "How much does it cost?")!.text, /\$6\.50 per hour/);
  assert.match(allDay.sections.find(s => s.heading === "How do I enrol my child?")!.text, /from 1 year to school age/);
  const brookfield = ONE_PAGER_REFERENCES.find(r => r.centreName === "Brookfield Kindergarten")!;
  assert.equal(resolveOnePagerContent(brookfield.centreName, brookfield.fields, customTemplate).sections.find(s => s.heading === "How much does it cost?")!.text, "NEW SHARED COST");
});

async function pdfText(buffer: Buffer): Promise<{ pages: number; text: string }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const document = await task.promise;
    const text = (await (await document.getPage(1)).getTextContent()).items.map(i => "str" in i ? i.str : "").join(" ");
    return { pages: document.numPages, text };
  } finally { await task.destroy(); }
}

test("Tai o Fenua is the template with its own logo and hibiscus: the only exception to the design", async () => {
  const reference = ONE_PAGER_REFERENCES.find(r => r.centreName === "Tai o Fenua Kindergarten")!;
  const result = await renderOnePagerPdf(resolveOnePagerContent(reference.centreName, reference.fields, DEFAULT_ONE_PAGER_TEMPLATE));
  const { pages, text } = await pdfText(result.buffer);
  assert.equal(pages, 1);
  // Everything else is the template: the About us heading and the tagline are there.
  assert.match(text, /About us/);
  assert.match(text, /Making the early years count/);
  assert.match(text, /Mālo ni/);
  assert.ok(existsSync("src/assets/one-pager/tai-o-fenua-header.png"));
  assert.ok(existsSync("src/assets/one-pager/tai-o-fenua-hibiscus.png"));
  // No other kindergarten has its own artwork, and nothing else varies by kindergarten in the layout:
  // the hibiscus hangs off the same single check as the logo.
  const others = ONE_PAGER_REFERENCES.filter(r => r !== reference).map(r => resolveOnePagerContent(r.centreName, r.fields, DEFAULT_ONE_PAGER_TEMPLATE));
  assert.ok(others.every(content => content.ownLogo === undefined));
  const pdfSource = readFileSync("src/ui/one-pager-pdf.ts", "utf8");
  assert.equal((pdfSource.match(/content\.ownLogo/g) ?? []).length, 1);
  assert.equal((pdfSource.match(/tai-o-fenua-hibiscus\.png/g) ?? []).length, 1);
  assert.match(pdfSource, /if \(taiOFenua\) place\(await artwork\("tai-o-fenua-hibiscus\.png"\), TAI_HIBISCUS\)/);
  assert.doesNotMatch(pdfSource, /layoutVariant/);
});

test("every supplied info sheet fits on a single page, including those whose original ran to two", async () => {
  for (const reference of ONE_PAGER_REFERENCES) {
    const result = await renderOnePagerPdf(resolveOnePagerContent(reference.centreName, reference.fields, DEFAULT_ONE_PAGER_TEMPLATE));
    assert.equal(result.fits, true, reference.centreName);
    assert.equal(pageCount(result.buffer), 1, reference.centreName);
  }
});

test("service models: All Day services share fees text, kindergartens share donations text, hours are always their own", () => {
  assert.equal(defaultOnePagerServiceModel("Maunganui All Day Kindergarten"), "all-day");
  assert.equal(defaultOnePagerServiceModel("OPEYS All Day Kindergarten"), "all-day");
  assert.equal(defaultOnePagerServiceModel("Avenues Kindergarten"), "kindergarten");
  assert.equal(resolveOnePagerServiceModel("all-day"), "all-day");
  assert.equal(resolveOnePagerServiceModel("anything else"), "kindergarten");

  const cost = (content: ReturnType<typeof resolveOnePagerContent>) => content.sections.find(s => s.heading === "How much does it cost?")!.text;
  const empty = { ...EMPTY_ONE_PAGER_FIELDS, hours: "7:30am - 5:30pm" };
  assert.match(cost(resolveOnePagerContent("X Kindergarten", empty, DEFAULT_ONE_PAGER_TEMPLATE, "all-day")), /fees are \$6\.50 per hour/);
  assert.match(cost(resolveOnePagerContent("X Kindergarten", empty, DEFAULT_ONE_PAGER_TEMPLATE, "kindergarten")), /donations/i);
  // A service's own text still wins over either shared text.
  assert.equal(cost(resolveOnePagerContent("X Kindergarten", { ...empty, costOverride: "Own." }, DEFAULT_ONE_PAGER_TEMPLATE, "all-day")), "Own.");
  // There is no shared hours text at all.
  assert.ok(!Object.keys(DEFAULT_ONE_PAGER_TEMPLATE).some(key => /hours/i.test(key)));
  // Every supplied sheet has its own hours, and they are not all the same.
  assert.ok(new Set(ONE_PAGER_REFERENCES.map(r => r.fields.hours)).size > 8);
});

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

// A real (tiny) PNG, so the PDF can hold it.
function png(width = 8, height = 6): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

const AVENUES: OnePagerCentre = { centreKey: 108, name: "Avenues Kindergarten", licenseNumber: 5001 };
const BROOKFIELD: OnePagerCentre = { centreKey: 109, name: "Brookfield Kindergarten", licenseNumber: 5002 };

const fields = (changes: Partial<OnePagerFields> = {}): OnePagerFields => ({ ...EMPTY_ONE_PAGER_FIELDS, ...changes });

// ---- Template rules -----------------------------------------------------------

test("About us: blank lines split paragraphs and dashed lines make a list", () => {
  assert.deepEqual(parseAboutUs("Our place.\nStill our place.\n\nThese values are:\n- Resilience\n• Creativity\n\nVisitors welcome."), [
    { type: "paragraph", text: "Our place. Still our place." },
    { type: "paragraph", text: "These values are:" },
    { type: "list", items: ["Resilience", "Creativity"] },
    { type: "paragraph", text: "Visitors welcome." },
  ]);
  assert.deepEqual(parseAboutUs("  \n\n "), []);
});

test("a kindergarten uses the shared text unless it has its own", () => {
  const shared = resolveOnePagerContent("Arataki Kindergarten", fields({ address: "31 Hawea Street, Mount Maunganui", phone: "07 575 5340", hours: "8:30am - 2:30pm" }), DEFAULT_ONE_PAGER_TEMPLATE);
  assert.deepEqual(
    shared.sections.map((section) => section.heading),
    ["Contact us", "Hours", "How much does it cost?", "Are the teachers trained?", "How do I enrol my child?"],
  );
  assert.equal(shared.sections[0].text, `31 Hawea Street, Mount Maunganui\n07 575 5340\n${DEFAULT_ONE_PAGER_TEMPLATE.website}`);
  assert.equal(shared.sections[2].text, DEFAULT_ONE_PAGER_TEMPLATE.costText);
  assert.equal(shared.tagline, "Making the early years count");

  const own = resolveOnePagerContent("Avenues Kindergarten", fields({ costOverride: "A separate fee of $10 is charged for extended hours." }), DEFAULT_ONE_PAGER_TEMPLATE);
  assert.equal(own.sections.find((section) => section.heading === "How much does it cost?")?.text, "A separate fee of $10 is charged for extended hours.");
  // No hours typed: the Hours heading is left off rather than shown empty.
  assert.ok(!own.sections.some((section) => section.heading === "Hours"));
});

test("saved text is tidied and cut to its limit; only the fields sent are changed", () => {
  const cleaned = cleanOnePagerFields({ aboutUs: "One.  \r\n\r\n\r\n\r\nTwo.\n", phone: "x".repeat(80), callout: "Extended hours available!" });
  // The cloud badge is gone from the template: a callout sent in is not kept.
  assert.deepEqual(Object.keys(cleaned).sort(), ["aboutUs", "phone"]);
  assert.equal(cleaned.aboutUs, "One.\n\nTwo.");
  assert.equal(cleaned.phone?.length, 60);
  assert.doesNotMatch(source("../src/ui/one-pager-pdf.ts") + source("../src/one-pager/template.ts") + source("../src/ui/one-pager-app-shell.ts"), /callout|cloud/i);
});

test("downloads use the Info Sheet name and date", () => {
  const date = new Date("2026-11-15T01:00:00Z");
  assert.equal(onePagerFilename("Avenues Kindergarten", date), "Avenues Kindergarten Info Sheet Nov 2026.pdf");
  assert.equal(onePagerFilename('A/B: "C"', date), "A B C Info Sheet Nov 2026.pdf");
});

// ---- Fill from what we know -----------------------------------------------------

test("contact details from the directory are written the info sheet way", () => {
  assert.equal(formatOnePagerAddress({ address: "27 Botanical Road", suburb: "", city: "Tauranga" }), "27 Botanical Road, Tauranga");
  assert.equal(formatOnePagerAddress({ address: "31 Hawea Street", suburb: "Mount Maunganui", city: "Tauranga" }), "31 Hawea Street, Mount Maunganui");
  // The road shares the suburb's name; the suburb is still added.
  assert.equal(formatOnePagerAddress({ address: "77 Otumoetai Road", suburb: "Otumoetai", city: "Tauranga" }), "77 Otumoetai Road, Otumoetai");
  assert.equal(formatOnePagerAddress({ address: "5 Main Road, Katikati", suburb: "Katikati", city: "" }), "5 Main Road, Katikati");
  assert.equal(formatOnePagerPhone("07-5766311"), "07 576 6311");
  assert.equal(formatOnePagerPhone("(07) 578 4481"), "07 578 4481");
  assert.equal(formatOnePagerPhone("0800  123 456"), "0800 123 456");
  assert.deepEqual(contactFromKnown(null), { address: "", phone: "", email: "" });
  assert.equal(contactFromKnown({ address: "1 A St", suburb: "", city: "", phone: "", email: " Avenues@iKindergartens.nz " }).email, "avenues@ikindergartens.nz");
});

test("prefill never overwrites what has been typed", () => {
  assert.deepEqual(fillEmptyFields({ address: "My own address", phone: " ", email: "" }, { address: "Directory address", phone: "07 578 4481", email: "" }), { phone: "07 578 4481" });
});

// ---- About us draft -------------------------------------------------------------

const aboutInput = (changes: Partial<OnePagerAboutInput> = {}): OnePagerAboutInput => ({
  centreName: "Brookfield Kindergarten",
  isEnviroschool: false,
  introParagraph: "",
  currentWebsiteHtml: "<p>We have a <strong>large garden</strong> &amp; a worm farm.</p>",
  oldWebsiteHtml: null,
  notes: "",
  ...changes,
});

test("About us draft: written only from this kindergarten's sources", () => {
  const [system, user] = buildOnePagerAboutMessages(aboutInput({ notes: "Opened 1962. Big sandpit." }));
  assert.equal(system.role, "system");
  assert.match(system.content, /Never invent a fact/);
  assert.match(system.content, /is NOT a registered Enviroschool/);
  assert.match(user.content, /Notes about Brookfield Kindergarten from the marketing team \(main source[^\n]*\n(Opened 1962\. Big sandpit\.)/);
  assert.match(user.content, /We have a large garden & a worm farm\./);
  assert.match(system.content, /Every sentence must come from the reference material/);
  // No other kindergarten's text goes in: the model copied their values when it did.
  assert.doesNotMatch(user.content, /Avenues|Arataki|Example/);
  assert.match(buildOnePagerAboutSystemPrompt(true), /IS a registered Enviroschool/);
});

test("About us draft: needs something to write from, and tidies the reply", () => {
  assert.equal(hasOnePagerAboutSource(aboutInput({ currentWebsiteHtml: null })), false);
  assert.equal(hasOnePagerAboutSource(aboutInput({ currentWebsiteHtml: null, notes: "Big sandpit." })), true);
  assert.equal(cleanOnePagerAboutDraft('## About us\n\n"We are a **proud** kindergarten.\n\n\n\n* Resilience\n• Creativity"'), "We are a proud kindergarten.\n\n- Resilience\n- Creativity");
});

test("Info Sheets use the app's one chat model and name none", () => {
  const modules = ["../src/ai/one-pager-context.ts", "../src/one-pager/routes.ts", "../src/ui/one-pager-app-shell.ts", "../src/ui/one-pager-pdf.ts"].map(source).join("\n");
  assert.doesNotMatch(modules, /AI_CHAT_MODEL|AI_IMAGE_MODEL|OPENAI|api\.openai\.com/);
  // The server hands the routes its own chat runner, called the Job Description way.
  assert.match(source("../src/server.ts"), /registerOnePagerRoutes\(app, \{[\s\S]*?runLocalChat\(\{ \.\.\.aiConfig, AI_TIMEOUT_MS: ONE_PAGER_AI_TIMEOUT_MS \}, messages, \{ think: false \}\)/);
});

// ---- The PDF --------------------------------------------------------------------

const AVENUES_FIELDS = fields({
  aboutUs: "Avenues Kindergarten is a place of aroha / love, learning and enjoyment.\n\nWe are committed to providing high quality early childhood education.",
  address: "27 Botanical Road, Tauranga",
  phone: "07 578 4481",
  email: "avenues@ikindergartens.nz",
  hours: "Part time: 8:30am - 12:30pm\nFull Day: 8:30am - 2:30pm",
  teamCaption: "Back Row: A and B.\nFront Row: C and D.",
});

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

// ---- Team photo upkeep ----------------------------------------------------------

test("team photo: a teacher starting or leaving, or a full-time teacher advert a month after it closed, is a reason", () => {
  const since = new Date("2026-11-17T02:00:00Z");
  const now = new Date("2027-01-20T02:00:00Z");
  const staff: StaffRow[] = [
    { job: "Teacher", startingDate: "2026-12-01", leavingDate: "" },
    { job: "Head Teacher", startingDate: "2019-01-01", leavingDate: "2026-12-18" },
    { job: "Teacher", startingDate: "2026-11-10", leavingDate: "" }, // before the photo went on
    { job: "Teacher", startingDate: "2027-02-01", leavingDate: "" }, // not yet
    { job: "Reliever", startingDate: "2026-12-05", leavingDate: "" },
    { job: "Other", startingDate: "2026-12-05", leavingDate: "" },
  ];
  const adverts: TeacherAdvert[] = [
    { jobTitle: "Teacher", positionType: "Full-time", closingAt: new Date("2026-12-10T04:00:00Z") },
    { jobTitle: "Teacher", positionType: "Part-time", closingAt: new Date("2026-12-10T04:00:00Z") },
    { jobTitle: "Administrator", positionType: "Full-time", closingAt: new Date("2026-12-10T04:00:00Z") },
    { jobTitle: "Teacher", positionType: "Full-time", closingAt: new Date("2027-01-10T04:00:00Z") }, // its month is not up
    { jobTitle: "Teacher", positionType: "Full-time", closingAt: new Date("2026-09-01T04:00:00Z") }, // settled before the photo
  ];
  assert.deepEqual(findStaffPhotoReasons({ since, now, staff, adverts }), [
    "A teacher started on 1 December 2026 (Infocare staff list).",
    "A head teacher left on 18 December 2026 (Infocare staff list).",
    "A full-time Teacher job was advertised and closed on 10 December 2026, a month ago.",
  ]);
  assert.deepEqual(findStaffPhotoReasons({ since: now, now, staff, adverts }), []);
  assert.equal(isTeachingJob("Head Teacher"), true);
  assert.equal(isTeachingJob("Reliever"), false);
  assert.equal(isFullTimeTeacherAdvert({ jobTitle: "Part-time Teacher", positionType: "", closingAt: null }), false);
});

test("team photo: a change raises one task for that kindergarten, and no second one while it is open", async () => {
  const centre: StaffPhotoCentre = { centreKey: 108, name: "Avenues Kindergarten", onePagerId: 1, teamPhotoAt: new Date("2026-11-17T00:00:00Z"), createdAt: new Date("2026-11-15T00:00:00Z"), staffPhotoCheckedAt: null, staffPhotoTaskId: null };
  const quiet: StaffPhotoCentre = { ...centre, centreKey: 109, name: "Brookfield Kindergarten", onePagerId: 2 };
  const tasks: Array<{ id: number; title: string; description: string; centreKey: number; dueDate: string; open: boolean }> = [];
  const staff: Record<number, StaffRow[]> = { 108: [{ job: "Teacher", startingDate: "2026-12-01", leavingDate: "" }], 109: [] };
  const deps: StaffPhotoDeps = {
    listCentres: async () => [centre, quiet],
    staff: async (centreKey) => staff[centreKey] ?? [],
    adverts: async () => [],
    taskOpen: async (taskId) => tasks.find((task) => task.id === taskId)?.open ?? false,
    createTask: async (input) => {
      tasks.push({ ...input, id: tasks.length + 1, open: true });
      return tasks.length;
    },
    mark: async (onePagerId, at, taskId) => {
      const target = onePagerId === 1 ? centre : quiet;
      target.staffPhotoCheckedAt = at;
      if (taskId != null) target.staffPhotoTaskId = taskId;
    },
  };

  const first = await checkStaffPhotos(deps, new Date("2026-12-05T00:00:00Z"));
  assert.deepEqual(first.created, [{ centreKey: 108, taskId: 1 }]);
  assert.equal(tasks[0].title, "Update the team photo: Avenues Kindergarten");
  assert.equal(tasks[0].centreKey, 108);
  assert.equal(tasks[0].dueDate, "2026-12-19");
  assert.match(tasks[0].description, /A teacher started on 1 December 2026/);
  assert.match(tasks[0].description, /Photos, Team photo, Replace/);

  // The same change is not raised twice.
  assert.deepEqual((await checkStaffPhotos(deps, new Date("2026-12-06T00:00:00Z"))).created, []);
  // A further change while the task is open adds no second task.
  staff[108].push({ job: "Teacher", startingDate: "2026-12-10", leavingDate: "" });
  const second = await checkStaffPhotos(deps, new Date("2026-12-12T00:00:00Z"));
  assert.deepEqual(second, { created: [], alreadyOpen: 1 });
  // Once the task is done, the next change raises a new one.
  tasks[0].open = false;
  staff[108].push({ job: "Teacher", startingDate: "2027-01-20", leavingDate: "" });
  assert.deepEqual((await checkStaffPhotos(deps, new Date("2027-01-25T00:00:00Z"))).created, [{ centreKey: 108, taskId: 2 }]);
  assert.equal(tasks.length, 2);

  // Infocare is only read: stored staff lists, no calls.
  assert.doesNotMatch(source("../src/storage/staff-photo-store.ts") + source("../src/one-pager/staff-photo.ts"), /createInfocareClient|client\.request/);
});

test("team photo: the list marks a kindergarten whose photo is due, and its Team photo card opens the task", () => {
  const html = renderOnePagerAppShell({ ...pageData(true), photoTasks: { 108: 55 } });
  assert.match(html, /Avenues Kindergarten<span class="badge badge--warning" data-one-pager-photo-due>/);
  assert.equal((html.match(/data-one-pager-photo-due/g) ?? []).length, 1);
  assert.match(html, /<form class="flex" action="\/tasks" method="get"><button type="submit" class="button-sm" name="task" value="55">/);
  assert.doesNotMatch(renderOnePagerAppShell(pageData(true)), /data-one-pager-photo-due|Team photo due/);
});

test("team photo: the names under an imported photo are checked against today's staff", () => {
  // A name broken across two lines is one person; two full names on two lines are two people.
  assert.deepEqual(captionNames("L:R Roxy Burt, Jen Evans, Zyri\nMartin and Heleni Futialo."), ["Roxy Burt", "Jen Evans", "Zyri Martin", "Heleni Futialo"]);
  assert.deepEqual(captionNames("Left to right: Claire Sands, Tracy Giacon\nCherie Hunter and Jo Kilkenny."), ["Claire Sands", "Tracy Giacon", "Cherie Hunter", "Jo Kilkenny"]);
  assert.deepEqual(captionNames("Back row: Andi Peat (Head Teacher), Amy Garrity\nFront row: Caroline Darby"), ["Andi Peat", "Amy Garrity", "Caroline Darby"]);

  const person = (firstName: string, lastName: string, job = "Teacher", leavingDate = "") => ({ firstName, lastName, job, leavingDate });
  const staff = [person("Angela (Ange)", "Peat", "Head Teacher"), person("Amy", "Garrity"), person("Kim", "New"), person("Old", "Hand", "Teacher", "2026-01-31"), person("Pat", "Office", "Administrator")];
  assert.deepEqual(compareCaptionWithStaff("Ange Peat, Amy Garrity, Old Hand and Pat Office", staff, "2026-11-17"), { notNamed: ["Kim New"], notOnStaff: ["Old Hand"] });
  // First names only are matched on first names.
  assert.deepEqual(compareCaptionWithStaff("Ange, Amy and Kim", staff, "2026-11-17"), { notNamed: [], notOnStaff: [] });
});

// ---- Emailing the kindergarten --------------------------------------------------

test("email: the two ready-made emails greet by first name and give three working days to reply", () => {
  assert.equal(joinGreetingNames(["Paula Smith", " Colleen Jones ", "Paula Smith", null]), "Paula and Colleen");
  assert.equal(joinGreetingNames(["Paula Smith"]), "Paula");
  assert.equal(joinGreetingNames([null, ""]), "there");
  // Thursday plus three working days is the next Tuesday.
  assert.equal(addBusinessDays(new Date(2026, 10, 19), 3).getDate(), 24);

  const input = { centreName: "Avenues Kindergarten", greeting: "Paula and Colleen", now: new Date(2026, 10, 17) };
  const approve = buildOnePagerEmail("approve", input);
  assert.equal(approve.subject, "Avenues Kindergarten info sheet for your approval");
  assert.match(approve.body, /^Kia ora Paula and Colleen,\n/);
  assert.match(approve.body, /The PDF is attached\./);
  assert.match(approve.body, /by 20 November 2026\./);
  const photo = buildOnePagerEmail("staff-photo", input);
  assert.equal(photo.subject, "Updated team photo for Avenues Kindergarten");
  assert.match(photo.body, /No children in the photo\./);
  assert.equal(onePagerEmailNote(approve), `Info sheet email sent: ${approve.subject}\n\n${approve.body}`);
});

test("preview badges: staff photo needed, and email sent, over the team photo in the preview only", async () => {
  const photo = buildOnePagerEmail("staff-photo", { centreName: "Avenues Kindergarten", greeting: "Paula" });
  // A Staff photo email is kept as one short line, whatever was written in it.
  assert.equal(onePagerEmailNote({ subject: "Photo please", body: "x" }, "staff-photo"), "Email sent for staff photo update");
  const sent = { text: onePagerEmailNote(photo, "staff-photo"), at: "2026-11-18T00:00:00Z" };
  const before = new Date("2026-11-17T00:00:00Z");
  const after = new Date("2026-11-19T00:00:00Z");
  assert.deepEqual(teamPhotoBadges({ photoDue: false, teamPhotoAt: before, notes: [] }), []);
  assert.deepEqual(teamPhotoBadges({ photoDue: true, teamPhotoAt: before, notes: [] }), ["Staff photo needed"]);
  assert.deepEqual(teamPhotoBadges({ photoDue: true, teamPhotoAt: before, notes: [sent] }), ["Staff photo needed", "Email sent"]);
  assert.deepEqual(teamPhotoBadges({ photoDue: true, teamPhotoAt: null, notes: [sent] }), ["Staff photo needed", "Email sent"]);
  // An email sent before the photo in the slot arrived has been answered.
  assert.deepEqual(teamPhotoBadges({ photoDue: false, teamPhotoAt: after, notes: [sent] }), []);
  // One sent before the note said what kind it was is known by the ready-made subject; other emails and notes don't count.
  assert.deepEqual(teamPhotoBadges({ photoDue: false, teamPhotoAt: before, notes: [{ ...sent, text: onePagerEmailNote(photo) }] }), ["Email sent"]);
  assert.deepEqual(teamPhotoBadges({ photoDue: false, teamPhotoAt: before, notes: [{ ...sent, text: onePagerEmailNote(buildOnePagerEmail("approve", { centreName: "Avenues Kindergarten", greeting: "Paula" })) }, { ...sent, text: "Rang about the email sent for staff photo update" }] }), []);

  // The badges take no room: the sheet is still one page, with or without a team photo.
  const content = resolveOnePagerContent("Avenues Kindergarten", AVENUES_FIELDS, DEFAULT_ONE_PAGER_TEMPLATE);
  const plain = await renderOnePagerPdf(content, { team: { bytes: png(), mimeType: "image/png" } });
  const badged = await renderOnePagerPdf(content, { team: { bytes: png(), mimeType: "image/png" } }, { teamBadges: ["Staff photo needed", "Email sent"] });
  assert.equal(pageCount(badged.buffer), 1);
  assert.deepEqual(badged.fit, plain.fit);
  assert.ok(badged.buffer.length > plain.buffer.length);
  assert.equal(pageCount((await renderOnePagerPdf(content, {}, { teamBadges: ["Staff photo needed"] })).buffer), 1);

  // Only the preview asks for them: the page's preview does, the download link does not.
  const page = renderOnePagerAppShell(pageData(true));
  assert.match(page, /fetch\(BASE \+ "\/pdf\?inline=1&badges=1"\)/);
  assert.match(page, /class="panel-action-button action-print" href="\/api\/one-pager\/108\/pdf" download/);
  assert.match(source("../src/one-pager/routes.ts"), /request\.query\?\.badges \? await previewBadges\(centre, onePager\) : \[\]/);

  const rootDir = mkdtempSync(join(tmpdir(), "one-pager-test-"));
  const app = Fastify();
  registerOnePagerRoutes(app, {
    store: memoryStore().store,
    rootDir,
    staffPhoto: { check: async () => undefined, openTasks: async () => new Map([[108, 7]]) },
    notes: { list: async () => [{ heading: "Info sheet", ...sent }], add: async () => undefined },
  });
  try {
    const download = await app.inject({ method: "GET", url: "/api/one-pager/108/pdf" });
    const preview = await app.inject({ method: "GET", url: "/api/one-pager/108/pdf?inline=1&badges=1" });
    assert.equal(preview.statusCode, 200);
    assert.ok(preview.rawPayload.length > download.rawPayload.length);
    assert.equal((await app.inject({ method: "GET", url: "/api/one-pager/109/pdf?inline=1&badges=1" })).rawPayload.length > 0, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("email: the button sends to the service email, and a sent email is kept as a note", async () => {
  const html = renderOnePagerAppShell({ ...pageData(true), emailContact: { to: "avenues@ikindergartens.nz", greeting: "Paula" } });
  assert.match(html, /<button class="panel-action-link" type="button" data-one-pager-email data-centre-name="Avenues Kindergarten" data-greeting="Paula" data-email-to="avenues@ikindergartens\.nz"/);
  assert.match(html, /Kia ora Paula,/);
  assert.doesNotMatch(renderOnePagerAppShell(pageData(false)), /<button[^>]*data-one-pager-email/);

  const rootDir = mkdtempSync(join(tmpdir(), "one-pager-test-"));
  const notes: Array<{ centreKey: number; text: string }> = [];
  const app = Fastify();
  registerOnePagerRoutes(app, {
    store: memoryStore().store,
    rootDir,
    contactNames: async () => ["Paula Smith", "Colleen Jones"],
    notes: {
      list: async (centre) => notes.filter((note) => note.centreKey === centre.centreKey).map((note) => ({ heading: "Info sheet", text: note.text, at: "2026-11-19T01:00:00Z" })).reverse(),
      add: async (centre, text) => void notes.push({ centreKey: centre.centreKey, text }),
    },
  });
  try {
    const page = await app.inject({ method: "GET", url: "/one-pager?centre=108" });
    assert.match(page.body, /data-greeting="Paula and Colleen" data-email-to="avenues@ikindergartens\.nz"/);

    const saved = await app.inject({ method: "POST", url: "/api/one-pager/108/email-note", payload: { subject: "Updated team photo", body: "Kia ora Paula,\r\n\r\nPlease send one." } });
    assert.equal(saved.statusCode, 201);
    assert.deepEqual(notes, [{ centreKey: 108, text: "Info sheet email sent: Updated team photo\n\nKia ora Paula,\n\nPlease send one." }]);

    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/email-note", payload: { subject: " ", body: "" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/999/email-note", payload: { subject: "x", body: "y" } })).statusCode, 404);
    assert.equal(notes.length, 1);
    // A Staff photo email is kept as the short line only.
    const photoNote = await app.inject({ method: "POST", url: "/api/one-pager/109/email-note", payload: { kind: "staff-photo", subject: "Updated team photo", body: "Kia ora" } });
    assert.equal(photoNote.statusCode, 201);
    assert.deepEqual(notes.pop(), { centreKey: 109, text: "Email sent for staff photo update" });
    // The sent email shows in the Notes panel straight away.
    assert.match(saved.json().fragments.notes, /Info sheet email sent: Updated team photo/);

    // ---- The Notes panel: the kindergarten's notes, and a box to add one ----
    const typed = await app.inject({ method: "POST", url: "/api/one-pager/108/notes", payload: { text: "  Paula rang: new photo <next> week.\r\nCall back Friday.  " } });
    assert.equal(typed.statusCode, 201);
    assert.equal(notes[1].text, "Paula rang: new photo <next> week.\nCall back Friday.");
    const panel = typed.json().fragments.notes as string;
    assert.deepEqual(Object.keys(typed.json().fragments), ["notes"]);
    assert.equal((panel.match(/data-one-pager-note>/g) ?? []).length, 2);
    // Newest first, with its date and what it is filed under; the words are escaped.
    assert.match(panel, /<span>19 Nov 2026, 2:00 pm<\/span><span>Info sheet<\/span><\/div>\s*<div class="one-pager-notes__text">Paula rang: new photo &lt;next&gt; week\.\nCall back Friday\.<\/div>[\s\S]*Info sheet email sent/);
    assert.match(panel, /<form[^>]*data-one-pager-form="note">/);

    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/notes", payload: { text: "  " } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/999/notes", payload: { text: "x" } })).statusCode, 404);
    assert.equal(notes.length, 2);

    // The page opens with the panel filled; a kindergarten with no notes says so.
    assert.match((await app.inject({ method: "GET", url: "/one-pager?centre=108" })).body, /data-panel-id="one-pager-notes"[\s\S]*Paula rang/);
    assert.match((await app.inject({ method: "GET", url: "/one-pager?centre=109" })).body, /No notes yet\./);
    assert.doesNotMatch((await app.inject({ method: "GET", url: "/one-pager" })).body, /data-panel-id="one-pager-notes"/);

    // Without the notes storage the page still opens and adding says why not.
    const bare = Fastify();
    registerOnePagerRoutes(bare, { store: memoryStore().store, rootDir });
    assert.match((await bare.inject({ method: "GET", url: "/one-pager?centre=108" })).body, /No notes yet\./);
    assert.equal((await bare.inject({ method: "POST", url: "/api/one-pager/108/notes", payload: { text: "x" } })).statusCode, 503);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ---- Hours from Infocare bookings ---------------------------------------------

// `count` bookings of one session on each of the given dates.
function bookings(dates: string[], from: string, to: string, count: number): BookingRow[] {
  return dates.flatMap((date) => Array.from({ length: count }, () => ({ date, from, to })));
}
// Monday 2 to Friday 6 November 2026.
const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

test("hours: sessions and open days are read from the bookings, in the info sheets' wording", () => {
  assert.equal(normaliseTime("8:30"), "08:30");
  assert.equal(normaliseTime("14:30:00"), "14:30");
  assert.equal(normaliseTime("late"), "");
  assert.equal(formatClock("08:30"), "8:30am");
  assert.equal(formatClock("13:00"), "1pm");
  assert.equal(formatClock("12:45"), "12:45pm");
  assert.equal(describeWeekdays([1, 2, 3, 4, 5]), "Monday to Friday");
  assert.equal(describeWeekdays([1, 2, 4, 5]), "Monday, Tuesday, Thursday and Friday");
  assert.equal(describeWeekdays([3]), "Wednesday");

  // One session, with a single child's odd booking and a weekend row ignored.
  const single = inferOperatingHours([...bookings(WEEK, "08:30", "14:30", 30), { date: WEEK[0], from: "09:00", to: "11:00" }, { date: "2026-11-07", from: "08:30", to: "14:30" }]);
  assert.equal(single.sessional, true);
  assert.equal(single.text, "8:30am - 2:30pm, Monday to Friday.");

  // A short and a full day, and a different Friday.
  const mixed = inferOperatingHours([
    ...bookings(WEEK.slice(0, 4), "08:30", "14:30", 25),
    ...bookings(WEEK.slice(0, 4), "08:30", "13:00", 8),
    ...bookings([WEEK[4]], "08:30", "12:45", 30),
  ]);
  assert.equal(mixed.text, "8:30am - 1pm or 8:30am - 2:30pm, Monday to Thursday.\n8:30am - 12:45pm, Friday.");

  // A day with almost no bookings is not an open day.
  const fourDays = inferOperatingHours([...bookings(WEEK.slice(0, 4), "08:45", "14:45", 30), ...bookings([WEEK[4]], "08:45", "14:45", 2)]);
  assert.equal(fourDays.text, "8:45am - 2:45pm, Monday to Thursday.");
});

test("hours: where families book their own hours, only the span is given and it is not treated as the opening hours", () => {
  const starts = ["07:30", "07:45", "08:00", "08:30", "09:00", "09:30"];
  const ends = ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
  const allDay = inferOperatingHours(starts.flatMap((from, index) => bookings(WEEK, from, ends[index], 4)));
  assert.equal(allDay.sessional, false);
  assert.equal(allDay.text, "7:30am - 5:30pm, Monday to Friday.");
  assert.match(source("../scripts/one-pager-hours.ts"), /inferred\.sessional \? mergeHours\(inferred\.text, stored\) : stored/);
});

test("hours: notes Infocare cannot know are kept when the times are replaced", () => {
  assert.equal(keepHoursNotes("8:30am - 2:30pm, Monday to Friday.\nHoliday programme available during school\nholidays."), "Holiday programme available during school holidays.");
  assert.equal(keepHoursNotes("Monday to Friday 8:30am - 12:30pm OR\nMonday to Friday 8:30am - 2:30pm\nHoliday programmes available during\nsome school holidays."), "Holiday programmes available during some school holidays.");
  assert.equal(keepHoursNotes("Monday - Friday\nPart Day: 8:30am - 12:30pm\nFull Day: 8:30am - 2:30pm\nOpen school term breaks. Closed Christmas Period."), "Open school term breaks. Closed Christmas Period.");
  assert.match(keepHoursNotes("8:45am - 2:45pm, Monday to Friday. Holiday\nprogramme available.\nOur Playgroup hours are 8.45am - 11.45am\non Wednesdays."), /Holiday programme available\. Our Playgroup hours are 8\.45am - 11\.45am on Wednesdays\./);
  assert.match(keepHoursNotes("7:30am - 5:30pm, Monday to Friday.\nOSCAR Before & After School Care\n7:15am - 8:35am and 3pm - 5:30pm, Monday to Friday."), /^OSCAR Before & After School Care 7:15am/);
  assert.equal(keepHoursNotes("8:45am - 2:45pm, Monday to Friday."), "");
  assert.equal(mergeHours("8:15am - 2:15pm, Monday to Friday.", "8:30am - 2:30pm, Monday to Friday. Holiday programme available."), "8:15am - 2:15pm, Monday to Friday.\nHoliday programme available.");
  // Infocare is only read: the hours code never calls it, and the script reads stored replies.
  assert.doesNotMatch(source("../src/one-pager/hours.ts"), /createInfocareClient|fetch\(/);
  assert.doesNotMatch(source("../scripts/one-pager-hours.ts"), /createInfocareClient|client\.request/);
});

test("PDF: a normal info sheet is one page, with or without photos", async () => {
  const content = resolveOnePagerContent("Avenues Kindergarten", AVENUES_FIELDS, DEFAULT_ONE_PAGER_TEMPLATE);
  const photo = { bytes: png(), mimeType: "image/png" };

  const withPhotos = await renderOnePagerPdf(content, { photo1: photo, photo2: photo, photo3: photo, team: photo });
  assert.equal(withPhotos.fits, true);
  assert.equal(pageCount(withPhotos.buffer), 1);
  assert.equal(describeOnePagerFit(withPhotos.fit), "");

  // The newer style, on every sheet: the name, the tagline, About us and the
  // right-hand headings are set in the heading font; the text stays Calibri.
  const pdfSource = source("../src/ui/one-pager-pdf.ts");
  assert.match(pdfSource, /const HEADING_FONT = "Arial";/);
  assert.equal((pdfSource.match(/font: HEADING_FONT/g) ?? []).length, 4);
  assert.match(pdfSource, /defaultStyle: \{ font: "Calibri"/);

  // Empty slots leave the layout intact.
  const bare = await renderOnePagerPdf(resolveOnePagerContent("Thames Coast Kindergarten", fields(), DEFAULT_ONE_PAGER_TEMPLATE));
  assert.equal(bare.fits, true);
  assert.equal(pageCount(bare.buffer), 1);
});

test("PDF: text too long for the page is reported by column, in lines", async () => {
  const paragraph = "We support children to develop a sense of themselves as learners through having fun, building confidence and growing their self-esteem.";
  const longAbout = await renderOnePagerPdf(
    resolveOnePagerContent("Avenues Kindergarten", { ...AVENUES_FIELDS, aboutUs: Array.from({ length: 30 }, () => paragraph).join("\n\n") }, DEFAULT_ONE_PAGER_TEMPLATE),
    { team: { bytes: png(), mimeType: "image/png" } },
  );
  assert.equal(longAbout.fits, false);
  assert.ok(longAbout.fit.leftOverflowLines > 5);
  assert.equal(longAbout.fit.rightOverflowLines, 0);
  assert.match(describeOnePagerFit(longAbout.fit), /^The left column \(About us, team photo and caption\) is \d+ lines too long\.$/);

  const longHours = await renderOnePagerPdf(
    resolveOnePagerContent("Avenues Kindergarten", { ...AVENUES_FIELDS, hours: Array.from({ length: 80 }, (_, index) => `Session ${index + 1}: 8:30am - 2:30pm`).join("\n") }, DEFAULT_ONE_PAGER_TEMPLATE),
  );
  assert.equal(longHours.fits, false);
  assert.equal(longHours.fit.leftOverflowLines, 0);
  assert.ok(longHours.fit.rightOverflowLines > 5);
});

test("PDF: a long About us shrinks the team photo before it is refused", async () => {
  const paragraph = "Our learning program is a synergy of children's interests and teacher led opportunities, and we see diversity as a strength.";
  const about = Array.from({ length: 8 }, () => paragraph).join("\n\n");
  const result = await renderOnePagerPdf(resolveOnePagerContent("Arataki Kindergarten", { ...AVENUES_FIELDS, aboutUs: about }, DEFAULT_ONE_PAGER_TEMPLATE), {
    team: { bytes: png(), mimeType: "image/png" },
  });
  assert.equal(result.fits, true);
  assert.equal(pageCount(result.buffer), 1);
});

// ---- Routes ---------------------------------------------------------------------

function memoryStore(centres: OnePagerCentre[] = [AVENUES, BROOKFIELD]) {
  let template: OnePagerTemplateText = { ...DEFAULT_ONE_PAGER_TEMPLATE };
  const rows: OnePagerRecord[] = [];
  let nextId = 1;
  const about: Record<number, string> = {};
  const byId = (id: number) => rows.find((row) => row.id === id)!;

  const store: OnePagerStore = {
    listCentres: async () => centres,
    getTemplate: async () => template,
    updateTemplate: async (changes) => (template = { ...template, ...changes }),
    list: async () => rows,
    get: async (centreKey) => rows.find((row) => row.centreKey === centreKey) ?? null,
    async ensure(centreKey, initial) {
      const existing = rows.find((row) => row.centreKey === centreKey);
      if (existing) return existing;
      const row: OnePagerRecord = { ...EMPTY_ONE_PAGER_FIELDS, serviceModel: "kindergarten", ...initial, id: nextId++, centreKey, updatedAt: new Date("2026-11-15T00:00:00Z"), images: [], previousImages: [] };
      rows.push(row);
      return row;
    },
    async update(centreKey, changes) {
      const row = rows.find((entry) => entry.centreKey === centreKey);
      if (!row) return null;
      Object.assign(row, changes);
      return row;
    },
    async setImage(onePagerId, slot, file) {
      const row = byId(onePagerId);
      const replaced = row.images.find((image) => image.slot === slot) ?? null;
      const dropped = replaced ? (row.previousImages.find((image) => image.slot === slot) ?? null) : null;
      if (replaced) row.previousImages = [...row.previousImages.filter((image) => image.slot !== slot), replaced];
      row.images = row.images.filter((image) => image.slot !== slot);
      row.images.push({ aiGenerated: false, aiPrompt: "", ...file, id: nextId++, onePagerId, slot, createdAt: new Date() });
      return dropped;
    },
    async revertImage(onePagerId, slot) {
      const row = byId(onePagerId);
      const kept = row.previousImages.find((image) => image.slot === slot);
      if (!kept) return false;
      const current = row.images.find((image) => image.slot === slot);
      row.previousImages = row.previousImages.filter((image) => image.slot !== slot);
      row.images = row.images.filter((image) => image.slot !== slot);
      if (current) row.previousImages.push({ ...current, id: nextId++ });
      row.images.push({ ...kept, id: nextId++ });
      return true;
    },
    async removeImage(onePagerId, slot) {
      const row = byId(onePagerId);
      const gone = [...row.images, ...row.previousImages].filter((entry) => entry.slot === slot);
      row.images = row.images.filter((entry) => entry.slot !== slot);
      row.previousImages = row.previousImages.filter((entry) => entry.slot !== slot);
      return gone;
    },
    async setImageAiGenerated(onePagerId, slot, aiGenerated) {
      const image = byId(onePagerId).images.find((entry) => entry.slot === slot);
      if (!image) return false;
      image.aiGenerated = aiGenerated;
      return true;
    },
    async getImage(id) {
      return rows.flatMap((row) => row.images).find((image: OnePagerImageRecord) => image.id === id) ?? null;
    },
    async knownContact(licenseNumber) {
      return licenseNumber === 5001 ? { address: "27 Botanical Road", suburb: "", city: "Tauranga", phone: "07-5784481", email: "Avenues@ikindergartens.nz" } : null;
    },
    async aboutSources(centreKey) {
      return { isEnviroschool: false, introParagraph: about[centreKey] ?? "", currentWebsiteHtml: null, oldWebsiteHtml: null };
    },
  };
  return { store, rows, about };
}

async function buildApp(options: { runChat?: (messages: Array<{ role: string; content: string }>) => Promise<string>; generateImage?: (prompt: string) => Promise<{ bytes: Buffer; mimeType: string }>; regenerateImage?: SlotImageRegenerator } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "one-pager-test-"));
  const memory = memoryStore();
  const app = Fastify();
  await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
  registerOnePagerRoutes(app, { store: memory.store, rootDir, runChat: options.runChat, generateImage: options.generateImage, regenerateImage: options.regenerateImage, now: () => new Date("2026-11-15T01:00:00Z") });
  return { app, rootDir, ...memory, close: () => rmSync(rootDir, { recursive: true, force: true }) };
}

function upload(bytes: Buffer, name = "team.jpg") {
  const boundary = "----onepagertest";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

test("routes: opening a kindergarten starts its info sheet with the contact details we hold", async () => {
  const { app, rows, close } = await buildApp();
  try {
    const list = await app.inject({ method: "GET", url: "/one-pager" });
    assert.equal(list.statusCode, 200);
    assert.match(list.body, /<button type="submit" class="one-pager-list__row" name="centre" value="108">\s*<span class="one-pager-list__name"><i[^>]*><\/i>Avenues Kindergarten</);
    assert.equal(rows.length, 0);

    const page = await app.inject({ method: "GET", url: "/one-pager?centre=108" });
    assert.match(page.body, /name="address" maxlength="200" value="27 Botanical Road, Tauranga"/);
    assert.match(page.body, /name="phone" maxlength="60" value="07 578 4481"/);
    assert.equal(rows[0].email, "avenues@ikindergartens.nz");

    const unknown = await app.inject({ method: "POST", url: "/api/one-pager/999", payload: { hours: "x" } });
    assert.equal(unknown.statusCode, 404);
  } finally {
    await close();
  }
});

test("routes: saving text answers with the panels it touched and leaves other fields alone", async () => {
  const { app, rows, close } = await buildApp();
  try {
    await app.inject({ method: "GET", url: "/one-pager?centre=108" });
    const saved = await app.inject({ method: "POST", url: "/api/one-pager/108", payload: { hours: "8:30am - 2:30pm\r\nMonday to Friday" } });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(Object.keys(saved.json().fragments).sort(), ["list", "text"]);
    assert.equal(rows[0].hours, "8:30am - 2:30pm\nMonday to Friday");
    assert.equal(rows[0].address, "27 Botanical Road, Tauranga");

    const prefill = await app.inject({ method: "POST", url: "/api/one-pager/108/prefill" });
    assert.deepEqual(prefill.json().contact, { address: "27 Botanical Road, Tauranga", phone: "07 578 4481", email: "avenues@ikindergartens.nz" });
    const nothing = await app.inject({ method: "POST", url: "/api/one-pager/109/prefill" });
    assert.equal(nothing.statusCode, 404);
  } finally {
    await close();
  }
});

test("routes: shared text saves for every kindergarten and cannot be left empty", async () => {
  const { app, store, close } = await buildApp();
  try {
    const blank = await app.inject({ method: "POST", url: "/api/one-pager/template", payload: { tagline: "  " } });
    assert.equal(blank.statusCode, 400);
    const saved = await app.inject({ method: "POST", url: "/api/one-pager/template", payload: { tagline: "Making every year count" } });
    assert.equal(saved.json().template.tagline, "Making every year count");
    assert.deepEqual(Object.keys(saved.json().fragments), ["shared"]);
    assert.equal((await store.getTemplate()).costText, DEFAULT_ONE_PAGER_TEMPLATE.costText);
  } finally {
    await close();
  }
});

test("routes: a photo goes in its slot, replaces the last one, is served and removed", async () => {
  const { app, rows, rootDir, close } = await buildApp();
  try {
    assert.equal(sniffOnePagerImage(png()), "image/png");
    assert.equal(sniffOnePagerImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
    assert.equal(sniffOnePagerImage(Buffer.from("<svg onload=alert(1)>")), null);

    const refused = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(Buffer.from("not a photo")) });
    assert.equal(refused.statusCode, 400);
    const badSlot = await app.inject({ method: "POST", url: "/api/one-pager/108/images/banner", ...upload(png()) });
    assert.equal(badSlot.statusCode, 404);

    const first = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png()) });
    assert.equal(first.statusCode, 200);
    assert.deepEqual(Object.keys(first.json().fragments).sort(), ["list", "photos"]);
    assert.match(first.json().fragments.photos, /data-one-pager-remove="team"/);
    const firstName = rows[0].images[0].storedName;
    // Named by the app, by what the bytes are rather than what the upload said.
    assert.match(firstName, /^[0-9a-f-]{36}\.png$/);

    // Nothing has been replaced yet, so there is nothing to go back to.
    assert.doesNotMatch(first.json().fragments.photos, /data-one-pager-revert/);
    assert.match(first.json().fragments.photos, new RegExp(`data-one-pager-download="/api/one-pager/images/${rows[0].images[0].id}/file" data-filename="Avenues Kindergarten Team photo\\.png"`));
    const nothingToRevert = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team/revert" });
    assert.equal(nothingToRevert.statusCode, 404);

    // A replaced photo is kept, once, so Revert can put it back.
    const second = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png(10, 8)) });
    assert.equal(rows[0].images.length, 1);
    const secondName = rows[0].images[0].storedName;
    assert.match(second.json().fragments.photos, /data-one-pager-revert="team"/);
    const pngFiles = () => readdirSync(join(rootDir, ONE_PAGER_IMAGE_DIR)).filter((name) => name.endsWith(".png")).sort();
    assert.deepEqual(pngFiles(), [firstName, secondName].sort());

    const file = await app.inject({ method: "GET", url: `/api/one-pager/images/${rows[0].images[0].id}/file` });
    assert.equal(file.headers["content-type"], "image/png");

    // Revert swaps the two; a second Revert swaps them back. No file is lost.
    const reverted = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team/revert" });
    assert.equal(reverted.statusCode, 200);
    assert.deepEqual(Object.keys(reverted.json().fragments).sort(), ["list", "photos"]);
    assert.equal(rows[0].images[0].storedName, firstName);
    assert.equal(rows[0].previousImages[0].storedName, secondName);
    await app.inject({ method: "POST", url: "/api/one-pager/108/images/team/revert" });
    assert.equal(rows[0].images[0].storedName, secondName);
    assert.deepEqual(pngFiles(), [firstName, secondName].sort());

    // Only one earlier photo is kept: a third upload drops the first.
    await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png(12, 8)) });
    assert.equal(rows[0].previousImages[0].storedName, secondName);
    assert.equal(existsSync(join(rootDir, ONE_PAGER_IMAGE_DIR, firstName)), false);

    // Remove empties the slot for good, the kept photo with it.
    const removed = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team/delete" });
    assert.equal(removed.statusCode, 200);
    assert.equal(rows[0].images.length, 0);
    assert.equal(rows[0].previousImages.length, 0);
    assert.deepEqual(pngFiles(), []);
    assert.doesNotMatch(removed.json().fragments.photos, /data-one-pager-revert|data-one-pager-download/);
  } finally {
    await close();
  }
});

test("routes: the PDF downloads under its name and date; there are no saved versions", async () => {
  const { app, close } = await buildApp();
  try {
    const draft = await app.inject({ method: "GET", url: "/api/one-pager/108/pdf" });
    assert.equal(draft.statusCode, 200);
    assert.equal(draft.headers["content-type"], "application/pdf");
    assert.equal(draft.rawPayload.subarray(0, 5).toString(), "%PDF-");
    assert.match(String(draft.headers["content-disposition"]), /^attachment; filename="Avenues Kindergarten Info Sheet Nov 2026\.pdf"/);
    assert.equal(draft.headers["x-one-pager-fit"], "");
    const inline = await app.inject({ method: "GET", url: "/api/one-pager/108/pdf?inline=1" });
    assert.match(String(inline.headers["content-disposition"]), /^inline;/);
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/versions" })).statusCode, 404);
  } finally {
    await close();
  }
});

test("routes: an info sheet that does not fit on one page says so with its preview", async () => {
  const { app, close } = await buildApp();
  try {
    // Every right-hand section filled to its limit is more than the column holds.
    const filler = "donations help to maintain the buildings ".repeat(40);
    await app.inject({ method: "POST", url: "/api/one-pager/108", payload: { hours: filler, costOverride: filler, teachersOverride: filler, enrolOverride: filler } });
    const preview = await app.inject({ method: "GET", url: "/api/one-pager/108/pdf?inline=1" });
    assert.match(decodeURIComponent(String(preview.headers["x-one-pager-fit"])), /^The right column .* is \d+ lines? too long\.$/);
  } finally {
    await close();
  }
});

test("routes: Draft with AI writes from the notes sent, saves nothing, and says when it has nothing to go on", async () => {
  const prompts: string[] = [];
  const { app, rows, close } = await buildApp({
    runChat: async (messages) => {
      prompts.push(messages.map((message) => message.content).join("\n"));
      return "**About us**\n\nWe have a big sandpit.";
    },
  });
  try {
    const nothing = await app.inject({ method: "POST", url: "/api/one-pager/109/draft-about", payload: { notes: "" } });
    assert.equal(nothing.statusCode, 422);
    assert.equal(prompts.length, 0);

    const draft = await app.inject({ method: "POST", url: "/api/one-pager/109/draft-about", payload: { notes: "Big sandpit. Opened 1962." } });
    assert.equal(draft.statusCode, 200);
    // The reply's own heading and markdown are dropped.
    assert.equal(draft.json().text, "We have a big sandpit.");
    assert.match(prompts[0], /Big sandpit\. Opened 1962\./);
    assert.ok(!rows.some((row) => row.centreKey === 109 && row.aboutUs));
  } finally {
    await close();
  }

  const offline = await buildApp();
  try {
    const unavailable = await offline.app.inject({ method: "POST", url: "/api/one-pager/109/draft-about", payload: { notes: "Big sandpit." } });
    assert.equal(unavailable.statusCode, 503);
  } finally {
    await offline.close();
  }
});

// ---- AI generated images --------------------------------------------------------

test("AI images: a generated picture is flagged automatically; an upload starts unflagged; only words go out", async () => {
  const prompts: string[] = [];
  const { app, rows, close } = await buildApp({
    generateImage: async (prompt) => {
      prompts.push(prompt);
      return { bytes: png(12, 8), mimeType: "image/png" };
    },
  });
  try {
    const blank = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/generate", payload: { prompt: "  " } });
    assert.equal(blank.statusCode, 400);

    const made = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/generate", payload: { prompt: "Two children painting at an easel" } });
    assert.equal(made.statusCode, 200);
    assert.deepEqual(prompts, ["Two children painting at an easel"]);
    assert.equal(rows[0].images[0].aiGenerated, true);
    assert.equal(rows[0].images[0].aiPrompt, "Two children painting at an easel");
    // The tick box is on, set by the app.
    assert.match(made.json().fragments.photos, /<input type="checkbox" checked data-one-pager-ai="photo1" \/>/);

    // A real photo uploaded into another slot is not flagged.
    await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png()) });
    assert.equal(rows[0].images.find((image) => image.slot === "team")!.aiGenerated, false);

    // Uploading over the generated picture leaves the slot unflagged again.
    const replaced = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png()) });
    assert.equal(rows[0].images.find((image) => image.slot === "photo1")!.aiGenerated, false);
    assert.match(replaced.json().fragments.photos, /<input type="checkbox" data-one-pager-ai="photo1" \/>/);

    // Revert brings the generated picture back with its own flag, and the
    // real photo it swaps out keeps its: no flag is ever handed across.
    const reverted = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/revert" });
    assert.equal(rows[0].images.find((image) => image.slot === "photo1")!.aiGenerated, true);
    assert.equal(rows[0].previousImages.find((image) => image.slot === "photo1")!.aiGenerated, false);
    assert.match(reverted.json().fragments.photos, /<input type="checkbox" checked data-one-pager-ai="photo1" \/>/);
    await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/revert" });
    assert.equal(rows[0].images.find((image) => image.slot === "photo1")!.aiGenerated, false);

    // The upload and the reverts reached nothing outside: the generator saw one description and no more.
    assert.equal(prompts.length, 1);
  } finally {
    await close();
  }

  const notSetUp = await buildApp();
  try {
    const refused = await notSetUp.app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/generate", payload: { prompt: "A sandpit" } });
    assert.equal(refused.statusCode, 503);
  } finally {
    await notSetUp.close();
  }
});

test("AI images: the user can tick and untick AI generated, and a ticked photo skips the question", async () => {
  const openAi = fakeImageEdits();
  const { app, rows, close } = await buildApp({ regenerateImage: createSlotImageRegenerator({ OPENAI_API_KEY: "sk-test" }, openAi.fetchImpl) });
  const tick = (slot: string, payload: object) => app.inject({ method: "POST", url: `/api/one-pager/108/images/${slot}/ai-generated`, payload });
  try {
    // An empty slot has nothing to tick.
    assert.equal((await tick("photo1", { aiGenerated: true })).statusCode, 404);

    await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png()) });
    const id = rows[0].images[0].id;

    // Only a clear yes or no is taken.
    assert.equal((await tick("photo1", { aiGenerated: "true" })).statusCode, 400);
    assert.equal((await tick("photo1", {})).statusCode, 400);
    assert.equal((await tick("nope", { aiGenerated: true })).statusCode, 404);
    assert.equal(rows[0].images[0].aiGenerated, false);

    // Unticked: regenerating still needs the answer.
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: {} })).statusCode, 400);
    assert.equal(openAi.calls.length, 0);

    // Ticked by the user: the same photo, now flagged, and the question is skipped.
    const ticked = await tick("photo1", { aiGenerated: true });
    assert.equal(ticked.statusCode, 200);
    assert.equal(rows[0].images[0].aiGenerated, true);
    assert.equal(rows[0].images[0].id, id);
    assert.match(ticked.json().fragments.photos, /<input type="checkbox" checked data-one-pager-ai="photo1" \/>/);
    assert.match(ticked.json().fragments.photos, /data-one-pager-regenerate="photo1" data-label="Photo 1" data-ai="1"/);

    // Unticked again: the question is back.
    const unticked = await tick("photo1", { aiGenerated: false });
    assert.equal(rows[0].images[0].aiGenerated, false);
    assert.match(unticked.json().fragments.photos, /<input type="checkbox" data-one-pager-ai="photo1" \/>/);
    assert.match(unticked.json().fragments.photos, /data-one-pager-regenerate="photo1" data-label="Photo 1" data-ai=""/);
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: {} })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { containsRealChildren: "yes" } })).statusCode, 403);
    assert.equal(openAi.calls.length, 0);

    // Ticked, then regenerated with no answer: it is sent.
    await tick("photo1", { aiGenerated: true });
    assert.equal((await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: {} })).statusCode, 200);
    assert.equal(openAi.calls.length, 1);
  } finally {
    await close();
  }
});

test("AI images: an image of real children can NEVER be sent to OpenAI", () => {
  // The gate: a picture goes only when the user answered "no" to the
  // question, or it is flagged AI generated (by the app when it generated
  // the picture, or by the user's tick): the flag skips the question.
  assert.equal(REAL_CHILDREN_QUESTION, "Does this image contain real children?");
  assert.throws(() => assertNoRealChildren({ aiGenerated: false }, "yes"), /never uploaded/);
  assert.throws(() => assertNoRealChildren({ aiGenerated: false }, undefined), /Answer first/);
  assert.throws(() => assertNoRealChildren({ aiGenerated: false }, ""), /Answer first/);
  assert.throws(() => assertNoRealChildren({ aiGenerated: false }, true), /Answer first/);
  assert.throws(() => assertNoRealChildren(null, "NO"), /Answer first/);
  assert.doesNotThrow(() => assertNoRealChildren({ aiGenerated: false }, "no"));
  assert.doesNotThrow(() => assertNoRealChildren({ aiGenerated: true }, undefined));

  // The info sheet code holds the photos and has no way to reach OpenAI
  // itself: it is only handed functions made in src/image-ai.
  for (const path of ["../src/one-pager/routes.ts", "../src/storage/one-pager-store.ts", "../src/ui/one-pager-app-shell.ts", "../src/ui/one-pager-pdf.ts"]) {
    assert.doesNotMatch(source(path), /api\.openai\.com|OPENAI_API_KEY|\bfetch\(\s*["'`]https?:/, path);
  }

  // One function in the app uploads a picture (editImage), and the only code
  // that calls it checks the gate on the line before.
  const imageAi = ["config", "openai", "routes", "photo-slot"].map((name) => source(`../src/image-ai/${name}.ts`)).join("\n");
  assert.equal((imageAi.match(/images\/edits/g) ?? []).length, 1);
  assert.doesNotMatch(imageAi, /images\/variations|image_url|input_image|\/responses\b|chat\/completions/);
  const allSource = ["../src/server.ts", "../src/one-pager/routes.ts", "../src/image-ai/routes.ts", "../src/image-ai/photo-slot.ts"].map(source).join("\n");
  assert.equal((allSource.match(/\beditImage\(/g) ?? []).length, 1);
  assert.match(source("../src/image-ai/photo-slot.ts"), /assertNoRealChildren\(input\.image, input\.containsRealChildren\);[\s\S]{0,400}await editImage\(/);

  // Uploads are stored unflagged; the app itself sets the flag in exactly one
  // place, where a picture that came from the AI image model is stored. The
  // only other way it is set is the user's tick, through its own route.
  const routes = source("../src/one-pager/routes.ts");
  assert.match(routes, /sizeBytes: bytes\.length, aiGenerated: false \}/);
  assert.equal((routes.match(/aiGenerated: true/g) ?? []).length, 1);
  assert.equal((routes.match(/setImageAiGenerated\(/g) ?? []).length, 1);
  assert.match(routes, /typeof ticked !== "boolean"[\s\S]{0,300}store\.setImageAiGenerated\(onePager\.id, slot, ticked\)/);
  assert.doesNotMatch(source("../scripts/one-pager-seed.ts"), /aiGenerated: true/);
});

// Stands in for OpenAI's image edit endpoint and records what was uploaded.
function fakeImageEdits() {
  const calls: Array<{ url: string; prompt: string; imageBytes: number }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const form = init?.body as FormData;
    calls.push({ url: String(url), prompt: String(form.get("prompt")), imageBytes: (form.get("image") as Blob).size });
    return Response.json({ data: [{ b64_json: png(16, 10).toString("base64") }] });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("Regenerate: asks about real children, stops on yes, sends on no, and skips the question for an AI generated picture", async () => {
  const openAi = fakeImageEdits();
  const { app, rows, close } = await buildApp({ regenerateImage: createSlotImageRegenerator({ OPENAI_API_KEY: "sk-test" }, openAi.fetchImpl) });
  try {
    const empty = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { containsRealChildren: "no" } });
    assert.equal(empty.statusCode, 404);

    await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png()) });
    const uploadedName = rows[0].images[0].storedName;

    // No answer, or "yes": nothing leaves the computer and the photo stays as it was.
    const unanswered = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { request: "Add children" } });
    assert.equal(unanswered.statusCode, 400);
    const yes = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { containsRealChildren: "yes" } });
    assert.equal(yes.statusCode, 403);
    assert.match(yes.json().error, /real children in it is never uploaded/);
    assert.equal(openAi.calls.length, 0);
    assert.equal(rows[0].images[0].storedName, uploadedName);
    assert.equal(rows[0].images[0].aiGenerated, false);

    // "no", with nothing typed: the default option is asked for, and the result is flagged.
    const no = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { containsRealChildren: "no", request: "  " } });
    assert.equal(no.statusCode, 200);
    assert.equal(openAi.calls.length, 1);
    assert.match(openAi.calls[0].url, /\/images\/edits$/);
    assert.ok(openAi.calls[0].imageBytes > 0);
    assert.match(openAi.calls[0].prompt, /Replace every child in the photograph with a new, different child: exactly the same number/);
    assert.equal(rows[0].images[0].aiGenerated, true);
    assert.equal(rows[0].images[0].aiPrompt, openAi.calls[0].prompt);
    assert.match(no.json().fragments.photos, /data-one-pager-regenerate="photo1" data-label="Photo 1" data-ai="1"/);

    // Now it is AI generated: no answer is needed, and the typed request is used.
    const again = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/regenerate", payload: { request: "Make it a sunny afternoon", option: "busy-group" } });
    assert.equal(again.statusCode, 200);
    assert.match(openAi.calls[1].prompt, /Make it a sunny afternoon/);
    assert.doesNotMatch(openAi.calls[1].prompt, /six to eight children/);

    // The team photo is of real staff and is not regenerated.
    await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png()) });
    const team = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team/regenerate", payload: { containsRealChildren: "no" } });
    assert.equal(team.statusCode, 404);
    assert.equal(openAi.calls.length, 2);
  } finally {
    await close();
  }
});

test("Upscale: a photo with too few pixels for its slot is offered an AI upscale, behind the same question", async () => {
  // Sharp is 300 of the photo's pixels to an inch of paper, where its slot puts it.
  assert.equal(ONE_PAGER_PRINT_DPI, 300);
  assert.ok(onePagerPhotoDpi("photo1", 719, 503) >= 300);
  assert.ok(onePagerPhotoDpi("photo1", 600, 420) < 300);
  // A top photo fills its box, so a wide one is measured by its height.
  assert.ok(onePagerPhotoDpi("photo1", 2000, 400) < 300);
  assert.ok(onePagerPhotoDpi("team", 1200, 900) >= 300);
  assert.ok(onePagerPhotoDpi("team", 800, 600) < 300);
  assert.equal(onePagerPhotoDpi("photo1", 0, 0), 0);

  const openAi = fakeImageEdits();
  const { app, rows, close } = await buildApp({ regenerateImage: createSlotImageRegenerator({ OPENAI_API_KEY: "sk-test" }, openAi.fetchImpl) });
  const upscale = (slot: string, payload: object) => app.inject({ method: "POST", url: `/api/one-pager/108/images/${slot}/upscale`, payload });
  try {
    assert.equal((await upscale("photo1", { containsRealChildren: "no" })).statusCode, 404);

    // Large enough: no upscale is offered, and one asked for anyway is refused.
    const sharp = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png(800, 560)) });
    assert.equal(sharp.json().upscale, false);
    assert.equal((await upscale("photo1", { containsRealChildren: "no" })).statusCode, 409);

    // A tight crop: the upload says it can be upscaled. It is still an upload: unflagged.
    const cropped = await app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png(300, 210)) });
    assert.equal(cropped.json().upscale, true);
    const croppedName = rows[0].images[0].storedName;
    assert.equal(rows[0].images[0].aiGenerated, false);

    // No answer, or "yes": nothing leaves the computer and the cropped photo stays.
    assert.equal((await upscale("photo1", {})).statusCode, 400);
    const yes = await upscale("photo1", { containsRealChildren: "yes" });
    assert.equal(yes.statusCode, 403);
    assert.match(yes.json().error, /real children in it is never uploaded/);
    assert.equal(openAi.calls.length, 0);
    assert.equal(rows[0].images[0].storedName, croppedName);

    // "no": the same picture is asked for, only sharper. Whatever else is posted is not sent.
    const no = await upscale("photo1", { containsRealChildren: "no", request: "Add a pony", option: "busy-group" });
    assert.equal(no.statusCode, 200);
    assert.equal(openAi.calls.length, 1);
    assert.match(openAi.calls[0].url, /\/images\/edits$/);
    assert.equal(openAi.calls[0].prompt, UPSCALE_PROMPT);
    assert.match(UPSCALE_PROMPT, /Reproduce this photograph exactly as it is, at a higher resolution/);
    assert.match(UPSCALE_PROMPT, /Do not add, remove, move, replace or restyle anything/);
    assert.doesNotMatch(UPSCALE_PROMPT, /m[aā]ori/i);
    // It came from the AI image model, so it is flagged; the cropped photo is kept for Revert.
    assert.equal(rows[0].images[0].aiGenerated, true);
    assert.equal(rows[0].previousImages[0].storedName, croppedName);
    assert.match(no.json().fragments.photos, /data-one-pager-revert="photo1"/);

    // The team photo is of real staff: an upscale is never offered for it, or done.
    const team = await app.inject({ method: "POST", url: "/api/one-pager/108/images/team", ...upload(png(300, 225)) });
    assert.equal(team.json().upscale, false);
    assert.equal((await upscale("team", { containsRealChildren: "no" })).statusCode, 404);
    assert.equal(openAi.calls.length, 1);
  } finally {
    await close();
  }

  // Without the OpenAI key nothing is offered.
  const notSetUp = await buildApp();
  try {
    const cropped = await notSetUp.app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1", ...upload(png(300, 210)) });
    assert.equal(cropped.json().upscale, false);
    assert.equal((await notSetUp.app.inject({ method: "POST", url: "/api/one-pager/108/images/photo1/upscale", payload: { containsRealChildren: "no" } })).statusCode, 503);
  } finally {
    await notSetUp.close();
  }
});

test("backup: the data download carries all media, and the original PDFs stay out of git", () => {
  // Every file the app stores is under uploads, which the backup takes whole.
  assert.ok(BACKUP_PATHS.includes("uploads"));
  for (const dir of [ONE_PAGER_IMAGE_DIR, AI_IMAGE_DIR]) assert.equal(dir.split(/[\\/]/)[0], "uploads", dir);
  assert.match(source("../src/server.ts"), /const TASK_ATTACHMENT_DIR = join\("uploads", "task-attachments"\);/);
  // The original info sheet PDFs hold photos of real children and staff:
  // never in git, always in the backup.
  assert.ok(BACKUP_PATHS.includes("docs/One Pager"));
  assert.match(source("../.gitignore"), /^\/docs\/One Pager\/$/m);
  // A restored folder is merged into one that is already there (logs, docs).
  assert.match(source("../scripts/restore-backup.ps1"), /Copy-Item \$_\.FullName \$repoRoot -Recurse -Force/);
});

test("Crop: the whole photo with a crop box, the slot's shape for the top photos and any shape for the team photo", () => {
  const html = renderOnePagerAppShell(pageData(true));
  assert.match(html, /<dialog class="wiki-modal one-pager-crop text-body" data-one-pager-crop aria-label="Crop the photo">/);
  assert.doesNotMatch(html, /data-one-pager-zoom/);
  assert.match(html, /data-one-pager-upload="photo1" data-ratio="1\.4295"/);
  assert.match(html, /data-one-pager-upload="team" data-ratio="free"/);
  // What is uploaded is the box's own pixels, never enlarged, so the server can tell a tight crop.
  assert.match(html, /output\.width = Math\.max\(1, Math\.round\(Math\.min\(OUTPUT_WIDTH, crop\.w\)\)\);/);
  // A tight crop goes on to the upscale, which starts with the real children question.
  assert.match(html, /if \(result\.upscale\) openRedraw\(slot, "upscale"\);/);
  assert.match(html, /sendRedraw\(redrawForm\.querySelector\("\[name=slot\]"\)\.value, "upscale", \{ containsRealChildren: "no" \}\);/);
});

test("Regenerate: the request sent keeps the scene, mixes the children and never uses the word that draws costume", () => {
  assert.equal(REGENERATION_OPTIONS.length, 5);
  // Nothing typed and nothing chosen: the same number of children, doing the same things.
  assert.equal(REGENERATION_OPTIONS[0].key, "same-children");
  assert.match(buildRegenerationPrompt({}), /exactly the same number of children as in the original, each in the same position, pose and activity/);
  for (const option of REGENERATION_OPTIONS) {
    const prompt = buildRegenerationPrompt({ option: option.key });
    assert.ok(prompt.includes(option.text));
    // The people in the old picture never carry over, whatever is asked for.
    assert.match(prompt, /None of the people in the original photograph may remain/);
    assert.match(prompt, /show exactly as many as the original photograph has/);
    assert.match(prompt, /Keep this photograph's place exactly as it is/);
    assert.match(prompt, /about half are Polynesian New Zealanders/);
    assert.match(prompt, /Pacific Island, European and Asian/);
    assert.match(prompt, /ordinary modern play clothes/);
    assert.doesNotMatch(prompt, /m[aā]ori/i);
  }
  // An unknown option falls back to the first; a typed request replaces the option.
  assert.ok(buildRegenerationPrompt({ option: "nope" }).includes(REGENERATION_OPTIONS[0].text));
  const typed = buildRegenerationPrompt({ request: "Three Māori children and a maori teacher gardening", option: "one-child" });
  assert.match(typed, /Three Polynesian New Zealander children and a Polynesian New Zealander teacher gardening/);
  assert.doesNotMatch(typed, /m[aā]ori/i);
  assert.ok(!typed.includes(REGENERATION_OPTIONS.find((option) => option.key === "one-child")!.text));
  assert.match(typed, /None of the people in the original photograph may remain/);
});

// ---- The page and the landing page ----------------------------------------------

function pageData(selected: boolean): OnePagerPageData {
  const onePager: OnePagerRecord = {
    ...AVENUES_FIELDS,
    id: 1,
    centreKey: 108,
    serviceModel: "kindergarten",
    updatedAt: new Date("2026-11-15T01:05:00Z"),
    images: [
      { id: 7, onePagerId: 1, slot: "team", storedName: "a.jpg", storagePath: "uploads/one-pager/a.jpg", mimeType: "image/jpeg", sizeBytes: 1000, aiGenerated: false, aiPrompt: "", createdAt: new Date() },
      { id: 8, onePagerId: 1, slot: "photo1", storedName: "c.jpg", storagePath: "uploads/one-pager/c.jpg", mimeType: "image/jpeg", sizeBytes: 1000, aiGenerated: true, aiPrompt: "Two children painting", createdAt: new Date() },
    ],
    previousImages: [],
  };
  return {
    centres: [AVENUES, BROOKFIELD],
    onePagers: [onePager],
    template: DEFAULT_ONE_PAGER_TEMPLATE,
    selected: selected ? { centre: AVENUES, onePager } : null,
    people: { 108: { seniorLeader: "Marion", headTeacher: "Paula Smith", administrator: "Colleen Jones" } },
  };
}

test("page: list, text, photos and shared text, with the PDF as the preview", () => {
  const html = renderOnePagerAppShell(pageData(true));
  for (const id of ["one-pager-list", "one-pager-text", "one-pager-photos", "one-pager-notes", "one-pager-shared", "one-pager-preview"]) {
    assert.match(html, new RegExp(`data-panel-id="${id}"`));
  }
  // Saved versions are gone: no panel, no button, no column.
  assert.doesNotMatch(html, /one-pager-versions|save-version|>Version</);
  assert.match(html, /href="\/one-pager" aria-label="Info Sheets" title="Info Sheets" aria-current="page"/);
  assert.match(html, /class="panel-action-button action-print" href="\/api\/one-pager\/108\/pdf" download/);
  // Each kindergarten is a button in a GET form, never a link; the open one is marked.
  assert.match(html, /<form class="one-pager-list[^"]*" action="\/one-pager" method="get">/);
  // The list names who looks after each kindergarten: its senior leader, then its head teacher and administrator.
  assert.match(html, /<span>Kindergarten<\/span><span[^>]*>Senior leader<\/span><span[^>]*>Head Teacher \/ Administrator<\/span><span>Photos<\/span><span>Last edited<\/span>/);
  assert.match(
    html,
    /name="centre" value="108" aria-current="true">[\s\S]*?data-one-pager-senior-leader>Marion<\/span>\s*<span[^>]*data-one-pager-team-leads><span>Paula Smith<\/span><span>Colleen Jones<\/span><\/span>\s*<span>2\/4<\/span>/,
  );
  // A kindergarten that is not on the contact list has empty people columns.
  assert.match(html, /name="centre" value="109">[\s\S]*?data-one-pager-senior-leader><\/span>/);
  assert.doesNotMatch(html, /href="\/one-pager\?centre=/);
  // The AI generated tick: on for the generated picture, off for the real photo, and the user can change it.
  assert.match(html, /<input type="checkbox" checked data-one-pager-ai="photo1" \/>/);
  assert.match(html, /<input type="checkbox" data-one-pager-ai="team" \/>/);
  assert.match(html, /name="serviceModel"><option value="kindergarten" selected>Kindergarten \(donations\)<\/option><option value="all-day">All Day \(fees\)<\/option>/);
  assert.match(html, /<img class="one-pager-photo__image" src="\/api\/one-pager\/images\/7\/file"/);
  // The shared text shows in a kindergarten's empty box as its placeholder.
  assert.match(html, /name="teachersOverride"[^>]*placeholder="Yes\. All of our teachers are 100% trained/);
  assert.match(html, /<script>[\s\S]*localStorage/); // the theme script is in the head
});

test("page: before a kindergarten is chosen only the list and shared text show", () => {
  const html = renderOnePagerAppShell(pageData(false));
  assert.match(html, /data-panel-id="one-pager-list"/);
  assert.match(html, /data-panel-id="one-pager-shared"/);
  assert.doesNotMatch(html, /data-panel-id="one-pager-(text|photos)"/);
  assert.doesNotMatch(html, /action-print/);
});

test("page: panel bodies are data and controls, with no explainer paragraphs", () => {
  const fragments = renderOnePagerFragments(pageData(true), ["list", "text", "photos", "shared"]);
  for (const html of Object.values(fragments)) assert.doesNotMatch(html, /<p(\s|>)/);
});

test("every page's nav rail links to Info Sheets", () => {
  for (const file of ["app-shell", "budget-app-shell", "comms-app-shell", "general-chat-page", "jd-app-shell", "sector-app-shell", "snippets-app-shell", "subscriptions-app-shell", "tasks-app-shell", "wiki-app-shell"]) {
    assert.match(source(`../src/ui/${file}.ts`), /href="\/one-pager" aria-label="Info Sheets"/, file);
  }
});

test("every page's nav rail runs in the landing page's order: big buttons, then small buttons", () => {
  const landing = renderLandingPage();
  const landingOrder = [...landing.matchAll(/class="landing-(?:button|tile) [^"]*" href="(\/[^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(landingOrder.slice(0, 6), ["/app", "/tasks", "/one-pager", "/comms", "/jd", "/budget"]);
  const rails: Record<string, string> = { "one-pager-app-shell": renderOnePagerAppShell(pageData(false)) };
  for (const file of ["app-shell", "budget-app-shell", "comms-app-shell", "general-chat-page", "jd-app-shell", "sector-app-shell", "snippets-app-shell", "subscriptions-app-shell", "tasks-app-shell", "wiki-app-shell"]) {
    rails[file] = source(`../src/ui/${file}.ts`);
  }
  for (const [file, html] of Object.entries(rails)) {
    const rail = [...html.matchAll(/class="nav-rail__item[^"]*" href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(rail[0], "/", file);
    assert.deepEqual(rail.slice(1), landingOrder.filter((href) => rail.includes(href)), file);
  }
});

test("landing: Info Sheets takes General Chat's place; General Chat is a small button after Sector Insight", () => {
  const html = renderLandingPage({});
  const buttons = html.slice(html.indexOf("landing__buttons"), html.indexOf("landing__tiles"));
  assert.match(buttons, /landing-button--primary" href="\/one-pager"/);
  assert.doesNotMatch(buttons, /href="\/chat"/);
  // Third in the main row, where General Chat was.
  assert.deepEqual([...buttons.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).slice(0, 3), ["/app", "/tasks", "/one-pager"]);
  const tiles = html.slice(html.indexOf("landing__tiles"));
  assert.match(tiles, /landing-tile--link" href="\/chat">\s*<span>General Chat<\/span>/);
  assert.ok(tiles.indexOf('href="/sector"') < tiles.indexOf('href="/chat"'));
});
