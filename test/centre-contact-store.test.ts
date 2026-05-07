import assert from "node:assert/strict";
import test from "node:test";

import {
  matchCentreContact,
  normalizeCentreContactName,
  readCentreContactList,
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

test("centre contact reader parses the workbook contact columns when available", async () => {
  const workbookContacts = await readCentreContactList();
  const match = matchCentreContact("Avenues Kindergarten", workbookContacts);

  assert.equal(match?.headTeacher, "Catherine Geddes");
  assert.equal(match?.administrator, "Jenna Fenton");
  assert.equal(match?.email, "avenues@ikindergartens.nz");
});
