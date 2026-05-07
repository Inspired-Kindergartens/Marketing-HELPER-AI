import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";
import { matchMetaNameToCentre, type MatchableCentre } from "./centre-match.js";
import { MetaAdsClient, type MetaInsightLevel } from "./client.js";
import type { MetaConfig } from "./config.js";

type MetaRefreshCounts = {
  accounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  campaignInsights: number;
  adSetInsights: number;
  adInsights: number;
};

export type MetaRefreshResult = MetaRefreshCounts & {
  pulledAt: string;
};

function normalizeAdAccountId(adAccountId: string) {
  return adAccountId.trim().replace(/^act_/, "");
}

function toStoredAdAccountId(adAccountId: string) {
  return `act_${normalizeAdAccountId(adAccountId)}`;
}

function parseMetaDate(value?: string) {
  return value ? new Date(value) : null;
}

function parseOptionalInt(value?: string) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDecimal(value?: string) {
  if (value == null || value.trim() === "") {
    return null;
  }

  return value;
}

function toJson(value: unknown) {
  if (value == null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getInsightDate(dateStart: string | undefined, pulledAt: Date) {
  if (!dateStart) {
    return pulledAt;
  }

  const date = new Date(dateStart);

  return Number.isNaN(date.getTime()) ? pulledAt : date;
}

export async function refreshMetaAds(config: MetaConfig): Promise<MetaRefreshResult> {
  const client = new MetaAdsClient(config);
  const pulledAt = new Date();
  const centres: MatchableCentre[] = await prisma.centreReference.findMany({
    where: {
      ignored: false,
      openStatus: "Open",
    },
    select: {
      centreKey: true,
      name: true,
    },
  });
  const counts: MetaRefreshCounts = {
    accounts: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    campaignInsights: 0,
    adSetInsights: 0,
    adInsights: 0,
  };
  const accounts = config.adAccountId
    ? [{ id: toStoredAdAccountId(config.adAccountId), name: toStoredAdAccountId(config.adAccountId) }]
    : (await client.listAdAccounts()).data;

  for (const account of accounts) {
    const metaAdAccountId = toStoredAdAccountId(account.id);
    const accountId = normalizeAdAccountId(account.id);

    await prisma.metaAdAccount.upsert({
      where: { metaAdAccountId },
      create: {
        metaAdAccountId,
        accountId,
        name: account.name ?? metaAdAccountId,
        accountStatus: account.account_status ?? null,
        currency: account.currency ?? null,
        timezoneName: account.timezone_name ?? null,
        pulledAt,
      },
      update: {
        accountId,
        name: account.name ?? metaAdAccountId,
        accountStatus: account.account_status ?? null,
        currency: account.currency ?? null,
        timezoneName: account.timezone_name ?? null,
        pulledAt,
      },
    });
    counts.accounts += 1;

    const [campaignsResponse, adSetsResponse, adsResponse] = await Promise.all([
      client.listCampaigns(accountId),
      client.listAdSets(accountId),
      client.listAds(accountId),
    ]);
    const campaignIds = new Set(campaignsResponse.data.map((campaign) => campaign.id));
    const campaignCentreKeys = new Map<string, number | null>();

    for (const campaign of campaignsResponse.data) {
      const campaignCentreKey = matchMetaNameToCentre(campaign.name ?? campaign.id, centres)?.centreKey ?? null;

      await prisma.metaCampaign.upsert({
        where: { metaCampaignId: campaign.id },
        create: {
          metaCampaignId: campaign.id,
          metaAdAccountId,
          centreKey: campaignCentreKey,
          name: campaign.name ?? campaign.id,
          status: campaign.status ?? null,
          effectiveStatus: campaign.effective_status ?? null,
          objective: campaign.objective ?? null,
          metaCreatedTime: parseMetaDate(campaign.created_time),
          metaUpdatedTime: parseMetaDate(campaign.updated_time),
          pulledAt,
        },
        update: {
          metaAdAccountId,
          centreKey: campaignCentreKey,
          name: campaign.name ?? campaign.id,
          status: campaign.status ?? null,
          effectiveStatus: campaign.effective_status ?? null,
          objective: campaign.objective ?? null,
          metaCreatedTime: parseMetaDate(campaign.created_time),
          metaUpdatedTime: parseMetaDate(campaign.updated_time),
          pulledAt,
        },
      });
      campaignCentreKeys.set(campaign.id, campaignCentreKey);
      counts.campaigns += 1;
    }

    const adSetIds = new Set<string>();
    const adSetCentreKeys = new Map<string, number | null>();

    for (const adSet of adSetsResponse.data) {
      if (!adSet.campaign_id || !campaignIds.has(adSet.campaign_id)) {
        continue;
      }

      const adSetCentreKey =
        campaignCentreKeys.get(adSet.campaign_id) ??
        matchMetaNameToCentre(adSet.name ?? adSet.id, centres)?.centreKey ??
        null;

      await prisma.metaAdSet.upsert({
        where: { metaAdSetId: adSet.id },
        create: {
          metaAdSetId: adSet.id,
          metaCampaignId: adSet.campaign_id,
          metaAdAccountId,
          centreKey: adSetCentreKey,
          name: adSet.name ?? adSet.id,
          status: adSet.status ?? null,
          effectiveStatus: adSet.effective_status ?? null,
          optimizationGoal: adSet.optimization_goal ?? null,
          dailyBudget: adSet.daily_budget ?? null,
          lifetimeBudget: adSet.lifetime_budget ?? null,
          startTime: parseMetaDate(adSet.start_time),
          endTime: parseMetaDate(adSet.end_time),
          pulledAt,
        },
        update: {
          metaCampaignId: adSet.campaign_id,
          metaAdAccountId,
          centreKey: adSetCentreKey,
          name: adSet.name ?? adSet.id,
          status: adSet.status ?? null,
          effectiveStatus: adSet.effective_status ?? null,
          optimizationGoal: adSet.optimization_goal ?? null,
          dailyBudget: adSet.daily_budget ?? null,
          lifetimeBudget: adSet.lifetime_budget ?? null,
          startTime: parseMetaDate(adSet.start_time),
          endTime: parseMetaDate(adSet.end_time),
          pulledAt,
        },
      });
      adSetIds.add(adSet.id);
      adSetCentreKeys.set(adSet.id, adSetCentreKey);
      counts.adSets += 1;
    }

    const adIds = new Set<string>();

    for (const ad of adsResponse.data) {
      const metaCampaignId = ad.campaign_id && campaignIds.has(ad.campaign_id) ? ad.campaign_id : null;
      const metaAdSetId = ad.adset_id && adSetIds.has(ad.adset_id) ? ad.adset_id : null;
      const adCentreKey =
        (metaAdSetId ? adSetCentreKeys.get(metaAdSetId) : null) ??
        (metaCampaignId ? campaignCentreKeys.get(metaCampaignId) : null) ??
        matchMetaNameToCentre(ad.name ?? ad.id, centres)?.centreKey ??
        null;

      await prisma.metaAd.upsert({
        where: { metaAdId: ad.id },
        create: {
          metaAdId: ad.id,
          metaAdSetId,
          metaCampaignId,
          metaAdAccountId,
          centreKey: adCentreKey,
          name: ad.name ?? ad.id,
          status: ad.status ?? null,
          effectiveStatus: ad.effective_status ?? null,
          metaCreatedTime: parseMetaDate(ad.created_time),
          metaUpdatedTime: parseMetaDate(ad.updated_time),
          pulledAt,
        },
        update: {
          metaAdSetId,
          metaCampaignId,
          metaAdAccountId,
          centreKey: adCentreKey,
          name: ad.name ?? ad.id,
          status: ad.status ?? null,
          effectiveStatus: ad.effective_status ?? null,
          metaCreatedTime: parseMetaDate(ad.created_time),
          metaUpdatedTime: parseMetaDate(ad.updated_time),
          pulledAt,
        },
      });
      adIds.add(ad.id);
      counts.ads += 1;
    }

    for (const level of ["campaign", "adset", "ad"] satisfies MetaInsightLevel[]) {
      const insightsResponse = await client.listInsights(accountId, level);

      for (const insight of insightsResponse.data) {
        const insightCampaignId = insight.campaign_id && campaignIds.has(insight.campaign_id) ? insight.campaign_id : null;
        const insightAdSetId = insight.adset_id && adSetIds.has(insight.adset_id) ? insight.adset_id : null;
        const insightAdId = insight.ad_id && adIds.has(insight.ad_id) ? insight.ad_id : null;
        const insightName = insight.ad_name ?? insight.adset_name ?? insight.campaign_name ?? "";
        const insightCentreKey =
          (insightAdSetId ? adSetCentreKeys.get(insightAdSetId) : null) ??
          (insightCampaignId ? campaignCentreKeys.get(insightCampaignId) : null) ??
          matchMetaNameToCentre(insightName, centres)?.centreKey ??
          null;

        await prisma.metaInsightSnapshot.create({
          data: {
            pulledAt,
            insightDate: getInsightDate(insight.date_start, pulledAt),
            level,
            metaAdAccountId,
            metaCampaignId: insightCampaignId,
            metaAdSetId: insightAdSetId,
            metaAdId: insightAdId,
            centreKey: insightCentreKey,
            campaignName: insight.campaign_name ?? null,
            adSetName: insight.adset_name ?? null,
            adName: insight.ad_name ?? null,
            impressions: parseOptionalInt(insight.impressions),
            reach: parseOptionalInt(insight.reach),
            clicks: parseOptionalInt(insight.inline_link_clicks ?? insight.clicks),
            spend: parseOptionalDecimal(insight.spend),
            cpc: parseOptionalDecimal(insight.cpc),
            cpm: parseOptionalDecimal(insight.cpm),
            ctr: parseOptionalDecimal(insight.ctr),
            frequency: parseOptionalDecimal(insight.frequency),
            rawActions: toJson(insight.actions),
            raw: toJson(insight),
          },
        });
      }

      if (level === "campaign") {
        counts.campaignInsights += insightsResponse.data.length;
      } else if (level === "adset") {
        counts.adSetInsights += insightsResponse.data.length;
      } else {
        counts.adInsights += insightsResponse.data.length;
      }
    }
  }

  return {
    ...counts,
    pulledAt: pulledAt.toISOString(),
  };
}
