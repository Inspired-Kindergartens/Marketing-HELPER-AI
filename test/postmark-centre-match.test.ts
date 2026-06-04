import assert from "node:assert/strict";
import test from "node:test";

import { matchPostmarkEventToCentre } from "../src/postmark/centre-match.js";

const centres = [
  { centreKey: 1, name: "Paengaroa Kindergarten" },
  { centreKey: 2, name: "Papamoa Kindergarten" },
  { centreKey: 3, name: "Papamoa Coast Kindergarten" },
  { centreKey: 4, name: "Avenues Kindergarten" },
];

test("postmark centre matcher uses recipient mailbox when a tag is absent", () => {
  const match = matchPostmarkEventToCentre(
    { recipient: "paengaroa@ikindergartens.nz" },
    centres,
  );

  assert.equal(match?.centreKey, 1);
});

test("postmark centre matcher falls back to recipient when the tag is generic", () => {
  const match = matchPostmarkEventToCentre(
    { tag: "welcome-email", recipient: "paengaroa@ikindergartens.nz" },
    centres,
  );

  assert.equal(match?.centreKey, 1);
});

test("postmark centre matcher leaves ambiguous mailbox names unmatched", () => {
  const match = matchPostmarkEventToCentre(
    { recipient: "kindergarten@ikindergartens.nz" },
    centres,
  );

  assert.equal(match, null);
});

test("postmark centre matcher prefers the exact centre mailbox over a longer centre name", () => {
  const match = matchPostmarkEventToCentre(
    { recipient: "papamoa@ikindergartens.nz" },
    centres,
  );

  assert.equal(match?.centreKey, 2);
});

test("postmark centre matcher recognizes an Avenues recipient mailbox", () => {
  const match = matchPostmarkEventToCentre(
    { recipient: "avenues@ikindergartens.nz" },
    centres,
  );

  assert.equal(match?.centreKey, 4);
});

test("postmark centre matcher recognizes compact multi-word recipient mailboxes", () => {
  const match = matchPostmarkEventToCentre(
    { recipient: "papamoacoast@ikindergartens.nz" },
    centres,
  );

  assert.equal(match?.centreKey, 3);
});
