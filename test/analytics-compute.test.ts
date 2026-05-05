import assert from "node:assert/strict";
import test from "node:test";

import { computeServiceAnalyticsSnapshot } from "../src/analytics/compute.js";
import type { CentreExtractionBundle } from "../src/infocare/extraction.js";

function buildBundle(
  waitingListChildren: CentreExtractionBundle["waitingListChildren"],
): CentreExtractionBundle {
  return {
    centre: {
      centreKey: 1,
      name: "Contract Centre",
      openStatus: "Open",
      ignored: false,
      lastSyncedAt: "2026-05-01T00:00:00.000Z",
    },
    enrolledChildren: [],
    waitingListChildren,
    licenses: [{ max_children: 40 }],
    bookingMinutesByChildKey: {},
    extractedAt: "2026-05-05T00:00:00.000Z",
  };
}

test("waitlist age uses application_date before starting_date", () => {
  const snapshot = computeServiceAnalyticsSnapshot(
    buildBundle([
      {
        child_key: 1,
        birth_date: "2022-01-01",
        application_date: "2026-04-01",
        starting_date: "2025-01-01",
      },
      {
        child_key: 2,
        birth_date: "2022-01-01",
        application_date: "2026-03-01",
        starting_date: "2024-01-01",
      },
    ]),
    40,
    { licensedCapacity: 40, source: "api" },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(snapshot.waitlistOldestEntryDays, 61);
  assert.equal(snapshot.waitlistAverageEntryDays, 45.5);
});

test("waitlist age falls back to starting_date only when application_date is absent", () => {
  const snapshot = computeServiceAnalyticsSnapshot(
    buildBundle([
      {
        child_key: 1,
        birth_date: "2022-01-01",
        starting_date: "2026-04-21",
      },
    ]),
    40,
    { licensedCapacity: 40, source: "api" },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(snapshot.waitlistOldestEntryDays, 10);
  assert.equal(snapshot.waitlistAverageEntryDays, 10);
});
