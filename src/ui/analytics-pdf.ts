// Infocare Analytics as an A4 PDF for the window and order chosen in the
// panel: the same columns as the panel table (without the Note and Email
// actions), with a total row. Cover, header, footer and print settings come
// from report-pdf.ts; every figure comes from the panel's own helpers.
import { getWindowOption, type WindowKey } from "../analytics/windows.js";
import { sltTotalName } from "../analytics/slt-filter.js";
import type { LatestSnapshotSet } from "../storage/analytics-store.js";
import {
  formatAgeBandCapacity,
  formatEnrolmentCapacity,
  formatEstimatedPlaces,
  formatWaitlistCoverage,
  getActionableWaitlistCount,
  getEstimatedOpenPlaces,
  getScopedApproachingFiveCount,
  getScopedKnownLeavingCount,
  sortAnalyticsRows,
  type AnalyticsRow,
  type ServiceSort,
} from "./app-shell.js";
import { formatAnalyticsServiceDisplayName } from "./centre-name.js";
import { dataTable, noteText, nzDateTime, nzFileDate, renderReportPdf, sectionTitle } from "./report-pdf.js";

const SORT_LABEL: Record<ServiceSort, string> = {
  critical: "most urgent first",
  asc: "A to Z",
  desc: "Z to A",
};

// "3M" -> "3 months", "1W" -> "1 week".
export function windowWords(windowKey: WindowKey) {
  const label = getWindowOption(windowKey).label;
  const count = Number.parseInt(label, 10);
  const unit = label.endsWith("W") ? "week" : "month";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

const COLUMN_NOTE =
  "Enrol/Max: enrolled children / licensed capacity, with average booked children per day as a % of the licence. Est: estimated open places (licence minus average booked per day). U2 / O2: under-2 and over-2 enrolments against their capacity. Waitlist: estimated actionable entries / total waitlist. Age 5+: enrolled children already five. Near 5: turning five in the window. Leaving: known leaving dates in the window. Age 5+, Near 5 and Leaving can count the same child.";

function sumAgeBand(rows: readonly AnalyticsRow[], enrolled: (row: AnalyticsRow) => number, capacity: (row: AnalyticsRow) => number | null | undefined) {
  return formatAgeBandCapacity(
    rows.reduce((sum, row) => sum + enrolled(row), 0),
    rows.reduce((sum, row) => sum + (capacity(row) ?? 0), 0) || null,
  );
}

function totalRow(rows: readonly AnalyticsRow[], windowKey: WindowKey, slt: string | null) {
  const sum = (value: (row: AnalyticsRow) => number) => rows.reduce((total, row) => total + value(row), 0);
  const estimated = rows.filter((row) => row.bookedAverageDailyCount > 0 && row.licensedCapacity > 0);
  return [
    slt ? sltTotalName(slt) : "All kindergartens",
    `${sum((row) => row.enrolledCount)}/${sum((row) => row.licensedCapacity)}`,
    estimated.length ? String(estimated.reduce((total, row) => total + getEstimatedOpenPlaces(row), 0)) : "-",
    sumAgeBand(rows, (row) => row.enrolledUnder2Count, (row) => row.licensedUnder2Capacity),
    sumAgeBand(rows, (row) => row.enrolledOver2Count, (row) => row.licensedOver2Capacity),
    `${sum(getActionableWaitlistCount)}/${sum((row) => row.waitlistCount)}`,
    String(sum((row) => row.agedOutCount)),
    String(sum((row) => getScopedApproachingFiveCount(row, windowKey))),
    String(sum((row) => getScopedKnownLeavingCount(row, windowKey))),
  ];
}

export async function generateAnalyticsPdfBuffer(
  snapshotSet: LatestSnapshotSet,
  windowKey: WindowKey,
  serviceSort: ServiceSort,
  now = new Date(),
  // The panel's SLT filter: the snapshot set holds only that SLT's centres.
  slt: string | null = null,
): Promise<Buffer> {
  const rows = sortAnalyticsRows(snapshotSet.snapshots, serviceSort, windowKey);
  const body = rows.map((row) => [
    formatAnalyticsServiceDisplayName(row.serviceName),
    formatEnrolmentCapacity(row),
    formatEstimatedPlaces(row),
    formatAgeBandCapacity(row.enrolledUnder2Count, row.licensedUnder2Capacity),
    formatAgeBandCapacity(row.enrolledOver2Count, row.licensedOver2Capacity),
    formatWaitlistCoverage(row),
    String(row.agedOutCount),
    String(getScopedApproachingFiveCount(row, windowKey)),
    String(getScopedKnownLeavingCount(row, windowKey)),
  ]);
  const snapshotAt = nzDateTime(new Date(snapshotSet.createdAt));
  const period = `Near 5 and Leaving: next ${windowWords(windowKey)}`;

  return renderReportPdf(
    {
      title: "Infocare Analytics",
      coverKicker: "Marketing",
      coverLabel: `INFOCARE SNAPSHOT${slt ? `  ·  SLT ${slt.toUpperCase()}` : ""}`,
      subtitle: `Snapshot ${snapshotAt}  ·  ${slt ? `SLT ${slt}  ·  ` : ""}${period}  ·  ${SORT_LABEL[serviceSort]}`,
      subject: `Snapshot ${snapshotAt}; ${slt ? `SLT ${slt}; ` : ""}${period}`,
      footerNote: "Enrol/Max = enrolled / licence",
      content: [
        sectionTitle("Centres"),
        dataTable(
          ["Service", "Enrol/Max", "Est", "U2", "O2", "Waitlist", "Age 5+", "Near 5", "Leaving"],
          rows.length > 1 ? [totalRow(rows, windowKey, slt), ...body] : body,
          ["*", 68, 30, 40, 44, 50, 38, 38, 42],
          { totalRow: rows.length > 1 },
        ),
        noteText(COLUMN_NOTE),
      ],
    },
    now,
  );
}

export function analyticsPdfFilename(windowKey: WindowKey, now = new Date(), slt: string | null = null) {
  return `Infocare-Analytics-${windowKey}-${slt ? `${slt}-` : ""}${nzFileDate(now)}.pdf`;
}
