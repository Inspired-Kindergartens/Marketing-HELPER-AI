import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderAppShell } from "../src/ui/app-shell.js";
import type { WaitlistDiscoveryReport } from "../src/infocare/waitlist-report.js";
import type { LatestSnapshotSet } from "../src/storage/analytics-store.js";
import type { GoogleAnalyticsDailySnapshotView } from "../src/storage/google-analytics-store.js";
import type { MetaAdsDashboardData } from "../src/storage/meta-store.js";
import type { MetaNotificationHistoryRow } from "../src/storage/meta-recommendation-notifications-store.js";

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

test("analytics enrol/max shows enrolled headcount with booked utilisation percent", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-05T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-05T00:00:00.000Z",
    snapshots: [
      {
        centreKey: 1,
        serviceName: "Avenues Kindergarten",
        date: "2026-05-05",
        enrolledCount: 59,
        enrolledFteCount: 18.68,
        bookedAverageDailyCount: 35.5,
        bookedUtilisationRatio: 0.8452,
        enrolledUnder2Count: 0,
        enrolledOver2Count: 59,
        licensedCapacity: 42,
        licensedUnder2Capacity: null,
        licensedOver2Capacity: 42,
        enrolmentRatio: 0.4448,
        waitlistCount: 0,
        waitlistUnder5Count: 0,
        waitlistTurning5ThisYearCount: 0,
        waitlistAged5PlusCount: 0,
        waitlistUnknownAgeCount: 0,
        waitlistOldestEntryDays: null,
        waitlistAverageEntryDays: null,
        knownLeavingCount: 0,
        knownLeavingCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        agedOutCount: 0,
        approachingFiveCount: 0,
        approachingFiveCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        replacementPressure: 0,
        waitlistCoverRatio: 0,
        urgencyScore: 0,
        urgencyBand: "Stable",
      },
    ],
  };

  const html = renderAppShell(snapshotSet);

  assert.match(html, /59\/42 85%/);
  assert.match(
    html,
    /59\/42 85%<\/td>\s*<td class="analytics-table__numeric">7<\/td>/,
  );
  assert.doesNotMatch(html, /59\/42 44%/);
  assert.doesNotMatch(html, /59\/42 140%/);
});

test("google analytics most visited pages can open as focused breakout section", () => {
  const googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView = {
    id: 1,
    propertyId: "123",
    snapshotDate: "2026-05-11T00:00:00.000Z",
    rangeStartDate: "2026-05-01T00:00:00.000Z",
    rangeEndDate: "2026-05-11T00:00:00.000Z",
    pulledAt: "2026-05-11T01:00:00.000Z",
    createdAt: "2026-05-11T01:00:00.000Z",
    updatedAt: "2026-05-11T01:00:00.000Z",
    activeUsers: 10,
    sessions: 12,
    engagedSessions: 8,
    screenPageViews: 42,
    conversions: 1,
    totalRevenue: 0,
    engagementRate: 0.5,
    averageSessionDuration: 90,
    pages: [
      {
        id: 10,
        pagePath: "/",
        pageTitle: "Home",
        activeUsers: 9,
        sessions: 11,
        screenPageViews: 40,
        engagementRate: 0.6,
      },
    ],
  };

  const dashboardHtml = renderAppShell(null, { googleAnalyticsSnapshot });

  assert.match(dashboardHtml, /data-open-panel="google-analytics"/);
  assert.match(dashboardHtml, /googleAnalyticsSection=pages/);
  assert.match(dashboardHtml, /Open Most Visited Pages window/);

  const focusedHtml = renderAppShell(null, {
    focusPanelId: "google-analytics",
    googleAnalyticsSection: "pages",
    googleAnalyticsSnapshot,
  });

  assert.match(focusedHtml, /Most Visited Pages/);
  assert.match(focusedHtml, /Home/);
  assert.doesNotMatch(focusedHtml, /Meta Ad Centre Pages/);
  assert.doesNotMatch(focusedHtml, /googleAnalyticsSection=pages/);
});

test("meta ad centre pages include completed ads from the selected period", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-11T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-11T00:00:00.000Z",
    snapshots: [
      {
        centreKey: 42,
        serviceName: "Harbour View Kindergarten",
        date: "2026-05-11",
        enrolledCount: 30,
        enrolledFteCount: 10,
        bookedAverageDailyCount: 20,
        bookedUtilisationRatio: 0.5,
        enrolledUnder2Count: 0,
        enrolledOver2Count: 30,
        licensedCapacity: 40,
        licensedUnder2Capacity: null,
        licensedOver2Capacity: 40,
        enrolmentRatio: 0.75,
        waitlistCount: 0,
        waitlistUnder5Count: 0,
        waitlistTurning5ThisYearCount: 0,
        waitlistAged5PlusCount: 0,
        waitlistUnknownAgeCount: 0,
        waitlistOldestEntryDays: null,
        waitlistAverageEntryDays: null,
        knownLeavingCount: 0,
        knownLeavingCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        agedOutCount: 0,
        approachingFiveCount: 0,
        approachingFiveCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        replacementPressure: 0,
        waitlistCoverRatio: 0,
        urgencyScore: 0,
        urgencyBand: "Stable",
      },
    ],
  };
  const googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView = {
    id: 1,
    propertyId: "123",
    snapshotDate: "2026-05-11T00:00:00.000Z",
    rangeStartDate: "2026-03-01T00:00:00.000Z",
    rangeEndDate: "2026-05-11T00:00:00.000Z",
    pulledAt: "2026-05-11T01:00:00.000Z",
    createdAt: "2026-05-11T01:00:00.000Z",
    updatedAt: "2026-05-11T01:00:00.000Z",
    activeUsers: 10,
    sessions: 12,
    engagedSessions: 8,
    screenPageViews: 42,
    conversions: 1,
    totalRevenue: 0,
    engagementRate: 0.5,
    averageSessionDuration: 90,
    pages: [
      {
        id: 10,
        pagePath: "/harbour-view-kindergarten",
        pageTitle: "Harbour View Kindergarten",
        activeUsers: 9,
        sessions: 11,
        screenPageViews: 40,
        engagementRate: 0.6,
      },
    ],
  };
  const metaAdsDashboardData: MetaAdsDashboardData = {
    latestPullAt: "2026-05-11T01:00:00.000Z",
    accountCount: 1,
    campaignCount: 1,
    activeCampaignCount: 0,
    activeHealthyCampaignCount: 0,
    learningCampaignCount: 0,
    learningLimitedCampaignCount: 0,
    completedCampaignCount: 1,
    notDeliveringCampaignCount: 0,
    rejectedCampaignCount: 0,
    adCount: 1,
    activeAdCount: 0,
    unmatchedCampaignCount: 0,
    matchedCampaignCount: 1,
    totalSpend30d: 25,
    currentAds: [
      {
        adName: "Harbour View enrolments",
        adSetName: "Harbour View May",
        campaignName: "Harbour View Kindergarten",
        advertType: "Leads",
        status: "Completed",
        resultLabel: "Landing views",
        resultCount: 5,
        spend: 25,
        impressions: 1000,
        reach: 900,
        clicks: 20,
        ctr: 2,
        cpc: 1.25,
        cpr: 5,
        budget: 50,
        endsAt: "2026-05-01T00:00:00.000Z",
        lastPulledAt: "2026-05-11T01:00:00.000Z",
        centreKey: 42,
      },
    ],
    centreCoverage: [],
    recommendations: [],
  };

  const html = renderAppShell(snapshotSet, {
    focusPanelId: "google-analytics",
    googleAnalyticsSnapshot,
    metaAdsDashboardData,
  });

  assert.match(html, /Meta Ad Centre Pages/);
  assert.match(html, /Harbour View Kindergarten/);
  assert.match(html, /Completed/);
  assert.match(html, /Delivery/);
});

test("meta ad centre pages include unkeyed active ads that match page paths", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-11T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-11T00:00:00.000Z",
    snapshots: [],
  };
  const googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView = {
    id: 1,
    propertyId: "123",
    snapshotDate: "2026-05-11T00:00:00.000Z",
    rangeStartDate: "2026-05-01T00:00:00.000Z",
    rangeEndDate: "2026-05-11T00:00:00.000Z",
    pulledAt: "2026-05-11T01:00:00.000Z",
    createdAt: "2026-05-11T01:00:00.000Z",
    updatedAt: "2026-05-11T01:00:00.000Z",
    activeUsers: 10,
    sessions: 12,
    engagedSessions: 8,
    screenPageViews: 42,
    conversions: 1,
    totalRevenue: 0,
    engagementRate: 0.5,
    averageSessionDuration: 90,
    pages: [
      {
        id: 10,
        pagePath: "/find-a-service/find-a-center/mountain-town/valley-kindergarten",
        pageTitle: "Valley Kindergarten",
        activeUsers: 9,
        sessions: 11,
        screenPageViews: 40,
        engagementRate: 0.6,
      },
    ],
  };
  const metaAdsDashboardData: MetaAdsDashboardData = {
    latestPullAt: "2026-05-11T01:00:00.000Z",
    accountCount: 1,
    campaignCount: 1,
    activeCampaignCount: 1,
    activeHealthyCampaignCount: 1,
    learningCampaignCount: 0,
    learningLimitedCampaignCount: 0,
    completedCampaignCount: 0,
    notDeliveringCampaignCount: 0,
    rejectedCampaignCount: 0,
    adCount: 1,
    activeAdCount: 1,
    unmatchedCampaignCount: 1,
    matchedCampaignCount: 0,
    totalSpend30d: 20,
    currentAds: [
      {
        adName: "Mountain Town enrolments",
        adSetName: "Mountain Town",
        campaignName: "Enrolment",
        advertType: "Leads",
        status: "Active",
        resultLabel: "Landing views",
        resultCount: 8,
        spend: 20,
        impressions: 1000,
        reach: 900,
        clicks: 20,
        ctr: 2,
        cpc: 1,
        cpr: 2.5,
        budget: 50,
        endsAt: "2026-05-28T00:00:00.000Z",
        lastPulledAt: "2026-05-11T01:00:00.000Z",
        centreKey: null,
      },
    ],
    centreCoverage: [],
    recommendations: [],
  };

  const html = renderAppShell(snapshotSet, {
    focusPanelId: "google-analytics",
    googleAnalyticsSnapshot,
    metaAdsDashboardData,
  });

  assert.match(html, /Mountain Town/);
  assert.match(html, /Active/);
  assert.match(html, /valley-kindergarten/);
  assert.doesNotMatch(html, /PAUSED/);
});

test("google analytics panel renders month range filter and preserves selection", () => {
  const googleAnalyticsSnapshot: GoogleAnalyticsDailySnapshotView = {
    id: 1,
    propertyId: "123",
    snapshotDate: "2026-05-11T00:00:00.000Z",
    rangeStartDate: "2025-06-01T00:00:00.000Z",
    rangeEndDate: "2026-05-11T00:00:00.000Z",
    pulledAt: "2026-05-11T01:00:00.000Z",
    createdAt: "2026-05-11T01:00:00.000Z",
    updatedAt: "2026-05-11T01:00:00.000Z",
    activeUsers: 10,
    sessions: 12,
    engagedSessions: 8,
    screenPageViews: 42,
    conversions: 1,
    totalRevenue: 0,
    engagementRate: 0.5,
    averageSessionDuration: 90,
    pages: [],
  };

  const html = renderAppShell(null, {
    focusPanelId: "google-analytics",
    googleAnalyticsSnapshot,
    googleAnalyticsRangeMode: "months",
    googleAnalyticsFromMonth: "6",
    googleAnalyticsFromYear: "2025",
    googleAnalyticsToMonth: "5",
    googleAnalyticsToYear: "2026",
  });

  assert.match(html, /name="gaFromMonth"/);
  assert.match(html, /name="gaFromYear"/);
  assert.match(html, /name="gaToMonth"/);
  assert.match(html, /name="gaToYear"/);
  assert.match(html, /name="gaFromMonth"[^>]*>[\s\S]*value="6" selected/);
  assert.match(html, /name="gaFromYear"[^>]*>[\s\S]*value="2025" selected/);
  assert.match(html, /name="gaToMonth"[^>]*>[\s\S]*value="5" selected/);
  assert.match(html, /name="gaToYear"[^>]*>[\s\S]*value="2026" selected/);
  assert.match(html, /gaRange=months&amp;gaFromMonth=6&amp;gaFromYear=2025&amp;gaToMonth=5&amp;gaToYear=2026/);
  assert.match(html, /Range 01\/06\/2025 to 11\/05\/2026/);
});

test("google analytics panel defaults filters to current month", () => {
  const html = renderAppShell(null, { focusPanelId: "google-analytics" });

  assert.match(html, /name="gaFromMonth"[^>]*>[\s\S]*value="5" selected/);
  assert.match(html, /name="gaFromYear"[^>]*>[\s\S]*value="2026" selected/);
  assert.match(html, /name="gaToMonth"[^>]*>[\s\S]*value="5" selected/);
  assert.match(html, /name="gaToYear"[^>]*>[\s\S]*value="2026" selected/);
  assert.doesNotMatch(html, /gaFromMonth=5&amp;gaFromYear=2025/);
});

test("focused breakout panels include a print action", () => {
  const html = renderAppShell(null, { focusPanelId: "google-analytics" });

  assert.match(html, /data-print-page/);
  assert.match(html, /Print window/);
});

test("dashboard and chat panels expose scoped print actions", () => {
  const html = renderAppShell(null);

  assert.match(html, /data-print-mode="dashboard"/);
  assert.match(html, /Print console/);
  assert.match(html, /data-print-mode="chat"/);
  assert.match(html, /Print AI Chat/);
  assert.match(html, /document\.documentElement\.dataset\.printMode = mode/);
  assert.match(html, /delete document\.documentElement\.dataset\.printMode/);
});

test("ai chat includes the latest three meta ads notes for the selected centre", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-12T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-12T00:00:00.000Z",
    snapshots: [
      {
        centreKey: 117,
        serviceName: "Harbour View Kindergarten",
        date: "2026-05-12",
        enrolledCount: 20,
        enrolledFteCount: 10,
        bookedAverageDailyCount: 18,
        bookedUtilisationRatio: 0.45,
        enrolledUnder2Count: 0,
        enrolledOver2Count: 20,
        licensedCapacity: 40,
        licensedUnder2Capacity: null,
        licensedOver2Capacity: 40,
        enrolmentRatio: 0.5,
        waitlistCount: 2,
        waitlistUnder5Count: 2,
        waitlistTurning5ThisYearCount: 0,
        waitlistAged5PlusCount: 0,
        waitlistUnknownAgeCount: 0,
        waitlistOldestEntryDays: null,
        waitlistAverageEntryDays: null,
        knownLeavingCount: 0,
        knownLeavingCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        agedOutCount: 0,
        approachingFiveCount: 0,
        approachingFiveCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 0, "6M": 0, "12M": 0 },
        replacementPressure: 0,
        waitlistCoverRatio: 1,
        urgencyScore: 1,
        urgencyBand: "Stable",
      },
    ],
  };
  const latestMetaRecommendationNotesForCentre: MetaNotificationHistoryRow[] = [
    {
      kind: "Note",
      centreKey: 117,
      centreName: "Harbour View Kindergarten",
      notificationId: "one",
      heading: "Needs ads",
      message: "Called centre about advert copy.",
      status: "Active",
      openPlaces: "",
      waitlist: "",
      pressure: "",
      occurredAt: "2026-05-12T12:00:00.000Z",
    },
    {
      kind: "Note",
      centreKey: 117,
      centreName: "Harbour View Kindergarten",
      notificationId: "two",
      heading: "Needs ads",
      message: "Draft creative ready for review.",
      status: "Active",
      openPlaces: "",
      waitlist: "",
      pressure: "",
      occurredAt: "2026-05-11T12:00:00.000Z",
    },
    {
      kind: "Note",
      centreKey: 117,
      centreName: "Harbour View Kindergarten",
      notificationId: "three",
      heading: "Needs ads",
      message: "Budget approved by team.",
      status: "Dismissed",
      openPlaces: "",
      waitlist: "",
      pressure: "",
      occurredAt: "2026-05-10T12:00:00.000Z",
    },
    {
      kind: "Note",
      centreKey: 117,
      centreName: "Harbour View Kindergarten",
      notificationId: "four",
      heading: "Needs ads",
      message: "Older note should not render.",
      status: "Dismissed",
      openPlaces: "",
      waitlist: "",
      pressure: "",
      occurredAt: "2026-05-09T12:00:00.000Z",
    },
  ];

  const html = renderAppShell(snapshotSet, {
    selectedCentreKey: 117,
    latestMetaRecommendationNotesForCentre,
  });

  assert.match(html, /Latest META Ads notes/);
  assert.match(html, /12\/05\/2026/);
  assert.match(html, /Called centre about advert copy\./);
  assert.match(html, /Draft creative ready for review\./);
  assert.match(html, /Budget approved by team\./);
  assert.doesNotMatch(html, /Older note should not render\./);
});

test("focused breakout panels set print-friendly document title", () => {
  const html = renderAppShell(null, { focusPanelId: "waitlist" });

  assert.match(html, /<title>Marketing Helper - Waitlist Quality - \d{4}-\d{2}-\d{2} \d{2}-\d{2}<\/title>/);
});

test("ai chat leaving pressure message uses deduped replacement pressure", () => {
  const snapshotSet: LatestSnapshotSet = {
    runDate: "2026-05-12T00:00:00.000Z",
    source: "test",
    createdAt: "2026-05-12T00:00:00.000Z",
    snapshots: [
      {
        centreKey: 117,
        serviceName: "Harbour View Kindergarten",
        date: "2026-05-12",
        enrolledCount: 20,
        enrolledFteCount: 10,
        bookedAverageDailyCount: 18,
        bookedUtilisationRatio: 0.45,
        enrolledUnder2Count: 0,
        enrolledOver2Count: 20,
        licensedCapacity: 40,
        licensedUnder2Capacity: null,
        licensedOver2Capacity: 40,
        enrolmentRatio: 0.5,
        waitlistCount: 2,
        waitlistUnder5Count: 2,
        waitlistTurning5ThisYearCount: 0,
        waitlistAged5PlusCount: 0,
        waitlistUnknownAgeCount: 0,
        waitlistOldestEntryDays: null,
        waitlistAverageEntryDays: null,
        knownLeavingCount: 3,
        knownLeavingCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 3, "6M": 3, "12M": 3 },
        agedOutCount: 1,
        approachingFiveCount: 2,
        approachingFiveCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 2, "6M": 2, "12M": 2 },
        replacementPressureCountsByWindow: { "1W": 0, "2W": 0, "3W": 0, "1M": 0, "2M": 0, "3M": 4, "6M": 4, "12M": 4 },
        replacementPressure: 4,
        waitlistCoverRatio: 0.5,
        urgencyScore: 50,
        urgencyBand: "High",
      },
    ],
  };

  const html = renderAppShell(snapshotSet, {
    selectedCentreKey: 117,
    selectedWindowKey: "3M",
  });

  assert.match(html, /4 across Leaving, Near 5, and Age 5\+/);
  assert.doesNotMatch(html, /6 across Leaving, Near 5, and Age 5\+/);
});

test("google analytics print styles hide stats and volume column", () => {
  const css = readFileSync(new URL("../src/ui/app.css", import.meta.url), "utf8");

  assert.match(css, /\.google-analytics-summary\s*\{\s*display: none !important;/);
  assert.match(css, /\.google-analytics-table__volume\s*\{\s*display: none !important;/);
  assert.match(css, /word-break: keep-all !important;/);
  assert.match(css, /border: 0 !important;/);
  assert.match(css, /border-bottom: 1px solid #d0d0d0 !important;/);
});

test("print styles scope dashboard, chat, and recent demand pages", () => {
  const css = readFileSync(new URL("../src/ui/app.css", import.meta.url), "utf8");

  assert.match(css, /html\[data-print-mode="dashboard"\] \.app-shell__right/);
  assert.match(css, /html\[data-print-mode="chat"\] \.app-shell__left/);
  assert.match(css, /html\[data-print-mode="chat"\] \.chat-message--user/);
  assert.match(css, /\.waitlist-quality__section--recent\s*\{[\s\S]*break-inside: auto;/);
  assert.match(css, /\.recent-demand-grid section\s*\{[\s\S]*break-inside: avoid;/);
  assert.match(css, /\.recent-demand-grid h4 \+ \.waitlist-chart\s*\{[\s\S]*break-before: avoid;/);
});

test("waitlist charts redraw with dark text for print", () => {
  const html = renderAppShell(null);

  assert.match(html, /beforeprint/);
  assert.match(html, /applyPrintChartColors/);
  assert.match(html, /printTickColor = "#000000"/);
});
