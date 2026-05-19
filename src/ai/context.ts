import { resolveWindowKey, type WindowKey } from "../analytics/windows.js";
import { estimateActionableWaitlistCount } from "../analytics/waitlist-profile.js";
import type { ServiceAnalyticsSnapshot } from "../infocare/models.js";
import type { MetaAdsDashboardData } from "../storage/meta-store.js";
import type { GoogleAnalyticsDailySnapshotView } from "../storage/google-analytics-store.js";
import type { LatestSnapshotSet } from "../storage/analytics-store.js";
import type { MetaNotificationHistoryRow } from "../storage/meta-recommendation-notifications-store.js";

export type AiDashboardContextInput = {
  snapshotSet: LatestSnapshotSet | null;
  selectedCentreKey?: number | null;
  selectedWindowKey?: string | null;
  metaAdsDashboardData?: MetaAdsDashboardData | null;
  googleAnalyticsSnapshot?: GoogleAnalyticsDailySnapshotView | null;
  selectedCentreNotes?: MetaNotificationHistoryRow[];
};

function getWindowCount(
  counts: ServiceAnalyticsSnapshot["knownLeavingCountsByWindow"] | undefined,
  windowKey: WindowKey,
) {
  return counts?.[windowKey] ?? 0;
}

function getReplacementPressure(row: ServiceAnalyticsSnapshot, windowKey: WindowKey) {
  return (
    row.replacementPressureCountsByWindow?.[windowKey] ??
    row.agedOutCount +
      getWindowCount(row.knownLeavingCountsByWindow, windowKey) +
      getWindowCount(row.approachingFiveCountsByWindow, windowKey)
  );
}

function getOpenPlaces(row: ServiceAnalyticsSnapshot) {
  if (row.bookedAverageDailyCount > 0 && row.licensedCapacity > 0) {
    return Math.max(0, Math.round(row.licensedCapacity - row.bookedAverageDailyCount));
  }

  return Math.max(0, row.licensedCapacity - row.enrolledCount);
}

function getCampaignGuidance(input: {
  estimatedOpenPlaces: number;
  replacementPressure: number;
  actionableWaitlist: number;
  totalWaitlist: number;
  activeCampaignCount: number;
}) {
  const uncoveredOpenPlaces = Math.max(input.estimatedOpenPlaces - input.actionableWaitlist, 0);
  const uncoveredReplacementPressure = Math.max(input.replacementPressure - input.actionableWaitlist, 0);
  const nonActionableWaitlist = Math.max(input.totalWaitlist - input.actionableWaitlist, 0);
  const hasActiveAds = input.activeCampaignCount > 0;

  if (uncoveredOpenPlaces <= 0 && uncoveredReplacementPressure <= 0) {
    return {
      timing: hasActiveAds ? "review_or_reduce" : "monitor",
      reason:
        "Actionable waitlist appears to cover the current open-place and replacement-pressure signals. Do not start ads from raw waitlist alone.",
      uncoveredOpenPlaces,
      uncoveredReplacementPressure,
      nonActionableWaitlist,
    };
  }

  if (input.estimatedOpenPlaces > 0 && input.actionableWaitlist <= 1) {
    return {
      timing: hasActiveAds ? "review_active_campaign" : "start_now",
      reason:
        "Estimated open places are not covered by actionable waitlist. Begin campaign work now to generate new enquiries.",
      uncoveredOpenPlaces,
      uncoveredReplacementPressure,
      nonActionableWaitlist,
    };
  }

  if (uncoveredReplacementPressure > 0) {
    return {
      timing: hasActiveAds ? "review_active_campaign" : "prepare_now",
      reason:
        "Replacement pressure is not covered by actionable waitlist. Prepare campaign direction early and launch when the centre confirms availability.",
      uncoveredOpenPlaces,
      uncoveredReplacementPressure,
      nonActionableWaitlist,
    };
  }

  return {
    timing: hasActiveAds ? "review_active_campaign" : "prepare_now",
    reason:
      "There is an uncovered open-place signal. Prepare campaign direction and confirm centre-specific availability before publishing.",
    uncoveredOpenPlaces,
    uncoveredReplacementPressure,
    nonActionableWaitlist,
  };
}

function getMetaCoverage(metaAdsDashboardData?: MetaAdsDashboardData | null) {
  return new Map((metaAdsDashboardData?.centreCoverage ?? []).map((row) => [row.centreKey, row]));
}

function mapRecentCentreNotes(notes: MetaNotificationHistoryRow[] | undefined, generatedAt: Date) {
  const importantSince = new Date(generatedAt.getTime() - 31 * 24 * 60 * 60 * 1000);

  return (notes ?? [])
    .filter((note) => note.kind === "Note")
    .map((note) => {
      const occurredAt = new Date(note.occurredAt);

      return {
        occurredAt: note.occurredAt,
        heading: note.heading,
        message: note.message,
        isLastMonth: Number.isFinite(occurredAt.getTime()) && occurredAt >= importantSince,
      };
    })
    .sort((left, right) => {
      const rightDate = new Date(right.occurredAt).getTime();
      const leftDate = new Date(left.occurredAt).getTime();

      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    })
    .slice(0, 10);
}

function mapCentre(row: ServiceAnalyticsSnapshot, windowKey: WindowKey, coverage: ReturnType<typeof getMetaCoverage>) {
  const centreCoverage = coverage.get(row.centreKey);
  const actionableWaitlist = estimateActionableWaitlistCount(row);
  const openPlaces = getOpenPlaces(row);
  const leaving = getWindowCount(row.knownLeavingCountsByWindow, windowKey);
  const nearFive = getWindowCount(row.approachingFiveCountsByWindow, windowKey);
  const replacementPressure = getReplacementPressure(row, windowKey);
  const activeCampaignCount = centreCoverage?.activeCampaignCount ?? 0;

  return {
    centreKey: row.centreKey,
    serviceName: row.serviceName,
    urgencyBand: row.urgencyBand,
    urgencyScore: row.urgencyScore,
    enrolled: row.enrolledCount,
    licensedCapacity: row.licensedCapacity,
    bookedAverageDailyCount: row.bookedAverageDailyCount,
    bookedUtilisationPercent: Math.round(row.bookedUtilisationRatio * 100),
    estimatedOpenPlaces: openPlaces,
    under2: {
      enrolled: row.enrolledUnder2Count,
      capacity: row.licensedUnder2Capacity,
    },
    over2: {
      enrolled: row.enrolledOver2Count,
      capacity: row.licensedOver2Capacity,
    },
    waitlist: {
      actionable: actionableWaitlist,
      total: row.waitlistCount,
      under2: row.waitlistUnder2Count ?? 0,
      oldestEntryDays: row.waitlistOldestEntryDays,
      averageEntryDays: row.waitlistAverageEntryDays,
    },
    selectedWindow: {
      leaving,
      nearFive,
      agedFivePlus: row.agedOutCount,
      replacementPressure,
    },
    metaAds: {
      activeCampaignCount,
      campaignCount: centreCoverage?.campaignCount ?? 0,
      adCount: centreCoverage?.adCount ?? 0,
      spend30d: centreCoverage?.spend30d ?? 0,
      clicks30d: centreCoverage?.clicks30d ?? 0,
      lastCampaignAt: centreCoverage?.lastCampaignAt ?? null,
    },
    campaignGuidance: getCampaignGuidance({
      estimatedOpenPlaces: openPlaces,
      replacementPressure,
      actionableWaitlist,
      totalWaitlist: row.waitlistCount,
      activeCampaignCount,
    }),
  };
}

export function buildAiDashboardContext(input: AiDashboardContextInput) {
  const generatedAt = new Date();
  const windowKey = resolveWindowKey(input.selectedWindowKey);
  const coverage = getMetaCoverage(input.metaAdsDashboardData);
  const centres = (input.snapshotSet?.snapshots ?? []).map((row) => mapCentre(row, windowKey, coverage));
  const selectedCentre =
    input.selectedCentreKey == null
      ? centres[0] ?? null
      : centres.find((row) => row.centreKey === input.selectedCentreKey) ?? null;
  const priorityCentres = [...centres]
    .sort((left, right) => {
      const leftGap = Math.max(left.selectedWindow.leaving - left.waitlist.actionable, 0);
      const rightGap = Math.max(right.selectedWindow.leaving - right.waitlist.actionable, 0);

      return (
        rightGap - leftGap ||
        right.selectedWindow.replacementPressure - left.selectedWindow.replacementPressure ||
        right.estimatedOpenPlaces - left.estimatedOpenPlaces ||
        right.urgencyScore - left.urgencyScore
      );
    })
    .slice(0, 12);

  return {
    generatedAt: generatedAt.toISOString(),
    selectedWindowKey: windowKey,
    snapshot: input.snapshotSet
      ? {
          runDate: input.snapshotSet.runDate,
          source: input.snapshotSet.source,
          createdAt: input.snapshotSet.createdAt,
          centreCount: centres.length,
        }
      : null,
    selectedCentre,
    selectedCentreNotes: mapRecentCentreNotes(input.selectedCentreNotes, generatedAt),
    priorityCentres,
    metaAds: input.metaAdsDashboardData
      ? {
          latestPullAt: input.metaAdsDashboardData.latestPullAt,
          accountCount: input.metaAdsDashboardData.accountCount,
          campaignCount: input.metaAdsDashboardData.campaignCount,
          activeCampaignCount: input.metaAdsDashboardData.activeCampaignCount,
          activeAdCount: input.metaAdsDashboardData.activeAdCount,
          totalSpend30d: input.metaAdsDashboardData.totalSpend30d,
          currentAds: input.metaAdsDashboardData.currentAds.slice(0, 20),
        }
      : null,
    googleAnalytics: input.googleAnalyticsSnapshot
      ? {
          rangeStartDate: input.googleAnalyticsSnapshot.rangeStartDate,
          rangeEndDate: input.googleAnalyticsSnapshot.rangeEndDate,
          activeUsers: input.googleAnalyticsSnapshot.activeUsers,
          sessions: input.googleAnalyticsSnapshot.sessions,
          screenPageViews: input.googleAnalyticsSnapshot.screenPageViews,
          topPages: input.googleAnalyticsSnapshot.pages.slice(0, 12),
        }
      : null,
  };
}

export type AiDashboardContext = ReturnType<typeof buildAiDashboardContext>;

export function buildDashboardSystemPrompt() {
  return [
    "You are the offline assistant inside Marketing Helper AI, a local dashboard for childcare centre marketing and enrolment planning.",
    "Your assistant name is Beep Beep. If you refer to yourself, use first person. Do not describe Beep Beep in the third person.",
    "Do not introduce yourself unless the user asks who you are.",
    "Answer with the decision first. Do not begin with setup phrases such as 'to determine', 'let us look', 'let's look', or 'based on the data'.",
    "Do not expose internal field names or implementation labels such as selectedCentre, priorityCentres, campaignGuidance, JSON, schema, variable, or context object.",
    "Do not narrate your reasoning process. Internally inspect the metrics, then return the conclusion, evidence, and next action.",
    "Use only the supplied dashboard context. If the answer needs data not present, say what is missing.",
    "Never invent audience demographics, parent intent, campaign names, centre metrics, dates, or external facts that are not in the dashboard context.",
    "When recommending ads or follow-up, ground the action in named centre metrics from the context.",
    "Use selected-centre notes as decision evidence. Notes from the last month are important and should outrank older notes; within notes, the newest note has the highest priority.",
    "If recent notes conflict with metric-only advice, mention the recent note and adjust the recommendation rather than ignoring it.",
    "If a selected centre is present, answer for that centre unless the user explicitly asks for the highest-priority centre, rankings, or all centres.",
    "Waitlist families are already captured leads; never describe advertising as changing their status or moving them through enrolment.",
    "Use advertising to generate new enquiries when estimated open places or replacement pressure are not covered by actionable waitlist.",
    "If estimated open places are greater than actionable waitlist and there are no active ads, recommend beginning campaign work now.",
    "Treat completed or ended campaigns as historical context only; they are benign for advert timing and do not count as active coverage.",
    "Do not say to wait for more open places or a higher urgency score when current estimated open places already exceed actionable waitlist.",
    "Do not use raw, long-running, or non-actionable waitlist as a reason to run ads by itself.",
    "Do not treat raw waitlist as clean demand; prefer actionable waitlist, age quality, and replacement pressure.",
    "Do not treat estimated open places as guaranteed places; describe them as planning signals.",
    "Read Meta Ads against centre demand: active ads are useful only when the centre has openings or future pressure.",
    "Give practical follow-up actions. Keep the response concise, specific, and suitable for an internal marketing/enrolment user.",
    "Do not claim that emails, files, Microsoft 365 tasks, or calendar entries have been changed. You may propose those as next actions only.",
  ].join("\n");
}
