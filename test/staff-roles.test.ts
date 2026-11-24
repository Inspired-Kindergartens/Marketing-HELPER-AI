import assert from "node:assert/strict";
import test from "node:test";

import { centresDueForStaffList, runStaffListSync } from "../src/infocare/staff-list-sync.js";
import { ADMINISTRATOR_JOB, currentHolders, currentStaff, HEAD_TEACHER_JOB, nzDate, staffPersonFromInfocare } from "../src/infocare/staff-roles.js";
import { buildCentreStaffContent, centreStaffPdfFilename, generateCentreStaffPdfBuffer } from "../src/ui/centre-staff-pdf.js";
import { buildJdApprovalEmailText } from "../src/ui/jd/jd-email.js";

const staff = [
  { first_name: "Kathryn", last_name: "Hawkes", job: "Head Teacher", starting_date: "2026-06-08", leaving_date: "" },
  { first_name: "Suzanne", last_name: "Steens", job: "Teacher", starting_date: "2024-10-14", leaving_date: "" },
  { first_name: "Maree", last_name: "Gassner", job: "Reliever", starting_date: "2023-08-07", leaving_date: "" },
  { first_name: "Gwen Rogers", last_name: "Kindergarten", job: "Other", starting_date: "2001-01-01", leaving_date: "" },
].map(staffPersonFromInfocare);

test("the head teacher is the person in Infocare's Head Teacher job today", () => {
  assert.equal(currentHolders(staff, HEAD_TEACHER_JOB, "2026-11-24"), "Kathryn Hawkes");
  // Not yet started on the day: nobody.
  assert.equal(currentHolders(staff, HEAD_TEACHER_JOB, "2026-06-07"), "");
});

test("the administrator is the Administrator job only: a reliever is never used instead", () => {
  assert.equal(currentHolders(staff, ADMINISTRATOR_JOB, "2026-11-24"), "");
  const withAdministrator = [...staff, staffPersonFromInfocare({ first_name: "Olivia", last_name: "Luoni", job: "Administrator", starting_date: "2022-05-04", leaving_date: null })];
  assert.equal(currentHolders(withAdministrator, ADMINISTRATOR_JOB, "2026-11-24"), "Olivia Luoni");
});

test("someone who has left no longer holds the job; a shared job names both", () => {
  const people = [
    { first_name: "Old", last_name: "Head", job: "Head Teacher", starting_date: "2015-01-01", leaving_date: "2026-06-05" },
    { first_name: "New", last_name: "Head", job: "head teacher", starting_date: "2026-06-08", leaving_date: "" },
    { first_name: "Other", last_name: "Head", job: "Head Teacher", starting_date: "2026-06-08", leaving_date: "2027-01-31" },
  ].map(staffPersonFromInfocare);
  assert.equal(currentHolders(people, HEAD_TEACHER_JOB, "2026-11-24"), "New Head, Other Head");
  assert.equal(currentHolders(people, HEAD_TEACHER_JOB, "2026-06-01"), "Old Head");
});

test("Centre Staff PDF lists who works there today: head teacher, administrator, teachers, then other jobs", async () => {
  const people = [
    { first_name: "Zed", last_name: "Aid", job: "Teacher Aid", starting_date: "2024-06-10", leaving_date: "" },
    { first_name: "Suzanne", last_name: "Steens", job: "Teacher", starting_date: "2024-10-14", leaving_date: "" },
    { first_name: "Maree", last_name: "Gassner", job: "Administrator", starting_date: "2023-08-07", leaving_date: "" },
    { first_name: "Amanda", last_name: "Richardson", job: "Teacher", starting_date: "2015-01-21", leaving_date: "" },
    { first_name: "Kathryn", last_name: "Hawkes", job: "Head Teacher", starting_date: "2026-06-08", leaving_date: "" },
    // Not people, or not here today.
    { first_name: "Gwen Rogers", last_name: "Kindergarten", job: "Other", starting_date: "2001-01-01", leaving_date: "" },
    { first_name: "Discretionary", last_name: "Staff", job: "Reliever", starting_date: "2000-01-01", leaving_date: "" },
    { first_name: "Claire", last_name: "Davison", job: "Head Teacher", starting_date: "2023-07-17", leaving_date: "2026-04-17" },
    { first_name: "Next", last_name: "Year", job: "Teacher", starting_date: "2027-02-01", leaving_date: "" },
  ].map(staffPersonFromInfocare);
  const listed = currentStaff(people, "2026-11-24");
  assert.deepEqual(listed, [
    { name: "Kathryn Hawkes", job: "Head Teacher" },
    { name: "Maree Gassner", job: "Administrator" },
    { name: "Amanda Richardson", job: "Teacher" },
    { name: "Suzanne Steens", job: "Teacher" },
    { name: "Zed Aid", job: "Teacher Aid" },
  ]);

  const sections = [
    { kindergarten: "Gwen Rogers Kindergarten", email: "gwenrogers@example.test", seniorTeacher: "Haylee", people: listed },
    { kindergarten: "No List Kindergarten", email: "", seniorTeacher: "", people: [] },
  ];
  const content = JSON.stringify(buildCentreStaffContent(sections));
  assert.match(content, /"text":"Gwen Rogers Kindergarten"/);
  assert.match(content, /gwenrogers@example\.test  ·  Senior Teacher: Haylee/);
  assert.match(content, /"text":"Kathryn Hawkes"[\s\S]*"text":"Head Teacher"[\s\S]*"text":"Maree Gassner"/);
  assert.match(content, /No staff list from Infocare yet\./);
  assert.equal(centreStaffPdfFilename(new Date("2026-11-23T11:30:00Z")), "Centre-Staff-2026-11-24.pdf");

  const pdf = await generateCentreStaffPdfBuffer(sections, new Date("2026-11-23T21:24:00Z"), new Date("2026-11-24T00:00:00Z"));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("the day is New Zealand's", () => {
  // 11:30 UTC on the 23rd is already the 24th in New Zealand.
  assert.equal(nzDate(new Date("2026-11-23T11:30:00Z")), "2026-11-24");
});

test("the staff list is fetched once a day: a kindergarten fetched today is skipped", async () => {
  const centres = [
    { centreKey: 1, name: "One" },
    { centreKey: 2, name: "Two" },
    { centreKey: 3, name: "Three" },
  ];
  const now = new Date("2026-11-24T02:00:00Z"); // 3 pm on the 24th in New Zealand
  const newest = new Map([
    [1, new Date("2026-11-23T22:00:00Z")], // 11 am on the 24th: today
    [2, new Date("2026-11-22T22:00:00Z")], // the 23rd: yesterday
  ]);
  assert.deepEqual(centresDueForStaffList(centres, newest, now).map((centre) => centre.centreKey), [2, 3]);

  const calls: Array<{ mode: string; parameters: Record<string, unknown> }> = [];
  const log = { info: () => undefined, warn: () => undefined };
  const result = await runStaffListSync(
    log,
    { centres: async () => centres, newestReceivedAt: async () => newest },
    {
      now,
      delayMs: 0,
      client: {
        request: async (mode: string, parameters: Record<string, unknown> = {}) => {
          calls.push({ mode, parameters });
          if (parameters.centre_key === 3) throw new Error("Infocare is down");
          return {} as never;
        },
      },
    },
  );
  // Read-only, one call per kindergarten that is due, and a failure does not stop the rest.
  assert.deepEqual(calls.map((call) => [call.mode, call.parameters.centre_key]), [["get_staff_list", 2], ["get_staff_list", 3]]);
  assert.deepEqual(result, { fetched: 1, failed: 1 });

  // Nothing due: Infocare is not called at all.
  calls.length = 0;
  await runStaffListSync(
    log,
    { centres: async () => centres.slice(0, 1), newestReceivedAt: async () => newest },
    { now, delayMs: 0, client: { request: async () => { throw new Error("must not be called"); } } },
  );
  assert.equal(calls.length, 0);
});

test("job description approval email greets the head teacher, or the service when there is none", () => {
  assert.match(buildJdApprovalEmailText("Kathryn Hawkes", "Haylee", "<p>Blurb</p>", "Gwen Rogers Kindergarten"), /^Kia ora Kathryn,/);
  assert.match(buildJdApprovalEmailText("", "Haylee", "<p>Blurb</p>", "Papamoa Kindergarten"), /^Kia ora Papamoa Kindergarten,/);
  assert.match(buildJdApprovalEmailText("", "", "<p>Blurb</p>"), /^Kia ora,/);
});
