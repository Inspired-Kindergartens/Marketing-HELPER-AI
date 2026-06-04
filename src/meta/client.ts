import type { MetaConfig } from "./config.js";
import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";

const META_GRAPH_API_BASE_URL = "https://graph.facebook.com/v23.0";

const AD_ACCOUNT_FIELDS = ["id", "name", "account_status", "currency", "timezone_name"] as const;
const CAMPAIGN_FIELDS = ["id", "name", "status", "effective_status", "objective", "created_time", "updated_time"] as const;
const AD_SET_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "optimization_goal",
  "daily_budget",
  "lifetime_budget",
  "start_time",
  "end_time",
] as const;
const AD_FIELDS = ["id", "name", "campaign_id", "adset_id", "status", "effective_status", "created_time", "updated_time"] as const;
const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "frequency",
  "actions",
  "cost_per_action_type",
] as const;

type MetaListResponse<T> = {
  data: T[];
  paging?: {
    cursors?: {
      after?: string;
    };
    next?: string;
  };
};

export type MetaAdAccount = {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
};

export type MetaCampaign = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  created_time?: string;
  updated_time?: string;
};

export type MetaAdSet = {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
};

export type MetaAd = {
  id: string;
  name?: string;
  campaign_id?: string;
  adset_id?: string;
  status?: string;
  effective_status?: string;
  created_time?: string;
  updated_time?: string;
};

export type MetaInsightLevel = "campaign" | "adset" | "ad";

export type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  actions?: unknown[];
  cost_per_action_type?: unknown[];
  date_start?: string;
  date_stop?: string;
};

function normalizeAdAccountId(adAccountId: string) {
  return adAccountId.trim().replace(/^act_/, "");
}

function buildFieldsParam(fields: readonly string[]) {
  return fields.join(",");
}

export class MetaAdsClient {
  constructor(private readonly config: MetaConfig) {}

  async get<T>(endpointPath: string, queryParams: Record<string, string | number | boolean | undefined> = {}) {
    if (!endpointPath.startsWith("/")) {
      throw new Error(`Meta endpoint path must start with "/": ${endpointPath}`);
    }

    const url = new URL(`${META_GRAPH_API_BASE_URL}${endpointPath}`);

    for (const [key, value] of Object.entries(queryParams)) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }

    url.searchParams.set("access_token", this.config.accessToken);

    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      await appendExternalApiCapture({
        source: "meta",
        operation: endpointPath,
        httpStatus: response.status,
        outcome: "error",
        requestContext: queryParams,
        payload: responseBody,
      });
      throw new Error(`Meta GET ${endpointPath} failed with ${response.status}: ${responseBody}`);
    }

    const payload = (await response.json()) as T;

    await appendExternalApiCapture({
      source: "meta",
      operation: endpointPath,
      httpStatus: response.status,
      outcome: "success",
      requestContext: queryParams,
      payload,
    });

    return payload;
  }

  async getList<T>(endpointPath: string, queryParams: Record<string, string | number | boolean | undefined> = {}) {
    const data: T[] = [];
    let after: string | undefined;

    do {
      const response = await this.get<MetaListResponse<T>>(endpointPath, {
        limit: 500,
        ...queryParams,
        after,
      });

      data.push(...response.data);
      after = response.paging?.cursors?.after;
    } while (after);

    return { data } satisfies MetaListResponse<T>;
  }

  async listAdAccounts() {
    return this.getList<MetaAdAccount>("/me/adaccounts", {
      fields: buildFieldsParam(AD_ACCOUNT_FIELDS),
    });
  }

  async listCampaigns(adAccountId: string) {
    return this.getList<MetaCampaign>(`/act_${normalizeAdAccountId(adAccountId)}/campaigns`, {
      fields: buildFieldsParam(CAMPAIGN_FIELDS),
    });
  }

  async listAdSets(adAccountId: string) {
    return this.getList<MetaAdSet>(`/act_${normalizeAdAccountId(adAccountId)}/adsets`, {
      fields: buildFieldsParam(AD_SET_FIELDS),
    });
  }

  async listAds(adAccountId: string) {
    return this.getList<MetaAd>(`/act_${normalizeAdAccountId(adAccountId)}/ads`, {
      fields: buildFieldsParam(AD_FIELDS),
    });
  }

  async listInsights(adAccountId: string, level: MetaInsightLevel) {
    return this.getList<MetaInsight>(`/act_${normalizeAdAccountId(adAccountId)}/insights`, {
      fields: buildFieldsParam(INSIGHT_FIELDS),
      date_preset: "last_30d",
      time_increment: 1,
      level,
    });
  }
}
