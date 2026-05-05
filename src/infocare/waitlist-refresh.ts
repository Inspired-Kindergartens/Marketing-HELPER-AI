import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readOpenCentreReferences } from "../storage/analytics-store.js";
import { createInfocareClient } from "./client.js";
import {
  buildExtractionDateRange,
  fetchCentreChildList,
  CURRENT_ENROLMENTS_CATEGORY,
  WAITING_LIST_CATEGORY,
} from "./extraction.js";
import type { CentreReference, InfocareChild } from "./models.js";
import { readWaitlistDiscoveryReport } from "./waitlist-report.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type CentreWaitlistSummary = {
  centreKey: number;
  centreName: string;
  waitlistCount: number;
  usableStartingDateCount: number;
  usableAgeCount: number;
  missingStartDateCount: number;
  waitAges: number[];
  waitlistEntries: { waitDays: number; birthDate?: string | null }[];
  medianDays: number | null;
  p75Days: number | null;
  oldestDays: number | null;
};

type CentreThresholdSummary = CentreWaitlistSummary & {
  shortWaitCount: number;
  typicalWaitCount: number;
  longRunningWaitCount: number;
  veryLongRunningWaitCount: number;
  recentEnrolments: Record<"lastMonth" | "lastTwoMonths" | "lastThreeMonths", number>;
  recentWaitlistEntries: Record<"lastMonth" | "lastTwoMonths" | "lastThreeMonths", number>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toArchiveStamp(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function calculateAgeInDays(dateValue: unknown, referenceDate: Date) {
  if (typeof dateValue !== "string" || dateValue.trim() === "") {
    return null;
  }

  const value = new Date(dateValue);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const days = (referenceDate.getTime() - value.getTime()) / 86_400_000;

  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : null;
}

function calculateAgeInYears(dateValue: unknown, referenceDate: Date) {
  if (typeof dateValue !== "string" || dateValue.trim() === "") {
    return null;
  }

  const value = new Date(dateValue);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const years = (referenceDate.getTime() - value.getTime()) / 31_557_600_000;

  return Number.isFinite(years) ? years : null;
}

function willTurnFiveThisCalendarYear(dateValue: unknown, referenceDate: Date) {
  if (typeof dateValue !== "string" || dateValue.trim() === "") {
    return false;
  }

  const value = new Date(dateValue);

  if (Number.isNaN(value.getTime())) {
    return false;
  }

  return value.getUTCFullYear() + 5 === referenceDate.getUTCFullYear();
}

function percentile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * fraction)),
  );

  return sortedValues[index] ?? null;
}

function buildBucket(days: number) {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  return "366+";
}

function buildThresholdLabel(days: number, p25Days: number | null, p75Days: number | null, p90Days: number | null) {
  if (p25Days == null || p75Days == null || p90Days == null) {
    return null;
  }

  if (days <= p25Days) return "Short wait";
  if (days <= p75Days) return "Typical wait";
  if (days <= p90Days) return "Long-running wait";
  return "Very long-running wait";
}

function buildWaitlistChildAgeLabel(birthDate: unknown, referenceDate: Date) {
  const age = calculateAgeInYears(birthDate, referenceDate);

  if (age == null) {
    return "unknown";
  }

  if (age >= 5) {
    return "aged5Plus";
  }

  if (willTurnFiveThisCalendarYear(birthDate, referenceDate)) {
    return "turning5";
  }

  return "under5";
}

function renderBar(count: number, maxCount: number) {
  if (count === 0 || maxCount === 0) {
    return "";
  }

  return "#".repeat(Math.max(1, Math.round((count / maxCount) * 24)));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function getWaitlistAgeDate(child: InfocareChild) {
  const source = child as InfocareChild & { application_date?: string | null };

  return source.application_date ?? child.starting_date;
}

function getRecentWaitlistDate(child: InfocareChild) {
  const source = child as InfocareChild & { application_date?: string | null };

  return source.application_date ?? child.starting_date;
}

function countRecentChildren(
  children: InfocareChild[],
  referenceDate: Date,
  maxAgeDays: number,
  selectDate: (child: InfocareChild) => unknown,
) {
  return children.filter((child) => {
    const ageDays = calculateAgeInDays(selectDate(child), referenceDate);

    return ageDays != null && ageDays <= maxAgeDays;
  }).length;
}

function buildRecentDemandRow(
  centre: CentreThresholdSummary,
  windowKey: keyof CentreThresholdSummary["recentEnrolments"],
) {
  const newEnrolments = centre.recentEnrolments[windowKey];
  const newWaitlistEntries = centre.recentWaitlistEntries[windowKey];

  return {
    centre: centre.centreName,
    newEnrolments,
    newWaitlistEntries,
    combined: newEnrolments + newWaitlistEntries,
  };
}

function buildWaitlistAgeProfileRows(
  centreSummaries: CentreWaitlistSummary[],
  referenceDate: Date,
  p25Days: number | null,
  p75Days: number | null,
  p90Days: number | null,
) {
  const rows = new Map(
    ["Short wait", "Typical wait", "Long-running wait", "Very long-running wait"].map((label) => [
      label,
      {
        label,
        under5: 0,
        turning5: 0,
        aged5Plus: 0,
        unknown: 0,
      },
    ]),
  );

  for (const centre of centreSummaries) {
    for (const entry of centre.waitlistEntries) {
      const thresholdLabel = buildThresholdLabel(entry.waitDays, p25Days, p75Days, p90Days);

      if (!thresholdLabel) {
        continue;
      }

      const row = rows.get(thresholdLabel);
      const childAgeLabel = buildWaitlistChildAgeLabel(entry.birthDate, referenceDate);

      if (row) {
        row[childAgeLabel] += 1;
      }
    }
  }

  return [...rows.values()].map((row) => ({
    ...row,
    total: row.under5 + row.turning5 + row.aged5Plus + row.unknown,
  }));
}

function renderRecentDemandSection(
  lines: string[],
  heading: string,
  rows: ReturnType<typeof buildRecentDemandRow>[],
) {
  lines.push(`## ${heading}`);
  lines.push("");
  lines.push("| Centre | New enrolments | New waitlist entries | Combined |");
  lines.push("|---|---:|---:|---:|");

  for (const row of rows
    .filter((entry) => entry.combined > 0)
    .sort((left, right) => right.combined - left.combined || right.newWaitlistEntries - left.newWaitlistEntries)
    .slice(0, 20)) {
    lines.push(`| ${row.centre} | ${row.newEnrolments} | ${row.newWaitlistEntries} | ${row.combined} |`);
  }

  lines.push("");
}

async function collectCentreSummary(
  centre: CentreReference,
  referenceDate: Date,
  client: ReturnType<typeof createInfocareClient>,
) {
  const dateRange = buildExtractionDateRange(referenceDate);
  const [enrolledChildren, waitingListChildren] = await Promise.all([
    fetchCentreChildList(
      {
        centreKey: centre.centreKey,
        category: CURRENT_ENROLMENTS_CATEGORY,
        dateRange,
      },
      client,
    ),
    fetchCentreChildList(
      {
        centreKey: centre.centreKey,
        category: WAITING_LIST_CATEGORY,
        dateRange,
      },
      client,
    ),
  ]);
  const waitAges: number[] = [];
  const waitlistEntries: { waitDays: number; birthDate?: string | null }[] = [];
  let usableStartingDateCount = 0;
  let missingStartDateCount = 0;

  for (const child of waitingListChildren) {
    if (calculateAgeInDays(child.starting_date, referenceDate) != null) {
      usableStartingDateCount += 1;
    }

    const days = calculateAgeInDays(getWaitlistAgeDate(child), referenceDate);

    if (days == null) {
      missingStartDateCount += 1;
      continue;
    }

    waitAges.push(days);
    waitlistEntries.push({
      waitDays: days,
      birthDate: child.birth_date,
    });
  }

  const sortedAges = [...waitAges].sort((a, b) => a - b);

  return {
    centreKey: centre.centreKey,
    centreName: centre.name,
    waitlistCount: waitingListChildren.length,
    usableStartingDateCount,
    usableAgeCount: waitAges.length,
    missingStartDateCount,
    waitAges,
    waitlistEntries,
    medianDays: percentile(sortedAges, 0.5),
    p75Days: percentile(sortedAges, 0.75),
    oldestDays: sortedAges.at(-1) ?? null,
    recentEnrolments: {
      lastMonth: countRecentChildren(enrolledChildren, referenceDate, 30, (child) => child.starting_date),
      lastTwoMonths: countRecentChildren(enrolledChildren, referenceDate, 60, (child) => child.starting_date),
      lastThreeMonths: countRecentChildren(enrolledChildren, referenceDate, 90, (child) => child.starting_date),
    },
    recentWaitlistEntries: {
      lastMonth: countRecentChildren(waitingListChildren, referenceDate, 30, getRecentWaitlistDate),
      lastTwoMonths: countRecentChildren(waitingListChildren, referenceDate, 60, getRecentWaitlistDate),
      lastThreeMonths: countRecentChildren(waitingListChildren, referenceDate, 90, getRecentWaitlistDate),
    },
  } satisfies CentreWaitlistSummary &
    Pick<CentreThresholdSummary, "recentEnrolments" | "recentWaitlistEntries">;
}

export async function generateWaitlistReportMarkdown(referenceDate: Date = new Date()) {
  const centres = await readOpenCentreReferences();
  const client = createInfocareClient();
  const centreSummaries: Awaited<ReturnType<typeof collectCentreSummary>>[] = [];
  const errors: { centreName: string; message: string }[] = [];

  for (const [index, centre] of centres.entries()) {
    try {
      centreSummaries.push(await collectCentreSummary(centre, referenceDate, client));
    } catch (error) {
      errors.push({
        centreName: centre.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(index === centres.length - 1 ? 0 : 175);
  }

  if (errors.length > 0) {
    throw new Error(
      `Waitlist report refresh did not cover every open centre. ${errors.length} of ${centres.length} centres failed: ${errors
        .map((error) => error.centreName)
        .join(", ")}`,
    );
  }

  const validDays = centreSummaries.flatMap((centre) => centre.waitAges).sort((a, b) => a - b);
  const bucketCounts = new Map([
    ["0-7", 0],
    ["8-14", 0],
    ["15-30", 0],
    ["31-60", 0],
    ["61-90", 0],
    ["91-180", 0],
    ["181-365", 0],
    ["366+", 0],
  ]);

  for (const days of validDays) {
    bucketCounts.set(buildBucket(days), (bucketCounts.get(buildBucket(days)) ?? 0) + 1);
  }

  const medianDays = percentile(validDays, 0.5);
  const p25Days = percentile(validDays, 0.25);
  const p75Days = percentile(validDays, 0.75);
  const p90Days = percentile(validDays, 0.9);
  const averageDays =
    validDays.length > 0
      ? round(validDays.reduce((sum, value) => sum + value, 0) / validDays.length, 1)
      : null;
  const oldestDays = validDays.at(-1) ?? null;
  const totalWaitlistCount = centreSummaries.reduce((sum, centre) => sum + centre.waitlistCount, 0);
  const totalUsableStartingDateCount = centreSummaries.reduce(
    (sum, centre) => sum + centre.usableStartingDateCount,
    0,
  );
  const totalUsableAgeCount = centreSummaries.reduce((sum, centre) => sum + centre.usableAgeCount, 0);
  const totalMissingStartDateCount = centreSummaries.reduce(
    (sum, centre) => sum + centre.missingStartDateCount,
    0,
  );
  const centreSummariesWithThresholdCounts: CentreThresholdSummary[] = centreSummaries.map((centre) => ({
    ...centre,
    shortWaitCount: centre.waitAges.filter((days) => p25Days != null && days <= p25Days).length,
    typicalWaitCount: centre.waitAges.filter(
      (days) => p25Days != null && p75Days != null && days > p25Days && days <= p75Days,
    ).length,
    longRunningWaitCount: centre.waitAges.filter(
      (days) => p75Days != null && p90Days != null && days > p75Days && days <= p90Days,
    ).length,
    veryLongRunningWaitCount: centre.waitAges.filter((days) => p90Days != null && days > p90Days).length,
  }));
  const biggestWaitlists = [...centreSummariesWithThresholdCounts]
    .filter((centre) => centre.waitlistCount > 0)
    .sort((a, b) => b.waitlistCount - a.waitlistCount || (b.oldestDays ?? 0) - (a.oldestDays ?? 0));
  const biggestLongRunningWaitlists = [...centreSummariesWithThresholdCounts]
    .filter((centre) => centre.waitlistCount > 0)
    .sort(
      (a, b) =>
        b.longRunningWaitCount +
          b.veryLongRunningWaitCount -
          (a.longRunningWaitCount + a.veryLongRunningWaitCount) ||
        b.veryLongRunningWaitCount - a.veryLongRunningWaitCount ||
        b.waitlistCount - a.waitlistCount,
    );
  const shortPlusTypicalCount = centreSummariesWithThresholdCounts.reduce(
    (sum, centre) => sum + centre.shortWaitCount + centre.typicalWaitCount,
    0,
  );
  const longRunningCount = centreSummariesWithThresholdCounts.reduce(
    (sum, centre) => sum + centre.longRunningWaitCount + centre.veryLongRunningWaitCount,
    0,
  );
  const veryLongRunningCount = centreSummariesWithThresholdCounts.reduce(
    (sum, centre) => sum + centre.veryLongRunningWaitCount,
    0,
  );
  const waitlistAgeProfileRows = buildWaitlistAgeProfileRows(
    centreSummaries,
    referenceDate,
    p25Days,
    p75Days,
    p90Days,
  );
  const maxBucketCount = Math.max(...bucketCounts.values(), 0);
  const lines: string[] = [];

  lines.push("# INFOCARE WAITLIST");
  lines.push("");
  lines.push(`Generated: ${referenceDate.toISOString()}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- Open centres checked: ${centres.length}`);
  lines.push(`- Waitlist entries returned across all centres: ${totalWaitlistCount}`);
  lines.push(`- Waitlist entries with usable \`starting_date\`: ${totalUsableStartingDateCount}`);
  lines.push(`- Entries with usable wait-age data from \`application_date\`: ${totalUsableAgeCount}`);
  lines.push(`- Entries missing usable \`application_date\`: ${totalMissingStartDateCount}`);
  if (errors.length > 0) {
    lines.push(`- Centres skipped due to API errors: ${errors.length}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  if (totalUsableAgeCount === 0) {
    lines.push("No usable waitlist-age data was returned.");
  } else {
    lines.push(`- Median time on waitlist: ${medianDays} days`);
    lines.push(`- Average time on waitlist: ${averageDays} days`);
    lines.push(`- 25th percentile: ${p25Days} days`);
    lines.push(`- 75th percentile: ${p75Days} days`);
    lines.push(`- 90th percentile: ${p90Days} days`);
    lines.push(`- Oldest visible waitlist entry: ${oldestDays} days`);
  }
  lines.push("");
  lines.push("## Suggested Thresholds");
  lines.push("");
  if (totalUsableAgeCount > 0 && p25Days != null && p75Days != null && p90Days != null) {
    lines.push(`- Short wait: 0-${p25Days} days`);
    lines.push(`- Typical wait: ${p25Days + 1}-${p75Days} days`);
    lines.push(`- Long-running wait: ${p75Days + 1}-${p90Days} days`);
    lines.push(`- Very long-running wait: ${p90Days + 1}+ days`);
  } else {
    lines.push("- Not enough usable data to derive thresholds.");
  }
  lines.push("");
  lines.push("## Distribution");
  lines.push("");
  lines.push("| Days on waitlist | Count | Share | Distribution |");
  lines.push("|---|---:|---:|---|");
  for (const [bucket, count] of bucketCounts.entries()) {
    const share = totalUsableAgeCount > 0 ? round((count / totalUsableAgeCount) * 100, 1) : 0;
    lines.push(`| ${bucket} | ${count} | ${share}% | ${renderBar(count, maxBucketCount)} |`);
  }
  lines.push("");
  lines.push("## Threshold Counts");
  lines.push("");
  lines.push(`- Short plus typical: ${shortPlusTypicalCount} of ${totalUsableAgeCount}`);
  lines.push(`- Long-running plus very long-running: ${longRunningCount} of ${totalUsableAgeCount}`);
  lines.push(`- Very long-running only: ${veryLongRunningCount} of ${totalUsableAgeCount}`);
  lines.push("");
  lines.push("## Waitlist Age Profile By Threshold");
  lines.push("");
  lines.push("| Wait category | Under 5 | Turning 5 this year | Aged 5+ | Unknown DOB | Total |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const row of waitlistAgeProfileRows) {
    lines.push(
      `| ${row.label} | ${row.under5} | ${row.turning5} | ${row.aged5Plus} | ${row.unknown} | ${row.total} |`,
    );
  }
  lines.push("");
  lines.push("## Centres With Largest Waitlists");
  lines.push("");
  lines.push("| Centre | Waitlist | Short wait | Typical wait | Long-running wait | Very long-running wait | Median days | 75th percentile | Oldest | Missing application dates |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const centre of biggestWaitlists) {
    lines.push(`| ${centre.centreName} | ${centre.waitlistCount} | ${centre.shortWaitCount} | ${centre.typicalWaitCount} | ${centre.longRunningWaitCount} | ${centre.veryLongRunningWaitCount} | ${centre.medianDays ?? "-"} | ${centre.p75Days ?? "-"} | ${centre.oldestDays ?? "-"} | ${centre.missingStartDateCount} |`);
  }
  lines.push("");
  lines.push("## Centres With Long-Tail Waitlists");
  lines.push("");
  lines.push("| Centre | Waitlist | Long-running wait | Very long-running wait | Oldest visible entry | Median days |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const centre of biggestLongRunningWaitlists) {
    lines.push(`| ${centre.centreName} | ${centre.waitlistCount} | ${centre.longRunningWaitCount} | ${centre.veryLongRunningWaitCount} | ${centre.oldestDays ?? "-"} | ${centre.medianDays ?? "-"} |`);
  }
  lines.push("");
  lines.push("## Recent Demand Activity");
  lines.push("");
  lines.push("- This section uses current enrolled children with a recent `starting_date` plus current waitlist entries with a recent `application_date` when available, otherwise `starting_date`.");
  lines.push("- It is a live recent-activity view for campaign response, not a stored month-by-month snapshot trend.");
  lines.push("");
  renderRecentDemandSection(
    lines,
    "Top Recent Demand In The Last Month",
    centreSummariesWithThresholdCounts.map((centre) => buildRecentDemandRow(centre, "lastMonth")),
  );
  renderRecentDemandSection(
    lines,
    "Top Recent Demand In The Last Two Months",
    centreSummariesWithThresholdCounts.map((centre) => buildRecentDemandRow(centre, "lastTwoMonths")),
  );
  renderRecentDemandSection(
    lines,
    "Top Recent Demand In The Last Three Months",
    centreSummariesWithThresholdCounts.map((centre) => buildRecentDemandRow(centre, "lastThreeMonths")),
  );
  lines.push("## Insights");
  lines.push("");
  if (totalUsableAgeCount > 0 && medianDays != null && p75Days != null && p90Days != null) {
    const over90 = validDays.filter((days) => days > 90).length;
    const over180 = validDays.filter((days) => days > 180).length;
    const over365 = validDays.filter((days) => days > 365).length;

    lines.push(`- The middle of the distribution sits around ${medianDays} days, so anything materially above ${p75Days} days is already outside the typical wait experience.`);
    lines.push(`- ${round((over90 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 90 days.`);
    lines.push(`- ${round((over180 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 180 days.`);
    lines.push(`- ${round((over365 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 365 days.`);
    lines.push(`- A practical app threshold for "long time on a waitlist" would be above ${p75Days} days, with "very long" above ${p90Days} days.`);
  }
  lines.push("");
  if (errors.length > 0) {
    lines.push("## API Errors");
    lines.push("");
    lines.push("| Centre | Error |");
    lines.push("|---|---|");
    for (const error of errors.slice(0, 20)) {
      lines.push(`| ${error.centreName} | ${error.message.replaceAll("|", "\\|")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function refreshWaitlistReport(referenceDate: Date = new Date()) {
  const report = await generateWaitlistReportMarkdown(referenceDate);
  const infocareDir = join(process.cwd(), "INFOCARE");
  const archiveDir = join(infocareDir, "archive");
  const latestPath = join(infocareDir, "INFOCARE-WAITLIST.md");
  const archivePath = join(archiveDir, `INFOCARE-WAITLIST-${toArchiveStamp(referenceDate)}.md`);

  await mkdir(archiveDir, { recursive: true });
  await writeFile(latestPath, report, "utf8");
  await writeFile(archivePath, report, "utf8");

  return {
    latestPath,
    archivePath,
  };
}

export async function ensureWeeklyWaitlistReport(referenceDate: Date = new Date()) {
  const report = await readWaitlistDiscoveryReport();
  let generatedAt = report?.generatedAt ? new Date(report.generatedAt) : null;

  if (generatedAt == null || Number.isNaN(generatedAt.getTime())) {
    try {
      const existing = await stat(join(process.cwd(), "INFOCARE", "INFOCARE-WAITLIST.md"));

      generatedAt = existing.mtime;
    } catch {
      generatedAt = null;
    }
  }

  if (generatedAt && referenceDate.getTime() - generatedAt.getTime() < WEEK_MS) {
    return {
      refreshed: false,
      generatedAt: generatedAt.toISOString(),
    };
  }

  const refreshed = await refreshWaitlistReport(referenceDate);

  return {
    refreshed: true,
    generatedAt: referenceDate.toISOString(),
    ...refreshed,
  };
}
