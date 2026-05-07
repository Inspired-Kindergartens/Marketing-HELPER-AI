import assert from "node:assert/strict";
import test from "node:test";

import { renderAppShell } from "../src/ui/app-shell.js";
import type { WaitlistDiscoveryReport } from "../src/infocare/waitlist-report.js";

function readChartConfig(html: string, chartId: string) {
  const pattern = new RegExp(`<script type="application/json" data-waitlist-chart="${chartId}">([\\s\\S]*?)</script>`);
  const match = html.match(pattern);

  assert.ok(match?.[1], `Missing chart config for ${chartId}`);

  return JSON.parse(match[1]) as { labels: string[]; datasets: { values: number[] }[] };
}

test("recent demand chart labels remove Kindergarten and trailing name text", () => {
  const report: WaitlistDiscoveryReport = {
    generatedAt: "2026-05-01T00:00:00.000Z",
    openCentreCount: 1,
    totalWaitlistCount: 0,
    waitlistStartingDateCount: 0,
    startDateCount: 0,
    missingStartDateCount: 0,
    medianDays: 0,
    averageDays: 0,
    oldestDays: 0,
    shortPlusTypicalCount: 0,
    shortPlusTypicalTotal: 0,
    longRunningCount: 0,
    longRunningTotal: 0,
    largestWaitlists: [],
    longTailWaitlists: [],
    distribution: [],
    ageProfileByThreshold: [],
    thresholds: [],
    recentDemand: {
      lastMonth: [
        {
          centre: "Contract Centre Kindergarten North",
          newEnrolments: 3,
          newWaitlistEntries: 5,
          combined: 8,
        },
      ],
      lastTwoMonths: [],
      lastThreeMonths: [],
    },
  };

  const html = renderAppShell(null, { waitlistReport: report });
  const config = readChartConfig(html, "waitlist-recent-month-chart");

  assert.deepEqual(config.labels, ["Contract Centre"]);
  assert.deepEqual(config.datasets[0]?.values, [3]);
  assert.deepEqual(config.datasets[1]?.values, [5]);
});
