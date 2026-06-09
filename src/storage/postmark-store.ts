import { prisma } from "../db.js";
import type { MatchableCentre } from "../meta/centre-match.js";
import { matchPostmarkEventToCentre } from "../postmark/centre-match.js";

export const POSTMARK_MESSAGES_PAGE_SIZE = 10;
const POSTMARK_WEBHOOK_STALE_MS = 24 * 60 * 60 * 1000;
const POSTMARK_WEBHOOK_GAP_MS = 48 * 60 * 60 * 1000;

export type PostmarkWebhookCheckStatus = "ok" | "stale" | "gap" | "empty";

export type PostmarkWebhookCheck = {
  checkedAt: string;
  status: PostmarkWebhookCheckStatus;
  message: string;
  latestOccurredAt: string | null;
  latestReceivedAt: string | null;
  hoursSinceLatestReceived: number | null;
  eventsLast24h: number;
  eventsLast48h: number;
};

export type PostmarkMessageView = {
  messageId: string;
  recipient: string | null;
  tag: string | null;
  centreKey: number | null;
  centreName: string | null;
  category: "centre" | "office-staff";
  latestOccurredAt: string;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
};

export type PostmarkCentreActivityView = {
  centreKey: number;
  centreName: string;
  delivered: number;
  opened: number;
  bounced: number;
  lastSentAt: string | null;
};

export type PostmarkDashboardData = {
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  latestReceivedAt: string | null;
  webhookCheck?: PostmarkWebhookCheck;
  recentMessages: PostmarkMessageView[];
  relevantMessageCount: number;
  centreMessageCount: number;
  officeStaffMessageCount: number;
  messagePage: number;
  messagePageSize: number;
  messagePageCount: number;
  centreActivity: PostmarkCentreActivityView[];
};

function countByType(
  rows: { eventType: string }[],
  eventType: string,
) {
  return rows.filter((row) => row.eventType === eventType).length;
}

function positivePage(page: number | undefined) {
  return Number.isSafeInteger(page) && Number(page) > 0 ? Number(page) : 1;
}

type RelevantEvent = {
  messageId: string;
  eventType: string;
  recipient: string | null;
  tag: string | null;
  occurredAt: Date;
  centreKey: number | null;
  centreName: string | null;
  category: "centre" | "office-staff";
};

function resolveCentre(
  event: { centreKey: number | null; centre: { name: string } | null; tag: string | null; recipient: string | null },
  centres: readonly MatchableCentre[],
) {
  if (event.centreKey != null && event.centre) {
    return { centreKey: event.centreKey, centreName: event.centre.name };
  }

  return matchPostmarkEventToCentre({ tag: event.tag, recipient: event.recipient }, centres);
}

function isOfficeStaffRecipient(recipient: string | null) {
  return /@ikindergartens\.nz$/i.test(recipient ?? "");
}

export async function readPostmarkWebhookCheck(now = new Date()): Promise<PostmarkWebhookCheck> {
  const since24h = new Date(now.getTime() - POSTMARK_WEBHOOK_STALE_MS);
  const since48h = new Date(now.getTime() - POSTMARK_WEBHOOK_GAP_MS);
  const [latestReceived, latestOccurred, eventsLast24h, eventsLast48h] = await Promise.all([
    prisma.postmarkMessageEvent.findFirst({
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      select: { receivedAt: true },
    }),
    prisma.postmarkMessageEvent.findFirst({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { occurredAt: true },
    }),
    prisma.postmarkMessageEvent.count({ where: { receivedAt: { gte: since24h } } }),
    prisma.postmarkMessageEvent.count({ where: { receivedAt: { gte: since48h } } }),
  ]);

  if (!latestReceived) {
    return {
      checkedAt: now.toISOString(),
      status: "empty",
      message: "No Postmark webhook events have been received yet.",
      latestOccurredAt: null,
      latestReceivedAt: null,
      hoursSinceLatestReceived: null,
      eventsLast24h,
      eventsLast48h,
    };
  }

  const hoursSinceLatestReceived = Math.max(
    0,
    Math.round(((now.getTime() - latestReceived.receivedAt.getTime()) / (60 * 60 * 1000)) * 10) / 10,
  );
  const status: PostmarkWebhookCheckStatus =
    now.getTime() - latestReceived.receivedAt.getTime() >= POSTMARK_WEBHOOK_GAP_MS
      ? "gap"
      : now.getTime() - latestReceived.receivedAt.getTime() >= POSTMARK_WEBHOOK_STALE_MS
        ? "stale"
        : "ok";
  const message = status === "ok"
    ? `Postmark webhooks are current. ${eventsLast24h} event${eventsLast24h === 1 ? "" : "s"} received in the last 24 hours.`
    : status === "stale"
      ? `No Postmark webhook events have been received for ${hoursSinceLatestReceived} hours. Check Postmark activity if messages were sent.`
      : `No Postmark webhook events have been received for ${hoursSinceLatestReceived} hours. Recent communications may need to be recovered from Postmark export.`;

  return {
    checkedAt: now.toISOString(),
    status,
    message,
    latestOccurredAt: latestOccurred?.occurredAt.toISOString() ?? null,
    latestReceivedAt: latestReceived.receivedAt.toISOString(),
    hoursSinceLatestReceived,
    eventsLast24h,
    eventsLast48h,
  };
}

export async function readPostmarkDashboardData(options: {
  messagePage?: number;
  fromDate?: Date;
  centreKeys?: number[] | null;
} = {}): Promise<PostmarkDashboardData> {
  const eventWhere = options.fromDate ? { occurredAt: { gte: options.fromDate } } : undefined;
  const [events, centres, latestActivity, webhookCheck] = await Promise.all([
    prisma.postmarkMessageEvent.findMany({
      where: eventWhere,
      include: { centre: { select: { name: true } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    prisma.centreReference.findMany({
      where: { ignored: false, openStatus: "Open" },
      select: { centreKey: true, name: true },
    }),
    prisma.postmarkMessageEvent.findFirst({
      where: eventWhere,
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
    readPostmarkWebhookCheck(),
  ]);
  const centreKeyFilter = Array.isArray(options.centreKeys)
    ? new Set(options.centreKeys)
    : null;
  const relevantEvents = events.flatMap((event): RelevantEvent[] => {
    const centre = resolveCentre(event, centres);

    if (centre) {
      if (centreKeyFilter && !centreKeyFilter.has(centre.centreKey)) {
        return [];
      }

      return [{
        messageId: event.messageId,
        eventType: event.eventType,
        recipient: event.recipient,
        tag: event.tag,
        occurredAt: event.occurredAt,
        centreKey: centre.centreKey,
        centreName: centre.centreName,
        category: "centre",
      }];
    }

    return isOfficeStaffRecipient(event.recipient)
      ? [{
          messageId: event.messageId,
          eventType: event.eventType,
          recipient: event.recipient,
          tag: event.tag,
          occurredAt: event.occurredAt,
          centreKey: null,
          centreName: null,
          category: "office-staff",
        }]
      : [];
  });
  const recentMessages = new Map<string, PostmarkMessageView>();

  for (const event of relevantEvents) {
    const message = recentMessages.get(event.messageId) ?? {
      messageId: event.messageId,
      recipient: event.recipient,
      tag: event.tag,
      centreKey: event.centreKey,
      centreName: event.centreName,
      category: event.category,
      latestOccurredAt: event.occurredAt.toISOString(),
      delivered: false,
      opened: false,
      clicked: false,
      bounced: false,
    };

    message.delivered ||= event.eventType === "Delivery";
    message.opened ||= event.eventType === "Open";
    message.clicked ||= event.eventType === "Click";
    message.bounced ||= event.eventType === "Bounce";
    recentMessages.set(event.messageId, message);
  }
  const messages = [...recentMessages.values()];
  const messagePageCount = Math.max(1, Math.ceil(messages.length / POSTMARK_MESSAGES_PAGE_SIZE));
  const messagePage = Math.min(positivePage(options.messagePage), messagePageCount);
  const startIndex = (messagePage - 1) * POSTMARK_MESSAGES_PAGE_SIZE;
  const centreActivityByKey = new Map<number, PostmarkCentreActivityView>();

  // Seed a zero row for every eligible centre so silent centres stay visible
  // (e.g. a broken mail service shows as 0 rather than vanishing from the list).
  for (const centre of centres) {
    if (centreKeyFilter && !centreKeyFilter.has(centre.centreKey)) {
      continue;
    }
    centreActivityByKey.set(centre.centreKey, {
      centreKey: centre.centreKey,
      centreName: centre.name,
      delivered: 0,
      opened: 0,
      bounced: 0,
      lastSentAt: null,
    });
  }

  for (const event of relevantEvents) {
    if (event.centreKey == null || event.centreName == null) {
      continue;
    }

    const row = centreActivityByKey.get(event.centreKey) ?? {
      centreKey: event.centreKey,
      centreName: event.centreName,
      delivered: 0,
      opened: 0,
      bounced: 0,
      lastSentAt: null as string | null,
    };

    if (event.eventType === "Delivery") {
      row.delivered += 1;
      const iso = event.occurredAt.toISOString();
      if (row.lastSentAt == null || iso > row.lastSentAt) {
        row.lastSentAt = iso;
      }
    }
    if (event.eventType === "Open") row.opened += 1;
    if (event.eventType === "Bounce") row.bounced += 1;
    centreActivityByKey.set(event.centreKey, row);
  }

  return {
    delivered: countByType(relevantEvents, "Delivery"),
    opened: countByType(relevantEvents, "Open"),
    clicked: countByType(relevantEvents, "Click"),
    bounced: countByType(relevantEvents, "Bounce"),
    latestReceivedAt: latestActivity?.occurredAt.toISOString() ?? null,
    webhookCheck,
    recentMessages: messages.slice(startIndex, startIndex + POSTMARK_MESSAGES_PAGE_SIZE),
    relevantMessageCount: messages.length,
    centreMessageCount: messages.filter((message) => message.category === "centre").length,
    officeStaffMessageCount: messages.filter((message) => message.category === "office-staff").length,
    messagePage,
    messagePageSize: POSTMARK_MESSAGES_PAGE_SIZE,
    messagePageCount,
    centreActivity: [...centreActivityByKey.values()]
      .sort((left, right) => left.centreName.localeCompare(right.centreName)),
  };
}
