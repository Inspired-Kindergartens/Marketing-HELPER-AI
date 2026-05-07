import type { GoogleAnalyticsConfig } from "./config.js";
import { GoogleAnalyticsClient, type GoogleAnalyticsRunReportResponse } from "./client.js";
import {
  readGoogleAnalyticsDailySnapshotForDate,
  upsertGoogleAnalyticsDailySnapshot,
} from "../storage/google-analytics-store.js";

const GOOGLE_ANALYTICS_METRICS = [
  "activeUsers",
  "sessions",
  "engagedSessions",
  "screenPageViews",
  "conversions",
  "totalRevenue",
  "engagementRate",
  "averageSessionDuration",
] as const;
const GOOGLE_ANALYTICS_PAGE_METRICS = [
  "screenPageViews",
  "activeUsers",
  "sessions",
  "engagementRate",
] as const;

type GoogleAnalyticsMetricName = (typeof GOOGLE_ANALYTICS_METRICS)[number];
type GoogleAnalyticsPageMetricName = (typeof GOOGLE_ANALYTICS_PAGE_METRICS)[number];

function parseMetricValue(response: GoogleAnalyticsRunReportResponse, metricName: GoogleAnalyticsMetricName) {
  const metricIndex = response.metricHeaders?.findIndex((header) => header.name === metricName) ?? -1;
  const rawValue = metricIndex >= 0 ? response.rows?.[0]?.metricValues?.[metricIndex]?.value : undefined;
  const parsed = rawValue == null ? null : Number(rawValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseRowMetricValue(
  response: GoogleAnalyticsRunReportResponse,
  rowIndex: number,
  metricName: GoogleAnalyticsPageMetricName,
) {
  const metricIndex = response.metricHeaders?.findIndex((header) => header.name === metricName) ?? -1;
  const rawValue = metricIndex >= 0 ? response.rows?.[rowIndex]?.metricValues?.[metricIndex]?.value : undefined;
  const parsed = rawValue == null ? null : Number(rawValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function getDateOnly(value: Date) {
  const date = new Date(value);

  date.setHours(0, 0, 0, 0);

  return date;
}

export async function refreshGoogleAnalyticsSnapshot(config: GoogleAnalyticsConfig, referenceDate = new Date()) {
  const client = new GoogleAnalyticsClient(config);
  const pulledAt = new Date();
  const report = await client.runReport({
    dateRanges: [
      {
        startDate: "30daysAgo",
        endDate: "yesterday",
      },
    ],
    metrics: GOOGLE_ANALYTICS_METRICS.map((name) => ({ name })),
  });
  const pageReport = await client.runReport({
    dateRanges: [
      {
        startDate: "30daysAgo",
        endDate: "yesterday",
      },
    ],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: GOOGLE_ANALYTICS_PAGE_METRICS.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 100,
  });
  const pageGroups = new Map<string, {
    pagePath: string;
    pageTitle: string | null;
    screenPageViews: number;
    activeUsers: number;
    sessions: number;
    engagementRateTotal: number;
    engagementRateCount: number;
    raw: unknown[];
  }>();

  for (const [index, row] of (pageReport.rows ?? []).entries()) {
    const pagePath = row.dimensionValues?.[0]?.value ?? "/";
    const existing = pageGroups.get(pagePath) ?? {
      pagePath,
      pageTitle: row.dimensionValues?.[1]?.value ?? null,
      screenPageViews: 0,
      activeUsers: 0,
      sessions: 0,
      engagementRateTotal: 0,
      engagementRateCount: 0,
      raw: [],
    };
    const engagementRate = parseRowMetricValue(pageReport, index, "engagementRate");

    existing.screenPageViews += parseRowMetricValue(pageReport, index, "screenPageViews") ?? 0;
    existing.activeUsers += parseRowMetricValue(pageReport, index, "activeUsers") ?? 0;
    existing.sessions += parseRowMetricValue(pageReport, index, "sessions") ?? 0;

    if (engagementRate != null) {
      existing.engagementRateTotal += engagementRate;
      existing.engagementRateCount += 1;
    }

    if (!existing.pageTitle && row.dimensionValues?.[1]?.value) {
      existing.pageTitle = row.dimensionValues[1].value;
    }

    existing.raw.push(row);
    pageGroups.set(pagePath, existing);
  }

  const pages = [...pageGroups.values()]
    .map((page) => ({
      pagePath: page.pagePath,
      pageTitle: page.pageTitle,
      screenPageViews: page.screenPageViews,
      activeUsers: page.activeUsers,
      sessions: page.sessions,
      engagementRate:
        page.engagementRateCount > 0 ? page.engagementRateTotal / page.engagementRateCount : null,
      raw: page.raw,
    }))
    .sort((left, right) => right.screenPageViews - left.screenPageViews);

  return upsertGoogleAnalyticsDailySnapshot({
    propertyId: config.propertyId,
    snapshotDate: getDateOnly(referenceDate),
    pulledAt,
    activeUsers: parseMetricValue(report, "activeUsers"),
    sessions: parseMetricValue(report, "sessions"),
    engagedSessions: parseMetricValue(report, "engagedSessions"),
    screenPageViews: parseMetricValue(report, "screenPageViews"),
    conversions: parseMetricValue(report, "conversions"),
    totalRevenue: parseMetricValue(report, "totalRevenue"),
    engagementRate: parseMetricValue(report, "engagementRate"),
    averageSessionDuration: parseMetricValue(report, "averageSessionDuration"),
    pages,
    raw: { summary: report, pages: pageReport },
  });
}

export async function ensureDailyGoogleAnalyticsSnapshot(config: GoogleAnalyticsConfig, referenceDate = new Date()) {
  const existing = await readGoogleAnalyticsDailySnapshotForDate(config.propertyId, referenceDate);

  if (existing && existing.pages.length > 0) {
    return existing;
  }

  return refreshGoogleAnalyticsSnapshot(config, referenceDate);
}
