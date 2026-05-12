import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";

const db = prisma as GeneratedPrismaClient;

export type GoogleAnalyticsSnapshotInput = {
  propertyId: string;
  snapshotDate: string | Date;
  rangeStartDate?: string | Date;
  rangeEndDate?: string | Date;
  pulledAt: string | Date;
  activeUsers?: number | null;
  sessions?: number | null;
  engagedSessions?: number | null;
  screenPageViews?: number | null;
  conversions?: number | null;
  totalRevenue?: number | null;
  engagementRate?: number | null;
  averageSessionDuration?: number | null;
  pages?: GoogleAnalyticsPageSnapshotInput[];
  raw?: unknown;
};

export type GoogleAnalyticsPageSnapshotInput = {
  pagePath: string;
  pageTitle?: string | null;
  activeUsers?: number | null;
  sessions?: number | null;
  screenPageViews?: number | null;
  engagementRate?: number | null;
  raw?: unknown;
};

export type GoogleAnalyticsPageSnapshotView = GoogleAnalyticsPageSnapshotInput & {
  id: number;
};

export type GoogleAnalyticsDailySnapshotView = Omit<GoogleAnalyticsSnapshotInput, "raw"> & {
  id: number;
  snapshotDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
  pulledAt: string;
  createdAt: string;
  updatedAt: string;
  pages: GoogleAnalyticsPageSnapshotView[];
};

function toNumber(value: { toString(): string } | number | null | undefined) {
  if (value == null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function toDateOnly(value: string | Date) {
  const date = new Date(value);

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDateOnly(value: string | Date) {
  return toDateOnly(value).toISOString();
}

function toJson(value: unknown) {
  if (value == null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapGoogleAnalyticsSnapshot(record: {
  id: number;
  propertyId: string;
  snapshotDate: Date;
  rangeStartDate: Date;
  rangeEndDate: Date;
  pulledAt: Date;
  activeUsers: number | null;
  sessions: number | null;
  engagedSessions: number | null;
  screenPageViews: number | null;
  conversions: { toString(): string } | null;
  totalRevenue: { toString(): string } | null;
  engagementRate: { toString(): string } | null;
  averageSessionDuration: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
  pages?: {
    id: number;
    pagePath: string;
    pageTitle: string | null;
    activeUsers: number | null;
    sessions: number | null;
    screenPageViews: number | null;
    engagementRate: { toString(): string } | null;
  }[];
}): GoogleAnalyticsDailySnapshotView {
  return {
    id: record.id,
    propertyId: record.propertyId,
    snapshotDate: record.snapshotDate.toISOString(),
    rangeStartDate: record.rangeStartDate.toISOString(),
    rangeEndDate: record.rangeEndDate.toISOString(),
    pulledAt: record.pulledAt.toISOString(),
    activeUsers: record.activeUsers,
    sessions: record.sessions,
    engagedSessions: record.engagedSessions,
    screenPageViews: record.screenPageViews,
    conversions: toNumber(record.conversions),
    totalRevenue: toNumber(record.totalRevenue),
    engagementRate: toNumber(record.engagementRate),
    averageSessionDuration: toNumber(record.averageSessionDuration),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pages: (record.pages ?? []).map((page) => ({
      id: page.id,
      pagePath: page.pagePath,
      pageTitle: page.pageTitle,
      activeUsers: page.activeUsers,
      sessions: page.sessions,
      screenPageViews: page.screenPageViews,
      engagementRate: toNumber(page.engagementRate),
    })),
  };
}

export async function upsertGoogleAnalyticsDailySnapshot(input: GoogleAnalyticsSnapshotInput) {
  const snapshotDate = toDateOnly(input.snapshotDate);
  const rangeStartDate = toDateOnly(input.rangeStartDate ?? input.snapshotDate);
  const rangeEndDate = toDateOnly(input.rangeEndDate ?? input.snapshotDate);
  const pulledAt = new Date(input.pulledAt);
  const data = {
    snapshotDate,
    pulledAt,
    activeUsers: input.activeUsers,
    sessions: input.sessions,
    engagedSessions: input.engagedSessions,
    screenPageViews: input.screenPageViews,
    conversions: input.conversions,
    totalRevenue: input.totalRevenue,
    engagementRate: input.engagementRate,
    averageSessionDuration: input.averageSessionDuration,
    raw: toJson(input.raw),
  };
  const record = await db.$transaction(async (tx) => {
    const snapshot = await tx.googleAnalyticsDailySnapshot.upsert({
      where: {
        propertyId_rangeStartDate_rangeEndDate: {
          propertyId: input.propertyId,
          rangeStartDate,
          rangeEndDate,
        },
      },
      update: data,
      create: {
        propertyId: input.propertyId,
        rangeStartDate,
        rangeEndDate,
        ...data,
      },
    });

    await tx.googleAnalyticsPageSnapshot.deleteMany({
      where: { snapshotId: snapshot.id },
    });

    if (input.pages && input.pages.length > 0) {
      await tx.googleAnalyticsPageSnapshot.createMany({
        data: input.pages.map((page) => ({
          snapshotId: snapshot.id,
          propertyId: input.propertyId,
          snapshotDate,
          rangeStartDate,
          rangeEndDate,
          pagePath: page.pagePath,
          pageTitle: page.pageTitle,
          activeUsers: page.activeUsers,
          sessions: page.sessions,
          screenPageViews: page.screenPageViews,
          engagementRate: page.engagementRate,
          raw: toJson(page.raw),
        })),
      });
    }

    return tx.googleAnalyticsDailySnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      include: {
        pages: {
          orderBy: [{ screenPageViews: "desc" }, { pagePath: "asc" }],
        },
      },
    });
  });

  return mapGoogleAnalyticsSnapshot(record);
}

export async function readLatestGoogleAnalyticsDailySnapshot(propertyId?: string | null) {
  const record = await db.googleAnalyticsDailySnapshot.findFirst({
    where: propertyId ? { propertyId } : undefined,
    orderBy: [{ snapshotDate: "desc" }, { pulledAt: "desc" }],
    include: {
      pages: {
        orderBy: [{ screenPageViews: "desc" }, { pagePath: "asc" }],
      },
    },
  });

  return record ? mapGoogleAnalyticsSnapshot(record) : null;
}

export async function readGoogleAnalyticsRangeSnapshot(
  propertyId: string,
  rangeStartInput: string | Date,
  rangeEndInput: string | Date,
) {
  const record = await db.googleAnalyticsDailySnapshot.findUnique({
    where: {
      propertyId_rangeStartDate_rangeEndDate: {
        propertyId,
        rangeStartDate: toDateOnly(rangeStartInput),
        rangeEndDate: toDateOnly(rangeEndInput),
      },
    },
    include: {
      pages: {
        orderBy: [{ screenPageViews: "desc" }, { pagePath: "asc" }],
      },
    },
  });

  return record ? mapGoogleAnalyticsSnapshot(record) : null;
}

export async function readGoogleAnalyticsDailySnapshotForDate(propertyId: string, dateInput: string | Date) {
  const record = await db.googleAnalyticsDailySnapshot.findFirst({
    where: {
      propertyId,
      snapshotDate: toDateOnly(dateInput),
    },
    orderBy: [{ rangeStartDate: "desc" }, { pulledAt: "desc" }],
    include: {
      pages: {
        orderBy: [{ screenPageViews: "desc" }, { pagePath: "asc" }],
      },
    },
  });

  return record ? mapGoogleAnalyticsSnapshot(record) : null;
}

export async function readGoogleAnalyticsRangeSnapshots(
  propertyId: string,
  rangeStartInput: string | Date,
  rangeEndInput: string | Date,
) {
  const records = await db.googleAnalyticsDailySnapshot.findMany({
    where: {
      propertyId,
      rangeStartDate: { gte: toDateOnly(rangeStartInput) },
      rangeEndDate: { lte: toDateOnly(rangeEndInput) },
    },
    orderBy: [{ rangeStartDate: "asc" }, { rangeEndDate: "asc" }],
    include: {
      pages: {
        orderBy: [{ screenPageViews: "desc" }, { pagePath: "asc" }],
      },
    },
  });

  return records.map(mapGoogleAnalyticsSnapshot);
}

function weightedAverage(
  entries: GoogleAnalyticsDailySnapshotView[],
  selector: (entry: GoogleAnalyticsDailySnapshotView) => number | null | undefined,
  weightSelector: (entry: GoogleAnalyticsDailySnapshotView) => number | null | undefined,
) {
  let total = 0;
  let weightTotal = 0;

  for (const entry of entries) {
    const value = selector(entry);
    const weight = weightSelector(entry) ?? 0;

    if (value != null && Number.isFinite(value) && weight > 0) {
      total += value * weight;
      weightTotal += weight;
    }
  }

  return weightTotal > 0 ? total / weightTotal : null;
}

function sumMetric(entries: GoogleAnalyticsDailySnapshotView[], selector: (entry: GoogleAnalyticsDailySnapshotView) => number | null | undefined) {
  return entries.reduce((sum, entry) => sum + (selector(entry) ?? 0), 0);
}

export function aggregateGoogleAnalyticsSnapshots(
  entries: GoogleAnalyticsDailySnapshotView[],
  propertyId: string,
  rangeStartInput: string | Date,
  rangeEndInput: string | Date,
): GoogleAnalyticsDailySnapshotView | null {
  if (entries.length === 0) {
    return null;
  }

  const pages = new Map<string, {
    pagePath: string;
    pageTitle: string | null;
    activeUsers: number;
    sessions: number;
    screenPageViews: number;
    engagementRateTotal: number;
    engagementRateWeight: number;
  }>();

  for (const entry of entries) {
    for (const page of entry.pages) {
      const existing = pages.get(page.pagePath) ?? {
        pagePath: page.pagePath,
        pageTitle: page.pageTitle ?? null,
        activeUsers: 0,
        sessions: 0,
        screenPageViews: 0,
        engagementRateTotal: 0,
        engagementRateWeight: 0,
      };
      const sessions = page.sessions ?? 0;

      existing.activeUsers += page.activeUsers ?? 0;
      existing.sessions += sessions;
      existing.screenPageViews += page.screenPageViews ?? 0;

      if (page.engagementRate != null && sessions > 0) {
        existing.engagementRateTotal += page.engagementRate * sessions;
        existing.engagementRateWeight += sessions;
      }

      if (!existing.pageTitle && page.pageTitle) {
        existing.pageTitle = page.pageTitle;
      }

      pages.set(page.pagePath, existing);
    }
  }

  return {
    id: -1,
    propertyId,
    snapshotDate: toIsoDateOnly(rangeEndInput),
    rangeStartDate: toIsoDateOnly(rangeStartInput),
    rangeEndDate: toIsoDateOnly(rangeEndInput),
    pulledAt: entries
      .map((entry) => entry.pulledAt)
      .sort()
      .at(-1) ?? new Date().toISOString(),
    createdAt: entries[0]?.createdAt ?? new Date().toISOString(),
    updatedAt: entries
      .map((entry) => entry.updatedAt)
      .sort()
      .at(-1) ?? new Date().toISOString(),
    activeUsers: sumMetric(entries, (entry) => entry.activeUsers),
    sessions: sumMetric(entries, (entry) => entry.sessions),
    engagedSessions: sumMetric(entries, (entry) => entry.engagedSessions),
    screenPageViews: sumMetric(entries, (entry) => entry.screenPageViews),
    conversions: sumMetric(entries, (entry) => entry.conversions),
    totalRevenue: sumMetric(entries, (entry) => entry.totalRevenue),
    engagementRate: weightedAverage(entries, (entry) => entry.engagementRate, (entry) => entry.sessions),
    averageSessionDuration: weightedAverage(entries, (entry) => entry.averageSessionDuration, (entry) => entry.sessions),
    pages: [...pages.values()]
      .map((page, index) => ({
        id: -index - 1,
        pagePath: page.pagePath,
        pageTitle: page.pageTitle,
        activeUsers: page.activeUsers,
        sessions: page.sessions,
        screenPageViews: page.screenPageViews,
        engagementRate: page.engagementRateWeight > 0 ? page.engagementRateTotal / page.engagementRateWeight : null,
      }))
      .sort((left, right) => (right.screenPageViews ?? 0) - (left.screenPageViews ?? 0)),
  };
}
