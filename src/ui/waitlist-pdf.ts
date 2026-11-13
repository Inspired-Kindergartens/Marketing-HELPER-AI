// Waitlist Quality as an A4 PDF: the panel's headline figures, waitlist by
// distribution days, the quality hierarchy, the age distribution, the DOB
// profile and recent demand, with every centre listed (the panel shows the top
// eight until opened in its own window). Cover, header, footer and print
// settings come from report-pdf.ts; the figures use the panel's own helpers.
import { estimateShortPlusTypicalWaitlistCount } from "../analytics/waitlist-profile.js";
import type { RecentDemandRow, WaitlistDiscoveryReport } from "../infocare/waitlist-report.js";
import {
  formatAverageDays,
  formatRecentDemandCentreLabel,
  getLongAndVeryLongCount,
  hasThresholdCounts,
  mergeWaitlistReportRows,
} from "./app-shell.js";
import { formatAnalyticsServiceDisplayName } from "./centre-name.js";
import {
  chartLegend,
  dataTable,
  INK,
  MUTED,
  noteText,
  nzDateTime,
  nzFileDate,
  renderReportPdf,
  renderStackedBarSvg,
  sectionTitle,
  WAIT_COLOUR,
  type PdfContent,
} from "./report-pdf.js";

const WAIT_SERIES = [
  { key: "shortWaitCount", label: "Short wait: 0-76 days", colour: WAIT_COLOUR.short },
  { key: "typicalWaitCount", label: "Typical wait: 77-370 days", colour: WAIT_COLOUR.typical },
  { key: "longRunningWaitCount", label: "Long-running wait: 371-537 days", colour: WAIT_COLOUR.longRunning },
  { key: "veryLongRunningWaitCount", label: "Very long-running wait: 538+ days", colour: WAIT_COLOUR.veryLongRunning },
] as const;

const DEMAND_SERIES = [
  { label: "New enrolments", colour: WAIT_COLOUR.short },
  { label: "New waitlist entries", colour: WAIT_COLOUR.typical },
];

// The five figures across the top of the panel.
function headlineFigures(report: WaitlistDiscoveryReport): PdfContent {
  const total = report.totalWaitlistCount ?? report.shortPlusTypicalTotal ?? 0;
  const under163 = estimateShortPlusTypicalWaitlistCount(total);
  const figures: Array<[string, string]> = [
    ["<163d / total", `${under163}/${total}`],
    ["163+d / total", `${Math.max(total - under163, 0)}/${total}`],
    ...(report.waitlistStartingDateCount != null ? [["Starting date", `${report.waitlistStartingDateCount}/${total}`] as [string, string]] : []),
    ["Oldest", `${report.oldestDays ?? 0}d`],
    ["Median", formatAverageDays(report.medianDays)],
  ];
  return {
    table: {
      widths: figures.map(() => "*"),
      body: [
        figures.map(([label]) => ({ text: label.toUpperCase(), fontSize: 7, color: MUTED, bold: true })),
        figures.map(([, value]) => ({ text: value, fontSize: 15, bold: true, color: INK })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i > 0 && i < figures.length ? 0.6 : 0),
      vLineColor: () => "#e5e7eb",
      paddingLeft: () => 8,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
    margin: [0, 0, 0, 14],
  };
}

function thresholdRows(report: WaitlistDiscoveryReport) {
  return mergeWaitlistReportRows(report)
    .filter(hasThresholdCounts)
    .sort((left, right) => getLongAndVeryLongCount(right) - getLongAndVeryLongCount(left) || right.waitlist - left.waitlist);
}

function distributionChart(report: WaitlistDiscoveryReport): PdfContent[] {
  const rows = thresholdRows(report);
  if (!rows.length) return [noteText("No distribution-day figures in the latest waitlist report.")];
  return [
    {
      svg: renderStackedBarSvg(
        rows.map((row) => formatAnalyticsServiceDisplayName(row.centre)),
        WAIT_SERIES.map((series) => ({ label: series.label, colour: series.colour, values: rows.map((row) => row[series.key] ?? 0) })),
      ),
      width: 515,
      font: "Arial",
    },
    chartLegend(WAIT_SERIES),
  ];
}

// Same order as the panel: most long and very long waits first.
function hierarchyTable(report: WaitlistDiscoveryReport): PdfContent {
  const rows = mergeWaitlistReportRows(report)
    .filter((row) => row.waitlist > 0)
    .sort(
      (left, right) =>
        getLongAndVeryLongCount(right) - getLongAndVeryLongCount(left) ||
        (right.veryLongRunningWaitCount ?? 0) - (left.veryLongRunningWaitCount ?? 0) ||
        right.waitlist - left.waitlist ||
        (right.oldestDays ?? 0) - (left.oldestDays ?? 0),
    );
  if (!rows.length) return noteText("No waitlist hierarchy rows in the latest waitlist report.");
  return dataTable(
    ["Centre", "Waitlist", "Long-running wait", "Very long-running wait", "Longest wait"],
    rows.map((row) => [
      formatAnalyticsServiceDisplayName(row.centre),
      String(row.waitlist),
      String(row.longRunningWaitCount ?? "-"),
      String(row.veryLongRunningWaitCount ?? "-"),
      String(row.oldestDays ?? "-"),
    ]),
    ["*", 60, 95, 110, 60],
  );
}

function ageDistributionTable(report: WaitlistDiscoveryReport): PdfContent {
  const rows = thresholdRows(report);
  const counts = WAIT_SERIES.map((series) => rows.reduce((sum, row) => sum + (row[series.key] ?? 0), 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return noteText("No distribution-day figures in the latest waitlist report.");
  return dataTable(
    ["Wait category", "Entries", "Share"],
    WAIT_SERIES.map((series, index) => [
      { text: [{ text: "■ ", color: series.colour }, { text: series.label }] },
      String(counts[index]),
      `${((counts[index]! / total) * 100).toFixed(1)}%`,
    ]),
    ["*", 70, 70],
    { boldFirstColumn: false },
  );
}

function ageProfileTable(report: WaitlistDiscoveryReport): PdfContent {
  if (!report.ageProfileByThreshold.length) return noteText("No DOB profile in the latest waitlist report.");
  return dataTable(
    ["Wait category", "Under 5", "of which Aged 2", "Turning 5", "Aged 5+", "Unknown DOB", "Total"],
    report.ageProfileByThreshold.map((row) => [
      row.category,
      String(row.under5),
      String(row.aged2 ?? "-"),
      String(row.turning5),
      String(row.aged5Plus),
      String(row.unknownDob),
      String(row.total),
    ]),
    ["*", 50, 70, 50, 50, 60, 45],
  );
}

function demandChart(title: string, rows: readonly RecentDemandRow[], pageBreak: boolean): PdfContent {
  return {
    unbreakable: true,
    stack: [
      sectionTitle(title, { marginTop: pageBreak ? 0 : 16 }),
      rows.length
        ? {
            svg: renderStackedBarSvg(
              rows.map((row) => formatRecentDemandCentreLabel(row.centre)),
              [
                { ...DEMAND_SERIES[0]!, values: rows.map((row) => row.newEnrolments) },
                { ...DEMAND_SERIES[1]!, values: rows.map((row) => row.newWaitlistEntries) },
              ],
            ),
            width: 515,
            font: "Arial",
          }
        : noteText("No recent demand rows for this period."),
      ...(rows.length ? [chartLegend(DEMAND_SERIES)] : []),
    ],
    ...(pageBreak ? { pageBreak: "before" } : {}),
  };
}

export async function generateWaitlistPdfBuffer(report: WaitlistDiscoveryReport, now = new Date()): Promise<Buffer> {
  const reportAt = report.generatedAt ? nzDateTime(new Date(report.generatedAt)) : "date unknown";

  return renderReportPdf(
    {
      title: "Waitlist Quality",
      coverKicker: "Marketing",
      coverLabel: "INFOCARE SNAPSHOT",
      subtitle: `Waitlist report ${reportAt}`,
      subject: `Waitlist report ${reportAt}`,
      footerNote: "Wait = days on the waitlist",
      content: [
        headlineFigures(report),
        sectionTitle("Waitlist by distribution days"),
        ...distributionChart(report),
        sectionTitle("Waitlist quality hierarchy", { pageBreak: true }),
        hierarchyTable(report),
        noteText("Longest wait: the number of days the longest-waiting single child at that centre has been on the waitlist."),
        { unbreakable: true, stack: [sectionTitle("Waitlist age distribution", { marginTop: 16 }), ageDistributionTable(report)] },
        { unbreakable: true, stack: [sectionTitle("DOB profile by wait category", { marginTop: 16 }), ageProfileTable(report)] },
        demandChart("Recent demand: last month", report.recentDemand.lastMonth, true),
        demandChart("Recent demand: last two months", report.recentDemand.lastTwoMonths, false),
        demandChart("Recent demand: last three months", report.recentDemand.lastThreeMonths, false),
      ],
    },
    now,
  );
}

export function waitlistPdfFilename(now = new Date()) {
  return `Waitlist-Quality-${nzFileDate(now)}.pdf`;
}
