import assert from "node:assert/strict";
import test from "node:test";

import {
  matchCentreContact,
  normalizeCentreContactName,
  readSeniorTeacherList,
  readSeniorTeacherListStats,
} from "../src/storage/centre-contact-store.js";

const contacts = [
  {
    kindergarten: "Avenues",
    headTeacher: "Catherine Geddes",
    administrator: "Jenna Fenton",
    email: "avenues@ikindergartens.nz",
  },
  {
    kindergarten: "Pāpāmoa Coast",
    headTeacher: "Example",
    administrator: "Person",
    email: "papamoacoast@ikindergartens.nz",
  },
  {
    kindergarten: "OPEYS/OSCAR",
    headTeacher: "Example",
    administrator: "Person",
    email: "opeys@ikindergartens.nz",
  },
];

test("centre contact matcher normalizes kindergarten suffixes", () => {
  const match = matchCentreContact("Avenues Kindergarten", contacts);

  assert.equal(match?.email, "avenues@ikindergartens.nz");
});

test("centre contact name normalizer removes generic centre words", () => {
  assert.equal(normalizeCentreContactName("The Avenues Kindergarten"), "avenues");
});

test("centre contact matcher ignores macrons", () => {
  const match = matchCentreContact("Papamoa Coast Kindergarten", contacts);

  assert.equal(match?.email, "papamoacoast@ikindergartens.nz");
});

test("centre contact matcher uses unique distinctive tokens for renamed services", () => {
  const match = matchCentreContact("OPEYS All Day Kindergarten", contacts);

  assert.equal(match?.email, "opeys@ikindergartens.nz");
});

// The uploaded workbook is read for the senior teacher only: the head teacher
// and administrator are Infocare's, and the email is the Info Sheet's.
test("workbook reader reads the senior teacher of each kindergarten and nothing else", async () => {
  const workbookContacts = await readSeniorTeacherList();
  const match = matchCentreContact("Avenues Kindergarten", workbookContacts);

  assert.deepEqual(match, { kindergarten: "Avenues", keySeniorTeacher: "Haylee" });
});

test("workbook reader reports workbook rows separately from usable rows", async () => {
  const stats = await readSeniorTeacherListStats();

  assert.equal(stats.rowCount, 26);
  assert.equal(stats.contacts.length, 26);
});

test("the app does not need the workbook: no file reads as an empty list", async () => {
  assert.deepEqual(await readSeniorTeacherListStats("no-such-workbook.xlsx"), { contacts: [], rowCount: 0 });
});
