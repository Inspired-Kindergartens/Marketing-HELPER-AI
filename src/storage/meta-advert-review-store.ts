import { Prisma, type PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import {
  ADVERT_VERDICT_WORDS,
  formatAdvertReviewNote,
  type AdvertAdSet,
  type AdvertDeliveryDay,
  type AdvertReview,
  type AdvertVerdict,
  type RollMonthRecord,
  type WaitlistPoint,
} from "../analytics/meta-advert-review.js";
import { prisma } from "../db.js";

const db = prisma as GeneratedPrismaClient;

// The heading the review's notification and note carry in Notes and the
// notification history.
export const ADVERT_REVIEW_HEADING = "Advert review";

function mapReview(record: {
  reviewId: string;
  centreKey: number;
  adSetNames: string[];
  startDate: Date;
  endDate: Date;
  measuredAt: Date;
  spend: Prisma.Decimal | null;
  clicks: number | null;
  rollBeforeMonth: string | null;
  rollBefore: number | null;
  rollAfterMonth: string | null;
  rollAfter: number | null;
  networkChange: number | null;
  waitlistBeforeAt: Date | null;
  waitlistBefore: number | null;
  waitlistAfterAt: Date | null;
  waitlistAfter: number | null;
  verdict: string;
}): AdvertReview {
  return {
    reviewId: record.reviewId,
    centreKey: record.centreKey,
    adSetNames: record.adSetNames,
    start: record.startDate,
    end: record.endDate,
    measuredAt: record.measuredAt,
    spend: record.spend == null ? null : Number(record.spend.toString()),
    clicks: record.clicks,
    rollBeforeMonth: record.rollBeforeMonth,
    rollBefore: record.rollBefore,
    rollAfterMonth: record.rollAfterMonth,
    rollAfter: record.rollAfter,
    networkChange: record.networkChange,
    waitlistBeforeAt: record.waitlistBeforeAt,
    waitlistBefore: record.waitlistBefore,
    waitlistAfterAt: record.waitlistAfterAt,
    waitlistAfter: record.waitlistAfter,
    verdict: (record.verdict in ADVERT_VERDICT_WORDS ? record.verdict : "not-well") as AdvertVerdict,
  };
}

export async function readMetaAdvertReviews(centreKey?: number | null): Promise<AdvertReview[]> {
  const records = await db.metaAdvertReview.findMany({
    where: centreKey == null ? {} : { centreKey },
    orderBy: [{ endDate: "asc" }, { id: "asc" }],
  });
  return records.map(mapReview);
}

export async function readMetaAdvertReviewIds(): Promise<Set<string>> {
  const records = await db.metaAdvertReview.findMany({ select: { reviewId: true } });
  return new Set(records.map((record) => record.reviewId));
}

// Saves the review and adds its note to the centre through the existing Meta
// notes (a notification row under the review id carries the centre). The note
// is dated when the result became measurable, so a backfilled old run sorts
// into history instead of looking new.
export async function saveMetaAdvertReview(review: AdvertReview, centreName: string, now = new Date()) {
  const noteText = formatAdvertReviewNote(review);
  const notedAt = review.measuredAt < now ? review.measuredAt : now;
  const waitlistCount = review.waitlistAfter ?? review.waitlistBefore ?? 0;

  await db.$transaction([
    db.metaAdvertReview.create({
      data: {
        reviewId: review.reviewId,
        centreKey: review.centreKey,
        adSetNames: review.adSetNames,
        startDate: review.start,
        endDate: review.end,
        measuredAt: review.measuredAt,
        spend: review.spend,
        clicks: review.clicks,
        rollBeforeMonth: review.rollBeforeMonth,
        rollBefore: review.rollBefore,
        rollAfterMonth: review.rollAfterMonth,
        rollAfter: review.rollAfter,
        networkChange: review.networkChange,
        waitlistBeforeAt: review.waitlistBeforeAt,
        waitlistBefore: review.waitlistBefore,
        waitlistAfterAt: review.waitlistAfterAt,
        waitlistAfter: review.waitlistAfter,
        verdict: review.verdict,
      },
    }),
    db.metaRecommendationNotification.upsert({
      where: { notificationId: review.reviewId },
      create: {
        notificationId: review.reviewId,
        centreKey: review.centreKey,
        centreName,
        windowKey: "review",
        recommendation: ADVERT_REVIEW_HEADING,
        message: `${centreName}: Meta advert ${ADVERT_VERDICT_WORDS[review.verdict]}.`,
        priority: 0,
        openPlaces: 0,
        actionableWaitlist: 0,
        waitlistCount,
        replacementPressure: 0,
        activeCampaignCount: 0,
        spend30d: review.spend ?? 0,
        firstSeenAt: notedAt,
        lastSeenAt: notedAt,
      },
      update: {},
    }),
    db.metaRecommendationNote.create({
      data: { notificationId: review.reviewId, text: noteText, submittedAt: notedAt },
    }),
  ]);
}

// --- Inputs for the review run ------------------------------------------------

export async function readAdvertAdSets(): Promise<AdvertAdSet[]> {
  const records = await db.metaAdSet.findMany({
    where: { centreKey: { not: null } },
    select: {
      metaAdSetId: true,
      name: true,
      centreKey: true,
      startTime: true,
      endTime: true,
      campaign: { select: { name: true } },
    },
  });
  return records.map((record) => ({
    metaAdSetId: record.metaAdSetId,
    name: record.name,
    campaignName: record.campaign?.name ?? null,
    centreKey: record.centreKey!,
    startTime: record.startTime,
    endTime: record.endTime,
  }));
}

// Each pull stores the last 30 days again, so take the newest pull per day.
export async function readAdvertDelivery(): Promise<{ days: AdvertDeliveryDay[]; coverageStart: Date | null; coverageEnd: Date | null }> {
  const rows = await db.$queryRaw<{ metaAdSetId: string; insightDate: Date; spend: Prisma.Decimal | null; clicks: number | null }[]>`
    SELECT DISTINCT ON ("metaAdSetId", "insightDate")
      "metaAdSetId", "insightDate", "spend", "clicks"
    FROM "MetaInsightSnapshot"
    WHERE "level" = 'adset' AND "metaAdSetId" IS NOT NULL
    ORDER BY "metaAdSetId", "insightDate", "pulledAt" DESC
  `;
  const range = await db.metaInsightSnapshot.aggregate({ _min: { insightDate: true }, _max: { insightDate: true } });
  return {
    days: rows.map((row) => ({
      metaAdSetId: row.metaAdSetId,
      date: row.insightDate,
      spend: row.spend == null ? 0 : Number(row.spend.toString()),
      clicks: row.clicks ?? 0,
    })),
    coverageStart: range._min.insightDate,
    coverageEnd: range._max.insightDate,
  };
}

export async function readAdvertRollMonths(): Promise<RollMonthRecord[]> {
  return db.centreMonthlyRoll.findMany({
    select: { centreKey: true, month: true, openDays: true, avgPlacements: true, avgLicence: true, avgLicenceU2: true, complete: true },
  });
}

export async function readAdvertWaitlistPoints(centreKeys: readonly number[]): Promise<WaitlistPoint[]> {
  if (centreKeys.length === 0) return [];
  const records = await db.serviceAnalyticsSnapshot.findMany({
    where: { centreKey: { in: [...centreKeys] } },
    select: { centreKey: true, date: true, waitlistCount: true },
    orderBy: [{ date: "asc" }],
  });
  return records;
}
