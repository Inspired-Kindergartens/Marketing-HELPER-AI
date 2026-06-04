import assert from "node:assert/strict";
import test from "node:test";

import { matchFormstackFormToCentre } from "../src/formstack/centre-match.js";

const centres = [
  { centreKey: 1, name: "Katikati Kindergarten" },
  { centreKey: 2, name: "Greerton Village Kindergarten" },
];

test("formstack centre matcher uses a form name", () => {
  const match = matchFormstackFormToCentre({ name: "Katikati Tour Request" }, centres);

  assert.equal(match?.centreKey, 1);
});

test("formstack centre matcher falls back to folder text", () => {
  const match = matchFormstackFormToCentre({ name: "General enquiry", folder: "Greerton Village" }, centres);

  assert.equal(match?.centreKey, 2);
});
