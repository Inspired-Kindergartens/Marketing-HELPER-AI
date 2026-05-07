import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";

const db = prisma as GeneratedPrismaClient;

export type GoogleAnalyticsSnapshotInput = {
  propertyId: string;
  snapshotDate: string | Date;
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

  date.setHours(0, 0, 0, 0);

  return date;
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
  const pulledAt = new Date(input.pulledAt);
  const data = {
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
        propertyId_snapshotDate: {
          propertyId: input.propertyId,
          snapshotDate,
        },
      },
      update: data,
      create: {
        propertyId: input.propertyId,
        snapshotDate,
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

export async function readGoogleAnalyticsDailySnapshotForDate(propertyId: string, dateInput: string | Date) {
  const record = await db.googleAnalyticsDailySnapshot.findUnique({
    where: {
      propertyId_snapshotDate: {
        propertyId,
        snapshotDate: toDateOnly(dateInput),
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
