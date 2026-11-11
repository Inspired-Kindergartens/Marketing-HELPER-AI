import assert from "node:assert/strict";
import test from "node:test";

import { earliestMetaHistoryDate, planMetaInsightRanges } from "../src/meta/insight-window.js";

test("a daily refresh asks for the last 30 days only", () => {
  const plan = planMetaInsightRanges({ today: "2026-11-10", lastStoredDay: "2026-11-09" });
  assert.deepEqual(plan.recent, { since: "2026-10-11", until: "2026-11-09" });
  assert.deepEqual(plan.history, []);
});

test("after a long gap, the days older than 30 that were never stored are asked for too", () => {
  const plan = planMetaInsightRanges({ today: "2026-11-10", lastStoredDay: "2026-08-31" });
  assert.deepEqual(plan.history, [
    { since: "2026-09-01", until: "2026-09-30" },
    { since: "2026-10-01", until: "2026-10-10" },
  ]);
});

test("a backfill starts no earlier than Meta still keeps, in month-sized chunks with no overlap", () => {
  const plan = planMetaInsightRanges({ today: "2026-11-10", lastStoredDay: "2026-11-09", historyFrom: "1970-01-01" });
  assert.equal(plan.history[0]!.since, earliestMetaHistoryDate("2026-11-10"));
  assert.equal(earliestMetaHistoryDate("2026-11-10"), "2023-10-13");
  assert.equal(plan.history.at(-1)!.until, "2026-10-10");
  for (let index = 1; index < plan.history.length; index += 1) {
    const previousEnd = new Date(`${plan.history[index - 1]!.until}T00:00:00Z`);
    previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
    assert.equal(plan.history[index]!.since, previousEnd.toISOString().slice(0, 10));
  }
});
