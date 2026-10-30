import { Prisma, type PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { estimateActionableWaitlistCount } from "../analytics/waitlist-profile.js";
import type { WindowKey } from "../analytics/windows.js";
import { prisma } from "../db.js";
import type { LatestSnapshotSet } from "./analytics-store.js";
import type { MetaAdsDashboardData } from "./meta-store.js";

const db = prisma as GeneratedPrismaClient;

type AnalyticsRow = NonNullable<LatestSnapshotSet>["snapshots"][number];

export type MetaRecommendationNotificationInput = {
  notificationId: string;
  centreKey: number;
  centreName: string;
  windowKey: string;
  recommendation: string;
  message: string;
  priority: number;
  openPlaces: number;
  actionableWaitlist: number;
  waitlistCount: number;
  replacementPressure: number;
  activeCampaignCount: number;
  spend30d: number;
};

export type MetaRecommendationNotificationView = MetaRecommendationNotificationInput & {
  firstSeenAt: string;
  lastSeenAt: string;
  dismissedAt: string | null;
};

export type MetaNotificationHistoryRow = {
  kind: "Notification" | "Note";
  centreKey: number;
  centreName: string;
  notificationId: string;
  heading: string;
  message: string;
  status: "Active" | "Dismissed";
  openPlaces: string;
  waitlist: string;
  pressure: string;
  occurredAt: string;
};

export type MetaNotificationHistoryKind = MetaNotificationHistoryRow["kind"];

export type MetaNotificationHistoryCentreOption = {
  centreKey: number;
  centreName: string;
};

export type MetaNotificationHistoryPage = {
  rows: MetaNotificationHistoryRow[];
  centreOptions: MetaNotificationHistoryCentreOption[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};

function createMetaNotificationId(row: AnalyticsRow, selectedWindowKey: WindowKey, recommendation: string) {
  return [
    "meta-ads",
    selectedWindowKey,
    row.centreKey,
    recommendation.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  ].join(":");
}

function getScopedReplacementPressure(row: AnalyticsRow, windowKey: WindowKey) {
  return row.replacementPressureCountsByWindow?.[windowKey] ?? (
    row.agedOutCount +
    row.knownLeavingCountsByWindow[windowKey] +
    row.approachingFiveCountsByWindow[windowKey]
  );
}

function getMetaRecommendation(
  row: AnalyticsRow,
  selectedWindowKey: WindowKey,
  coverage: Map<number, MetaAdsDashboardData["centreCoverage"][number]>,
) {
  const centreCoverage = coverage.get(row.centreKey);
  const openPlaces = Math.max(row.licensedCapacity - row.enrolledCount, 0);
  const actionableWaitlist = estimateActionableWaitlistCount(row);
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

  return activeCampaignCount > 0 ? "Covered by ads" : "Watch";
}

function getPriority(recommendation: string) {
  if (recommendation === "Needs ads" || recommendation === "Prepare campaign") {
    return 3;
  }

  if (recommendation === "Ads active, monitor" || recommendation === "Review spend") {
    return 2;
  }

  return 1;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

function mapNotification(notification: {
  notificationId: string;
  centreKey: number;
  centreName: string;
  windowKey: string;
  recommendation: string;
  message: string;
  priority: number;
  openPlaces: number;
  actionableWaitlist: number;
  waitlistCount: number;
  replacementPressure: number;
  activeCampaignCount: number;
  spend30d: { toString(): string };
  firstSeenAt: Date;
  lastSeenAt: Date;
  dismissedAt: Date | null;
}): MetaRecommendationNotificationView {
  return {
    notificationId: notification.notificationId,
    centreKey: notification.centreKey,
    centreName: notification.centreName,
    windowKey: notification.windowKey,
    recommendation: notification.recommendation,
    message: notification.message,
    priority: notification.priority,
    openPlaces: notification.openPlaces,
    actionableWaitlist: notification.actionableWaitlist,
    waitlistCount: notification.waitlistCount,
    replacementPressure: notification.replacementPressure,
    activeCampaignCount: notification.activeCampaignCount,
    spend30d: Number(notification.spend30d.toString()),
    firstSeenAt: notification.firstSeenAt.toISOString(),
    lastSeenAt: notification.lastSeenAt.toISOString(),
    dismissedAt: notification.dismissedAt?.toISOString() ?? null,
  };
}

export function buildMetaRecommendationNotificationInputs(
  snapshotSet: LatestSnapshotSet | null,
  selectedWindowKey: WindowKey,
  metaAdsDashboardData?: MetaAdsDashboardData | null,
) {
  const coverage = new Map((metaAdsDashboardData?.centreCoverage ?? []).map((row) => [row.centreKey, row]));

  return (snapshotSet?.snapshots ?? [])
    .map((row): MetaRecommendationNotificationInput => {
      const centreCoverage = coverage.get(row.centreKey);
      const recommendation = getMetaRecommendation(row, selectedWindowKey, coverage);
      const openPlaces = Math.max(row.licensedCapacity - row.enrolledCount, 0);
      const actionableWaitlist = estimateActionableWaitlistCount(row);

      return {
        notificationId: createMetaNotificationId(row, selectedWindowKey, recommendation),
        centreKey: row.centreKey,
        centreName: row.serviceName,
        windowKey: selectedWindowKey,
        recommendation,
        message: `${row.serviceName}: ${openPlaces} open, ${actionableWaitlist}/${row.waitlistCount} actionable waitlist, ${getScopedReplacementPressure(row, selectedWindowKey)} pressure, ${centreCoverage?.activeCampaignCount ?? 0} active campaigns, ${formatMoney(centreCoverage?.spend30d ?? 0)} spend.`,
        priority: getPriority(recommendation),
        openPlaces,
        actionableWaitlist,
        waitlistCount: row.waitlistCount,
        replacementPressure: getScopedReplacementPressure(row, selectedWindowKey),
        activeCampaignCount: centreCoverage?.activeCampaignCount ?? 0,
        spend30d: centreCoverage?.spend30d ?? 0,
      };
    })
    .filter((notification) => notification.priority > 1);
}

export async function syncMetaRecommendationNotifications(notifications: MetaRecommendationNotificationInput[]) {
  const now = new Date();

  for (const notification of notifications) {
    await upsertMetaRecommendationNotification(notification, now);
  }
}

export async function upsertMetaRecommendationNotification(
  notification: MetaRecommendationNotificationInput,
  now = new Date(),
) {
  return db.metaRecommendationNotification.upsert({
    where: {
      notificationId: notification.notificationId,
    },
    create: {
      ...notification,
      lastSeenAt: now,
    },
    update: {
      centreKey: notification.centreKey,
      centreName: notification.centreName,
      windowKey: notification.windowKey,
      recommendation: notification.recommendation,
      message: notification.message,
      priority: notification.priority,
      openPlaces: notification.openPlaces,
      actionableWaitlist: notification.actionableWaitlist,
      waitlistCount: notification.waitlistCount,
      replacementPressure: notification.replacementPressure,
      activeCampaignCount: notification.activeCampaignCount,
      spend30d: notification.spend30d,
      lastSeenAt: now,
    },
  });
}

export async function readMetaRecommendationNotifications() {
  const notifications = await db.metaRecommendationNotification.findMany({
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
  });

  return notifications.map(mapNotification);
}

export async function countMetaRecommendationNotifications() {
  return db.metaRecommendationNotification.count();
}

type RawMetaHistoryRow = {
  kind: "Notification" | "Note";
  centreKey: number;
  centreName: string;
  notificationId: string;
  heading: string;
  message: string;
  status: "Active" | "Dismissed";
  openPlaces: string | number | null;
  waitlist: string | null;
  pressure: string | number | null;
  occurredAt: Date;
  totalRows: bigint | number;
};

function mapHistoryRow(row: RawMetaHistoryRow): MetaNotificationHistoryRow {
  return {
    kind: row.kind,
    centreKey: row.centreKey,
    centreName: row.centreName,
    notificationId: row.notificationId,
    heading: row.heading,
    message: row.message,
    status: row.status,
    openPlaces: row.openPlaces == null ? "" : String(row.openPlaces),
    waitlist: row.waitlist ?? "",
    pressure: row.pressure == null ? "" : String(row.pressure),
    occurredAt: row.occurredAt.toISOString(),
  };
}

export async function readMetaNotificationHistoryPage(input?: {
  page?: number;
  pageSize?: number;
  centreKey?: number | null;
  kind?: MetaNotificationHistoryKind | null;
}): Promise<MetaNotificationHistoryPage> {
  const page = Math.max(1, Math.trunc(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(input?.pageSize ?? 25)));
  const centreKey = Number.isInteger(input?.centreKey) ? input?.centreKey ?? null : null;
  const kind = input?.kind === "Notification" || input?.kind === "Note" ? input.kind : null;
  const offset = (page - 1) * pageSize;
  const centreFilter = centreKey == null ? Prisma.empty : Prisma.sql`WHERE "centreKey" = ${centreKey}`;
  const noteCentreFilter = centreKey == null ? Prisma.empty : Prisma.sql`AND notification."centreKey" = ${centreKey}`;
  const kindFilter = kind == null ? Prisma.empty : Prisma.sql`WHERE "kind" = ${kind}`;
  const rows = await db.$queryRaw<RawMetaHistoryRow[]>`
    WITH history AS (
      SELECT
        'Notification'::text AS "kind",
        "centreKey",
        "centreName",
        "notificationId",
        "recommendation" AS "heading",
        "message",
        CASE WHEN "dismissedAt" IS NULL THEN 'Active' ELSE 'Dismissed' END AS "status",
        "openPlaces"::text AS "openPlaces",
        ("actionableWaitlist"::text || '/' || "waitlistCount"::text) AS "waitlist",
        "replacementPressure"::text AS "pressure",
        "lastSeenAt" AS "occurredAt",
        "id" AS "sortId"
      FROM "MetaRecommendationNotification"
      ${centreFilter}
      UNION ALL
      SELECT
        'Note'::text AS "kind",
        notification."centreKey",
        notification."centreName",
        notification."notificationId",
        notification."recommendation" AS "heading",
        note."text" AS "message",
        CASE WHEN notification."dismissedAt" IS NULL THEN 'Active' ELSE 'Dismissed' END AS "status",
        '' AS "openPlaces",
        '' AS "waitlist",
        '' AS "pressure",
        note."submittedAt" AS "occurredAt",
        note."id" AS "sortId"
      FROM "MetaRecommendationNote" note
      INNER JOIN "MetaRecommendationNotification" notification
        ON notification."notificationId" = note."notificationId"
      WHERE note."deletedAt" IS NULL
      ${noteCentreFilter}
    )
    SELECT *, COUNT(*) OVER() AS "totalRows"
    FROM history
    ${kindFilter}
    ORDER BY "occurredAt" DESC, "sortId" DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
  const centreOptions = await db.metaRecommendationNotification.findMany({
    distinct: ["centreKey"],
    select: {
      centreKey: true,
      centreName: true,
    },
    orderBy: [{ centreName: "asc" }],
  });
  const totalRows = Number(rows[0]?.totalRows ?? 0);

  return {
    rows: rows.map(mapHistoryRow),
    centreOptions,
    page,
    pageSize,
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

export async function readLatestMetaRecommendationNotesForCentre(centreKey: number, limit = 3) {
  const rows = await db.$queryRaw<RawMetaHistoryRow[]>`
    SELECT
      'Note'::text AS "kind",
      notification."centreKey",
      notification."centreName",
      notification."notificationId",
      notification."recommendation" AS "heading",
      note."text" AS "message",
      CASE WHEN notification."dismissedAt" IS NULL THEN 'Active' ELSE 'Dismissed' END AS "status",
      '' AS "openPlaces",
      '' AS "waitlist",
      '' AS "pressure",
      note."submittedAt" AS "occurredAt",
      0::bigint AS "totalRows"
    FROM "MetaRecommendationNote" note
    INNER JOIN "MetaRecommendationNotification" notification
      ON notification."notificationId" = note."notificationId"
    WHERE note."deletedAt" IS NULL
      AND notification."centreKey" = ${centreKey}
    ORDER BY note."submittedAt" DESC, note."id" DESC
    LIMIT ${Math.max(1, Math.min(10, Math.trunc(limit)))}
  `;

  return rows.map(mapHistoryRow);
}

export async function dismissMetaRecommendationNotification(notificationId: string) {
  const notification = await db.metaRecommendationNotification.update({
    where: { notificationId },
    data: {
      dismissedAt: new Date(),
    },
  });

  return mapNotification(notification);
}
