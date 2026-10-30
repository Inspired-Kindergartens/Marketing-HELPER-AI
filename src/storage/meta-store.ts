import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";
import { matchMetaNameToCentre, type MatchableCentre } from "../meta/centre-match.js";

const db = prisma as GeneratedPrismaClient;

const META_ACTIVE_HEALTHY_STATUSES = [
  "ACTIVE",
  "Active",
  "active",
] as const;

const META_LEARNING_STATUSES = [
  "LEARNING",
  "Learning",
  "learning",
] as const;

const META_LEARNING_LIMITED_STATUSES = [
  "LEARNING_LIMITED",
  "LEARNING LIMITED",
  "Learning Limited",
  "learning limited",
  "LEARNING-LIMITED",
  "learning-limited",
] as const;

const META_IN_REVIEW_STATUSES = [
  "IN_REVIEW",
  "IN REVIEW",
  "In Review",
  "in review",
  "PENDING_REVIEW",
  "PENDING REVIEW",
  "Pending Review",
  "pending review",
] as const;

const META_DELIVERY_ACTIVE_STATUSES = [
  ...META_ACTIVE_HEALTHY_STATUSES,
  ...META_LEARNING_STATUSES,
  ...META_LEARNING_LIMITED_STATUSES,
  ...META_IN_REVIEW_STATUSES,
] as const;

const META_DELIVERY_NOT_DELIVERING_STATUSES = [
  "NOT_DELIVERING",
  "NOT DELIVERING",
  "Not Delivering",
  "not delivering",
  "WITH_ISSUES",
  "WITH ISSUES",
  "With Issues",
  "with issues",
] as const;

const META_DELIVERY_REJECTED_STATUSES = [
  "REJECTED",
  "Rejected",
  "rejected",
  "DISAPPROVED",
  "Disapproved",
  "disapproved",
] as const;

const META_COMPLETED_STATUSES = [
  "COMPLETED",
  "Completed",
  "completed",
] as const;

const META_CURRENT_AD_STATUSES = [
  ...META_ACTIVE_HEALTHY_STATUSES,
  ...META_LEARNING_STATUSES,
  ...META_LEARNING_LIMITED_STATUSES,
  ...META_DELIVERY_NOT_DELIVERING_STATUSES,
  ...META_DELIVERY_REJECTED_STATUSES,
  ...META_COMPLETED_STATUSES,
] as const;

const META_ACTIVE_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_DELIVERY_ACTIVE_STATUSES] } },
    { effectiveStatus: { in: [...META_DELIVERY_ACTIVE_STATUSES] } },
  ],
};

const META_CURRENT_AD_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_CURRENT_AD_STATUSES] } },
    { effectiveStatus: { in: [...META_CURRENT_AD_STATUSES] } },
  ],
};

const META_ACTIVE_HEALTHY_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_ACTIVE_HEALTHY_STATUSES] } },
    { effectiveStatus: { in: [...META_ACTIVE_HEALTHY_STATUSES] } },
  ],
};

const META_LEARNING_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_LEARNING_STATUSES] } },
    { effectiveStatus: { in: [...META_LEARNING_STATUSES] } },
  ],
};

const META_LEARNING_LIMITED_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_LEARNING_LIMITED_STATUSES] } },
    { effectiveStatus: { in: [...META_LEARNING_LIMITED_STATUSES] } },
  ],
};

const META_BLOCKED_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_DELIVERY_NOT_DELIVERING_STATUSES] } },
    { effectiveStatus: { in: [...META_DELIVERY_NOT_DELIVERING_STATUSES] } },
  ],
};

const META_REJECTED_STATUS_WHERE = {
  OR: [
    { status: { in: [...META_DELIVERY_REJECTED_STATUSES] } },
    { effectiveStatus: { in: [...META_DELIVERY_REJECTED_STATUSES] } },
  ],
};

const META_DASHBOARD_DELIVERY_STATUSES = new Set([
  "Active",
  "Learning",
  "Learning Limited",
  "Completed",
  "Not Delivering",
]);

export type MetaCurrentAdRow = {
  adName: string;
  adSetName: string;
  campaignName: string;
  advertType: string | null;
  status: string;
  resultLabel: string;
  resultCount: number | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpr: number | null;
  budget: number | null;
  endsAt: string | null;
  lastPulledAt: string;
  centreKey: number | null;
};

export type MetaCentreCoverageRow = {
  centreKey: number;
  campaignCount: number;
  activeCampaignCount: number;
  adCount: number;
  spend30d: number;
  clicks30d: number;
  lastCampaignAt: string | null;
};

export type MetaRecommendation = {
  centreKey: number;
  centreName: string;
  priority: "high" | "medium" | "low";
  label: string;
  detail: string;
};

export type MetaAdsDashboardData = {
  latestPullAt: string | null;
  accountCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  activeHealthyCampaignCount: number;
  learningCampaignCount: number;
  learningLimitedCampaignCount: number;
  completedCampaignCount: number;
  notDeliveringCampaignCount: number;
  rejectedCampaignCount: number;
  adCount: number;
  activeAdCount: number;
  unmatchedCampaignCount: number;
  matchedCampaignCount: number;
  totalSpend30d: number;
  currentAds: MetaCurrentAdRow[];
  centreCoverage: MetaCentreCoverageRow[];
  recommendations: MetaRecommendation[];
};

export type MetaAdsDashboardRange = {
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
};

function toNumber(value: { toString(): string } | null | undefined) {
  return value == null ? null : Number(value.toString());
}

function addNullable(left: number | null, right: number | null | undefined) {
  if (right == null) {
    return left;
  }

  return (left ?? 0) + right;
}

function sumActionValues(rows: { rawActions: unknown }[]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (!Array.isArray(row.rawActions)) {
      continue;
    }

    for (const action of row.rawActions) {
      if (!action || typeof action !== "object") {
        continue;
      }

      const source = action as Record<string, unknown>;
      const actionType = typeof source.action_type === "string" ? source.action_type : null;
      const value = Number(source.value ?? 0);

      if (actionType && Number.isFinite(value)) {
        totals.set(actionType, (totals.get(actionType) ?? 0) + value);
      }
    }
  }

  return totals;
}

function getPrimaryResult(rows: { rawActions: unknown }[]) {
  const totals = sumActionValues(rows);
  const preferred = [
    ["landing_page_view", "Landing views"],
    ["link_click", "Link clicks"],
    ["lead", "Leads"],
    ["onsite_web_lead", "Website leads"],
    ["offsite_conversion.fb_pixel_lead", "Pixel leads"],
  ] as const;

  for (const [key, label] of preferred) {
    const value = totals.get(key);

    if (value != null) {
      return {
        label,
        count: value,
      };
    }
  }

  return {
    label: "Results",
    count: null,
  };
}

function getLeadResultCount(rows: { rawActions: unknown }[]) {
  const totals = sumActionValues(rows);

  return (
    (totals.get("lead") ?? 0) +
    (totals.get("onsite_web_lead") ?? 0) +
    (totals.get("offsite_conversion.fb_pixel_lead") ?? 0)
  );
}

function normalizeDeliveryStatus(status: string | null | undefined) {
  const normalized = (status ?? "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();

  if (normalized === "active") {
    return "Active";
  }

  if (normalized === "learning") {
    return "Learning";
  }

  if (normalized === "learning limited") {
    return "Learning Limited";
  }

  if (normalized === "not delivering" || normalized === "with issues") {
    return "Not Delivering";
  }

  if (normalized === "rejected" || normalized === "disapproved") {
    return "Rejected";
  }

  if (normalized === "completed") {
    return "Completed";
  }

  return status ?? "-";
}

function isActiveMetaStatus(status: string | null | undefined) {
  return normalizeDeliveryStatus(status) === "Active";
}

function deriveCurrentAdDeliveryStatus(input: {
  adStatus: string | null | undefined;
  adEffectiveStatus: string | null | undefined;
  adSetStatus: string | null | undefined;
  adSetEffectiveStatus: string | null | undefined;
  campaignStatus: string | null | undefined;
  campaignEffectiveStatus: string | null | undefined;
  adSetEndTime: Date | null | undefined;
  pulledAt: Date;
  adSetInsights: { spend: { toString(): string } | null; rawActions: unknown }[];
}) {
  const normalizedAdStatus = normalizeDeliveryStatus(input.adEffectiveStatus ?? input.adStatus);
  const normalizedAdSetStatus = normalizeDeliveryStatus(input.adSetEffectiveStatus ?? input.adSetStatus);
  const normalizedCampaignStatus = normalizeDeliveryStatus(input.campaignEffectiveStatus ?? input.campaignStatus);

  if (
    input.adSetEndTime &&
    input.adSetEndTime < input.pulledAt &&
    isActiveMetaStatus(input.adStatus) &&
    isActiveMetaStatus(input.adEffectiveStatus) &&
    isActiveMetaStatus(input.adSetStatus) &&
    isActiveMetaStatus(input.adSetEffectiveStatus) &&
    isActiveMetaStatus(input.campaignStatus) &&
    isActiveMetaStatus(input.campaignEffectiveStatus)
  ) {
    return "Completed";
  }

  if (normalizedAdStatus === "Rejected" || normalizedAdSetStatus === "Rejected" || normalizedCampaignStatus === "Rejected") {
    return "Rejected";
  }

  if (
    normalizedAdSetStatus === "Not Delivering" ||
    normalizedAdStatus === "Not Delivering" ||
    normalizedCampaignStatus === "Not Delivering"
  ) {
    return "Not Delivering";
  }

  if (normalizedAdSetStatus === "Learning Limited" || normalizedAdStatus === "Learning Limited") {
    return "Learning Limited";
  }

  if (normalizedAdSetStatus === "Learning" || normalizedAdStatus === "Learning") {
    return "Learning";
  }

  if (normalizedAdSetStatus === "Active" || normalizedAdStatus === "Active") {
    const spend = input.adSetInsights.reduce((sum, insight) => sum + (toNumber(insight.spend) ?? 0), 0);

    if (spend > 0 && getLeadResultCount(input.adSetInsights) < 10) {
      return "Learning";
    }

    return "Active";
  }

  return normalizedAdSetStatus !== "-" ? normalizedAdSetStatus : normalizedAdStatus;
}

function parseMetaBudget(value: string | null | undefined) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed / 100;
}

function getAdSetBudget(adSet: { dailyBudget: string | null; lifetimeBudget: string | null } | null | undefined) {
  return parseMetaBudget(adSet?.dailyBudget) ?? parseMetaBudget(adSet?.lifetimeBudget);
}

function formatMetaEnumLabel(value: string | null | undefined) {
  const words = (value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function toDate(value: string | Date | null | undefined) {
  if (value == null) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function buildAdSetRunRangeWhere(fromDate: Date | null, toDate: Date | null): Prisma.MetaAdWhereInput | null {
  if (!fromDate && !toDate) {
    return null;
  }

  return {
    adSet: {
      AND: [
        {
          OR: [
            { startTime: null },
            ...(toDate ? [{ startTime: { lte: toDate } }] : []),
          ],
        },
        {
          OR: [
            { endTime: null },
            ...(fromDate ? [{ endTime: { gte: fromDate } }] : []),
          ],
        },
      ],
    },
  };
}

function buildPeriodAdSetWhere(fromDate: Date | null, toDate: Date | null): Prisma.MetaAdSetWhereInput {
  const rangeWhere = buildAdSetRunRangeWhere(fromDate, toDate)?.adSet as Prisma.MetaAdSetWhereInput | undefined;

  return rangeWhere
    ? {
        AND: [
          rangeWhere,
          META_CURRENT_AD_STATUS_WHERE as Prisma.MetaAdSetWhereInput,
        ],
      }
    : META_ACTIVE_HEALTHY_STATUS_WHERE;
}

function buildPeriodAdWhere(fromDate: Date | null, toDate: Date | null): Prisma.MetaAdWhereInput {
  const rangeWhere = buildAdSetRunRangeWhere(fromDate, toDate);

  return rangeWhere
    ? {
        AND: [
          rangeWhere,
          META_CURRENT_AD_STATUS_WHERE,
        ],
      }
    : {
        OR: [META_CURRENT_AD_STATUS_WHERE],
      };
}

function dedupeLatestInsightsByDate<T extends { insightDate: Date; pulledAt: Date }>(insights: T[]) {
  const latestByDate = new Map<string, T>();

  for (const insight of insights) {
    const key = insight.insightDate.toISOString().slice(0, 10);
    const existing = latestByDate.get(key);

    if (!existing || insight.pulledAt > existing.pulledAt) {
      latestByDate.set(key, insight);
    }
  }

  return [...latestByDate.values()];
}

function dedupeLatestInsightsByEntityAndDate<
  T extends { insightDate: Date; pulledAt: Date; metaAdId: string | null },
>(insights: T[]) {
  const latestByEntityAndDate = new Map<string, T>();

  for (const insight of insights) {
    const key = `${insight.metaAdId ?? "unknown"}:${insight.insightDate.toISOString().slice(0, 10)}`;
    const existing = latestByEntityAndDate.get(key);

    if (!existing || insight.pulledAt > existing.pulledAt) {
      latestByEntityAndDate.set(key, insight);
    }
  }

  return [...latestByEntityAndDate.values()];
}

function resolveStoredAdCentreKey(
  ad: {
    centreKey: number | null;
    name: string;
    adSet?: { centreKey: number | null; name: string } | null;
    campaign?: { centreKey: number | null; name: string } | null;
  },
  centres: readonly MatchableCentre[],
) {
  return (
    ad.centreKey ??
    ad.adSet?.centreKey ??
    ad.campaign?.centreKey ??
    matchMetaNameToCentre(`${ad.name} ${ad.adSet?.name ?? ""} ${ad.campaign?.name ?? ""}`, centres)?.centreKey ??
    null
  );
}

export async function readMetaAdsDashboardData(range: MetaAdsDashboardRange = {}): Promise<MetaAdsDashboardData> {
  const latestAccount = await db.metaAdAccount.findFirst({
    orderBy: { pulledAt: "desc" },
    select: { pulledAt: true },
  });
  const latestPullAt = latestAccount?.pulledAt ?? null;
  const rangeStart = toDate(range.fromDate);
  const rangeEnd = toDate(range.toDate) ?? latestPullAt;
  const completedSince = rangeStart ?? (latestPullAt ? new Date(latestPullAt.getTime() - 30 * 24 * 60 * 60 * 1000) : null);
  const adSetRunRangeWhere = buildAdSetRunRangeWhere(rangeStart ?? completedSince, rangeEnd);
  const periodAdWhere = buildPeriodAdWhere(rangeStart ?? completedSince, rangeEnd);
  const periodAdSetWhere = buildPeriodAdSetWhere(rangeStart ?? completedSince, rangeEnd);
  const currentActiveAdSetWhere = latestPullAt
    ? {
        AND: [
          META_ACTIVE_STATUS_WHERE as Prisma.MetaAdSetWhereInput,
          {
            OR: [
              { endTime: null },
              { endTime: { gte: latestPullAt } },
            ],
          },
        ],
      }
    : META_ACTIVE_STATUS_WHERE;
  const latestInsightWhere = latestPullAt
    ? {
        pulledAt: latestPullAt,
        level: "ad",
      }
      : {
        level: "ad",
      };
  const rangedInsightWhere = {
    level: "ad",
    ...(rangeStart || rangeEnd
      ? {
          insightDate: {
            ...(rangeStart ? { gte: rangeStart } : {}),
            ...(rangeEnd ? { lte: rangeEnd } : {}),
          },
        }
      : {}),
  };
  const [
    accountCount,
    campaignCount,
    notDeliveringCampaignCount,
    rejectedCampaignCount,
    adCount,
    activeAdCount,
    unmatchedCampaignCount,
    matchedCampaignCount,
    centres,
    rangedAdInsights,
    ads,
    campaignCoverage,
    activeCampaignCoverage,
    adCoverage,
  ] = await Promise.all([
    db.metaAdAccount.count(),
    db.metaCampaign.count(),
    db.metaAdSet.count({
      where: META_BLOCKED_STATUS_WHERE,
    }),
    db.metaAd.count({
      where: META_REJECTED_STATUS_WHERE,
    }),
    db.metaAd.count(),
    db.metaAd.count({
      where: META_ACTIVE_STATUS_WHERE,
    }),
    db.metaCampaign.count({
      where: {
        centreKey: null,
      },
    }),
    db.metaCampaign.count({
      where: {
        centreKey: {
          not: null,
        },
      },
    }),
    db.centreReference.findMany({
      where: {
        ignored: false,
        openStatus: "Open",
      },
      select: {
        centreKey: true,
        name: true,
      },
    }),
    db.metaInsightSnapshot.findMany({
      where: rangedInsightWhere,
      orderBy: [{ pulledAt: "desc" }, { insightDate: "desc" }],
    }),
    db.metaAd.findMany({
      where: periodAdWhere,
      orderBy: [{ pulledAt: "desc" }, { name: "asc" }],
      include: {
        campaign: true,
        adSet: true,
      },
    }),
    db.metaCampaign.groupBy({
      by: ["centreKey"],
      where: {
        centreKey: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        metaUpdatedTime: true,
        pulledAt: true,
      },
    }),
    db.metaAdSet.groupBy({
      by: ["centreKey"],
      where: {
        centreKey: {
          not: null,
        },
        ...currentActiveAdSetWhere,
      },
      _count: {
        _all: true,
      },
    }),
    db.metaAd.groupBy({
      by: ["centreKey"],
      where: {
        centreKey: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);
  const coverageByCentre = new Map<number, MetaCentreCoverageRow>();
  const activeAdSets = await db.metaAdSet.findMany({
    where: periodAdSetWhere,
    include: {
      campaign: true,
    },
    orderBy: [{ pulledAt: "desc" }, { name: "asc" }],
  });
  const latestAdSetInsightsByAdSetId = new Map<string, Awaited<ReturnType<typeof db.metaInsightSnapshot.findMany>>>();

  await Promise.all(
    activeAdSets.map(async (adSet) => {
      const insights = await db.metaInsightSnapshot.findMany({
        where: {
          level: "adset",
          metaAdSetId: adSet.metaAdSetId,
          ...(rangeStart || rangeEnd
            ? {
                insightDate: {
                  ...(rangeStart ? { gte: rangeStart } : {}),
                  ...(rangeEnd ? { lte: rangeEnd } : {}),
                },
              }
            : latestPullAt ? { pulledAt: latestPullAt } : {}),
        },
        orderBy: [{ pulledAt: "desc" }, { insightDate: "desc" }],
      });

      latestAdSetInsightsByAdSetId.set(adSet.metaAdSetId, rangeStart || rangeEnd ? dedupeLatestInsightsByDate(insights) : insights);
    }),
  );

  const spendingActiveAdSets = activeAdSets.filter((adSet) => {
    const insights = latestAdSetInsightsByAdSetId.get(adSet.metaAdSetId) ?? [];
    const spend = insights.reduce((sum, insight) => sum + (toNumber(insight.spend) ?? 0), 0);

    return spend > 0;
  });
  const completedCampaignCount = activeAdSets.filter(
    (adSet) => latestPullAt && adSet.endTime && adSet.endTime < latestPullAt,
  ).length;
  const currentSpendingActiveAdSets = spendingActiveAdSets.filter(
    (adSet) => !latestPullAt || !adSet.endTime || adSet.endTime >= latestPullAt,
  );
  const activeHealthyCampaignCount = currentSpendingActiveAdSets.filter((adSet) => {
    const insights = latestAdSetInsightsByAdSetId.get(adSet.metaAdSetId) ?? [];

    return getLeadResultCount(insights) >= 10;
  }).length;
  const learningCampaignCount = currentSpendingActiveAdSets.length - activeHealthyCampaignCount;
  const learningLimitedCampaignCount = 0;
  const activeCampaignCount = activeHealthyCampaignCount + learningCampaignCount + learningLimitedCampaignCount;

  function ensureCoverage(centreKey: number) {
    const existing = coverageByCentre.get(centreKey);

    if (existing) {
      return existing;
    }

    const created = {
      centreKey,
      campaignCount: 0,
      activeCampaignCount: 0,
      adCount: 0,
      spend30d: 0,
      clicks30d: 0,
      lastCampaignAt: null,
    };

    coverageByCentre.set(centreKey, created);

    return created;
  }

  for (const row of campaignCoverage) {
    if (row.centreKey != null) {
      const coverage = ensureCoverage(row.centreKey);

      coverage.campaignCount = row._count._all;
      coverage.lastCampaignAt = (row._max.metaUpdatedTime ?? row._max.pulledAt)?.toISOString() ?? null;
    }
  }

  for (const row of activeCampaignCoverage) {
    if (row.centreKey != null) {
      ensureCoverage(row.centreKey).activeCampaignCount = row._count._all;
    }
  }

  for (const row of adCoverage) {
    if (row.centreKey != null) {
      ensureCoverage(row.centreKey).adCount = row._count._all;
    }
  }

  const dedupedRangedAdInsights = dedupeLatestInsightsByEntityAndDate(rangedAdInsights);

  for (const insight of dedupedRangedAdInsights) {
    if (insight.centreKey != null) {
      const coverage = ensureCoverage(insight.centreKey);

      coverage.spend30d += toNumber(insight.spend) ?? 0;
      coverage.clicks30d += insight.clicks ?? 0;
    }
  }

  const insightsByAdId = new Map<string, Awaited<ReturnType<typeof db.metaInsightSnapshot.findMany>>>();

  await Promise.all(
    ads.map(async (ad) => {
      const insights = await db.metaInsightSnapshot.findMany({
        where: {
          level: "ad",
          metaAdId: ad.metaAdId,
          ...(rangeStart || rangeEnd
            ? {
                insightDate: {
                  ...(rangeStart ? { gte: rangeStart } : {}),
                  ...(rangeEnd ? { lte: rangeEnd } : {}),
                },
              }
            : latestPullAt ? { pulledAt: latestPullAt } : {}),
        },
        orderBy: [{ pulledAt: "desc" }, { insightDate: "desc" }],
      });

      insightsByAdId.set(ad.metaAdId, rangeStart || rangeEnd ? dedupeLatestInsightsByDate(insights) : insights);
    }),
  );

  const currentAds = ads.map((ad) => {
    const insights = insightsByAdId.get(ad.metaAdId) ?? [];
    const adSetInsights = ad.metaAdSetId ? (latestAdSetInsightsByAdSetId.get(ad.metaAdSetId) ?? []) : [];
    const result = getPrimaryResult(insights);
    const spend = insights.reduce((sum, insight) => sum + (toNumber(insight.spend) ?? 0), 0);
    const impressions = insights.reduce<number | null>((sum, insight) => addNullable(sum, insight.impressions), null);
    const reach = insights.reduce<number | null>((sum, insight) => addNullable(sum, insight.reach), null);
    const clicks = insights.reduce<number | null>((sum, insight) => addNullable(sum, insight.clicks), null);
    const status = deriveCurrentAdDeliveryStatus({
      adStatus: ad.status,
      adEffectiveStatus: ad.effectiveStatus,
      adSetStatus: ad.adSet?.status,
      adSetEffectiveStatus: ad.adSet?.effectiveStatus,
      campaignStatus: ad.campaign?.status,
      campaignEffectiveStatus: ad.campaign?.effectiveStatus,
      adSetEndTime: ad.adSet?.endTime,
      pulledAt: latestPullAt ?? ad.pulledAt,
      adSetInsights,
    });

    return {
      adName: ad.name,
      adSetName: ad.adSet?.name ?? "-",
      campaignName: ad.campaign?.name ?? "-",
      advertType: formatMetaEnumLabel(ad.adSet?.optimizationGoal),
      status,
      resultLabel: result.label,
      resultCount: result.count,
      spend,
      impressions,
      reach,
      clicks,
      ctr: impressions && impressions > 0 && clicks != null ? (clicks / impressions) * 100 : null,
      cpc: clicks && clicks > 0 ? spend / clicks : null,
      cpr: result.count && result.count > 0 ? spend / result.count : null,
      budget: getAdSetBudget(ad.adSet),
      endsAt: ad.adSet?.endTime?.toISOString() ?? null,
      lastPulledAt: ad.pulledAt.toISOString(),
      centreKey: resolveStoredAdCentreKey(ad, centres),
    };
  }).filter((ad) => META_DASHBOARD_DELIVERY_STATUSES.has(ad.status));
  const countCurrentAdsByStatus = (status: string) => currentAds.filter((ad) => ad.status === status).length;
  const currentActiveHealthyCampaignCount = countCurrentAdsByStatus("Active");
  const currentLearningCampaignCount = countCurrentAdsByStatus("Learning");
  const currentLearningLimitedCampaignCount = countCurrentAdsByStatus("Learning Limited");
  const currentCompletedCampaignCount = countCurrentAdsByStatus("Completed");

  return {
    latestPullAt: latestPullAt?.toISOString() ?? null,
    accountCount,
    campaignCount,
    activeCampaignCount:
      currentActiveHealthyCampaignCount + currentLearningCampaignCount + currentLearningLimitedCampaignCount,
    activeHealthyCampaignCount: currentActiveHealthyCampaignCount,
    learningCampaignCount: currentLearningCampaignCount,
    learningLimitedCampaignCount: currentLearningLimitedCampaignCount,
    completedCampaignCount: currentCompletedCampaignCount,
    notDeliveringCampaignCount,
    rejectedCampaignCount,
    adCount,
    activeAdCount,
    unmatchedCampaignCount,
    matchedCampaignCount,
    totalSpend30d: dedupedRangedAdInsights.reduce((sum, insight) => sum + (toNumber(insight.spend) ?? 0), 0),
    currentAds,
    centreCoverage: [...coverageByCentre.values()],
    recommendations: [],
  };
}
