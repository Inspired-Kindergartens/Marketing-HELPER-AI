import { prisma } from "../db.js";
import type { MatchableCentre } from "../meta/centre-match.js";
import { matchMailchimpCampaignToCentre } from "./centre-match.js";
import { MailchimpClient } from "./client.js";
import type { MailchimpConfig } from "./config.js";
import {
  readLatestMailchimpPulledAt,
  readMailchimpListGrowthSnapshotForDate,
  upsertMailchimpCampaign,
  upsertMailchimpCampaignReport,
  upsertMailchimpListGrowthSnapshot,
} from "../storage/mailchimp-store.js";

export type MailchimpRefreshResult = {
  pulledAt: string;
  campaigns: number;
  reports: number;
  lists: number;
  listGrowthSnapshots: number;
};

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isSentStatus(status: string | undefined | null) {
  if (!status) return false;
  return status === "sent" || status === "sending" || status === "schedule";
}

async function loadMatchableCentres(): Promise<MatchableCentre[]> {
  return prisma.centreReference.findMany({
    where: { ignored: false, openStatus: "Open" },
    select: { centreKey: true, name: true },
  });
}

export async function refreshMailchimpSnapshot(config: MailchimpConfig): Promise<MailchimpRefreshResult> {
  const client = new MailchimpClient(config);
  const pulledAt = new Date();
  const snapshotDate = toUtcDateOnly(pulledAt);
  const centres = await loadMatchableCentres();
  const result: MailchimpRefreshResult = {
    pulledAt: pulledAt.toISOString(),
    campaigns: 0,
    reports: 0,
    lists: 0,
    listGrowthSnapshots: 0,
  };

  const campaigns = await client.listCampaigns();

  for (const campaign of campaigns) {
    const centreKey = matchMailchimpCampaignToCentre(
      {
        subject: campaign.settings?.subject_line ?? null,
        title: campaign.settings?.title ?? null,
        previewText: campaign.settings?.preview_text ?? null,
        listName: campaign.recipients?.list_name ?? null,
        segmentText: campaign.recipients?.segment_text ?? null,
      },
      centres,
    )?.centreKey ?? null;

    await upsertMailchimpCampaign({
      mailchimpId: campaign.id,
      serverPrefix: config.serverPrefix,
      listId: campaign.recipients?.list_id ?? null,
      centreKey,
      subject: campaign.settings?.subject_line ?? null,
      previewText: campaign.settings?.preview_text ?? null,
      status: campaign.status ?? null,
      type: campaign.type ?? null,
      archiveUrl: campaign.long_archive_url ?? campaign.archive_url ?? null,
      sendTime: campaign.send_time ?? null,
      emailsSent: campaign.emails_sent ?? 0,
      pulledAt,
    });
    result.campaigns += 1;

    if (isSentStatus(campaign.status)) {
      try {
        const report = await client.getCampaignReport(campaign.id);

        await upsertMailchimpCampaignReport({
          mailchimpId: campaign.id,
          opens: report.opens?.opens_total ?? 0,
          uniqueOpens: report.opens?.unique_opens ?? 0,
          openRate: report.opens?.open_rate ?? 0,
          clicks: report.clicks?.clicks_total ?? 0,
          uniqueClicks: report.clicks?.unique_clicks ?? 0,
          clickRate: report.clicks?.click_rate ?? 0,
          unsubscribes: report.unsubscribed ?? 0,
          bounces:
            (report.bounces?.hard_bounces ?? 0) +
            (report.bounces?.soft_bounces ?? 0) +
            (report.bounces?.syntax_errors ?? 0),
          abuseReports: report.abuse_reports ?? 0,
          forwardCount: report.forwards?.forwards_count ?? 0,
          sendTime: report.send_time ?? campaign.send_time ?? null,
          fetchedAt: pulledAt,
          raw: report,
        });
        result.reports += 1;
      } catch {
        // Reports endpoint can 404 for very-recently-sent or draft campaigns;
        // skip silently so one bad campaign doesn't fail the whole snapshot.
      }
    }
  }

  const lists = await client.listLists();
  result.lists = lists.length;

  for (const list of lists) {
    const stats = list.stats ?? {};
    await upsertMailchimpListGrowthSnapshot({
      serverPrefix: config.serverPrefix,
      listId: list.id,
      snapshotDate,
      memberCount: stats.member_count ?? 0,
      subscribed: stats.member_count_since_send ?? 0,
      unsubscribed: stats.unsubscribe_count ?? 0,
      cleaned: stats.cleaned_count ?? 0,
      pending: 0,
      pulledAt,
      raw: list,
    });
    result.listGrowthSnapshots += 1;
  }

  return result;
}

export async function ensureDailyMailchimpSnapshot(
  config: MailchimpConfig,
  referenceDate = new Date(),
): Promise<MailchimpRefreshResult | null> {
  const lists = await prisma.mailchimpListGrowthSnapshot.findFirst({
    where: {
      serverPrefix: config.serverPrefix,
      snapshotDate: toUtcDateOnly(referenceDate),
    },
    select: { id: true },
  });

  if (lists) {
    const latestPulledAt = await readLatestMailchimpPulledAt(config.serverPrefix);

    return {
      pulledAt: latestPulledAt ?? new Date().toISOString(),
      campaigns: 0,
      reports: 0,
      lists: 0,
      listGrowthSnapshots: 0,
    };
  }

  return refreshMailchimpSnapshot(config);
}

export async function hasMailchimpListGrowthSnapshotForDate(
  serverPrefix: string,
  listId: string,
  date: Date,
) {
  const record = await readMailchimpListGrowthSnapshotForDate(serverPrefix, listId, date);
  return record != null;
}
