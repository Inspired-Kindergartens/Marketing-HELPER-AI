import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readWaitlistDiscoveryReport } from "../src/infocare/waitlist-report.js";

async function withReport(content: string, run: () => Promise<void>) {
  const originalCwd = process.cwd();
  const workspace = await mkdtemp(join(tmpdir(), "waitlist-report-"));

  try {
    process.chdir(workspace);
    await mkdir(join(workspace, "INFOCARE"));
    await writeFile(join(workspace, "INFOCARE", "INFOCARE-WAITLIST.md"), content, "utf8");
    await run();
  } finally {
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  }
}

test("waitlist report parser accepts application_date source counts", async () => {
  await withReport(
    `# INFOCARE WAITLIST

Generated: 2026-05-01T00:00:00.000Z

## Scope

- Open centres checked: 1
- Waitlist entries returned across all centres: 2
- Waitlist entries with usable \`starting_date\`: 1
- Entries with usable wait-age data from \`application_date\`: 2
- Entries missing usable \`application_date\`: 0

## Summary

- Median time on waitlist: 10 days
- Average time on waitlist: 20 days
- Oldest visible waitlist entry: 30 days

## Threshold Counts

- Short plus typical: 1 of 2
- Long-running plus very long-running: 1 of 2

## Centres With Largest Waitlists

| Centre | Waitlist | Short wait | Typical wait | Long-running wait | Very long-running wait |
|---|---:|---:|---:|---:|---:|
| Contract Centre | 2 | 1 | 0 | 1 | 0 |
`,
    async () => {
      const report = await readWaitlistDiscoveryReport();

      assert.equal(report?.waitlistStartingDateCount, 1);
      assert.equal(report?.startDateCount, 2);
      assert.equal(report?.missingStartDateCount, 0);
      assert.equal(report?.largestWaitlists[0]?.longRunningWaitCount, 1);
    },
  );
});

test("waitlist report parser rejects partial reports with skipped centres", async () => {
  await withReport(
    `# INFOCARE WAITLIST

Generated: 2026-05-01T00:00:00.000Z

## Scope

- Open centres checked: 25
- Waitlist entries returned across all centres: 322
- Entries with usable wait-age data from \`application_date\`: 21
- Entries missing usable \`application_date\`: 301
- Centres skipped due to API errors: 12
`,
    async () => {
      const report = await readWaitlistDiscoveryReport();

      assert.equal(report, null);
    },
  );
});
