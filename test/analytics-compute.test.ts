import assert from "node:assert/strict";
import test from "node:test";

import { computeServiceAnalyticsSnapshot } from "../src/analytics/compute.js";
import type { CentreExtractionBundle } from "../src/infocare/extraction.js";

function buildBundle(
  waitingListChildren: CentreExtractionBundle["waitingListChildren"],
  enrolledChildren: CentreExtractionBundle["enrolledChildren"] = [],
  bookingMinutesByChildKey: CentreExtractionBundle["bookingMinutesByChildKey"] = {},
  bookingDatesByChildKey: CentreExtractionBundle["bookingDatesByChildKey"] = {},
): CentreExtractionBundle {
  return {
    centre: {
      centreKey: 1,
      name: "Contract Centre",
      openStatus: "Open",
      ignored: false,
      lastSyncedAt: "2026-05-01T00:00:00.000Z",
    },
    enrolledChildren,
    waitingListChildren,
    licenses: [{ max_children: 40 }],
    bookingMinutesByChildKey,
    bookingDatesByChildKey,
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

test("enrolment ratio uses enrolled headcount against licensed capacity", () => {
  const snapshot = computeServiceAnalyticsSnapshot(
    buildBundle(
      [],
      Array.from({ length: 45 }, (_, index) => ({
        child_key: index + 1,
        birth_date: "2022-01-01",
      })),
      Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, 20 * 60])),
      Object.fromEntries(
        Array.from({ length: 45 }, (_, index) => [
          index + 1,
          index < 20 ? ["2026-05-01", "2026-05-02"] : ["2026-05-01"],
        ]),
      ),
    ),
    40,
    { licensedCapacity: 40, source: "api" },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(snapshot.enrolledCount, 45);
  assert.equal(snapshot.enrolledFteCount, 18);
  assert.equal(snapshot.bookedAverageDailyCount, 32.5);
  assert.equal(snapshot.bookedUtilisationRatio, 0.8125);
  assert.equal(snapshot.enrolmentRatio, 1.125);
});

test("replacement pressure deduplicates leaving, near five, and age five plus children", () => {
  const snapshot = computeServiceAnalyticsSnapshot(
    buildBundle(
      [],
      [
        {
          child_key: 1,
          birth_date: "2021-06-01",
          leaving_date: "2026-06-15",
        },
        {
          child_key: 2,
          birth_date: "2020-01-01",
          leaving_date: "2026-06-20",
        },
        {
          child_key: 3,
          birth_date: "2021-07-15",
        },
        {
          child_key: 4,
          birth_date: "2022-01-01",
          leaving_date: "2026-05-20",
        },
      ],
    ),
    40,
    { licensedCapacity: 40, source: "api" },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(snapshot.knownLeavingCountsByWindow["3M"], 3);
  assert.equal(snapshot.approachingFiveCountsByWindow["3M"], 2);
  assert.equal(snapshot.agedOutCount, 1);
  assert.equal(snapshot.replacementPressureCountsByWindow?.["3M"], 4);
  assert.equal(snapshot.replacementPressure, 4);
});
