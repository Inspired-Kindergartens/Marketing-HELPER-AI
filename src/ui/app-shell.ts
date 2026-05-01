import type {
  CentreSnapshotHistoryEntry,
  LatestSnapshotSet,
  ManualCentreCapacity,
} from "../storage/analytics-store.js";
import { getWindowOption, resolveWindowKey, type WindowKey, WINDOW_OPTIONS } from "../analytics/windows.js";
import type { ServiceAnalyticsSnapshot } from "../infocare/models.js";
import { estimateShortPlusTypicalWaitlistCount } from "../analytics/waitlist-profile.js";
import { renderLayout } from "./layout.js";

type AnalyticsRow = NonNullable<LatestSnapshotSet>["snapshots"][number];
type ServiceSort = "critical" | "asc" | "desc";

const PANEL_DEFINITIONS = [
  { id: "analytics", title: "Infocare Analytics", className: "panel--system" },
  { id: "status", title: "Status", className: "panel--status" },
  { id: "summary", title: "Summary", className: "panel--tools" },
  { id: "output", title: "Output", className: "panel--output" },
  { id: "privacy", title: "Privacy", className: "panel--database" },
  { id: "chat", title: "AI Chat", className: "panel--chat" },
] as const;

type AppShellOptions = {
  selectedCentreKey?: number | null;
  selectedWindowKey?: string | null;
  serviceSort?: string | null;
  focusPanelId?: string | null;
  centreHistory?: CentreSnapshotHistoryEntry[];
  annualHistory?: CentreSnapshotHistoryEntry[];
  manualCapacity?: ManualCentreCapacity | null;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCapacityWithPercent(
  enrolledCount: number,
  enrolledFteCount: number,
  licensedCapacity: number,
) {
  const utilisationRatio =
    licensedCapacity > 0 ? Math.max(0, Math.min(enrolledFteCount / licensedCapacity, 1)) : 0;

  return `${enrolledCount}/${licensedCapacity} ${formatPercent(utilisationRatio)}`;
}

function formatAgeBandCapacity(enrolledCount: number, licensedCapacity?: number | null) {
  if ((licensedCapacity == null || licensedCapacity <= 0) && enrolledCount <= 0) {
    return "-";
  }

  if (licensedCapacity == null || licensedCapacity <= 0) {
    return `${enrolledCount}/-`;
  }

  return `${enrolledCount}/${licensedCapacity}`;
}

function formatWaitlistCoverage(waitlistCount: number) {
  return `${estimateShortPlusTypicalWaitlistCount(waitlistCount)}/${waitlistCount}`;
}

function getActionableWaitlistCount(row: AnalyticsRow) {
  return estimateShortPlusTypicalWaitlistCount(row.waitlistCount);
}

function getScopedKnownLeavingCount(row: ServiceAnalyticsSnapshot, windowKey: WindowKey) {
  return row.knownLeavingCountsByWindow[windowKey];
}

function getScopedApproachingFiveCount(row: ServiceAnalyticsSnapshot, windowKey: WindowKey) {
  return row.approachingFiveCountsByWindow[windowKey];
}

function getScopedReplacementPressure(row: ServiceAnalyticsSnapshot, windowKey: WindowKey) {
  return (
    row.agedOutCount +
    getScopedKnownLeavingCount(row, windowKey) +
    getScopedApproachingFiveCount(row, windowKey)
  );
}

function resolveServiceSort(input?: string | null): ServiceSort {
  if (input === "asc" || input === "desc") {
    return input;
  }

  return "critical";
}

function sortAnalyticsRows(rows: readonly AnalyticsRow[], serviceSort: ServiceSort) {
  const sorted = [...rows];

  if (serviceSort === "asc") {
    return sorted.sort((left, right) => left.serviceName.localeCompare(right.serviceName));
  }

  if (serviceSort === "desc") {
    return sorted.sort((left, right) => right.serviceName.localeCompare(left.serviceName));
  }

  return sorted;
}

function buildRankingReasons(row: AnalyticsRow, windowKey: WindowKey) {
  const reasons: string[] = [];
  const actionableWaitlistCount = getActionableWaitlistCount(row);
  const scopedLeavingCount = getScopedKnownLeavingCount(row, windowKey);
  const scopedApproachingFiveCount = getScopedApproachingFiveCount(row, windowKey);
  const under2Gap =
    row.licensedUnder2Capacity != null ? row.licensedUnder2Capacity - row.enrolledUnder2Count : 0;
  const over2Gap =
    row.licensedOver2Capacity != null ? row.licensedOver2Capacity - row.enrolledOver2Count : 0;

  if (actionableWaitlistCount <= 3) {
    reasons.push("low waitlist cover");
  }

  if (scopedLeavingCount >= 3 || scopedApproachingFiveCount >= 3 || row.agedOutCount >= 3) {
    reasons.push("high leaving pressure");
  }

  if (under2Gap > 0) {
    reasons.push(`under-2 below capacity by ${under2Gap}`);
  }

  if (over2Gap > 0) {
    reasons.push(`over-2 below capacity by ${over2Gap}`);
  }

  if (reasons.length === 0 && row.waitlistCount >= 10) {
    reasons.push("strong waitlist pressure");
  }

  return reasons.slice(0, 3);
}

function buildOverviewStatement(row: AnalyticsRow, windowKey: WindowKey) {
  const actionableWaitlistCount = getActionableWaitlistCount(row);
  const scopedReplacementPressure = getScopedReplacementPressure(row, windowKey);
  const availablePlaces = row.licensedCapacity - row.enrolledCount;
  const fteGap = row.licensedCapacity - row.enrolledFteCount;

  if (row.urgencyBand === "Stable") {
    return "This centre looks steady at the moment. Keep it on the watchlist, but it does not need to be treated as urgent.";
  }

  if (row.urgencyBand === "Moderate" && actionableWaitlistCount < 20 && scopedReplacementPressure < 3) {
    return "This centre is worth a light watch, but nothing looks especially concerning right now.";
  }

  if (actionableWaitlistCount >= 60) {
    return "Strong demand is the standout issue. Any realistic opening should be planned early and followed up quickly.";
  }

  if (actionableWaitlistCount <= 3 && scopedReplacementPressure >= 3) {
    return "The main watch-out is upcoming enrolment changes with only light waitlist cover. This centre may need early follow-up to keep future spaces filled.";
  }

  if (availablePlaces >= 5 || fteGap >= 3) {
    return "There may be enrolment opportunities here. The best fit will be families whose preferred days, times, and age group line up with current availability.";
  }

  if (actionableWaitlistCount >= 20) {
    return "Nothing looks immediately concerning. Demand looks healthy, so the next step is steady follow-up with suitable waitlist families.";
  }

  return "Nothing urgent stands out right now. Keep this centre on the watchlist and respond to suitable enquiries as availability changes.";
}

function buildStatusLead(row: AnalyticsRow, reasonText: string | null) {
  if (row.urgencyBand === "Critical") {
    return reasonText
      ? `${row.serviceName} needs priority attention mainly because ${reasonText}.`
      : `${row.serviceName} needs priority attention.`;
  }

  if (row.urgencyBand === "High") {
    return reasonText
      ? `${row.serviceName} needs a closer look because ${reasonText}.`
      : `${row.serviceName} needs a closer look.`;
  }

  if (row.urgencyBand === "Moderate") {
    return reasonText
      ? `${row.serviceName} is in a moderate watch range because ${reasonText}.`
      : `${row.serviceName} is in a moderate watch range.`;
  }

  return reasonText
    ? `${row.serviceName} is in a stable range. The main signals to keep an eye on are: ${reasonText}.`
    : `${row.serviceName} is in a stable range.`;
}

function buildOpeningNarrative(row: AnalyticsRow, windowKey: WindowKey) {
  const reasons = buildRankingReasons(row, windowKey);
  const scopedReplacementPressure = getScopedReplacementPressure(row, windowKey);
  const overview = buildOverviewStatement(row, windowKey).replace(/\.$/, "");

  const phrases = reasons.map((reason) => {
    if (reason === "low waitlist cover") {
      return "the short-term waitlist is still fairly light";
    }

    if (reason === "high leaving pressure") {
      return `several enrolment changes are coming up (${scopedReplacementPressure} across Leaving, Near 5, and Age 5+)`;
    }

    if (reason === "strong waitlist pressure") {
      return "the waitlist is still doing a lot of the work";
    }

    if (reason.startsWith("under-2 below capacity by ")) {
      const gap = Number(reason.replace("under-2 below capacity by ", ""));
      return `the under-2 area is still ${gap} place${gap === 1 ? "" : "s"} under capacity`;
    }

    if (reason.startsWith("over-2 below capacity by ")) {
      const gap = Number(reason.replace("over-2 below capacity by ", ""));
      return `the over-2 area is still ${gap} place${gap === 1 ? "" : "s"} under capacity`;
    }

    return reason;
  });

  const reasonText =
    phrases.length === 0
      ? null
      : phrases.length === 1
        ? phrases[0]
        : phrases.length === 2
          ? `${phrases[0]} and ${phrases[1]}`
          : `${phrases[0]}, ${phrases[1]}, and ${phrases[2]}`;

  return `${buildStatusLead(row, reasonText)} ${overview}:`;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-NZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDelta(value: number, suffix = "") {
  if (value === 0) {
    return `steady at 0${suffix}`;
  }

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value}${suffix}`;
}

function formatMonthName(monthIndex: number) {
  return new Date(Date.UTC(2026, monthIndex, 1)).toLocaleString("en-NZ", {
    month: "long",
  });
}

function calculateDayDifference(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function formatWindowLabel(windowKey: WindowKey) {
  const labels: Record<WindowKey, string> = {
    "1W": "one week",
    "2W": "two weeks",
    "3W": "three weeks",
    "1M": "one month",
    "2M": "two months",
    "3M": "three months",
    "6M": "six months",
    "12M": "twelve months",
  };

  return labels[windowKey] ?? getWindowOption(windowKey).label;
}

function formatWindowPeriodLabel(windowKey: WindowKey) {
  const labels: Record<WindowKey, string> = {
    "1W": "1-week period",
    "2W": "2-week period",
    "3W": "3-week period",
    "1M": "1-month period",
    "2M": "2-month period",
    "3M": "3-month period",
    "6M": "6-month period",
    "12M": "12-month period",
  };

  return labels[windowKey] ?? `${getWindowOption(windowKey).label} period`;
}

function formatCountWord(value: number) {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];

  return words[value] ?? String(value);
}

function formatChildCount(value: number) {
  return `${formatCountWord(value)} ${value === 1 ? "child" : "children"}`;
}

function formatFte(value: number) {
  return Number(value.toFixed(1)).toString();
}

function isLargeHeadcountGap(row: AnalyticsRow) {
  return row.licensedCapacity - row.enrolledCount >= 5;
}

function getKnownWaitlistAgeCount(row: AnalyticsRow) {
  return row.waitlistUnder5Count + row.waitlistTurning5ThisYearCount + row.waitlistAged5PlusCount;
}

function resolveSelectedRow(
  snapshotSet: LatestSnapshotSet | null,
  selectedCentreKey?: number | null,
) {
  if (!snapshotSet?.snapshots.length) {
    return null;
  }

  if (selectedCentreKey == null) {
    return snapshotSet.snapshots[0];
  }

  return (
    snapshotSet.snapshots.find((row) => row.centreKey === selectedCentreKey) ??
    snapshotSet.snapshots[0]
  );
}

function buildQueryString(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  focusPanelId?: string | null,
) {
  const params = new URLSearchParams();

  if (selectedCentreKey != null) {
    params.set("centre", String(selectedCentreKey));
  }

  params.set("window", selectedWindowKey);

  if (serviceSort !== "critical") {
    params.set("sort", serviceSort);
  }

  if (focusPanelId) {
    params.set("panel", focusPanelId);
  }

  return params.toString();
}

function buildPanelActions(
  panelId: string,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  focusPanelId?: string | null,
) {
  if (panelId === "chat") {
    return "";
  }

  const analyticsRefreshAction =
    panelId === "analytics"
      ? `<a class="panel-action-button" href="/actions/refresh-snapshot?${buildQueryString(selectedCentreKey, "3M", "critical")}" aria-label="Download latest Infocare analytics snapshot" title="Download latest Infocare analytics snapshot"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
      : "";

  if (focusPanelId === panelId) {
    return `${analyticsRefreshAction}<a class="panel-action-link" href="/?${buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort)}"><i class="bi bi-arrow-left-short ui-icon" aria-hidden="true"></i><span>Return to dashboard</span></a>`;
  }

  const popupQuery = buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, panelId);

  return `${analyticsRefreshAction}<button class="panel-action-button" type="button" data-open-panel="${panelId}" data-panel-query="${popupQuery}" aria-label="Open window" title="Open window"><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i></button>`;
}

function buildWindowInsights(row: AnalyticsRow, history: CentreSnapshotHistoryEntry[], windowKey: WindowKey) {
  const label = formatWindowLabel(windowKey);
  const uniqueRunDates = [...new Set(history.map((entry) => entry.runDate.slice(0, 10)))];
  const observedSpanDays =
    uniqueRunDates.length >= 2
      ? calculateDayDifference(uniqueRunDates[0]!, uniqueRunDates[uniqueRunDates.length - 1]!)
      : 0;

  if (uniqueRunDates.length < 2 || observedSpanDays < 7) {
    return null;
  }

  const first = history[0].snapshot;
  const last = history[history.length - 1].snapshot;
  const waitlistDelta = last.waitlistCount - first.waitlistCount;
  const enrolmentDelta = last.enrolledCount - first.enrolledCount;
  const leavingDelta =
    getScopedReplacementPressure(last, windowKey) -
    getScopedReplacementPressure(first, windowKey);

  if (waitlistDelta > 0) {
    return `Across the last ${label}, demand has picked up, so this centre is worth watching more closely than it was earlier in the period.`;
  }

  if (waitlistDelta < 0) {
    return `Across the last ${label}, demand has eased back a little, which suggests recent pressure may be softening.`;
  }

  if (enrolmentDelta > 0 || leavingDelta > 0) {
    return `Across the last ${label}, the pattern looks fairly steady, although upcoming enrolment changes mean new openings should still be handled promptly.`;
  }

  return `Across the last ${label}, the centre has been fairly steady, which means the waitlist, enrolment level, and upcoming enrolment changes have not shifted enough to suggest demand is either building sharply or easing off.`;
}

function buildSeasonalityNarrative(history: CentreSnapshotHistoryEntry[]) {
  if (history.length < 6) {
    return null;
  }

  const monthMap = new Map<number, { totalPressure: number; count: number }>();

  for (const entry of history) {
    const runDate = new Date(entry.runDate);
    const month = runDate.getUTCMonth();
    const totalPressure =
      entry.snapshot.waitlistCount +
      entry.snapshot.replacementPressure +
      Math.max(entry.snapshot.licensedCapacity - entry.snapshot.enrolledCount, 0);
    const current = monthMap.get(month) ?? { totalPressure: 0, count: 0 };

    current.totalPressure += totalPressure;
    current.count += 1;
    monthMap.set(month, current);
  }

  if (monthMap.size < 3) {
    return null;
  }

  const topMonths = [...monthMap.entries()]
    .map(([month, value]) => ({
      month,
      averagePressure: value.totalPressure / value.count,
    }))
    .sort((left, right) => right.averagePressure - left.averagePressure)
    .slice(0, 3);

  const monthLabels = topMonths.map((entry) => formatMonthName(entry.month));

  return `Looking forward over the next 12 months, ${monthLabels.join(", ")} look like the strongest pressure months to watch based on the highest average historical mix of waitlist, turnover, and unfilled places. Treat that as directional rather than predictive.`;
}

function buildCapacityNarrative(manualCapacity: ManualCentreCapacity | null | undefined) {
  if (!manualCapacity) {
    return "Age-band capacity split not recorded.";
  }

  if ((manualCapacity.maxU2 ?? 0) > 0 && (manualCapacity.maxO2 ?? 0) > 0) {
    return `Under 2 with ${manualCapacity.maxU2} capacity; Over 2 with ${manualCapacity.maxO2} capacity.`;
  }

  if ((manualCapacity.maxU2 ?? 0) > 0) {
    return `Under 2 with ${manualCapacity.maxU2} capacity.`;
  }

  if ((manualCapacity.maxO2 ?? 0) > 0) {
    return `Over 2 with ${manualCapacity.maxO2} capacity.`;
  }

  return "Age-band capacity split not recorded.";
}

function buildLeavingNarrative(row: AnalyticsRow, windowKey: WindowKey) {
  const label = formatWindowPeriodLabel(windowKey);
  const scopedKnownLeavingCount = getScopedKnownLeavingCount(row, windowKey);
  const scopedApproachingFiveCount = getScopedApproachingFiveCount(row, windowKey);

  return `There are currently ${formatChildCount(scopedKnownLeavingCount)} indicated as Leaving within the selected ${label}. There are ${formatChildCount(scopedApproachingFiveCount)} turning five years old within that same time frame. There are ${formatChildCount(row.agedOutCount)} who are already five or older.`;
}

function buildFteGuidance(row: AnalyticsRow) {
  const availablePlaces = row.licensedCapacity - row.enrolledCount;
  const fteGap = row.licensedCapacity - row.enrolledFteCount;
  const actionableWaitlistCount = getActionableWaitlistCount(row);

  if (availablePlaces >= 5) {
    return `${row.serviceName} appears to have room for new enrolments, with about ${availablePlaces} places showing and booked hours closer to ${formatFte(row.enrolledFteCount)} full-time places.`;
  }

  if (actionableWaitlistCount >= 20) {
    return `${row.serviceName} has a healthy waitlist and should begin contacting those families now, especially where their preferred days line up with current availability.`;
  }

  if (fteGap >= 3) {
    return `${row.serviceName} may still have enrolment opportunities, especially for families whose preferred days and times match current availability.`;
  }

  return `${row.serviceName} looks fairly full once current enrolments and booked hours are considered, so any new places should be handled deliberately.`;
}

function buildWaitlistGuidance(row: AnalyticsRow, windowKey: WindowKey) {
  const actionableWaitlistCount = getActionableWaitlistCount(row);
  const scopedReplacementPressure = getScopedReplacementPressure(row, windowKey);

  if (actionableWaitlistCount >= 60) {
    if ((row.waitlistOldestEntryDays ?? 0) >= 180) {
      return `The waitlist is unusually high, and some entries appear to have been sitting there for a long time, so the list may need a quality check as well as normal follow-up.`;
    }

    return `There is overwhelming demand here, so any realistic opening should be planned and followed up quickly.`;
  }

  if (actionableWaitlistCount >= 30) {
    return `This centre has strong waitlist demand, so upcoming spaces should be planned and followed up early.`;
  }

  if (actionableWaitlistCount >= 20) {
    return `This centre has a healthy waitlist and should stay in contact with those families.`;
  }

  if (actionableWaitlistCount >= 10) {
    if (isLargeHeadcountGap(row)) {
      return `There is meaningful interest here, but the queue is not especially deep yet and the centre may still have room for the right enrolments.`;
    }

    return `There is some real demand here, although it is not yet in the strongest waitlist range.`;
  }

  if (actionableWaitlistCount >= 4) {
    return `There is some waitlist activity here, but it is still modest rather than strong.`;
  }

  if (actionableWaitlistCount >= 1) {
    return `There is only light waitlist interest here at the moment.`;
  }

  if (scopedReplacementPressure > 0) {
    return `There are upcoming enrolment changes, but without a visible waitlist the focus should be on filling future spaces early.`;
  }

  return `There is no strong immediate demand signal here yet, so this centre is better treated as one to monitor than one to push urgently.`;
}

function buildWaitlistAgeQualityGuidance(row: AnalyticsRow) {
  const knownAgeCount = getKnownWaitlistAgeCount(row);
  const olderCount = row.waitlistTurning5ThisYearCount + row.waitlistAged5PlusCount;

  if (row.waitlistCount === 0) {
    return null;
  }

  if (knownAgeCount === 0) {
    return null;
  }

  const olderShare = olderCount / knownAgeCount;

  if (row.waitlistAged5PlusCount >= 5 || olderShare >= 0.5) {
    return `A large share of the visible waitlist is already 5 or turning 5 this year, so the raw queue may overstate true younger-child demand.`;
  }

  if (olderShare >= 0.3) {
    return `Part of this waitlist is made up of older children, so the queue should be read with some caution rather than treated as pure younger-family demand.`;
  }

  if (row.waitlistUnder5Count >= Math.max(5, olderCount + 3)) {
    return `The visible waitlist is weighted more toward younger children, which makes the demand signal more useful for future enrolment planning.`;
  }

  if (row.waitlistUnknownAgeCount > knownAgeCount) {
    return `There is some younger-child demand visible here, but a large part of the queue has no usable age data so the signal is incomplete.`;
  }

  return `The visible waitlist has a mixed age profile, so it should not be treated as a clean younger-child demand signal on its own.`;
}

function renderAnalyticsTable(
  snapshotSet: LatestSnapshotSet | null,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
) {
  const analyticsRows = sortAnalyticsRows(snapshotSet?.snapshots ?? [], serviceSort);
  const selectedCentreValue = selectedCentreKey == null ? null : selectedCentreKey;
  const criticalSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "critical")}`;
  const ascSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "asc")}`;
  const descSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "desc")}`;
  const rows = analyticsRows
    .map(
      (row) => `
        <tr class="${row.centreKey === selectedCentreKey ? "analytics-table__row--selected analytics-table__row--clickable" : "analytics-table__row--clickable"}" data-row-href="/?${buildQueryString(row.centreKey, selectedWindowKey, serviceSort)}">
          <td class="analytics-table__service">
            <a class="analytics-table__link" href="/?${buildQueryString(row.centreKey, selectedWindowKey, serviceSort)}">${row.serviceName}</a>
          </td>
          <td class="analytics-table__numeric">${formatCapacityWithPercent(row.enrolledCount, row.enrolledFteCount, row.licensedCapacity)}</td>
          <td class="analytics-table__numeric">${formatAgeBandCapacity(row.enrolledUnder2Count, row.licensedUnder2Capacity)}</td>
          <td class="analytics-table__numeric">${formatAgeBandCapacity(row.enrolledOver2Count, row.licensedOver2Capacity)}</td>
          <td class="analytics-table__numeric">${formatWaitlistCoverage(row.waitlistCount)}</td>
          <td class="analytics-table__numeric">${row.agedOutCount}</td>
          <td class="analytics-table__numeric">${getScopedApproachingFiveCount(row, selectedWindowKey)}</td>
          <td class="analytics-table__numeric">${getScopedKnownLeavingCount(row, selectedWindowKey)}</td>
        </tr>
      `,
    )
    .join("");
  const body =
    rows ||
    `
      <tr>
        <td colspan="8" class="analytics-table__empty">No analytics snapshot rows are available yet.</td>
      </tr>
    `;

  return `
    <div class="analytics-table-shell">
      <div class="analytics-toolbar">
        <div class="analytics-toolbar__actions">
          <a
            class="analytics-toolbar__icon-action"
            href="/?${buildQueryString(selectedCentreValue, "3M", "critical")}"
            aria-label="Reset analytics view"
            title="Reset analytics view"
          ><i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i></a>
          ${WINDOW_OPTIONS.map((option) => {
            const className =
              option.key === selectedWindowKey
                ? "analytics-toolbar__window analytics-toolbar__window--active"
                : "analytics-toolbar__window";

            return `<a class="${className}" href="/?${buildQueryString(selectedCentreValue, option.key, serviceSort)}">${option.label}</a>`;
          }).join("")}
          <a class="analytics-toolbar__window${serviceSort === "asc" ? " analytics-toolbar__window--active" : ""}" href="${ascSortHref}" aria-label="Sort service A to Z">↑</a>
          <a class="analytics-toolbar__window${serviceSort === "desc" ? " analytics-toolbar__window--active" : ""}" href="${descSortHref}" aria-label="Sort service Z to A">↓</a>
        </div>
      </div>
      <div class="analytics-table-wrap">
        <table class="analytics-table">
          <thead>
            <tr>
              <th>
                <div class="analytics-table__service-header">
                  <a class="analytics-table__sort-link${serviceSort === "critical" ? " analytics-table__sort-link--active" : ""}" href="${criticalSortHref}">Service</a>
                  <span class="analytics-table__sort-arrows">
                    <a class="analytics-table__sort-link${serviceSort === "asc" ? " analytics-table__sort-link--active" : ""}" href="${ascSortHref}" aria-label="Sort service A to Z">↑</a>
                    <a class="analytics-table__sort-link${serviceSort === "desc" ? " analytics-table__sort-link--active" : ""}" href="${descSortHref}" aria-label="Sort service Z to A">↓</a>
                  </span>
                </div>
              </th>
              <th class="analytics-table__numeric">ENROL/MAX</th>
              <th class="analytics-table__numeric">U2</th>
              <th class="analytics-table__numeric">O2</th>
              <th class="analytics-table__numeric">Waitlist</th>
              <th class="analytics-table__numeric">Age 5+</th>
              <th class="analytics-table__numeric">Near 5</th>
              <th class="analytics-table__numeric">Leaving</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCompactStats(snapshotSet: LatestSnapshotSet | null, selectedWindowKey: WindowKey) {
  const rowCount = snapshotSet?.snapshots.length ?? 0;
  const dualPathCount =
    snapshotSet?.snapshots.filter((snapshot) => snapshot.waitlistCount > 0 && snapshot.enrolledCount < snapshot.licensedCapacity).length ??
    0;

  return `
    <div class="compact-stats">
      <div class="compact-stats__item">
        <span class="compact-stats__label">Rows</span>
        <span class="compact-stats__value">${rowCount}</span>
      </div>
      <div class="compact-stats__item">
        <span class="compact-stats__label">Selected Window</span>
        <span class="compact-stats__value">${getWindowOption(selectedWindowKey).label}</span>
      </div>
      <div class="compact-stats__item">
        <span class="compact-stats__label">Waitlist + Space</span>
        <span class="compact-stats__value">${dualPathCount}</span>
      </div>
    </div>
  `;
}

function renderSelectedCentreNarrative(
  snapshotSet: LatestSnapshotSet | null,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  centreHistory: CentreSnapshotHistoryEntry[],
  annualHistory: CentreSnapshotHistoryEntry[],
  manualCapacity?: ManualCentreCapacity | null,
) {
  const selectedRow = resolveSelectedRow(snapshotSet, selectedCentreKey);

  if (!selectedRow) {
    return `
      <div class="chat-message">
        <span class="chat-message__role">AI</span>
        <p>No snapshot row selected yet. Choose a centre from the analytics table to see a plain-language summary here.</p>
      </div>
    `;
  }

  const guidanceItems = [
    buildFteGuidance(selectedRow),
    buildWaitlistGuidance(selectedRow, selectedWindowKey),
    buildWaitlistAgeQualityGuidance(selectedRow),
    buildWindowInsights(selectedRow, centreHistory, selectedWindowKey),
    buildSeasonalityNarrative(annualHistory),
    buildLeavingNarrative(selectedRow, selectedWindowKey),
    buildCapacityNarrative(manualCapacity),
    `Latest stored snapshot: <strong>${snapshotSet ? formatTimestamp(snapshotSet.createdAt) : "Pending"}</strong>.`,
  ].filter((item): item is string => Boolean(item));

  return `
    <div class="chat-message">
      <p>${buildOpeningNarrative(selectedRow, selectedWindowKey)}</p>
      <ul>
        ${guidanceItems.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderAiChatPanel(
  snapshotSet: LatestSnapshotSet | null,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  centreHistory: CentreSnapshotHistoryEntry[],
  annualHistory: CentreSnapshotHistoryEntry[],
  manualCapacity?: ManualCentreCapacity | null,
) {
  return `
    <div class="chat-shell">
      <div class="chat-shell__messages">
        ${renderSelectedCentreNarrative(
          snapshotSet,
          selectedCentreKey,
          selectedWindowKey,
          centreHistory,
          annualHistory,
          manualCapacity,
        )}
      </div>
      <div class="chat-shell__composer">
        <label class="chat-shell__prompt-label" for="chat-prompt">Prompt</label>
        <textarea id="chat-prompt" class="chat-shell__prompt-input" placeholder="Type a question about the selected centre. AI wiring pending." disabled></textarea>
        <button class="chat-shell__send" type="button" disabled>Send</button>
      </div>
    </div>
  `;
}

function renderStatusPanel(snapshotSet: LatestSnapshotSet | null, historyCount: number) {
  return `
    <div class="status-lines">
      <p>Snapshot source: ${snapshotSet?.source ?? "Unavailable"}</p>
      <p>Rows loaded: ${snapshotSet?.snapshots.length ?? 0}</p>
      <p>History points in view: ${historyCount}</p>
      <p>Last refresh: ${snapshotSet ? formatTimestamp(snapshotSet.createdAt) : "Pending"}</p>
    </div>
  `;
}

function renderOutputPanel(
  snapshotSet: LatestSnapshotSet | null,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  centreHistory: CentreSnapshotHistoryEntry[],
) {
  const selectedRow = resolveSelectedRow(snapshotSet, selectedCentreKey);
  const selectedWindowLabel =
    getWindowOption(selectedWindowKey).label;
  const latestHistory = centreHistory.at(-1)?.snapshot;
  const previousHistory = centreHistory.length > 1 ? centreHistory[centreHistory.length - 2]?.snapshot : null;

  return `
    <div class="output-list">
      <p>Latest run date: ${snapshotSet?.runDate.slice(0, 10) ?? "Pending"}</p>
      <ul>
        <li><span>Centre</span><strong>${selectedRow?.serviceName ?? "No selection"}</strong></li>
        <li><span>Window</span><strong>${selectedWindowLabel}</strong></li>
        <li><span>Current waitlist</span><strong>${selectedRow?.waitlistCount ?? 0}</strong></li>
        <li><span>Previous waitlist</span><strong>${previousHistory?.waitlistCount ?? latestHistory?.waitlistCount ?? 0}</strong></li>
      </ul>
    </div>
  `;
}

function renderPrivacyPanel() {
  return `
    <div class="status-lines">
      <p>Individual child first names and last names are stripped out of the analytics pipeline before any dashboard rendering or snapshot storage happens.</p>
      <p>Parent names are not collected by this dashboard and should not be added to prompts, exports, or future analytics summaries.</p>
      <p>Centre messaging should stay aggregated to counts, age bands, waitlist pressure, and turnover signals rather than identifiable family details.</p>
    </div>
  `;
}

function renderBreakoutScript() {
  return `
    <script>
      (() => {
        const storageKey = "marketing-helper-ai.last-output-screen-index";

        function keepSelectedAnalyticsRowVisible() {
          const selectedRow = document.querySelector(".analytics-table__row--selected");
          const scrollContainer = selectedRow?.closest(".analytics-table-wrap");

          if (selectedRow instanceof HTMLElement && scrollContainer instanceof HTMLElement) {
            selectedRow.scrollIntoView({ block: "center", inline: "nearest" });
          }
        }

        function isSameScreen(left, right) {
          return (
            left.availLeft === right.availLeft &&
            left.availTop === right.availTop &&
            left.availWidth === right.availWidth &&
            left.availHeight === right.availHeight
          );
        }

        function resolveTargetScreenIndex(details) {
          const lastUsedIndex = Number.parseInt(localStorage.getItem(storageKey) ?? "-1", 10);
          const currentIndex = details.screens.findIndex((screen) => isSameScreen(screen, details.currentScreen));
          const candidates = details.screens.map((screen, index) => ({ screen, index }));
          const preferred =
            candidates.find(({ index }) => index !== currentIndex && index !== lastUsedIndex) ??
            candidates.find(({ index }) => index !== currentIndex) ??
            candidates.find(({ index }) => index !== lastUsedIndex) ??
            candidates[0];

          return preferred?.index ?? 0;
        }

        async function openPanel(button) {
          const query = button.getAttribute("data-panel-query");

          if (!query) {
            return;
          }

          let featureString = "popup=yes,resizable=yes,scrollbars=yes,width=1600,height=900";

          if ("getScreenDetails" in window) {
            try {
              const details = await window.getScreenDetails();
              const targetIndex = resolveTargetScreenIndex(details);
              const screen = details.screens[targetIndex] ?? details.currentScreen;

              featureString = [
                "popup=yes",
                "resizable=yes",
                "scrollbars=yes",
                "left=" + screen.availLeft,
                "top=" + screen.availTop,
                "width=" + Math.max(960, Math.floor(screen.availWidth * 0.92)),
                "height=" + Math.max(700, Math.floor(screen.availHeight * 0.92)),
              ].join(",");
              localStorage.setItem(storageKey, String(targetIndex));
            } catch (error) {
            }
          }

          window.open("/?" + query, "_blank", featureString);
        }

        document.addEventListener("click", (event) => {
          const target = event.target;

          if (!(target instanceof HTMLElement)) {
            return;
          }

          const openButton = target.closest("[data-open-panel]");

          if (openButton instanceof HTMLButtonElement) {
            event.preventDefault();
            void openPanel(openButton);
            return;
          }

          const row = target.closest("[data-row-href]");

          if (row instanceof HTMLTableRowElement && !target.closest("a, button, textarea, input, label")) {
            const href = row.getAttribute("data-row-href");

            if (href) {
              window.location.href = href;
            }
          }
        });

        keepSelectedAnalyticsRowVisible();
      })();
    </script>
  `;
}

export function renderAppShell(
  snapshotSet: LatestSnapshotSet | null,
  options: AppShellOptions = {},
) {
  const selectedWindowKey = resolveWindowKey(options.selectedWindowKey);
  const serviceSort = resolveServiceSort(options.serviceSort);
  const selectedCentreKey = options.selectedCentreKey ?? null;
  const focusPanelId = options.focusPanelId ?? null;
  const centreHistory = options.centreHistory ?? [];
  const annualHistory = options.annualHistory ?? [];
  const panelContent = PANEL_DEFINITIONS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: buildPanelActions(panel.id, selectedCentreKey, selectedWindowKey, serviceSort, focusPanelId),
    meta:
      panel.id === "analytics"
        ? `
            <span>source ${snapshotSet?.source ?? "none"}</span>
            <span>${snapshotSet ? formatTimestamp(snapshotSet.createdAt) : "pending"}</span>
          `
        : panel.id === "status"
          ? `<span>read-only</span>`
          : panel.id === "summary"
            ? `<span>live counts</span>`
            : panel.id === "output"
              ? `<span>${selectedWindowKey} insight view</span>`
              : panel.id === "privacy"
                ? `<span>identity-safe</span>`
                : "",
    children:
      panel.id === "analytics"
        ? renderAnalyticsTable(snapshotSet, selectedCentreKey, selectedWindowKey, serviceSort)
        : panel.id === "status"
          ? renderStatusPanel(snapshotSet, centreHistory.length)
          : panel.id === "summary"
            ? renderCompactStats(snapshotSet, selectedWindowKey)
            : panel.id === "output"
              ? renderOutputPanel(snapshotSet, selectedCentreKey, selectedWindowKey, centreHistory)
              : panel.id === "privacy"
                ? renderPrivacyPanel()
                : renderAiChatPanel(
                    snapshotSet,
                    selectedCentreKey,
                    selectedWindowKey,
                    centreHistory,
                    annualHistory,
                    options.manualCapacity,
                  ),
  }));
  const layout = renderLayout({
    panels: panelContent,
    focusPanelId,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper AI</title>
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    ${layout}
    ${renderBreakoutScript()}
  </body>
</html>`;
}
