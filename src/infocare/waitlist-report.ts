import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type WaitlistReportTableRow = {
  centre: string;
  waitlist: number;
  medianDays?: number;
  oldestDays?: number;
  winsorizedMeanDays?: number;
  shortWaitCount?: number;
  typicalWaitCount?: number;
  longRunningWaitCount?: number;
  veryLongRunningWaitCount?: number;
};

export type WaitlistReportDistributionRow = {
  label: string;
  count: number;
  share: string;
};

export type WaitlistThreshold = {
  label: string;
  range: string;
};

export type RecentDemandRow = {
  centre: string;
  newEnrolments: number;
  newWaitlistEntries: number;
  combined: number;
};

export type WaitlistDiscoveryReport = {
  generatedAt: string | null;
  openCentreCount: number | null;
  totalWaitlistCount: number | null;
  waitlistStartingDateCount: number | null;
  startDateCount: number | null;
  missingStartDateCount: number | null;
  medianDays: number | null;
  averageDays: number | null;
  oldestDays: number | null;
  shortPlusTypicalCount: number | null;
  shortPlusTypicalTotal: number | null;
  longRunningCount: number | null;
  longRunningTotal: number | null;
  largestWaitlists: WaitlistReportTableRow[];
  longTailWaitlists: WaitlistReportTableRow[];
  distribution: WaitlistReportDistributionRow[];
  thresholds: WaitlistThreshold[];
  recentDemand: {
    lastMonth: RecentDemandRow[];
    lastTwoMonths: RecentDemandRow[];
    lastThreeMonths: RecentDemandRow[];
  };
};

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function matchNumber(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return parseNumber(match?.[1]);
}

function extractTable(source: string, heading: string) {
  const start = source.indexOf(`## ${heading}`);

  if (start < 0) {
    return "";
  }

  const rest = source.slice(start);
  const nextHeading = rest.slice(1).search(/\n## /);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1);
}

function parseMarkdownRows(tableSource: string) {
  return tableSource
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function normalizeHeader(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("`", "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMarkdownTable(tableSource: string) {
  const lines = tableSource
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"));
  const headers = lines[0]?.split("|").slice(1, -1).map((cell) => normalizeHeader(cell)) ?? [];

  return lines.slice(1).map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const row = new Map<string, string>();

    headers.forEach((header, index) => {
      row.set(header, cells[index] ?? "");
    });

    return row;
  });
}

function getCell(row: Map<string, string>, ...headers: string[]) {
  for (const header of headers) {
    const value = row.get(normalizeHeader(header));

    if (value != null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function parseCentreRows(tableSource: string): WaitlistReportTableRow[] {
  return parseMarkdownTable(tableSource).map((row) => ({
    centre: getCell(row, "Centre") ?? "",
    waitlist: parseNumber(getCell(row, "Waitlist")) ?? 0,
    medianDays: parseNumber(getCell(row, "Median days")) ?? undefined,
    oldestDays:
      parseNumber(getCell(row, "Oldest", "Oldest visible entry", "Maximum days", "Max days")) ??
      undefined,
    winsorizedMeanDays: parseNumber(getCell(row, "10% winsorized mean days", "Winsorized mean days")) ?? undefined,
    shortWaitCount: parseNumber(getCell(row, "Short wait", "Short")) ?? undefined,
    typicalWaitCount: parseNumber(getCell(row, "Typical wait", "Typical")) ?? undefined,
    longRunningWaitCount:
      parseNumber(getCell(row, "Long-running wait", "Long wait", "Long-running", "Long")) ??
      undefined,
    veryLongRunningWaitCount:
      parseNumber(getCell(row, "Very long-running wait", "Very long wait", "Very long-running", "Very long")) ??
      undefined,
  }));
}

function parseDistributionRows(tableSource: string): WaitlistReportDistributionRow[] {
  return parseMarkdownRows(tableSource).map((cells) => ({
    label: cells[0] ?? "",
    count: parseNumber(cells[1]) ?? 0,
    share: cells[2] ?? "",
  }));
}

function parseThresholds(source: string): WaitlistThreshold[] {
  const section = extractTableLikeList(source, "Suggested Thresholds");

  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^-\s*([^:]+):\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      label: match[1]?.trim() ?? "",
      range: match[2]?.trim() ?? "",
    }));
}

function extractTableLikeList(source: string, heading: string) {
  const start = source.indexOf(`## ${heading}`);

  if (start < 0) {
    return "";
  }

  const rest = source.slice(start);
  const nextHeading = rest.slice(1).search(/\n## /);

  return nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1);
}

function parseRecentDemandRows(tableSource: string): RecentDemandRow[] {
  return parseMarkdownTable(tableSource).map((row) => ({
    centre: getCell(row, "Centre") ?? "",
    newEnrolments: parseNumber(getCell(row, "New enrolments")) ?? 0,
    newWaitlistEntries: parseNumber(getCell(row, "New waitlist entries")) ?? 0,
    combined: parseNumber(getCell(row, "Combined")) ?? 0,
  }));
}

export async function readWaitlistDiscoveryReport() {
  try {
    const source = await readFile(join(process.cwd(), "INFOCARE", "INFOCARE-WAITLIST.md"), "utf8");
    const generatedAt = source.match(/Generated:\s*([^\r\n]+)/)?.[1]?.trim() ?? null;
    const shortPlusTypicalMatch = source.match(/Short plus typical:\s*(\d+)\s+of\s+(\d+)/i);
    const longRunningMatch = source.match(/Long-running plus very long-running:\s*(\d+)\s+of\s+(\d+)/i);
    const skippedCentreCount = matchNumber(source, /Centres skipped due to API errors:\s*(\d+)/i) ?? 0;

    if (skippedCentreCount > 0) {
      return null;
    }

    return {
      generatedAt,
      openCentreCount: matchNumber(source, /Open centres checked:\s*(\d+)/i),
      totalWaitlistCount: matchNumber(source, /Waitlist entries returned across all centres:\s*(\d+)/i),
      waitlistStartingDateCount: matchNumber(
        source,
        /Waitlist entries with usable\s+`starting_date`:\s*(\d+)/i,
      ),
      startDateCount: matchNumber(
        source,
        /Entries with(?: usable wait-age data from)?\s+`(?:starting_date|application_date)`:\s*(\d+)/i,
      ),
      missingStartDateCount: matchNumber(
        source,
        /Entries (?:missing usable|without)\s+`(?:starting_date|application_date)`:\s*(\d+)/i,
      ),
      medianDays: matchNumber(source, /Median time on waitlist:\s*([\d.]+)/i),
      averageDays: matchNumber(source, /Average time on waitlist:\s*([\d.]+)/i),
      oldestDays: matchNumber(source, /Oldest visible waitlist entry:\s*(\d+)/i),
      shortPlusTypicalCount: parseNumber(shortPlusTypicalMatch?.[1]),
      shortPlusTypicalTotal: parseNumber(shortPlusTypicalMatch?.[2]),
      longRunningCount: parseNumber(longRunningMatch?.[1]),
      longRunningTotal: parseNumber(longRunningMatch?.[2]),
      largestWaitlists: parseCentreRows(extractTable(source, "Centres With Largest Waitlists")),
      longTailWaitlists: parseCentreRows(extractTable(source, "Centres With Long-Tail Waitlists")),
      distribution: parseDistributionRows(extractTable(source, "Distribution")),
      thresholds: parseThresholds(source),
      recentDemand: {
        lastMonth: parseRecentDemandRows(extractTable(source, "Top Recent Demand In The Last Month")),
        lastTwoMonths: parseRecentDemandRows(extractTable(source, "Top Recent Demand In The Last Two Months")),
        lastThreeMonths: parseRecentDemandRows(extractTable(source, "Top Recent Demand In The Last Three Months")),
      },
    } satisfies WaitlistDiscoveryReport;
  } catch {
    return null;
  }
}
