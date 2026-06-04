import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";

const db = prisma as GeneratedPrismaClient;

export type MailchimpCampaignUpsertInput = {
  mailchimpId: string;
  serverPrefix: string;
  listId?: string | null;
  subject?: string | null;
  previewText?: string | null;
  status?: string | null;
  type?: string | null;
  archiveUrl?: string | null;
  sendTime?: string | Date | null;
  emailsSent?: number | null;
  pulledAt: string | Date;
};

export type MailchimpCampaignReportSnapshotInput = {
  mailchimpId: string;
  opens?: number | null;
  uniqueOpens?: number | null;
  openRate?: number | null;
  clicks?: number | null;
  uniqueClicks?: number | null;
  clickRate?: number | null;
  unsubscribes?: number | null;
  bounces?: number | null;
  abuseReports?: number | null;
  forwardCount?: number | null;
  sendTime?: string | Date | null;
  fetchedAt: string | Date;
  raw?: unknown;
};

export type MailchimpListGrowthSnapshotInput = {
  serverPrefix: string;
  listId: string;
  snapshotDate: string | Date;
  memberCount?: number | null;
  subscribed?: number | null;
  unsubscribed?: number | null;
  cleaned?: number | null;
  pending?: number | null;
  pulledAt: string | Date;
  raw?: unknown;
};

export type MailchimpCampaignView = {
  mailchimpId: string;
  serverPrefix: string;
  listId: string | null;
  subject: string;
  previewText: string;
  status: string | null;
  type: string | null;
  archiveUrl: string | null;
  sendTime: string | null;
  emailsSent: number;
  pulledAt: string;
  report: {
    opens: number;
    uniqueOpens: number;
    openRate: number;
    clicks: number;
    uniqueClicks: number;
    clickRate: number;
    unsubscribes: number;
    bounces: number;
    abuseReports: number;
    forwardCount: number;
    sendTime: string | null;
    fetchedAt: string;
  } | null;
};

export type MailchimpListGrowthSnapshotView = {
  serverPrefix: string;
  listId: string;
  listName: string;
  snapshotDate: string;
  memberCount: number;
  subscribed: number;
  unsubscribed: number;
  cleaned: number;
  pending: number;
  pulledAt: string;
};

export type MailchimpDashboardData = {
  campaigns: MailchimpCampaignView[];
  listGrowth: MailchimpListGrowthSnapshotView[];
  latestPulledAt: string | null;
};

function toDateOnly(value: string | Date) {
  const date = new Date(value);

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toJson(value: unknown) {
  if (value == null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toNumber(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function toOptionalDate(value: string | Date | null | undefined) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function listNameFromRaw(raw: Prisma.JsonValue | null | undefined) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "Unnamed audience";
  }

  const name = raw.name;
  return typeof name === "string" && name.trim() ? name.trim() : "Unnamed audience";
}

export async function upsertMailchimpCampaign(input: MailchimpCampaignUpsertInput) {
  const pulledAt = new Date(input.pulledAt);
  const sendTime = toOptionalDate(input.sendTime ?? null);
  const data = {
    serverPrefix: input.serverPrefix,
    listId: input.listId ?? null,
    subject: input.subject ?? "",
    previewText: input.previewText ?? "",
    status: input.status ?? null,
    type: input.type ?? null,
    archiveUrl: input.archiveUrl ?? null,
    sendTime,
    emailsSent: input.emailsSent ?? 0,
    pulledAt,
  };

  return db.mailchimpCampaign.upsert({
    where: { mailchimpId: input.mailchimpId },
    create: { mailchimpId: input.mailchimpId, ...data },
    update: data,
  });
}

export async function createMailchimpCampaignReportSnapshot(input: MailchimpCampaignReportSnapshotInput) {
  const fetchedAt = new Date(input.fetchedAt);
  const sendTime = toOptionalDate(input.sendTime ?? null);
  const data = {
    opens: input.opens ?? 0,
    uniqueOpens: input.uniqueOpens ?? 0,
    openRate: input.openRate ?? 0,
    clicks: input.clicks ?? 0,
    uniqueClicks: input.uniqueClicks ?? 0,
    clickRate: input.clickRate ?? 0,
    unsubscribes: input.unsubscribes ?? 0,
    bounces: input.bounces ?? 0,
    abuseReports: input.abuseReports ?? 0,
    forwardCount: input.forwardCount ?? 0,
    sendTime,
    fetchedAt,
    raw: toJson(input.raw),
  };

  return db.mailchimpCampaignReport.create({
    data: { mailchimpId: input.mailchimpId, ...data },
  });
}

export async function createMailchimpListGrowthSnapshot(input: MailchimpListGrowthSnapshotInput) {
  const snapshotDate = toDateOnly(input.snapshotDate);
  const pulledAt = new Date(input.pulledAt);
  const data = {
    memberCount: input.memberCount ?? 0,
    subscribed: input.subscribed ?? 0,
    unsubscribed: input.unsubscribed ?? 0,
    cleaned: input.cleaned ?? 0,
    pending: input.pending ?? 0,
    pulledAt,
    raw: toJson(input.raw),
  };

  return db.mailchimpListGrowthSnapshot.create({
    data: {
      serverPrefix: input.serverPrefix,
      listId: input.listId,
      snapshotDate,
      ...data,
    },
  });
}

export async function readMailchimpDashboardData(
  options: { fromDate?: string | Date; toDate?: string | Date; serverPrefix?: string } = {},
): Promise<MailchimpDashboardData> {
  const fromDate = options.fromDate ? new Date(options.fromDate) : null;
  const toDate = options.toDate ? new Date(options.toDate) : null;
  const sendTimeFilter: Prisma.DateTimeNullableFilter | undefined =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;

  const campaigns = await db.mailchimpCampaign.findMany({
    where: {
      ...(options.serverPrefix ? { serverPrefix: options.serverPrefix } : {}),
      ...(sendTimeFilter ? { sendTime: sendTimeFilter } : {}),
    },
    orderBy: [{ sendTime: { sort: "desc", nulls: "last" } }, { pulledAt: "desc" }],
    include: {
      reports: {
        orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
    take: 200,
  });

  const listGrowth = await db.mailchimpListGrowthSnapshot.findMany({
    where: {
      ...(options.serverPrefix ? { serverPrefix: options.serverPrefix } : {}),
      ...(fromDate || toDate
        ? {
            snapshotDate: {
              ...(fromDate ? { gte: toDateOnly(fromDate) } : {}),
              ...(toDate ? { lte: toDateOnly(toDate) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ listId: "asc" }, { snapshotDate: "asc" }],
  });

  const latestPulledAt = await db.mailchimpCampaign.findFirst({
    where: options.serverPrefix ? { serverPrefix: options.serverPrefix } : undefined,
    orderBy: { pulledAt: "desc" },
    select: { pulledAt: true },
  });

  return {
    campaigns: campaigns.map((campaign) => ({
      mailchimpId: campaign.mailchimpId,
      serverPrefix: campaign.serverPrefix,
      listId: campaign.listId,
      subject: campaign.subject,
      previewText: campaign.previewText,
      status: campaign.status,
      type: campaign.type,
      archiveUrl: campaign.archiveUrl,
      sendTime: campaign.sendTime?.toISOString() ?? null,
      emailsSent: campaign.emailsSent,
      pulledAt: campaign.pulledAt.toISOString(),
      report: campaign.reports[0]
        ? {
            opens: campaign.reports[0].opens,
            uniqueOpens: campaign.reports[0].uniqueOpens,
            openRate: toNumber(campaign.reports[0].openRate),
            clicks: campaign.reports[0].clicks,
            uniqueClicks: campaign.reports[0].uniqueClicks,
            clickRate: toNumber(campaign.reports[0].clickRate),
            unsubscribes: campaign.reports[0].unsubscribes,
            bounces: campaign.reports[0].bounces,
            abuseReports: campaign.reports[0].abuseReports,
            forwardCount: campaign.reports[0].forwardCount,
            sendTime: campaign.reports[0].sendTime?.toISOString() ?? null,
            fetchedAt: campaign.reports[0].fetchedAt.toISOString(),
          }
        : null,
    })),
    listGrowth: listGrowth.map((entry) => ({
      serverPrefix: entry.serverPrefix,
      listId: entry.listId,
      listName: listNameFromRaw(entry.raw),
      snapshotDate: entry.snapshotDate.toISOString(),
      memberCount: entry.memberCount,
      subscribed: entry.subscribed,
      unsubscribed: entry.unsubscribed,
      cleaned: entry.cleaned,
      pending: entry.pending,
      pulledAt: entry.pulledAt.toISOString(),
    })),
    latestPulledAt: latestPulledAt?.pulledAt?.toISOString() ?? null,
  };
}

export async function readLatestMailchimpPulledAt(serverPrefix?: string) {
  const record = await db.mailchimpCampaign.findFirst({
    where: serverPrefix ? { serverPrefix } : undefined,
    orderBy: { pulledAt: "desc" },
    select: { pulledAt: true },
  });

  return record?.pulledAt?.toISOString() ?? null;
}

export async function readMailchimpListGrowthSnapshotForDate(
  serverPrefix: string,
  listId: string,
  snapshotDate: string | Date,
) {
  return db.mailchimpListGrowthSnapshot.findFirst({
    where: {
      serverPrefix,
      listId,
      snapshotDate: toDateOnly(snapshotDate),
    },
    orderBy: [{ pulledAt: "desc" }, { createdAt: "desc" }],
  });
}
