import type {
  CentreSnapshotHistoryEntry,
  LatestSnapshotSet,
  ManualCentreCapacity,
} from "../storage/analytics-store.js";
import { getWindowOption, resolveWindowKey, type WindowKey, WINDOW_OPTIONS } from "../analytics/windows.js";
import type { WaitlistDiscoveryReport } from "../infocare/waitlist-report.js";
import type { ServiceAnalyticsSnapshot } from "../infocare/models.js";
import type { MetaConfigStatus } from "../meta/config.js";
import type { GoogleAnalyticsConfigStatus } from "../google-analytics/config.js";
import type {
  GoogleAnalyticsDailySnapshotView,
  GoogleAnalyticsPageSnapshotView,
} from "../storage/google-analytics-store.js";
import type { MetaAdsDashboardData } from "../storage/meta-store.js";
import type {
  MetaNotificationHistoryPage,
  MetaNotificationHistoryRow,
  MetaRecommendationNotificationView,
} from "../storage/meta-recommendation-notifications-store.js";
import type { MetaRecommendationNoteView } from "../storage/meta-recommendation-notes-store.js";
import { matchCentreContact, type CentreContact } from "../storage/centre-contact-store.js";
import { estimateShortPlusTypicalWaitlistCount } from "../analytics/waitlist-profile.js";
import { renderLayout } from "./layout.js";

type AnalyticsRow = NonNullable<LatestSnapshotSet>["snapshots"][number];
type ServiceSort = "critical" | "asc" | "desc";
type WaitlistSection = "threshold" | "hierarchy" | null;
type GoogleAnalyticsSection = "pages" | null;
type GoogleAnalyticsRangeSelection = {
  mode: "currentMonth" | "months";
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
};

const PANEL_DEFINITIONS = [
  { id: "analytics", title: "Infocare Analytics", className: "panel--system" },
  { id: "waitlist", title: "Waitlist Quality", className: "panel--waitlist" },
  { id: "meta-ads", title: "META Ads", className: "panel--meta-ads" },
  { id: "google-analytics", title: "Google Analytics", className: "panel--google-analytics" },
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
  waitlistSnapshotSet?: LatestSnapshotSet | null;
  waitlistReport?: WaitlistDiscoveryReport | null;
  waitlistSection?: string | null;
  googleAnalyticsSection?: string | null;
  metaConfigStatus?: MetaConfigStatus | null;
  metaAdsDashboardData?: MetaAdsDashboardData | null;
  googleAnalyticsConfigStatus?: GoogleAnalyticsConfigStatus | null;
  googleAnalyticsSnapshot?: GoogleAnalyticsDailySnapshotView | null;
  googleAnalyticsRangeMode?: string | null;
  googleAnalyticsFromMonth?: string | null;
  googleAnalyticsFromYear?: string | null;
  googleAnalyticsToMonth?: string | null;
  googleAnalyticsToYear?: string | null;
  metaRecommendationNotifications?: MetaRecommendationNotificationView[];
  metaRecommendationNotificationCount?: number;
  metaRecommendationNotes?: MetaRecommendationNoteView[];
  latestMetaRecommendationNotesForCentre?: MetaNotificationHistoryRow[];
  centreContacts?: CentreContact[];
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeJsonForScript(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function formatEnrolmentCapacity(row: AnalyticsRow) {
  const bookedPercent =
    row.bookedUtilisationRatio > 0 ? ` ${formatPercent(row.bookedUtilisationRatio)}` : "";

  return `${row.enrolledCount}/${row.licensedCapacity}${bookedPercent}`;
}

function formatEstimatedPlaces(row: AnalyticsRow) {
  if (row.bookedAverageDailyCount <= 0 || row.licensedCapacity <= 0) {
    return "-";
  }

  return String(Math.max(0, Math.round(row.licensedCapacity - row.bookedAverageDailyCount)));
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
  return row.replacementPressureCountsByWindow?.[windowKey] ?? (
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

function resolveWaitlistSection(input?: string | null): WaitlistSection {
  if (input === "threshold" || input === "hierarchy") {
    return input;
  }

  return null;
}

function resolveGoogleAnalyticsSection(input?: string | null): GoogleAnalyticsSection {
  if (input === "pages") {
    return input;
  }

  return null;
}

function getGoogleAnalyticsBounds(referenceDate = new Date()) {
  const start = new Date(Date.UTC(2025, 4, 1));
  const today = new Date(referenceDate);

  return {
    minYear: start.getUTCFullYear(),
    minMonth: start.getUTCMonth() + 1,
    maxYear: today.getUTCFullYear(),
    maxMonth: today.getUTCMonth() + 1,
  };
}

function getGoogleAnalyticsDefaultMonthSelection(referenceDate = new Date()) {
  const endDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  return {
    fromMonth: startDate.getUTCMonth() + 1,
    fromYear: startDate.getUTCFullYear(),
    toMonth: endDate.getUTCMonth() + 1,
    toYear: endDate.getUTCFullYear(),
  };
}

function parseGoogleAnalyticsMonth(input?: string | null) {
  const value = Number.parseInt(String(input ?? ""), 10);

  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

function parseGoogleAnalyticsYear(input?: string | null) {
  const value = Number.parseInt(String(input ?? ""), 10);

  return Number.isInteger(value) ? value : null;
}

function formatGoogleAnalyticsMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isGoogleAnalyticsMonthAllowed(year: number, month: number, referenceDate = new Date()) {
  const bounds = getGoogleAnalyticsBounds(referenceDate);

  if (year < bounds.minYear || year > bounds.maxYear) {
    return false;
  }

  if (year === bounds.minYear && month < bounds.minMonth) {
    return false;
  }

  return !(year === bounds.maxYear && month > bounds.maxMonth);
}

function resolveGoogleAnalyticsRangeSelection(
  input: {
    mode?: string | null;
    fromMonth?: string | null;
    fromYear?: string | null;
    toMonth?: string | null;
    toYear?: string | null;
  } = {},
): GoogleAnalyticsRangeSelection {
  const defaults = getGoogleAnalyticsDefaultMonthSelection();
  const fromMonth = parseGoogleAnalyticsMonth(input.fromMonth) ?? defaults.fromMonth;
  const fromYear = parseGoogleAnalyticsYear(input.fromYear) ?? defaults.fromYear;
  const toMonth = parseGoogleAnalyticsMonth(input.toMonth) ?? defaults.toMonth;
  const toYear = parseGoogleAnalyticsYear(input.toYear) ?? defaults.toYear;
  const boundedFrom = isGoogleAnalyticsMonthAllowed(fromYear, fromMonth)
    ? { month: fromMonth, year: fromYear }
    : { month: defaults.fromMonth, year: defaults.fromYear };
  const boundedTo = isGoogleAnalyticsMonthAllowed(toYear, toMonth)
    ? { month: toMonth, year: toYear }
    : { month: defaults.toMonth, year: defaults.toYear };

  if (
    formatGoogleAnalyticsMonthKey(boundedFrom.year, boundedFrom.month) >
    formatGoogleAnalyticsMonthKey(boundedTo.year, boundedTo.month)
  ) {
    return {
      mode: input.mode === "months" ? "months" : "currentMonth",
      fromMonth: boundedTo.month,
      fromYear: boundedTo.year,
      toMonth: boundedTo.month,
      toYear: boundedTo.year,
    };
  }

  return {
    mode: input.mode === "months" ? "months" : "currentMonth",
    fromMonth: boundedFrom.month,
    fromYear: boundedFrom.year,
    toMonth: boundedTo.month,
    toYear: boundedTo.year,
  };
}

function formatGoogleAnalyticsRangeLabel(snapshot: GoogleAnalyticsDailySnapshotView) {
  return `${formatDateOnly(snapshot.rangeStartDate)} to ${formatDateOnly(snapshot.rangeEndDate)}`;
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

function formatDaysSince(value?: string | null) {
  if (!value) {
    return "pending";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "pending";
  }

  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));

  return elapsedDays === 1 ? "1 day" : `${elapsedDays} days`;
}

function formatAverageDays(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value)}d`;
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMetaMetric(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return `${Number(value.toFixed(2))}${suffix}`;
}

function formatInteger(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-NZ", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isBeforeToday(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return dateOnly < todayOnly;
}

function createMetaNotificationId(row: AnalyticsRow, selectedWindowKey: WindowKey, recommendation: string) {
  return [
    "meta-ads",
    selectedWindowKey,
    row.centreKey,
    recommendation.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  ].join(":");
}

function groupMetaRecommendationNotes(notes: MetaRecommendationNoteView[]) {
  const grouped = new Map<string, MetaRecommendationNoteView[]>();

  for (const note of notes) {
    const existing = grouped.get(note.notificationId) ?? [];
    existing.push(note);
    grouped.set(note.notificationId, existing);
  }

  return grouped;
}

function getDismissedMetaNotificationIds(notifications: MetaRecommendationNotificationView[]) {
  return new Set(
    notifications
      .filter((notification) => notification.dismissedAt)
      .map((notification) => notification.notificationId),
  );
}

function renderMetaRecommendationNote(note: MetaRecommendationNoteView) {
  const isDeleted = Boolean(note.deletedAt);

  return `
    <li class="meta-ads-note${isDeleted ? " meta-ads-note--deleted" : ""}" data-meta-note-id="${note.id}">
      <span>${escapeHtml(note.text)}</span>
      <button type="button" data-meta-note-delete title="Delete note" aria-label="Delete note"${isDeleted ? " hidden" : ""}>
        <i class="bi bi-trash ui-icon" aria-hidden="true"></i>
      </button>
      <button type="button" data-meta-note-restore title="Undo delete" aria-label="Undo delete"${isDeleted ? "" : " hidden"}>
        <i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i>
      </button>
    </li>
  `;
}

function joinGreetingNames(names: string[]) {
  const filteredNames = [
    ...new Set(
      names
        .map((name) => name.trim().split(/\s+/)[0] ?? "")
        .filter(Boolean),
    ),
  ];

  if (filteredNames.length === 0) {
    return "there";
  }

  if (filteredNames.length === 1) {
    return filteredNames[0];
  }

  return `${filteredNames.slice(0, -1).join(", ")} and ${filteredNames[filteredNames.length - 1]}`;
}

function buildMetaAdvertEmailHref(contact: CentreContact) {
  const greetingNames = joinGreetingNames([contact.headTeacher, contact.administrator]);
  const subject = `Facebook advert for enrolments`;
  const body = [
    `Kia ora ${greetingNames},`,
    "",
    "I hope your day is going well.",
    "",
    "I wanted to start a conversation with you about the possibility of running a Facebook advert for enrolments over the next month. I thought it could be a good opportunity to help raise awareness of your kindergarten and encourage enquiries from local whānau.",
    "",
    "Please let me know your thoughts, and whether this is something you would be interested in exploring further.",
  ].join("\n");

  return `mailto:${contact.email.replace(/[\r\n]/g, "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type WaitlistChartRow = {
  label: string;
  value: number;
  meta?: string;
};

type WaitlistChartDataset = {
  label: string;
  values: number[];
  color: "short" | "typical" | "longRunning" | "veryLongRunning" | "green" | "blue" | "orange" | "red";
};

type WaitlistChartConfig = {
  kind: "bar" | "doughnut" | "stackedBar";
  labels: string[];
  values?: number[];
  meta?: string[];
  colors?: string[];
  datasets?: WaitlistChartDataset[];
};

type WaitlistHierarchyRow = {
  centre: string;
  waitlist: number;
  longRunningWaitCount?: number;
  veryLongRunningWaitCount?: number;
  oldestDays?: number;
};

function renderWaitlistChart(chartId: string, config: WaitlistChartConfig | null, emptyText: string) {
  if (!config || config.labels.length === 0) {
    return `<p class="waitlist-chart__empty">${escapeHtml(emptyText)}</p>`;
  }

  const chartClass = chartId.startsWith("waitlist-recent-") ? " waitlist-chart--recent-demand" : "";

  return `
    <div class="waitlist-chart${chartClass}">
      <div class="waitlist-chart__canvas-wrap" style="--waitlist-chart-rows: ${config.labels.length}">
        <canvas id="${escapeHtml(chartId)}"></canvas>
      </div>
      <script type="application/json" data-waitlist-chart="${escapeHtml(chartId)}">${serializeJsonForScript(config)}</script>
    </div>
  `;
}

function buildSimpleChartConfig(kind: "bar" | "doughnut", rows: WaitlistChartRow[]): WaitlistChartConfig | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    kind,
    labels: rows.map((row) => row.label),
    values: rows.map((row) => row.value),
    meta: rows.map((row) => row.meta ?? String(row.value)),
  };
}

function buildWaitlistAgeDistributionChartConfig(rows: WaitlistChartRow[]): WaitlistChartConfig | null {
  const config = buildSimpleChartConfig("doughnut", rows);

  if (!config) {
    return null;
  }

  return {
    ...config,
    colors: ["#7fbe6f", "#4bc2c3", "#eeaf38", "#fb3640"],
  };
}

function hasThresholdCounts(row: { shortWaitCount?: number; typicalWaitCount?: number; longRunningWaitCount?: number; veryLongRunningWaitCount?: number }) {
  return (
    row.shortWaitCount != null ||
    row.typicalWaitCount != null ||
    row.longRunningWaitCount != null ||
    row.veryLongRunningWaitCount != null
  );
}

function getLongAndVeryLongCount(row: { longRunningWaitCount?: number; veryLongRunningWaitCount?: number }) {
  return (row.longRunningWaitCount ?? 0) + (row.veryLongRunningWaitCount ?? 0);
}

function buildFallbackThresholdChartConfig(rows: readonly AnalyticsRow[], showAllRows: boolean): WaitlistChartConfig | null {
  const sortedRows = [...rows]
    .filter((row) => row.waitlistCount > 0)
    .sort(
      (left, right) =>
        Math.max(right.waitlistCount - getActionableWaitlistCount(right), 0) -
          Math.max(left.waitlistCount - getActionableWaitlistCount(left), 0) ||
        right.waitlistCount - left.waitlistCount,
    );
  const visibleRows = showAllRows ? sortedRows : sortedRows.slice(0, 8);

  if (visibleRows.length === 0) {
    return null;
  }

  return {
    kind: "stackedBar",
    labels: visibleRows.map((row) => row.serviceName),
    datasets: [
      {
        label: "<163",
        values: visibleRows.map((row) => getActionableWaitlistCount(row)),
        color: "short",
      },
      {
        label: "163+",
        values: visibleRows.map((row) => Math.max(row.waitlistCount - getActionableWaitlistCount(row), 0)),
        color: "veryLongRunning",
      },
    ],
  };
}

function mergeWaitlistReportRows(report: WaitlistDiscoveryReport) {
  const byCentre = new Map<string, WaitlistDiscoveryReport["largestWaitlists"][number]>();

  for (const row of [...report.largestWaitlists, ...report.longTailWaitlists]) {
    const existing = byCentre.get(row.centre);

    byCentre.set(row.centre, {
      ...existing,
      ...row,
      waitlist: Math.max(existing?.waitlist ?? 0, row.waitlist),
      oldestDays: Math.max(existing?.oldestDays ?? 0, row.oldestDays ?? 0) || undefined,
      shortWaitCount: existing?.shortWaitCount ?? row.shortWaitCount,
      typicalWaitCount: existing?.typicalWaitCount ?? row.typicalWaitCount,
      longRunningWaitCount: existing?.longRunningWaitCount ?? row.longRunningWaitCount,
      veryLongRunningWaitCount: existing?.veryLongRunningWaitCount ?? row.veryLongRunningWaitCount,
    });
  }

  return [...byCentre.values()];
}

function formatDistributionLegendLabel(label: string, range: string) {
  return `${label}: ${range}`;
}

function formatShare(count: number, total: number) {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
}

function buildWaitlistAgeCategoryRows(report: WaitlistDiscoveryReport): WaitlistChartRow[] {
  const rows = mergeWaitlistReportRows(report).filter(hasThresholdCounts);

  if (rows.length === 0) {
    return [];
  }

  const shortWaitCount = rows.reduce((sum, row) => sum + (row.shortWaitCount ?? 0), 0);
  const typicalWaitCount = rows.reduce((sum, row) => sum + (row.typicalWaitCount ?? 0), 0);
  const longRunningWaitCount = rows.reduce((sum, row) => sum + (row.longRunningWaitCount ?? 0), 0);
  const veryLongRunningWaitCount = rows.reduce((sum, row) => sum + (row.veryLongRunningWaitCount ?? 0), 0);
  const total = shortWaitCount + typicalWaitCount + longRunningWaitCount + veryLongRunningWaitCount;

  return [
    {
      label: formatDistributionLegendLabel("Short wait", "0-76 days"),
      value: shortWaitCount,
      meta: `${shortWaitCount} ${formatShare(shortWaitCount, total)}`,
    },
    {
      label: formatDistributionLegendLabel("Typical wait", "77-370 days"),
      value: typicalWaitCount,
      meta: `${typicalWaitCount} ${formatShare(typicalWaitCount, total)}`,
    },
    {
      label: formatDistributionLegendLabel("Long-running wait", "371-537 days"),
      value: longRunningWaitCount,
      meta: `${longRunningWaitCount} ${formatShare(longRunningWaitCount, total)}`,
    },
    {
      label: formatDistributionLegendLabel("Very long-running wait", "538+ days"),
      value: veryLongRunningWaitCount,
      meta: `${veryLongRunningWaitCount} ${formatShare(veryLongRunningWaitCount, total)}`,
    },
  ];
}

function renderWaitlistAgeProfileTable(report: WaitlistDiscoveryReport) {
  const rows = report.ageProfileByThreshold;

  if (rows.length === 0) {
    return `<p class="waitlist-chart__empty">Refresh the waitlist report to show DOB profile by wait category.</p>`;
  }

  return `
    <div class="waitlist-table-wrap waitlist-age-profile-table-wrap">
      <table class="waitlist-table waitlist-age-profile-table">
        <thead>
          <tr>
            <th>Wait category</th>
            <th>Under 5</th>
            <th>Turning 5</th>
            <th>Aged 5+</th>
            <th>Unknown DOB</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.category)}</td>
                  <td>${row.under5}</td>
                  <td>${row.turning5}</td>
                  <td>${row.aged5Plus}</td>
                  <td>${row.unknownDob}</td>
                  <td>${row.total}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildThresholdChartConfig(report: WaitlistDiscoveryReport, showAllRows: boolean): WaitlistChartConfig | null {
  const rows = mergeWaitlistReportRows(report)
    .filter(hasThresholdCounts)
    .sort((left, right) => getLongAndVeryLongCount(right) - getLongAndVeryLongCount(left) || right.waitlist - left.waitlist);
  const visibleRows = showAllRows ? rows : rows.slice(0, 8);

  if (visibleRows.length === 0) {
    return null;
  }

  const shortLabel = formatDistributionLegendLabel("Short wait", "0-76 days");
  const typicalLabel = formatDistributionLegendLabel("Typical wait", "77-370 days");
  const longLabel = formatDistributionLegendLabel("Long-running wait", "371-537 days");
  const veryLongLabel = formatDistributionLegendLabel("Very long-running wait", "538+ days");

  return {
    kind: "stackedBar",
    labels: visibleRows.map((row) => row.centre),
    datasets: [
      {
        label: shortLabel,
        values: visibleRows.map((row) => row.shortWaitCount ?? 0),
        color: "short",
      },
      {
        label: typicalLabel,
        values: visibleRows.map((row) => row.typicalWaitCount ?? 0),
        color: "typical",
      },
      {
        label: longLabel,
        values: visibleRows.map((row) => row.longRunningWaitCount ?? 0),
        color: "longRunning",
      },
      {
        label: veryLongLabel,
        values: visibleRows.map((row) => row.veryLongRunningWaitCount ?? 0),
        color: "veryLongRunning",
      },
    ],
  };
}

function renderThresholdRefreshHref(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
) {
  return `/actions/refresh-snapshot?${buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort)}`;
}

function renderThresholdChart(
  report: WaitlistDiscoveryReport,
  showAllRows: boolean,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
) {
  const chartConfig = buildThresholdChartConfig(report, showAllRows);

  if (chartConfig) {
    return renderWaitlistChart("waitlist-threshold-chart", chartConfig, "");
  }

  const total = report.totalWaitlistCount ?? report.shortPlusTypicalTotal ?? 0;
  const good = report.shortPlusTypicalCount ?? 0;
  const longRunning = report.longRunningCount ?? Math.max(total - good, 0);
  const goodPercent = total > 0 ? Math.round((good / total) * 100) : 0;
  const longPercent = total > 0 ? Math.max(0, 100 - goodPercent) : 0;

  return `
    <div class="waitlist-threshold-state">
      <div class="waitlist-threshold-state__bars" aria-label="Current aggregate waitlist split">
        <div class="waitlist-threshold-state__track">
          <span class="waitlist-threshold-state__bar waitlist-threshold-state__bar--good" style="width: ${goodPercent}%"></span>
          <span class="waitlist-threshold-state__bar waitlist-threshold-state__bar--long" style="width: ${longPercent}%"></span>
        </div>
        <div class="waitlist-threshold-state__legend">
          <span><i class="waitlist-threshold-state__swatch waitlist-threshold-state__swatch--good"></i>&lt;163 ${good}/${total}</span>
          <span><i class="waitlist-threshold-state__swatch waitlist-threshold-state__swatch--long"></i>163+ ${longRunning}/${total}</span>
        </div>
      </div>
      <div class="waitlist-threshold-state__body">
        <p>Per-centre distribution bars need the threshold columns from the waitlist pull.</p>
        <div class="waitlist-threshold-state__required">
          <span>Short wait: 0-76 days</span>
          <span>Typical wait: 77-370 days</span>
          <span>Long-running wait: 371-537 days</span>
          <span>Very long-running wait: 538+ days</span>
        </div>
      </div>
      <a class="panel-action-button waitlist-threshold-state__action" href="${escapeHtml(renderThresholdRefreshHref(selectedCentreKey, selectedWindowKey, serviceSort))}" aria-label="Refresh analytics and waitlist report" title="Refresh analytics and waitlist report">
        <i class="bi bi-download ui-icon" aria-hidden="true"></i>
        <span>Refresh source data</span>
      </a>
    </div>
  `;
}

function renderWaitlistHierarchyTable(rows: WaitlistHierarchyRow[], showAllRows: boolean) {
  const sortedRows = rows
    .filter((row) => row.waitlist > 0)
    .sort(
      (left, right) =>
        getLongAndVeryLongCount(right) - getLongAndVeryLongCount(left) ||
        (right.veryLongRunningWaitCount ?? 0) - (left.veryLongRunningWaitCount ?? 0) ||
        right.waitlist - left.waitlist ||
        (right.oldestDays ?? 0) - (left.oldestDays ?? 0),
    );
  const visibleRows = showAllRows ? sortedRows : sortedRows.slice(0, 8);

  if (visibleRows.length === 0) {
    return `<p class="waitlist-chart__empty">No waitlist hierarchy rows stored.</p>`;
  }

  return `
    <div class="waitlist-table-wrap">
      <table class="waitlist-table">
        <thead>
          <tr>
            <th>Centre</th>
            <th>Long-running wait</th>
            <th>Very long-running wait</th>
            <th>Max days</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.centre)}</td>
                  <td>${row.longRunningWaitCount ?? "-"}</td>
                  <td>${row.veryLongRunningWaitCount ?? "-"}</td>
                  <td>${row.oldestDays ?? "-"}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLongRunningTable(report: WaitlistDiscoveryReport, showAllRows: boolean) {
  return renderWaitlistHierarchyTable(mergeWaitlistReportRows(report), showAllRows);
}

function formatRecentDemandCentreLabel(centre: string) {
  const trimmed = centre.trim();
  const kindergartenIndex = trimmed.search(/\bkindergart?en\b/i);

  if (kindergartenIndex >= 0) {
    return trimmed.slice(0, kindergartenIndex).trim() || trimmed;
  }

  return trimmed;
}

function buildRecentDemandChartConfig(rows: { centre: string; newEnrolments: number; newWaitlistEntries: number }[]): WaitlistChartConfig | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    kind: "stackedBar",
    labels: rows.map((row) => formatRecentDemandCentreLabel(row.centre)),
    datasets: [
      {
        label: "New enrolments",
        values: rows.map((row) => row.newEnrolments),
        color: "green",
      },
      {
        label: "New waitlist entries",
        values: rows.map((row) => row.newWaitlistEntries),
        color: "blue",
      },
    ],
  };
}

function renderRecentDemandPanel(
  report: Pick<WaitlistDiscoveryReport, "recentDemand"> | null,
  showAllRows: boolean,
) {
  const limitRows = <T,>(rows: T[]) => (showAllRows ? rows : rows.slice(0, 8));
  const recentDemand = report?.recentDemand ?? {
    lastMonth: [],
    lastTwoMonths: [],
    lastThreeMonths: [],
  };

  return `
    <section class="waitlist-quality__section waitlist-quality__section--wide waitlist-quality__section--recent">
      <h3>Recent Demand Activity</h3>
      <div class="recent-demand-grid">
        <section>
          <h4>Last Month</h4>
          ${renderWaitlistChart("waitlist-recent-month-chart", buildRecentDemandChartConfig(limitRows(recentDemand.lastMonth)), "No last-month recent demand rows stored.")}
        </section>
        <section>
          <h4>Last Two Months</h4>
          ${renderWaitlistChart("waitlist-recent-two-month-chart", buildRecentDemandChartConfig(limitRows(recentDemand.lastTwoMonths)), "No two-month recent demand rows stored.")}
        </section>
        <section>
          <h4>Last Three Months</h4>
          ${renderWaitlistChart("waitlist-recent-three-month-chart", buildRecentDemandChartConfig(limitRows(recentDemand.lastThreeMonths)), "No three-month recent demand rows stored.")}
        </section>
      </div>
    </section>
  `;
}

function buildWaitlistSectionQuery(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  waitlistSection: Exclude<WaitlistSection, null>,
) {
  const params = new URLSearchParams(buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, "waitlist"));

  params.set("waitlistSection", waitlistSection);

  return params.toString();
}

function buildGoogleAnalyticsSectionQuery(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  googleAnalyticsSection: Exclude<GoogleAnalyticsSection, null>,
  googleAnalyticsRange?: GoogleAnalyticsRangeSelection,
) {
  const params = new URLSearchParams(buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, "google-analytics", googleAnalyticsRange));

  params.set("googleAnalyticsSection", googleAnalyticsSection);

  return params.toString();
}

function renderWaitlistSectionHeader(
  title: string,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  waitlistSection: Exclude<WaitlistSection, null>,
  showBreakoutButton: boolean,
) {
  const button = showBreakoutButton
    ? `<button class="panel-action-button waitlist-section-open" type="button" data-open-panel="waitlist" data-panel-query="${escapeHtml(buildWaitlistSectionQuery(selectedCentreKey, selectedWindowKey, serviceSort, waitlistSection))}" aria-label="Open ${escapeHtml(title)} window" title="Open window"><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i></button>`
    : "";

  return `
    <div class="waitlist-quality__section-header">
      <h3>${escapeHtml(title)}</h3>
      ${button}
    </div>
  `;
}

function renderWaitlistReportPanel(
  report: WaitlistDiscoveryReport,
  showAllRows: boolean,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  waitlistSection: WaitlistSection,
) {
  const totalWaitlistCount = report.totalWaitlistCount ?? report.shortPlusTypicalTotal ?? 0;
  const under163Count = estimateShortPlusTypicalWaitlistCount(totalWaitlistCount);
  const over163Count = Math.max(totalWaitlistCount - under163Count, 0);
  const distributionRows = buildWaitlistAgeCategoryRows(report);
  const thresholdSection = `
    <section class="waitlist-quality__section">
      ${renderWaitlistSectionHeader("Waitlist by Distribution Days", selectedCentreKey, selectedWindowKey, serviceSort, "threshold", false)}
      ${renderThresholdChart(report, showAllRows, selectedCentreKey, selectedWindowKey, serviceSort)}
    </section>
  `;
  const hierarchySection = `
    <section class="waitlist-quality__section">
      ${renderWaitlistSectionHeader("Waitlist Quality Hierarchy", selectedCentreKey, selectedWindowKey, serviceSort, "hierarchy", false)}
      ${renderLongRunningTable(report, showAllRows)}
    </section>
  `;
  const waitlistBody =
    waitlistSection === "threshold"
      ? thresholdSection
      : waitlistSection === "hierarchy"
        ? hierarchySection
        : `
          ${thresholdSection}
          ${hierarchySection}
          <section class="waitlist-quality__section">
            <h3>Waitlist Age Distribution</h3>
            ${renderWaitlistChart("waitlist-distribution-chart", buildWaitlistAgeDistributionChartConfig(distributionRows), "No distribution rows stored.")}
          </section>
          <section class="waitlist-quality__section">
            <h3>DOB Profile By Wait Category</h3>
            ${renderWaitlistAgeProfileTable(report)}
          </section>
          ${renderRecentDemandPanel(report, showAllRows)}
        `;

  return `
    <div class="waitlist-quality${waitlistSection ? " waitlist-quality--section-focus" : ""}">
      <div class="waitlist-quality__stats">
        <div class="compact-stats__item">
          <span class="compact-stats__label">&lt;163d/Total</span>
          <span class="compact-stats__value">${under163Count}/${totalWaitlistCount}</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">163+d/Total</span>
          <span class="compact-stats__value">${over163Count}/${totalWaitlistCount}</span>
        </div>
        ${
          report.waitlistStartingDateCount != null
            ? `<div class="compact-stats__item">
                <span class="compact-stats__label">Starting date</span>
                <span class="compact-stats__value">${report.waitlistStartingDateCount}/${totalWaitlistCount}</span>
              </div>`
            : ""
        }
        <div class="compact-stats__item">
          <span class="compact-stats__label">Oldest</span>
          <span class="compact-stats__value">${report.oldestDays ?? 0}d</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">Median</span>
          <span class="compact-stats__value">${formatAverageDays(report.medianDays)}</span>
        </div>
      </div>
      <div class="waitlist-quality__grid">
        ${waitlistBody}
      </div>
    </div>
  `;
}

function renderWaitlistQualityPanel(
  snapshotSet: LatestSnapshotSet | null,
  report?: WaitlistDiscoveryReport | null,
  showAllRows = false,
  selectedCentreKey?: number | null,
  selectedWindowKey: WindowKey = "3M",
  serviceSort: ServiceSort = "critical",
  waitlistSection: WaitlistSection = null,
) {
  if (report) {
    return renderWaitlistReportPanel(
      report,
      showAllRows,
      selectedCentreKey,
      selectedWindowKey,
      serviceSort,
      waitlistSection,
    );
  }

  const rows = snapshotSet?.snapshots ?? [];
  const totalWaitlistCount = rows.reduce((sum, row) => sum + row.waitlistCount, 0);
  const under163Count = rows.reduce((sum, row) => sum + getActionableWaitlistCount(row), 0);
  const over163Count = Math.max(totalWaitlistCount - under163Count, 0);
  const oldestEntryDays = Math.max(0, ...rows.map((row) => row.waitlistOldestEntryDays ?? 0));
  const olderChildRows = [...rows]
    .map((row) => ({
      label: row.serviceName,
      value: row.waitlistTurning5ThisYearCount + row.waitlistAged5PlusCount,
      meta: `${row.waitlistTurning5ThisYearCount + row.waitlistAged5PlusCount}/${Math.max(getKnownWaitlistAgeCount(row), row.waitlistCount)}`,
    }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
  const thresholdSection = `
    <section class="waitlist-quality__section">
      ${renderWaitlistSectionHeader("Waitlist by Distribution Days", selectedCentreKey, selectedWindowKey, serviceSort, "threshold", false)}
      ${renderWaitlistChart("waitlist-threshold-chart", buildFallbackThresholdChartConfig(rows, showAllRows), "No waitlist rows stored.")}
    </section>
  `;
  const hierarchySection = `
    <section class="waitlist-quality__section">
      ${renderWaitlistSectionHeader("Waitlist Quality Hierarchy", selectedCentreKey, selectedWindowKey, serviceSort, "hierarchy", false)}
      ${renderWaitlistHierarchyTable(
        rows.map((row) => ({
          centre: row.serviceName,
          waitlist: row.waitlistCount,
          longRunningWaitCount: Math.max(row.waitlistCount - getActionableWaitlistCount(row), 0),
          oldestDays: row.waitlistOldestEntryDays ?? undefined,
        })),
        showAllRows,
      )}
    </section>
  `;
  const waitlistBody =
    waitlistSection === "threshold"
      ? thresholdSection
      : waitlistSection === "hierarchy"
        ? hierarchySection
        : `
          ${thresholdSection}
          ${hierarchySection}
          <section class="waitlist-quality__section">
            <h3>Waitlist Age Distribution</h3>
            ${renderWaitlistChart("waitlist-older-children-chart", buildSimpleChartConfig("doughnut", olderChildRows), "No older-child waitlist rows stored.")}
          </section>
          ${renderRecentDemandPanel(null, showAllRows)}
        `;

  if (rows.length === 0) {
    return `
      <div class="waitlist-quality waitlist-quality--empty">
        <p>No stored waitlist analytics are available yet.</p>
      </div>
    `;
  }

  return `
    <div class="waitlist-quality${waitlistSection ? " waitlist-quality--section-focus" : ""}">
      <div class="waitlist-quality__stats">
        <div class="compact-stats__item">
          <span class="compact-stats__label">&lt;163d/Total</span>
          <span class="compact-stats__value">${under163Count}/${totalWaitlistCount}</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">163+d/Total</span>
          <span class="compact-stats__value">${over163Count}/${totalWaitlistCount}</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">Starting date</span>
          <span class="compact-stats__value">snapshot</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">Oldest</span>
          <span class="compact-stats__value">${oldestEntryDays}d</span>
        </div>
        <div class="compact-stats__item">
          <span class="compact-stats__label">Median</span>
          <span class="compact-stats__value">-</span>
        </div>
      </div>
      <div class="waitlist-quality__grid">
        ${waitlistBody}
      </div>
    </div>
  `;
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
  googleAnalyticsRange?: GoogleAnalyticsRangeSelection,
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

  if (googleAnalyticsRange) {
    if (googleAnalyticsRange.mode === "months") {
      params.set("gaRange", "months");
      params.set("gaFromMonth", String(googleAnalyticsRange.fromMonth));
      params.set("gaFromYear", String(googleAnalyticsRange.fromYear));
      params.set("gaToMonth", String(googleAnalyticsRange.toMonth));
      params.set("gaToYear", String(googleAnalyticsRange.toYear));
    }
  }

  return params.toString();
}

function renderAnalyticsToolbarActions(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
) {
  const selectedCentreValue = selectedCentreKey == null ? null : selectedCentreKey;
  const ascSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "asc")}`;
  const descSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "desc")}`;

  return `
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
      <a class="analytics-toolbar__window${serviceSort === "asc" ? " analytics-toolbar__window--active" : ""}" href="${ascSortHref}" aria-label="Sort service A to Z">&uarr;</a>
      <a class="analytics-toolbar__window${serviceSort === "desc" ? " analytics-toolbar__window--active" : ""}" href="${descSortHref}" aria-label="Sort service Z to A">&darr;</a>
    </div>
  `;
}

function buildPanelActions(
  panelId: string,
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  focusPanelId?: string | null,
  googleAnalyticsRange?: GoogleAnalyticsRangeSelection,
) {
  if (panelId === "chat") {
    return `<button class="panel-action-button" type="button" data-print-mode="chat" aria-label="Print AI Chat" title="Print AI Chat"><i class="bi bi-printer ui-icon" aria-hidden="true"></i></button>`;
  }

  const analyticsViewActions =
    panelId === "analytics"
      ? renderAnalyticsToolbarActions(selectedCentreKey, selectedWindowKey, serviceSort)
      : "";
  const dashboardPrintAction =
    !focusPanelId && panelId === "analytics"
      ? `<button class="panel-action-button" type="button" data-print-mode="dashboard" aria-label="Print console" title="Print console"><i class="bi bi-printer ui-icon" aria-hidden="true"></i></button>`
      : "";
  const analyticsRefreshAction =
    panelId === "analytics"
      ? `<a class="panel-action-button" href="/actions/refresh-snapshot?${buildQueryString(selectedCentreKey, "3M", "critical")}" aria-label="Download latest Infocare analytics snapshot" title="Download latest Infocare analytics snapshot"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
      : "";
  const metaRefreshAction =
    panelId === "meta-ads"
      ? `<a class="panel-action-button" href="/actions/refresh-meta-ads?${buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort)}" aria-label="Download latest Meta Ads data" title="Download latest Meta Ads data"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
      : "";
  const googleAnalyticsRefreshAction =
    panelId === "google-analytics"
      ? `<a class="panel-action-button" href="/actions/refresh-google-analytics?${buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, null, googleAnalyticsRange)}" aria-label="Download latest Google Analytics data" title="Download latest Google Analytics data"><i class="bi bi-download ui-icon" aria-hidden="true"></i></a>`
      : "";
  const fullscreenAction = `<button class="panel-action-button" type="button" data-fullscreen-toggle aria-label="Enter fullscreen" title="Enter fullscreen"><i class="bi bi-fullscreen ui-icon" aria-hidden="true"></i></button>`;
  const printAction = `<button class="panel-action-button" type="button" data-print-page aria-label="Print window" title="Print window"><i class="bi bi-printer ui-icon" aria-hidden="true"></i></button>`;

  if (focusPanelId === panelId) {
    return `${analyticsViewActions}${analyticsRefreshAction}${metaRefreshAction}${googleAnalyticsRefreshAction}${printAction}${fullscreenAction}<a class="panel-action-link" href="/?${buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, null, googleAnalyticsRange)}"><i class="bi bi-arrow-left-short ui-icon" aria-hidden="true"></i><span>Return to dashboard</span></a>`;
  }

  const popupQuery = buildQueryString(selectedCentreKey, selectedWindowKey, serviceSort, panelId, googleAnalyticsRange);

  return `${analyticsViewActions}${dashboardPrintAction}${analyticsRefreshAction}${metaRefreshAction}${googleAnalyticsRefreshAction}${fullscreenAction}<button class="panel-action-button" type="button" data-open-panel="${panelId}" data-panel-query="${popupQuery}" aria-label="Open window" title="Open window"><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i></button>`;
}

function formatDocumentTitleTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function buildDocumentTitle(focusPanelId?: string | null) {
  const panelTitle = focusPanelId
    ? PANEL_DEFINITIONS.find((panel) => panel.id === focusPanelId)?.title
    : null;

  return panelTitle
    ? `Marketing Helper - ${panelTitle} - ${formatDocumentTitleTimestamp()}`
    : "Marketing Helper AI";
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
  centreContacts: CentreContact[] = [],
  metaAdsDashboardData?: MetaAdsDashboardData | null,
) {
  const analyticsRows = sortAnalyticsRows(snapshotSet?.snapshots ?? [], serviceSort);
  const selectedCentreValue = selectedCentreKey == null ? null : selectedCentreKey;
  const criticalSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "critical")}`;
  const ascSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "asc")}`;
  const descSortHref = `/?${buildQueryString(selectedCentreValue, selectedWindowKey, "desc")}`;
  const coverage = getMetaCoverageByCentre(metaAdsDashboardData);
  const rows = analyticsRows
    .map(
      (row) => {
        const contact = matchCentreContact(row.serviceName, centreContacts);
        const recommendation = getMetaRecommendation(row, selectedWindowKey, coverage);
        const notificationId = createMetaNotificationId(row, selectedWindowKey, recommendation);
        const emailAction = contact
          ? `<a class="analytics-table__email-action" data-analytics-email data-notification-id="${escapeHtml(notificationId)}" data-centre-name="${escapeHtml(row.serviceName)}" href="${escapeHtml(buildMetaAdvertEmailHref(contact))}" title="Email centre about a Facebook advert" aria-label="Email ${escapeHtml(row.serviceName)} about a Facebook advert"><i class="bi bi-envelope ui-icon" aria-hidden="true"></i></a>`
          : "";

        return `
        <tr class="${row.centreKey === selectedCentreKey ? "analytics-table__row--selected analytics-table__row--clickable" : "analytics-table__row--clickable"}" data-row-href="/?${buildQueryString(row.centreKey, selectedWindowKey, serviceSort)}">
          <td class="analytics-table__service">
            ${escapeHtml(row.serviceName)}
          </td>
          <td class="analytics-table__numeric">${formatEnrolmentCapacity(row)}</td>
          <td class="analytics-table__numeric">${formatEstimatedPlaces(row)}</td>
          <td class="analytics-table__numeric">${formatAgeBandCapacity(row.enrolledUnder2Count, row.licensedUnder2Capacity)}</td>
          <td class="analytics-table__numeric">${formatAgeBandCapacity(row.enrolledOver2Count, row.licensedOver2Capacity)}</td>
          <td class="analytics-table__numeric">${formatWaitlistCoverage(row.waitlistCount)}</td>
          <td class="analytics-table__numeric">${row.agedOutCount}</td>
          <td class="analytics-table__numeric">${getScopedApproachingFiveCount(row, selectedWindowKey)}</td>
          <td class="analytics-table__numeric">${getScopedKnownLeavingCount(row, selectedWindowKey)}</td>
          <td class="analytics-table__action">${emailAction}</td>
        </tr>
      `;
      },
    )
    .join("");
  const body =
    rows ||
    `
      <tr>
        <td colspan="10" class="analytics-table__empty">No analytics snapshot rows are available yet.</td>
      </tr>
    `;

  return `
    <div class="analytics-table-shell">
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
              <th class="analytics-table__numeric">EST</th>
              <th class="analytics-table__numeric">U2</th>
              <th class="analytics-table__numeric">O2</th>
              <th class="analytics-table__numeric">Waitlist</th>
              <th class="analytics-table__numeric">Age 5+</th>
              <th class="analytics-table__numeric">Near 5</th>
              <th class="analytics-table__numeric">Leaving</th>
              <th class="analytics-table__action">Email</th>
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
  latestMetaRecommendationNotesForCentre: MetaNotificationHistoryRow[] = [],
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
      ${renderLatestMetaRecommendationNotesForChat(latestMetaRecommendationNotesForCentre)}
    </div>
  `;
}

function renderLatestMetaRecommendationNotesForChat(notes: MetaNotificationHistoryRow[]) {
  if (notes.length === 0) {
    return "";
  }

  return `
    <div class="chat-message__meta-notes">
      <strong>Latest META Ads notes</strong>
      <ol>
        ${notes
          .slice(0, 3)
          .map(
            (note) => `
              <li>
                <span>${formatDateOnly(note.occurredAt)}</span>
                <p>${escapeHtml(note.message)}</p>
              </li>
            `,
          )
          .join("")}
      </ol>
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
  latestMetaRecommendationNotesForCentre: MetaNotificationHistoryRow[] = [],
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
          latestMetaRecommendationNotesForCentre,
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

function getMetaCoverageByCentre(metaAdsDashboardData?: MetaAdsDashboardData | null) {
  return new Map((metaAdsDashboardData?.centreCoverage ?? []).map((row) => [row.centreKey, row]));
}

function getMetaRecommendation(
  row: AnalyticsRow,
  selectedWindowKey: WindowKey,
  coverage: ReturnType<typeof getMetaCoverageByCentre>,
) {
  const centreCoverage = coverage.get(row.centreKey);
  const openPlaces = Math.max(row.licensedCapacity - row.enrolledCount, 0);
  const actionableWaitlist = getActionableWaitlistCount(row);
  const replacementPressure = getScopedReplacementPressure(row, selectedWindowKey);
  const activeCampaignCount = centreCoverage?.activeCampaignCount ?? 0;
  const spend30d = centreCoverage?.spend30d ?? 0;

  if (openPlaces >= 5 && actionableWaitlist <= 3 && activeCampaignCount === 0) {
    return "Needs ads";
  }

  if (openPlaces >= 5 && activeCampaignCount > 0 && spend30d > 0) {
    return "Ads active, monitor";
  }

  if (row.waitlistCount >= openPlaces + replacementPressure && activeCampaignCount > 0 && spend30d > 0) {
    return "Review spend";
  }

  if (replacementPressure >= 3 && activeCampaignCount === 0) {
    return "Prepare campaign";
  }

  if (openPlaces <= 1 && row.waitlistCount >= 5) {
    return "Demand covered";
  }

  return activeCampaignCount > 0 ? "Covered by ads" : "Watch";
}

function renderMetaCoverageRows(
  snapshotSet: LatestSnapshotSet | null,
  metaAdsDashboardData?: MetaAdsDashboardData | null,
) {
  const deliverySortRank = new Map([
    ["Active", 0],
    ["Learning", 1],
    ["Learning Limited", 2],
    ["Completed", 3],
    ["Not Delivering", 4],
  ]);
  const centreNames = new Map((snapshotSet?.snapshots ?? []).map((row) => [row.centreKey, row.serviceName]));
  const getDisplayCentreName = (row: MetaAdsDashboardData["currentAds"][number]) =>
    row.centreKey == null
      ? row.adSetName !== "-"
        ? row.adSetName
        : row.campaignName !== "-"
          ? row.campaignName
          : row.adName
      : (centreNames.get(row.centreKey) ?? `Centre ${row.centreKey}`);
  const rows = (metaAdsDashboardData?.currentAds ?? [])
    .filter((row) => deliverySortRank.has(row.status))
    .sort((left, right) => {
      const deliverySort = (deliverySortRank.get(left.status) ?? 999) - (deliverySortRank.get(right.status) ?? 999);

      if (deliverySort !== 0) {
        return deliverySort;
      }

      const leftCentre = getDisplayCentreName(left);
      const rightCentre = getDisplayCentreName(right);
      const centreSort = leftCentre.localeCompare(rightCentre);

      if (centreSort !== 0) {
        return centreSort;
      }

      return left.adName.localeCompare(right.adName);
    });

  if ((snapshotSet?.snapshots ?? []).length === 0) {
    return `
      <tr>
        <td colspan="9" class="meta-ads-table__empty">Refresh Infocare analytics before comparing centre demand with Meta advertising coverage.</td>
      </tr>
    `;
  }

  if (rows.length === 0) {
    return `
      <tr>
        <td colspan="9" class="meta-ads-table__empty">No matched adverts found for the selected period and Meta delivery states.</td>
      </tr>
    `;
  }

  return rows
    .map(
      (row) => {
        const rowClass =
          isBeforeToday(row.endsAt) || row.status === "Rejected" ? ` class="meta-ads-table__ended-row"` : "";

        return `
        <tr${rowClass}>
          <td>${escapeHtml(getDisplayCentreName(row))}</td>
          <td>${escapeHtml(`${row.adName}${row.advertType ? ` - ${row.advertType}` : ""}`)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${row.resultCount == null ? "-" : `${formatInteger(row.resultCount)} ${escapeHtml(row.resultLabel)}`}</td>
          <td class="meta-ads-table__numeric">${formatInteger(row.impressions)}</td>
          <td class="meta-ads-table__numeric">${formatMoney(row.spend)}</td>
          <td class="meta-ads-table__numeric">${formatMoney(row.cpr)}</td>
          <td class="meta-ads-table__numeric">${formatMoney(row.budget)}</td>
          <td>${formatDateOnly(row.endsAt)}</td>
        </tr>
      `;
      },
    )
    .join("");
}

function renderMetaConfigEmptyState(metaConfigStatus?: MetaConfigStatus | null) {
  if (!metaConfigStatus || metaConfigStatus.isConfigured) {
    return "";
  }

  return `
    <div class="meta-ads-config-state">
      <strong>Meta Ads refresh is not configured.</strong>
      <span>Server-side Meta Ads credentials are required before data can be pulled.</span>
    </div>
  `;
}

function renderMetaDeliveryNotices(metaAdsDashboardData?: MetaAdsDashboardData | null) {
  const notDeliveringCount = metaAdsDashboardData?.notDeliveringCampaignCount ?? 0;
  const rejectedCount = metaAdsDashboardData?.rejectedCampaignCount ?? 0;

  if (notDeliveringCount === 0 && rejectedCount === 0) {
    return "";
  }

  const notices = [
    notDeliveringCount > 0
      ? `<li><strong>${notDeliveringCount} Not Delivering</strong><span>Something is blocking spend.</span></li>`
      : "",
    rejectedCount > 0 ? `<li><strong>${rejectedCount} Rejected</strong><span>Policy issue.</span></li>` : "",
  ].join("");

  return `<ul class="meta-ads-delivery-notices">${notices}</ul>`;
}

function renderMetaRecommendations(
  snapshotSet: LatestSnapshotSet | null,
  selectedWindowKey: WindowKey,
  metaAdsDashboardData?: MetaAdsDashboardData | null,
  metaRecommendationNotifications: MetaRecommendationNotificationView[] = [],
  metaRecommendationNotes: MetaRecommendationNoteView[] = [],
  centreContacts: CentreContact[] = [],
) {
  const rows = snapshotSet?.snapshots ?? [];
  const coverage = getMetaCoverageByCentre(metaAdsDashboardData);
  const notesByNotificationId = groupMetaRecommendationNotes(metaRecommendationNotes);
  const dismissedNotificationIds = getDismissedMetaNotificationIds(metaRecommendationNotifications);
  const recommendations = rows
    .map((row) => {
      const centreCoverage = coverage.get(row.centreKey);
      const openPlaces = Math.max(row.licensedCapacity - row.enrolledCount, 0);
      const actionableWaitlist = getActionableWaitlistCount(row);
      const replacementPressure = getScopedReplacementPressure(row, selectedWindowKey);
      const recommendation = getMetaRecommendation(row, selectedWindowKey, coverage);
      const priority =
        recommendation === "Needs ads" || recommendation === "Prepare campaign"
          ? 3
          : recommendation === "Ads active, monitor" || recommendation === "Review spend"
            ? 2
            : 1;

      return {
        row,
        centreCoverage,
        openPlaces,
        actionableWaitlist,
        replacementPressure,
        recommendation,
        priority,
        notificationId: createMetaNotificationId(row, selectedWindowKey, recommendation),
      };
    })
    .filter((entry) => entry.priority > 1)
    .filter((entry) => !dismissedNotificationIds.has(entry.notificationId))
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return right.openPlaces + right.replacementPressure - (left.openPlaces + left.replacementPressure);
    });

  if (recommendations.length === 0) {
    return `
      <p class="meta-ads-empty" data-meta-recommendations-empty>No urgent campaign changes found from the current Infocare demand and matched Meta coverage.</p>
      <ul class="meta-ads-recommendations" data-meta-recommendations-list></ul>
    `;
  }

  return `
    <p class="meta-ads-empty" data-meta-recommendations-empty hidden>No urgent campaign changes found from the current Infocare demand and matched Meta coverage.</p>
    <ul class="meta-ads-recommendations" data-meta-recommendations-list>
      ${recommendations
        .map((entry) => {
          const notes = notesByNotificationId.get(entry.notificationId) ?? [];
          const contact = matchCentreContact(entry.row.serviceName, centreContacts);

          return `
            <li class="meta-ads-notification" data-meta-notification-id="${escapeHtml(entry.notificationId)}">
              <div class="meta-ads-notification__content">
                <div class="meta-ads-notification__title">
                  <strong>${escapeHtml(entry.recommendation)}</strong>
                  <div class="meta-ads-notification__title-actions">
                    ${
                      contact
                        ? `<a class="meta-ads-notification__email" href="${escapeHtml(buildMetaAdvertEmailHref(contact))}" title="Email centre about a Facebook advert" aria-label="Email ${escapeHtml(entry.row.serviceName)} about a Facebook advert"><i class="bi bi-envelope ui-icon" aria-hidden="true"></i></a>`
                        : ""
                    }
                    <button type="button" data-meta-notification-dismiss title="Dismiss notification" aria-label="Dismiss notification">
                      <i class="bi bi-x-lg ui-icon" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
                <span>${escapeHtml(entry.row.serviceName)}: ${entry.openPlaces} open, ${entry.actionableWaitlist}/${entry.row.waitlistCount} actionable waitlist, ${entry.replacementPressure} pressure, ${entry.centreCoverage?.activeCampaignCount ?? 0} active campaigns, ${formatMoney(entry.centreCoverage?.spend30d ?? 0)} spend.</span>
              </div>
              <div class="meta-ads-notification__actions">
                <div class="meta-ads-notification__controls">
                  <textarea data-meta-note-text placeholder="Add a note" aria-label="Add a note" rows="1"></textarea>
                  <button type="button" data-meta-note-add title="Add note" aria-label="Add note">
                    <i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i>
                  </button>
                </div>
                <ol class="meta-ads-notification__notes" data-meta-notes>${notes.map(renderMetaRecommendationNote).join("")}</ol>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderMetaNotificationHistory(
  notificationCount: number,
) {
  return `
    <div class="meta-ads-history" data-meta-history data-page-size="25">
      <div class="meta-ads-history__toolbar">
        <select data-meta-history-centre-filter aria-label="Filter notification history by centre">
          <option value="">All centres</option>
        </select>
        <select data-meta-history-kind-filter aria-label="Filter notification history by type">
          <option value="">All types</option>
          <option value="Notification">Notification</option>
          <option value="Note">Note</option>
        </select>
      </div>
      <div class="meta-ads-table-wrap">
        <table class="meta-ads-table meta-ads-table--history">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Type</th>
              <th>Heading</th>
              <th>Message</th>
              <th>Status</th>
              <th class="meta-ads-table__numeric">Open</th>
              <th class="meta-ads-table__numeric">Waitlist</th>
              <th class="meta-ads-table__numeric">Pressure</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody data-meta-history-body>
            <tr>
              <td colspan="9" class="meta-ads-table__empty" data-meta-history-loading>Loading notification history...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="meta-ads-history__pagination" data-meta-history-pagination></div>
      <p class="meta-ads-empty" data-meta-history-empty${notificationCount > 0 ? " hidden" : ""}>No recommendation notifications have been recorded yet.</p>
    </div>
  `;
}

export function renderMetaNotificationHistoryRows(rows: MetaNotificationHistoryRow[]) {
  if (rows.length === 0) {
    return `<tr><td colspan="9" class="meta-ads-table__empty">No history rows found.</td></tr>`;
  }

  return rows
    .map(
      (row) => `
        <tr data-meta-history-row data-centre-key="${row.centreKey}" data-notification-id="${escapeHtml(row.notificationId)}" data-meta-history-kind="${escapeHtml(row.kind)}" data-meta-history-heading="${escapeHtml(row.heading)}" data-meta-history-message="${escapeHtml(row.message)}">
          <td>${escapeHtml(row.centreName)}</td>
          <td>${row.kind}</td>
          <td>${escapeHtml(row.heading)}</td>
          <td class="meta-ads-history__message">${escapeHtml(row.message)}</td>
          <td data-meta-history-status>${row.status}</td>
          <td class="meta-ads-table__numeric">${row.openPlaces}</td>
          <td class="meta-ads-table__numeric">${row.waitlist}</td>
          <td class="meta-ads-table__numeric">${row.pressure}</td>
          <td>${formatTimestamp(row.occurredAt)}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderMetaNotificationHistoryPagination(pageData: MetaNotificationHistoryPage) {
  if (pageData.totalRows === 0) {
    return "";
  }

  const previousDisabled = pageData.page <= 1 ? " disabled" : "";
  const nextDisabled = pageData.page >= pageData.totalPages ? " disabled" : "";
  const firstRow = (pageData.page - 1) * pageData.pageSize + 1;
  const lastRow = Math.min(pageData.page * pageData.pageSize, pageData.totalRows);

  return `
    <span>${firstRow}-${lastRow} of ${pageData.totalRows}</span>
    <button type="button" data-meta-history-page="${pageData.page - 1}" aria-label="Previous notification history page" title="Previous page"${previousDisabled}>
      <i class="bi bi-chevron-left ui-icon" aria-hidden="true"></i>
    </button>
    <button type="button" data-meta-history-page="${pageData.page + 1}" aria-label="Next notification history page" title="Next page"${nextDisabled}>
      <i class="bi bi-chevron-right ui-icon" aria-hidden="true"></i>
    </button>
  `;
}

function renderMetaAdsPanel(
  snapshotSet: LatestSnapshotSet | null,
  selectedWindowKey: WindowKey,
  metaConfigStatus?: MetaConfigStatus | null,
  metaAdsDashboardData?: MetaAdsDashboardData | null,
  metaRecommendationNotifications: MetaRecommendationNotificationView[] = [],
  metaRecommendationNotificationCount = metaRecommendationNotifications.length,
  metaRecommendationNotes: MetaRecommendationNoteView[] = [],
  centreContacts: CentreContact[] = [],
) {
  return `
    <div class="meta-ads-panel">
      <div class="meta-ads-summary">
        <div class="meta-ads-summary__item">
          <span>Active</span>
          <strong>${metaAdsDashboardData?.activeHealthyCampaignCount ?? 0}</strong>
          <small>Healthy</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Learning</span>
          <strong>${metaAdsDashboardData?.learningCampaignCount ?? 0}</strong>
          <small>Normal optimisation period</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Learning Limited</span>
          <strong>${metaAdsDashboardData?.learningLimitedCampaignCount ?? 0}</strong>
          <small>Usually a problem</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Completed</span>
          <strong>${metaAdsDashboardData?.completedCampaignCount ?? 0}</strong>
          <small>Ended adverts</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Not Delivering</span>
          <strong>${metaAdsDashboardData?.notDeliveringCampaignCount ?? 0}</strong>
          <small>Something is blocking spend</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Rejected</span>
          <strong>${metaAdsDashboardData?.rejectedCampaignCount ?? 0}</strong>
          <small>Policy issue</small>
        </div>
        <div class="meta-ads-summary__item">
          <span>Amount spent</span>
          <strong>${formatMoney(metaAdsDashboardData?.totalSpend30d ?? 0)}</strong>
          <small>${escapeHtml(formatWindowPeriodLabel(selectedWindowKey))}</small>
        </div>
      </div>

      ${renderMetaConfigEmptyState(metaConfigStatus)}

      <section class="meta-ads-section meta-ads-section--wide meta-ads-section--recent">
        <div class="meta-ads-section__header">
          <h3>Ads In Period</h3>
          <span>${metaAdsDashboardData?.latestPullAt ? `last Meta pull ${formatTimestamp(metaAdsDashboardData.latestPullAt)}` : "no pull yet"}</span>
        </div>
        <div class="meta-ads-table-wrap">
          <table class="meta-ads-table">
            <thead>
              <tr>
                <th>Centre</th>
                <th>Advert</th>
                <th>Delivery</th>
                <th>Results</th>
                <th class="meta-ads-table__numeric">Impressions</th>
                <th class="meta-ads-table__numeric">Amount spent</th>
                <th class="meta-ads-table__numeric" title="Cost per result">CPR</th>
                <th class="meta-ads-table__numeric">Budget</th>
                <th>Ends</th>
              </tr>
            </thead>
            <tbody>${renderMetaCoverageRows(snapshotSet, metaAdsDashboardData)}</tbody>
          </table>
        </div>
      </section>

      <section class="meta-ads-section meta-ads-section--wide meta-ads-section--recommendations">
        <div class="meta-ads-section__header">
          <h3>Recommendations</h3>
          <span>${metaAdsDashboardData?.unmatchedCampaignCount ?? 0} unmatched campaigns</span>
        </div>
        ${renderMetaRecommendations(snapshotSet, selectedWindowKey, metaAdsDashboardData, metaRecommendationNotifications, metaRecommendationNotes, centreContacts)}
      </section>

      <section class="meta-ads-section meta-ads-section--wide">
        <div class="meta-ads-section__header">
          <h3>Notification History</h3>
          <span>${metaRecommendationNotificationCount} stored</span>
        </div>
        ${renderMetaNotificationHistory(metaRecommendationNotificationCount)}
      </section>
    </div>
  `;
}

function formatDecimalPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return `${Number((value * 100).toFixed(1))}%`;
}

function formatDurationSeconds(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function normalizePageMatchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/kindergarten|centre|center|early|childhood|learning|the|and/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCentrePageMatchTokens(serviceName: string) {
  return normalizePageMatchText(serviceName)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function getMetaAdPageMatchTokens(ad: MetaAdsDashboardData["currentAds"][number]) {
  return normalizePageMatchText(`${ad.adSetName} ${ad.adName} ${ad.campaignName}`)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !["advert", "campaign", "kindergarten", "enrolment", "enrolments", "april"].includes(token));
}

function getMetaAdDisplayName(ad: MetaAdsDashboardData["currentAds"][number]) {
  return ad.adSetName !== "-"
    ? ad.adSetName
    : ad.campaignName !== "-"
      ? ad.campaignName
      : ad.adName;
}

function renderGoogleAnalyticsPageRows(pages: GoogleAnalyticsPageSnapshotView[], limit = 12) {
  const visiblePages = pages.slice(0, limit);
  const maxViews = Math.max(...visiblePages.map((page) => page.screenPageViews ?? 0), 1);

  if (visiblePages.length === 0) {
    return `<tr><td colspan="5" class="google-analytics-table__empty">No page data stored yet.</td></tr>`;
  }

  return visiblePages
    .map((page) => {
      const views = page.screenPageViews ?? 0;
      const width = Math.max(4, Math.round((views / maxViews) * 100));

      return `
        <tr>
          <td>
            <strong>${escapeHtml(page.pageTitle || page.pagePath)}</strong>
            <span>${escapeHtml(page.pagePath)}</span>
          </td>
          <td class="google-analytics-table__numeric">${formatInteger(views)}</td>
          <td class="google-analytics-table__numeric">${formatInteger(page.activeUsers)}</td>
          <td class="google-analytics-table__numeric">${formatInteger(page.sessions)}</td>
          <td class="google-analytics-table__volume"><span class="google-analytics-bar" style="--bar-width: ${width}%"></span></td>
        </tr>
      `;
    })
    .join("");
}

function buildMetaRelatedGoogleAnalyticsPages(
  snapshotSet: LatestSnapshotSet | null,
  metaAdsDashboardData: MetaAdsDashboardData | null | undefined,
  googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView,
) {
  const deliverySortRank = new Map([
    ["Active", 0],
    ["Learning", 1],
    ["Learning Limited", 2],
    ["Completed", 3],
    ["Not Delivering", 4],
  ]);
  const adsByCentre = new Map<number, MetaAdsDashboardData["currentAds"]>();
  const advertisedCentreKeys = new Set(
    (metaAdsDashboardData?.currentAds ?? [])
      .filter((ad) => ad.centreKey != null)
      .map((ad) => ad.centreKey as number),
  );

  for (const ad of metaAdsDashboardData?.currentAds ?? []) {
    if (ad.centreKey == null) {
      continue;
    }

    const ads = adsByCentre.get(ad.centreKey) ?? [];

    ads.push(ad);
    adsByCentre.set(ad.centreKey, ads);
  }

  for (const coverage of metaAdsDashboardData?.centreCoverage ?? []) {
    if (coverage.activeCampaignCount > 0) {
      advertisedCentreKeys.add(coverage.centreKey);
    }
  }

  const centreRows = (snapshotSet?.snapshots ?? []).filter((row) => advertisedCentreKeys.has(row.centreKey));
  const rows = centreRows
    .map((centre) => {
      const ads = adsByCentre.get(centre.centreKey) ?? [];
      const tokens = getCentrePageMatchTokens(centre.serviceName);
      const matchedPages = googleAnalyticsSnapshot.pages.filter((page) => {
        const pageText = normalizePageMatchText(`${page.pagePath} ${page.pageTitle ?? ""}`);

        return tokens.some((token) => pageText.includes(token));
      });
      const topPage = matchedPages.sort(
        (left, right) => (right.screenPageViews ?? 0) - (left.screenPageViews ?? 0),
      )[0];
      const coverage = metaAdsDashboardData?.centreCoverage.find((row) => row.centreKey === centre.centreKey);
      const deliveryStatuses = [...new Set(ads.map((ad) => ad.status))]
        .sort((left, right) => (deliverySortRank.get(left) ?? 999) - (deliverySortRank.get(right) ?? 999));

      return {
        name: centre.serviceName,
        page: topPage ?? null,
        adCount: ads.length || coverage?.activeCampaignCount || 0,
        delivery: deliveryStatuses.length > 0 ? deliveryStatuses.join(", ") : "-",
      };
    })
    .filter((row) => row.page != null || row.adCount > 0);
  const unkeyedAdGroups = new Map<string, MetaAdsDashboardData["currentAds"]>();

  for (const ad of metaAdsDashboardData?.currentAds ?? []) {
    if (ad.centreKey != null) {
      continue;
    }

    const displayName = getMetaAdDisplayName(ad);
    const ads = unkeyedAdGroups.get(displayName) ?? [];

    ads.push(ad);
    unkeyedAdGroups.set(displayName, ads);
  }

  for (const [displayName, ads] of unkeyedAdGroups) {
    const tokens = [...new Set(ads.flatMap(getMetaAdPageMatchTokens))];

    if (tokens.length === 0) {
      continue;
    }

    const matchedPages = googleAnalyticsSnapshot.pages.filter((page) => {
      const pageText = normalizePageMatchText(`${page.pagePath} ${page.pageTitle ?? ""}`);

      return tokens.some((token) => pageText.includes(token));
    });
    const topPage = matchedPages.sort(
      (left, right) => (right.screenPageViews ?? 0) - (left.screenPageViews ?? 0),
    )[0];
    const deliveryStatuses = [...new Set(ads.map((ad) => ad.status))]
      .sort((left, right) => (deliverySortRank.get(left) ?? 999) - (deliverySortRank.get(right) ?? 999));

    if (!topPage) {
      continue;
    }

    rows.push({
      name: displayName,
      page: topPage,
      adCount: ads.length,
      delivery: deliveryStatuses.length > 0 ? deliveryStatuses.join(", ") : "-",
    });
  }

  return rows
    .sort((left, right) => (right.page?.screenPageViews ?? 0) - (left.page?.screenPageViews ?? 0));
}

function renderMetaRelatedGoogleAnalyticsRows(
  snapshotSet: LatestSnapshotSet | null,
  metaAdsDashboardData: MetaAdsDashboardData | null | undefined,
  googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView,
) {
  const rows = buildMetaRelatedGoogleAnalyticsPages(snapshotSet, metaAdsDashboardData, googleAnalyticsSnapshot);

  if (rows.length === 0) {
    return `<tr><td colspan="7" class="google-analytics-table__empty">No Meta ad centre pages matched for the selected period yet.</td></tr>`;
  }

  return rows
    .map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${row.adCount}</td>
        <td>${escapeHtml(row.delivery)}</td>
        <td>
          ${
            row.page
              ? `<strong>${escapeHtml(row.page.pageTitle || row.page.pagePath)}</strong><span>${escapeHtml(row.page.pagePath)}</span>`
              : `<span>No matching page in top 100</span>`
          }
        </td>
        <td class="google-analytics-table__numeric">${formatInteger(row.page?.screenPageViews)}</td>
        <td class="google-analytics-table__numeric">${formatInteger(row.page?.activeUsers)}</td>
        <td class="google-analytics-table__numeric">${formatDecimalPercent(row.page?.engagementRate)}</td>
      </tr>
    `)
    .join("");
}

function renderGoogleAnalyticsConfigEmptyState(configStatus?: GoogleAnalyticsConfigStatus | null) {
  if (!configStatus || configStatus.isConfigured) {
    return "";
  }

  return `
    <div class="google-analytics-config-state">
      <strong>Google Analytics is not ready.</strong>
      <span>Missing ${configStatus.missingKeys.map(escapeHtml).join(", ")}.</span>
    </div>
  `;
}

function renderGoogleAnalyticsRangeFilter(
  selectedCentreKey: number | null | undefined,
  selectedWindowKey: WindowKey,
  serviceSort: ServiceSort,
  googleAnalyticsRange: GoogleAnalyticsRangeSelection,
  googleAnalyticsSection: GoogleAnalyticsSection,
) {
  const bounds = getGoogleAnalyticsBounds();
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: new Date(Date.UTC(2026, index, 1)).toLocaleDateString("en-NZ", { month: "short", timeZone: "UTC" }),
  }));
  const years = Array.from(
    { length: bounds.maxYear - bounds.minYear + 1 },
    (_, index) => bounds.minYear + index,
  );
  const renderMonthOptions = (selectedMonth: number) =>
    months
      .map((option) => `<option value="${option.value}"${option.value === selectedMonth ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("");
  const renderYearOptions = (selectedYear: number) =>
    years
      .map((year) => `<option value="${year}"${year === selectedYear ? " selected" : ""}>${year}</option>`)
      .join("");

  return `
    <form class="google-analytics-filter" method="get" action="/" autocomplete="off">
      ${selectedCentreKey != null ? `<input type="hidden" name="centre" value="${selectedCentreKey}">` : ""}
      <input type="hidden" name="window" value="${selectedWindowKey}">
      ${serviceSort !== "critical" ? `<input type="hidden" name="sort" value="${serviceSort}">` : ""}
      <input type="hidden" name="panel" value="google-analytics">
      ${googleAnalyticsSection ? `<input type="hidden" name="googleAnalyticsSection" value="${googleAnalyticsSection}">` : ""}
      <input type="hidden" name="gaRange" value="months">
      <fieldset data-ga-month-bound data-min-year="${bounds.minYear}" data-min-month="${bounds.minMonth}" data-max-year="${bounds.maxYear}" data-max-month="${bounds.maxMonth}">
        <legend>From</legend>
        <label>
          <span>Month</span>
          <select name="gaFromMonth" data-ga-month-select data-selected-value="${googleAnalyticsRange.fromMonth}" autocomplete="off">${renderMonthOptions(googleAnalyticsRange.fromMonth)}</select>
        </label>
        <label>
          <span>Year</span>
          <select name="gaFromYear" data-ga-year-select data-selected-value="${googleAnalyticsRange.fromYear}" autocomplete="off">${renderYearOptions(googleAnalyticsRange.fromYear)}</select>
        </label>
      </fieldset>
      <fieldset data-ga-month-bound data-min-year="${bounds.minYear}" data-min-month="${bounds.minMonth}" data-max-year="${bounds.maxYear}" data-max-month="${bounds.maxMonth}">
        <legend>To</legend>
        <label>
          <span>Month</span>
          <select name="gaToMonth" data-ga-month-select data-selected-value="${googleAnalyticsRange.toMonth}" autocomplete="off">${renderMonthOptions(googleAnalyticsRange.toMonth)}</select>
        </label>
        <label>
          <span>Year</span>
          <select name="gaToYear" data-ga-year-select data-selected-value="${googleAnalyticsRange.toYear}" autocomplete="off">${renderYearOptions(googleAnalyticsRange.toYear)}</select>
        </label>
      </fieldset>
      <button type="submit" aria-label="Apply Google Analytics date range" title="Apply date range"><i class="bi bi-funnel ui-icon" aria-hidden="true"></i></button>
      <script>
        (() => {
          for (const group of document.querySelectorAll("[data-ga-month-bound]")) {
            const yearSelect = group.querySelector("[data-ga-year-select]");
            const monthSelect = group.querySelector("[data-ga-month-select]");

            if (!(yearSelect instanceof HTMLSelectElement) || !(monthSelect instanceof HTMLSelectElement)) {
              continue;
            }

            yearSelect.value = yearSelect.getAttribute("data-selected-value") || yearSelect.value;
            monthSelect.value = monthSelect.getAttribute("data-selected-value") || monthSelect.value;

            const minYear = Number(group.getAttribute("data-min-year"));
            const minMonth = Number(group.getAttribute("data-min-month"));
            const maxYear = Number(group.getAttribute("data-max-year"));
            const maxMonth = Number(group.getAttribute("data-max-month"));
            const syncMonths = () => {
              const year = Number(yearSelect.value);
              let firstEnabled = null;

              for (const option of monthSelect.options) {
                const month = Number(option.value);
                const disabled = (year === minYear && month < minMonth) || (year === maxYear && month > maxMonth);

                option.disabled = disabled;

                if (!disabled && firstEnabled == null) {
                  firstEnabled = option.value;
                }
              }

              if (monthSelect.selectedOptions[0]?.disabled && firstEnabled != null) {
                monthSelect.value = firstEnabled;
              }
            };

            yearSelect.addEventListener("change", syncMonths);
            syncMonths();
          }
        })();
      </script>
    </form>
  `;
}

function renderGoogleAnalyticsPanel(
  snapshot?: GoogleAnalyticsDailySnapshotView | null,
  configStatus?: GoogleAnalyticsConfigStatus | null,
  snapshotSet?: LatestSnapshotSet | null,
  metaAdsDashboardData?: MetaAdsDashboardData | null,
  selectedCentreKey?: number | null,
  selectedWindowKey: WindowKey = "3M",
  serviceSort: ServiceSort = "critical",
  googleAnalyticsSection: GoogleAnalyticsSection = null,
  googleAnalyticsRange: GoogleAnalyticsRangeSelection = resolveGoogleAnalyticsRangeSelection(),
) {
  const hasSnapshot = Boolean(snapshot);
  const rangeLabel = snapshot ? formatGoogleAnalyticsRangeLabel(snapshot) : "No stored range";
  const pagesSection = snapshot
    ? `
      <section class="google-analytics-section">
        <div class="google-analytics-section__header">
          <div class="google-analytics-section__title">
            <h3>Most Visited Pages</h3>
            ${
              googleAnalyticsSection
                ? ""
                : `<button class="panel-action-button google-analytics-section-open" type="button" data-open-panel="google-analytics" data-panel-query="${escapeHtml(buildGoogleAnalyticsSectionQuery(selectedCentreKey, selectedWindowKey, serviceSort, "pages", googleAnalyticsRange))}" aria-label="Open Most Visited Pages window" title="Open window"><i class="bi bi-box-arrow-up-right ui-icon" aria-hidden="true"></i><span>Open</span></button>`
            }
          </div>
          <div class="google-analytics-section__actions">
            <span>${escapeHtml(rangeLabel)}</span>
          </div>
        </div>
        <div class="google-analytics-table-wrap">
          <table class="google-analytics-table">
            <thead>
              <tr>
                <th>Page</th>
                <th class="google-analytics-table__numeric">Views</th>
                <th class="google-analytics-table__numeric">Users</th>
                <th class="google-analytics-table__numeric">Sessions</th>
                <th class="google-analytics-table__volume">Volume</th>
              </tr>
            </thead>
            <tbody>${renderGoogleAnalyticsPageRows(snapshot.pages)}</tbody>
          </table>
        </div>
      </section>
    `
    : "";
  const metaCentrePagesSection = snapshot
    ? `
      <section class="google-analytics-section">
        <div class="google-analytics-section__header">
          <h3>Meta Ad Centre Pages</h3>
          <span>Matched from active Meta ad centres</span>
        </div>
        <div class="google-analytics-table-wrap">
          <table class="google-analytics-table">
            <thead>
              <tr>
                <th>Centre</th>
                <th>Ads</th>
                <th>Delivery</th>
                <th>Matched page</th>
                <th class="google-analytics-table__numeric">Views</th>
                <th class="google-analytics-table__numeric">Users</th>
                <th class="google-analytics-table__numeric">Engagement</th>
              </tr>
            </thead>
            <tbody>${renderMetaRelatedGoogleAnalyticsRows(snapshotSet ?? null, metaAdsDashboardData, snapshot)}</tbody>
          </table>
        </div>
      </section>
    `
    : "";

  return `
    <div class="google-analytics-panel${googleAnalyticsSection ? " google-analytics-panel--section-focus" : ""}">
      ${renderGoogleAnalyticsConfigEmptyState(configStatus)}
      ${renderGoogleAnalyticsRangeFilter(selectedCentreKey, selectedWindowKey, serviceSort, googleAnalyticsRange, googleAnalyticsSection)}
      ${
        hasSnapshot && snapshot
          ? googleAnalyticsSection === "pages"
            ? pagesSection
            : `
            <div class="google-analytics-summary">
              <div class="google-analytics-summary__item">
                <span>Active users</span>
                <strong>${formatInteger(snapshot.activeUsers)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Sessions</span>
                <strong>${formatInteger(snapshot.sessions)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Engaged sessions</span>
                <strong>${formatInteger(snapshot.engagedSessions)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Views</span>
                <strong>${formatInteger(snapshot.screenPageViews)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Conversions</span>
                <strong>${formatMetaMetric(snapshot.conversions)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Revenue</span>
                <strong>${formatMoney(snapshot.totalRevenue)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Engagement rate</span>
                <strong>${formatDecimalPercent(snapshot.engagementRate)}</strong>
              </div>
              <div class="google-analytics-summary__item">
                <span>Avg session</span>
                <strong>${formatDurationSeconds(snapshot.averageSessionDuration)}</strong>
              </div>
            </div>
            <div class="google-analytics-panel__meta">
              <span>Property ${escapeHtml(snapshot.propertyId)}</span>
              <span>Range ${escapeHtml(formatGoogleAnalyticsRangeLabel(snapshot))}</span>
              <span>Pulled ${formatTimestamp(snapshot.pulledAt)}</span>
            </div>
            ${pagesSection}
            ${metaCentrePagesSection}
          `
          : `<p class="google-analytics-panel__empty">Open this panel to take the first daily Google Analytics snapshot.</p>`
      }
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

          let targetBounds = {
            left: window.screen?.availLeft || 0,
            top: window.screen?.availTop || 0,
            width: window.screen?.availWidth || window.screen?.width || 1600,
            height: window.screen?.availHeight || window.screen?.height || 900,
          };
          let featureString = [
            "popup=yes",
            "resizable=yes",
            "scrollbars=yes",
            "fullscreen=yes",
            "left=" + targetBounds.left,
            "top=" + targetBounds.top,
            "screenX=" + targetBounds.left,
            "screenY=" + targetBounds.top,
            "width=" + targetBounds.width,
            "height=" + targetBounds.height,
          ].join(",");

          if ("getScreenDetails" in window) {
            try {
              const details = await window.getScreenDetails();
              const targetIndex = resolveTargetScreenIndex(details);
              const screen = details.screens[targetIndex] ?? details.currentScreen;
              targetBounds = {
                left: screen.availLeft,
                top: screen.availTop,
                width: screen.availWidth,
                height: screen.availHeight,
              };

              featureString = [
                "popup=yes",
                "resizable=yes",
                "scrollbars=yes",
                "fullscreen=yes",
                "left=" + targetBounds.left,
                "top=" + targetBounds.top,
                "screenX=" + targetBounds.left,
                "screenY=" + targetBounds.top,
                "width=" + targetBounds.width,
                "height=" + targetBounds.height,
              ].join(",");
              localStorage.setItem(storageKey, String(targetIndex));
            } catch (error) {
            }
          }

          const popup = window.open("/?" + query, "_blank", featureString);

          if (popup) {
            try {
              popup.moveTo(targetBounds.left, targetBounds.top);
              popup.resizeTo(targetBounds.width, targetBounds.height);
              setTimeout(() => {
                try {
                  popup.moveTo(targetBounds.left, targetBounds.top);
                  popup.resizeTo(targetBounds.width, targetBounds.height);
                } catch (error) {
                }
              }, 250);
              popup.focus();
            } catch (error) {
            }
          }
        }

        function setFullscreenButtonState() {
          const isFullscreen = Boolean(document.fullscreenElement);

          for (const button of document.querySelectorAll("[data-fullscreen-toggle]")) {
            const icon = button.querySelector(".ui-icon");
            const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";

            button.setAttribute("aria-label", label);
            button.setAttribute("title", label);

            if (icon instanceof HTMLElement) {
              icon.className = isFullscreen ? "bi bi-fullscreen-exit ui-icon" : "bi bi-fullscreen ui-icon";
            }
          }
        }

        async function toggleFullscreen() {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
          }

          await document.documentElement.requestFullscreen();
        }

        function getMetaHistoryElements() {
          const history = document.querySelector("[data-meta-history]");
          const body = history?.querySelector("[data-meta-history-body]");
          const pagination = history?.querySelector("[data-meta-history-pagination]");
          const centreFilter = history?.querySelector("[data-meta-history-centre-filter]");
          const kindFilter = history?.querySelector("[data-meta-history-kind-filter]");

          if (!(history instanceof HTMLElement) || !(body instanceof HTMLTableSectionElement) || !(pagination instanceof HTMLElement)) {
            return null;
          }

          return {
            history,
            body,
            pagination,
            centreFilter: centreFilter instanceof HTMLSelectElement ? centreFilter : null,
            kindFilter: kindFilter instanceof HTMLSelectElement ? kindFilter : null,
          };
        }

        function syncMetaHistoryCentreOptions(select, options) {
          const selectedValue = select.value;
          const knownOptions = new Set(Array.from(select.options).map((option) => option.value));

          for (const option of options || []) {
            const value = String(option.centreKey || "");

            if (!value || knownOptions.has(value)) {
              continue;
            }

            const element = document.createElement("option");
            element.value = value;
            element.textContent = String(option.centreName || "");
            select.append(element);
          }

          select.value = Array.from(select.options).some((option) => option.value === selectedValue) ? selectedValue : "";
        }

        async function loadMetaHistoryPage(page = 1) {
          const elements = getMetaHistoryElements();

          if (!elements) {
            return;
          }

          const pageSize = elements.history.getAttribute("data-page-size") || "25";
          const centre = elements.centreFilter?.value || "";
          const kind = elements.kindFilter?.value || "";
          const params = new URLSearchParams({ page: String(page), pageSize });

          if (centre) {
            params.set("centre", centre);
          }

          if (kind) {
            params.set("kind", kind);
          }

          elements.history.setAttribute("aria-busy", "true");
          elements.body.innerHTML = '<tr><td colspan="9" class="meta-ads-table__empty">Loading notification history...</td></tr>';

          try {
            const response = await fetch("/api/meta-recommendation-notifications/history?" + params.toString(), {
              headers: {
                "Accept": "application/json",
              },
            });

            if (!response.ok) {
              throw new Error("History request failed");
            }

            const payload = await response.json();
            elements.body.innerHTML = String(payload.rowsHtml || "");
            elements.pagination.innerHTML = String(payload.paginationHtml || "");

            if (elements.centreFilter) {
              syncMetaHistoryCentreOptions(elements.centreFilter, payload.centreOptions);
            }
          } catch (error) {
            elements.body.innerHTML = '<tr><td colspan="9" class="meta-ads-table__empty">Notification history could not be loaded.</td></tr>';
            elements.pagination.innerHTML = "";
          } finally {
            elements.history.removeAttribute("aria-busy");
          }
        }

        function getMetaNotificationId(notification) {
          return notification.getAttribute("data-meta-notification-id") || "";
        }

        function createMetaNoteElement(note) {
          const item = document.createElement("li");
          const text = document.createElement("span");
          const deleteButton = document.createElement("button");
          const restoreButton = document.createElement("button");

          item.className = "meta-ads-note";
          item.setAttribute("data-meta-note-id", String(note.id));
          text.textContent = String(note.text || "");
          deleteButton.type = "button";
          deleteButton.setAttribute("data-meta-note-delete", "");
          deleteButton.title = "Delete note";
          deleteButton.setAttribute("aria-label", "Delete note");
          deleteButton.innerHTML = '<i class="bi bi-trash ui-icon" aria-hidden="true"></i>';
          restoreButton.type = "button";
          restoreButton.setAttribute("data-meta-note-restore", "");
          restoreButton.title = "Undo delete";
          restoreButton.setAttribute("aria-label", "Undo delete");
          restoreButton.hidden = true;
          restoreButton.innerHTML = '<i class="bi bi-arrow-counterclockwise ui-icon" aria-hidden="true"></i>';
          item.append(text, deleteButton, restoreButton);

          return item;
        }

        function focusMetaRecommendation(notification) {
          notification.scrollIntoView({ block: "nearest", inline: "nearest" });
          const textInput = notification.querySelector("[data-meta-note-text]");

          if (textInput instanceof HTMLTextAreaElement) {
            textInput.focus();
          }
        }

        function createMetaRecommendationFromHistoryRow(row) {
          const id = row.getAttribute("data-notification-id") || "";

          if (!id) {
            return;
          }

          const existing = document.querySelector('.meta-ads-notification[data-meta-notification-id="' + CSS.escape(id) + '"]');

          if (existing instanceof HTMLElement) {
            focusMetaRecommendation(existing);
            return;
          }

          const list = document.querySelector("[data-meta-recommendations-list]");

          if (!(list instanceof HTMLUListElement)) {
            return;
          }

          const heading = row.getAttribute("data-meta-history-heading") || row.children[2]?.textContent || "Recommendation";
          const message = row.getAttribute("data-meta-history-message") || row.children[3]?.textContent || "";
          const item = document.createElement("li");
          const content = document.createElement("div");
          const title = document.createElement("div");
          const strong = document.createElement("strong");
          const titleActions = document.createElement("div");
          const dismissButton = document.createElement("button");
          const summary = document.createElement("span");
          const actions = document.createElement("div");
          const controls = document.createElement("div");
          const textarea = document.createElement("textarea");
          const addButton = document.createElement("button");
          const notes = document.createElement("ol");
          const empty = document.querySelector("[data-meta-recommendations-empty]");

          item.className = "meta-ads-notification";
          item.setAttribute("data-meta-notification-id", id);
          content.className = "meta-ads-notification__content";
          title.className = "meta-ads-notification__title";
          strong.textContent = heading;
          titleActions.className = "meta-ads-notification__title-actions";
          dismissButton.type = "button";
          dismissButton.setAttribute("data-meta-notification-dismiss", "");
          dismissButton.title = "Dismiss notification";
          dismissButton.setAttribute("aria-label", "Dismiss notification");
          dismissButton.innerHTML = '<i class="bi bi-x-lg ui-icon" aria-hidden="true"></i>';
          summary.textContent = message;
          actions.className = "meta-ads-notification__actions";
          controls.className = "meta-ads-notification__controls";
          textarea.setAttribute("data-meta-note-text", "");
          textarea.placeholder = "Add a note";
          textarea.setAttribute("aria-label", "Add a note");
          textarea.rows = 1;
          addButton.type = "button";
          addButton.setAttribute("data-meta-note-add", "");
          addButton.title = "Add note";
          addButton.setAttribute("aria-label", "Add note");
          addButton.innerHTML = '<i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i>';
          notes.className = "meta-ads-notification__notes";
          notes.setAttribute("data-meta-notes", "");
          titleActions.append(dismissButton);
          title.append(strong, titleActions);
          content.append(title, summary);
          controls.append(textarea, addButton);
          actions.append(controls, notes);
          item.append(content, actions);
          list.prepend(item);

          if (empty instanceof HTMLElement) {
            empty.hidden = true;
          }

          focusMetaRecommendation(item);
        }

        function setMetaNoteDeletedState(item, isDeleted) {
          const deleteButton = item.querySelector("[data-meta-note-delete]");
          const restoreButton = item.querySelector("[data-meta-note-restore]");

          item.classList.toggle("meta-ads-note--deleted", isDeleted);

          if (deleteButton instanceof HTMLButtonElement) {
            deleteButton.hidden = isDeleted;
          }

          if (restoreButton instanceof HTMLButtonElement) {
            restoreButton.hidden = !isDeleted;
          }
        }

        async function saveMetaNote(notification, textInput) {
          const id = getMetaNotificationId(notification);
          const text = textInput.value.trim();

          if (!id || !text) {
            return;
          }

          const response = await fetch("/api/meta-recommendation-notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ notificationId: id, text }),
          });

          if (!response.ok) {
            return;
          }

          const payload = await response.json();
          const notesList = notification.querySelector("[data-meta-notes]");

          if (notesList instanceof HTMLOListElement && payload.note) {
            notesList.prepend(createMetaNoteElement(payload.note));
          }

          await loadMetaHistoryPage(1);

          textInput.value = "";
        }

        document.addEventListener("click", async (event) => {
          const target = event.target;

          if (!(target instanceof HTMLElement)) {
            return;
          }

          const analyticsEmail = target.closest("[data-analytics-email]");

          if (analyticsEmail instanceof HTMLAnchorElement) {
            const centreName = analyticsEmail.getAttribute("data-centre-name") || "this centre";
            const notificationId = analyticsEmail.getAttribute("data-notification-id") || "";

            setTimeout(async () => {
              const confirmed = window.confirm("Did you send the email to " + centreName + "?");

              if (!confirmed || !notificationId) {
                return;
              }

              const response = await fetch("/api/meta-recommendation-notes", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ notificationId, text: "Email sent for initiating campaign" }),
              });

              if (!response.ok) {
                return;
              }

              const payload = await response.json();
              const notification = document.querySelector('[data-meta-notification-id="' + CSS.escape(notificationId) + '"]');
              const notesList = notification?.querySelector("[data-meta-notes]");

              if (notesList instanceof HTMLOListElement && payload.note) {
                notesList.prepend(createMetaNoteElement(payload.note));
              }

              await loadMetaHistoryPage(1);
            }, 0);

            return;
          }

          const addNoteButton = target.closest("[data-meta-note-add]");

          if (addNoteButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const notification = addNoteButton.closest("[data-meta-notification-id]");
            const textInput = notification?.querySelector("[data-meta-note-text]");

            if (notification instanceof HTMLElement && textInput instanceof HTMLTextAreaElement) {
              await saveMetaNote(notification, textInput);
            }

            return;
          }

          const deleteNoteButton = target.closest("[data-meta-note-delete]");

          if (deleteNoteButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const note = deleteNoteButton.closest("[data-meta-note-id]");
            const id = note?.getAttribute("data-meta-note-id") || "";

            if (note instanceof HTMLLIElement && id) {
              const response = await fetch("/api/meta-recommendation-notes/" + encodeURIComponent(id) + "/delete", {
                method: "POST",
              });

              if (response.ok) {
                setMetaNoteDeletedState(note, true);
              }
            }

            return;
          }

          const restoreNoteButton = target.closest("[data-meta-note-restore]");

          if (restoreNoteButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const note = restoreNoteButton.closest("[data-meta-note-id]");
            const id = note?.getAttribute("data-meta-note-id") || "";

            if (note instanceof HTMLLIElement && id) {
              const response = await fetch("/api/meta-recommendation-notes/" + encodeURIComponent(id) + "/restore", {
                method: "POST",
              });

              if (response.ok) {
                setMetaNoteDeletedState(note, false);
              }
            }

            return;
          }

          const dismissNotificationButton = target.closest("[data-meta-notification-dismiss]");

          if (dismissNotificationButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const notification = dismissNotificationButton.closest("[data-meta-notification-id]");
            const notificationId = notification instanceof HTMLElement ? getMetaNotificationId(notification) : "";

            if (notification instanceof HTMLElement && notificationId) {
              const response = await fetch("/api/meta-recommendation-notifications/dismiss", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ notificationId }),
              });

              if (response.ok) {
                const historyRow = document.querySelector('[data-meta-history-row][data-notification-id="' + CSS.escape(notificationId) + '"]');
                const historyStatus = historyRow?.querySelector("[data-meta-history-status]");

                if (historyStatus instanceof HTMLTableCellElement) {
                  historyStatus.textContent = "Dismissed";
                }

                notification.remove();
                await loadMetaHistoryPage(1);
              }
            }

            return;
          }

          const historyPageButton = target.closest("[data-meta-history-page]");

          if (historyPageButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const page = Number.parseInt(historyPageButton.getAttribute("data-meta-history-page") || "1", 10);

            if (!Number.isNaN(page)) {
              await loadMetaHistoryPage(page);
            }

            return;
          }

          const historyRow = target.closest("[data-meta-history-row]");

          if (historyRow instanceof HTMLTableRowElement && !target.closest("a, button, textarea, input, label, select")) {
            createMetaRecommendationFromHistoryRow(historyRow);
            return;
          }

          const openButton = target.closest("[data-open-panel]");

          if (openButton instanceof HTMLButtonElement) {
            event.preventDefault();
            void openPanel(openButton);
            return;
          }

          const fullscreenButton = target.closest("[data-fullscreen-toggle]");

          if (fullscreenButton instanceof HTMLButtonElement) {
            event.preventDefault();
            void toggleFullscreen();
            return;
          }

          const printButton = target.closest("[data-print-page]");

          if (printButton instanceof HTMLButtonElement) {
            event.preventDefault();
            window.print();
            return;
          }

          const printModeButton = target.closest("[data-print-mode]");

          if (printModeButton instanceof HTMLButtonElement) {
            event.preventDefault();
            const mode = printModeButton.getAttribute("data-print-mode") || "";

            document.documentElement.dataset.printMode = mode;
            window.print();
            window.setTimeout(() => {
              if (document.documentElement.dataset.printMode === mode) {
                delete document.documentElement.dataset.printMode;
              }
            }, 1000);
            return;
          }

          const row = target.closest("[data-row-href]");

          if (row instanceof HTMLTableRowElement && !target.closest("a, button, textarea, input, label")) {
            const href = row.getAttribute("data-row-href");

            if (href) {
              let openerNavigated = false;

              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.location.href = href;
                  try { window.opener.focus(); } catch (error) {}
                  openerNavigated = true;
                }
              } catch (error) {}

              if (!openerNavigated) {
                window.location.href = href;
              }
            }
          }
        });

        document.addEventListener("fullscreenchange", setFullscreenButtonState);
        window.addEventListener("afterprint", () => {
          delete document.documentElement.dataset.printMode;
        });

        document.addEventListener("change", (event) => {
          const target = event.target;

          if (!(target instanceof HTMLSelectElement) || !target.matches("[data-meta-history-centre-filter], [data-meta-history-kind-filter]")) {
            return;
          }

          void loadMetaHistoryPage(1);
        });

        document.addEventListener("keydown", async (event) => {
          const target = event.target;

          if (!(target instanceof HTMLTextAreaElement) || !target.matches("[data-meta-note-text]")) {
            return;
          }

          if (event.key !== "Enter" || event.shiftKey) {
            return;
          }

          event.preventDefault();
          const notification = target.closest("[data-meta-notification-id]");

          if (notification instanceof HTMLElement) {
            await saveMetaNote(notification, target);
          }
        });

        keepSelectedAnalyticsRowVisible();
        void loadMetaHistoryPage(1);
        setFullscreenButtonState();
      })();
    </script>
  `;
}

function renderWaitlistChartScript() {
  return `
    <script>
      (() => {
        if (!window.Chart) {
          return;
        }

        const screenGridColor = "rgba(212, 212, 212, 0.12)";
        const screenTickColor = "#d4d4d4";
        const printGridColor = "#e2e2e2";
        const printTickColor = "#000000";
        const charts = [];
        const colorMap = {
          short: "#7fbe6f",
          typical: "#4bc2c3",
          longRunning: "#eeaf38",
          veryLongRunning: "#fb3640",
          green: "#7fbe6f",
          blue: "#4bc2c3",
          orange: "#eeaf38",
          red: "#fb3640",
        };
        const palette = [colorMap.short, colorMap.typical, colorMap.longRunning, colorMap.veryLongRunning, "#9d8fe3", "#d4d4d4"];

        function resolveColor(key, fallbackIndex) {
          return colorMap[key] || palette[fallbackIndex % palette.length];
        }

        function isPrinting() {
          return window.matchMedia?.("print").matches || document.documentElement.classList.contains("is-printing");
        }

        function getChartTextColor() {
          return isPrinting() ? printTickColor : screenTickColor;
        }

        function getChartGridColor() {
          return isPrinting() ? printGridColor : screenGridColor;
        }

        function readConfig(script) {
          try {
            return JSON.parse(script.textContent || "{}");
          } catch (error) {
            return null;
          }
        }

        function createBarConfig(config) {
          return {
            type: "bar",
            data: {
              labels: config.labels,
              datasets: [{
                data: config.values,
                backgroundColor: "#7fbe6f",
                borderColor: "#d8f79a",
                borderWidth: 1,
              }],
            },
            options: {
              animation: false,
              indexAxis: "y",
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (context) => config.meta?.[context.dataIndex] || String(context.raw),
                  },
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  grid: { color: getChartGridColor() },
                  ticks: { color: getChartTextColor(), precision: 0 },
                },
                y: {
                  grid: { display: false },
                  ticks: { color: getChartTextColor(), autoSkip: false },
                },
              },
            },
          };
        }

        function createStackedBarConfig(config) {
          return {
            type: "bar",
            data: {
              labels: config.labels,
              datasets: (config.datasets || []).map((dataset, index) => ({
                label: dataset.label,
                data: dataset.values,
                backgroundColor: resolveColor(dataset.color, index),
                borderColor: "#050505",
                borderWidth: 1,
              })),
            },
            options: {
              animation: false,
              indexAxis: "y",
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { color: getChartTextColor(), boxWidth: 10 },
                },
              },
              scales: {
                x: {
                  stacked: true,
                  beginAtZero: true,
                  grid: { color: getChartGridColor() },
                  ticks: { color: getChartTextColor(), precision: 0 },
                },
                y: {
                  stacked: true,
                  grid: { display: false },
                  ticks: { color: getChartTextColor(), autoSkip: false },
                },
              },
            },
          };
        }

        function createDoughnutConfig(config) {
          return {
            type: "doughnut",
            data: {
              labels: config.labels,
              datasets: [{
                data: config.values,
                backgroundColor: config.values.map((_, index) => config.colors?.[index] || palette[index % palette.length]),
                borderColor: "#050505",
                borderWidth: 2,
              }],
            },
            options: {
              animation: false,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "right",
                  labels: { color: getChartTextColor(), boxWidth: 10 },
                },
                tooltip: {
                  callbacks: {
                    label: (context) => config.meta?.[context.dataIndex] || String(context.raw),
                  },
                },
              },
            },
          };
        }

        for (const script of document.querySelectorAll("script[data-waitlist-chart]")) {
          const chartId = script.getAttribute("data-waitlist-chart");
          const canvas = chartId ? document.getElementById(chartId) : null;
          const config = readConfig(script);

          if (!(canvas instanceof HTMLCanvasElement) || !config) {
            continue;
          }

          const chartConfig =
            config.kind === "doughnut"
              ? createDoughnutConfig(config)
              : config.kind === "stackedBar"
                ? createStackedBarConfig(config)
                : createBarConfig(config);

          new Chart(canvas, chartConfig);
          charts.push(Chart.getChart(canvas));
        }

        function applyPrintChartColors(printMode) {
          document.documentElement.classList.toggle("is-printing", printMode);

          for (const chart of charts) {
            if (!chart) {
              continue;
            }

            const textColor = printMode ? printTickColor : screenTickColor;
            const gridColor = printMode ? printGridColor : screenGridColor;
            const scales = chart.options.scales || {};

            for (const scale of Object.values(scales)) {
              if (scale?.ticks) {
                scale.ticks.color = textColor;
              }

              if (scale?.grid && scale.grid.display !== false) {
                scale.grid.color = gridColor;
              }
            }

            const legendLabels = chart.options.plugins?.legend?.labels;

            if (legendLabels) {
              legendLabels.color = textColor;
            }

            chart.update("none");
          }
        }

        window.addEventListener("beforeprint", () => applyPrintChartColors(true));
        window.addEventListener("afterprint", () => applyPrintChartColors(false));

        const printMedia = window.matchMedia?.("print");

        if (printMedia?.addEventListener) {
          printMedia.addEventListener("change", (event) => applyPrintChartColors(event.matches));
        }
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
  const waitlistSnapshotSet = options.waitlistSnapshotSet ?? snapshotSet;
  const waitlistReport = options.waitlistReport ?? null;
  const waitlistSection = resolveWaitlistSection(options.waitlistSection);
  const googleAnalyticsSection = resolveGoogleAnalyticsSection(options.googleAnalyticsSection);
  const googleAnalyticsRange = resolveGoogleAnalyticsRangeSelection({
    mode: options.googleAnalyticsRangeMode,
    fromMonth: options.googleAnalyticsFromMonth,
    fromYear: options.googleAnalyticsFromYear,
    toMonth: options.googleAnalyticsToMonth,
    toYear: options.googleAnalyticsToYear,
  });
  const metaConfigStatus = options.metaConfigStatus ?? null;
  const googleAnalyticsConfigStatus = options.googleAnalyticsConfigStatus ?? null;
  const googleAnalyticsSnapshot = options.googleAnalyticsSnapshot ?? null;
  const panelContent = PANEL_DEFINITIONS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    className: panel.className,
    actions: buildPanelActions(panel.id, selectedCentreKey, selectedWindowKey, serviceSort, focusPanelId, googleAnalyticsRange),
    meta:
      panel.id === "analytics"
        ? `
            <span>source ${snapshotSet?.source ?? "none"}</span>
            <span>${snapshotSet ? formatTimestamp(snapshotSet.createdAt) : "pending"}</span>
          `
        : panel.id === "meta-ads"
          ? ""
          : panel.id === "waitlist"
            ? `<span>${waitlistReport?.generatedAt ? `report ${formatTimestamp(waitlistReport.generatedAt)}` : `last pulled ${formatDaysSince(waitlistSnapshotSet?.createdAt)}`}</span>`
            : panel.id === "google-analytics"
              ? `<span>${googleAnalyticsSnapshot ? `range ${formatGoogleAnalyticsRangeLabel(googleAnalyticsSnapshot)}` : "no snapshot"}</span>`
              : "",
    children:
      panel.id === "analytics"
        ? renderAnalyticsTable(snapshotSet, selectedCentreKey, selectedWindowKey, serviceSort, options.centreContacts ?? [], options.metaAdsDashboardData)
        : panel.id === "waitlist"
          ? renderWaitlistQualityPanel(
              waitlistSnapshotSet,
              waitlistReport,
              focusPanelId === "waitlist",
              selectedCentreKey,
              selectedWindowKey,
              serviceSort,
              focusPanelId === "waitlist" ? waitlistSection : null,
            )
        : panel.id === "meta-ads"
          ? renderMetaAdsPanel(
              snapshotSet,
              selectedWindowKey,
              metaConfigStatus,
              options.metaAdsDashboardData,
              options.metaRecommendationNotifications ?? [],
              options.metaRecommendationNotificationCount,
              options.metaRecommendationNotes ?? [],
              options.centreContacts ?? [],
            )
        : panel.id === "google-analytics"
          ? renderGoogleAnalyticsPanel(
              googleAnalyticsSnapshot,
              googleAnalyticsConfigStatus,
              snapshotSet,
              options.metaAdsDashboardData,
              selectedCentreKey,
              selectedWindowKey,
              serviceSort,
              focusPanelId === "google-analytics" ? googleAnalyticsSection : null,
              googleAnalyticsRange,
            )
          : renderAiChatPanel(
              snapshotSet,
              selectedCentreKey,
              selectedWindowKey,
              centreHistory,
              annualHistory,
              options.manualCapacity,
              options.latestMetaRecommendationNotesForCentre ?? [],
            ),
  }));
  const layout = renderLayout({
    panels: panelContent,
    focusPanelId,
  });
  const documentTitle = buildDocumentTitle(focusPanelId);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(documentTitle)}</title>
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    ${layout}
    <script src="/vendor/chart.umd.js"></script>
    ${renderWaitlistChartScript()}
    ${renderBreakoutScript()}
  </body>
</html>`;
}
