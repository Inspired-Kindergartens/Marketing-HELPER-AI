import assert from "node:assert/strict";
import test from "node:test";

import { matchMetaNameToCentre, tokenizeMetaName } from "../src/meta/centre-match.js";

const centres = [
  { centreKey: 1, name: "Katikati Kindergarten" },
  { centreKey: 2, name: "Tauranga Kindergarten" },
  { centreKey: 3, name: "Greerton Village Kindergarten" },
  { centreKey: 4, name: "Papamoa Coast Kindergarten" },
];

test("meta centre matcher ignores campaign words and matches kindergarten names", () => {
  const match = matchMetaNameToCentre("Katikati Enrolments April 2026", centres);

  assert.equal(match?.centreKey, 1);
});

test("meta centre matcher keeps ambiguous single-token names unmatched", () => {
  const match = matchMetaNameToCentre("Kindergarten Enrolments April 2026", centres);

  assert.equal(match, null);
});

test("meta centre tokenizer removes generic ad and enrolment words", () => {
  assert.deepEqual(tokenizeMetaName("Katikati Enrolments April 2026"), ["katikati"]);
});

test("meta centre matcher handles macrons in Meta names", () => {
  const match = matchMetaNameToCentre("Pāpāmoa Coast Kindergarten April 2026", centres);

  assert.equal(match?.centreKey, 4);
});
