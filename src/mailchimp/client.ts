import type { MailchimpConfig } from "./config.js";
import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";

export class MailchimpApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "MailchimpApiError";
    this.status = status;
    this.body = body;
  }
}

export type MailchimpCampaignSettings = {
  subject_line?: string;
  preview_text?: string;
  title?: string;
  from_name?: string;
  reply_to?: string;
};

export type MailchimpRecipients = {
  list_id?: string;
  list_name?: string;
  segment_text?: string;
  recipient_count?: number;
};

export type MailchimpCampaignSummary = {
  id: string;
  type?: string;
  status?: string;
  send_time?: string;
  emails_sent?: number;
  archive_url?: string;
  long_archive_url?: string;
  create_time?: string;
  settings?: MailchimpCampaignSettings;
  recipients?: MailchimpRecipients;
};

export type MailchimpCampaignsResponse = {
  campaigns: MailchimpCampaignSummary[];
  total_items?: number;
};

export type MailchimpCampaignReport = {
  id: string;
  campaign_title?: string;
  type?: string;
  list_id?: string;
  list_name?: string;
  subject_line?: string;
  preview_text?: string;
  emails_sent?: number;
  send_time?: string;
  bounces?: {
    hard_bounces?: number;
    soft_bounces?: number;
    syntax_errors?: number;
  };
  forwards?: {
    forwards_count?: number;
    forwards_opens?: number;
  };
  opens?: {
    opens_total?: number;
    unique_opens?: number;
    open_rate?: number;
  };
  clicks?: {
    clicks_total?: number;
    unique_clicks?: number;
    click_rate?: number;
  };
  unsubscribed?: number;
  abuse_reports?: number;
};

export type MailchimpReportsResponse = {
  reports: MailchimpCampaignReport[];
  total_items?: number;
};

export type MailchimpList = {
  id: string;
  name?: string;
  stats?: {
    member_count?: number;
    unsubscribe_count?: number;
    cleaned_count?: number;
    member_count_since_send?: number;
    unsubscribe_count_since_send?: number;
    cleaned_count_since_send?: number;
  };
};

export type MailchimpListsResponse = {
  lists: MailchimpList[];
  total_items?: number;
};

export type MailchimpGrowthHistory = {
  list_id: string;
  month: string;
  existing?: number;
  imports?: number;
  optins?: number;
  subscribed?: number;
  unsubscribed?: number;
  reconfirm?: number;
  cleaned?: number;
  pending?: number;
  deleted?: number;
  transactional?: number;
};

export type MailchimpGrowthHistoryResponse = {
  history: MailchimpGrowthHistory[];
  list_id: string;
  total_items?: number;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MAX_RETRIES = 3;

function buildAuthHeader(apiKey: string) {
  const token = Buffer.from(`anystring:${apiKey}`).toString("base64");

  return `Basic ${token}`;
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    search.set(key, String(value));
  }

  const query = search.toString();

  return query.length > 0 ? `?${query}` : "";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MailchimpClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: MailchimpConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  private async request<T>(path: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(params)}`;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < MAX_RETRIES) {
      attempt += 1;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: buildAuthHeader(this.apiKey),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const payload = (await response.json()) as T;

        await appendExternalApiCapture({
          source: "mailchimp",
          operation: path,
          httpStatus: response.status,
          outcome: "success",
          requestContext: { params, attempt },
          payload,
        });

        return payload;
      }

      const bodyText = await response.text();
      let parsedBody: unknown = bodyText;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        // leave as text
      }

      await appendExternalApiCapture({
        source: "mailchimp",
        operation: path,
        httpStatus: response.status,
        outcome: "error",
        requestContext: { params, attempt },
        payload: parsedBody,
      });

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        lastError = new MailchimpApiError(
          `Mailchimp ${response.status} on ${path}`,
          response.status,
          parsedBody,
        );
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** (attempt - 1);
        await sleep(backoff);
        continue;
      }

      throw new MailchimpApiError(
        `Mailchimp ${response.status} on ${path}`,
        response.status,
        parsedBody,
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new MailchimpApiError("Mailchimp request exhausted retries", 0, null);
  }

  private async paginate<TItem, TResponse>(
    path: string,
    extractItems: (response: TResponse) => TItem[],
    params: Record<string, string | number | undefined | null> = {},
  ): Promise<TItem[]> {
    const items: TItem[] = [];
    let offset = 0;
    let pages = 0;

    while (pages < MAX_PAGES) {
      pages += 1;
      const response = await this.request<TResponse>(path, {
        ...params,
        count: DEFAULT_PAGE_SIZE,
        offset,
      });
      const pageItems = extractItems(response);

      items.push(...pageItems);

      if (pageItems.length < DEFAULT_PAGE_SIZE) {
        break;
      }

      offset += DEFAULT_PAGE_SIZE;
    }

    return items;
  }

  async listCampaigns(options: { sinceSendTime?: string; status?: string } = {}): Promise<MailchimpCampaignSummary[]> {
    const params: Record<string, string | number | undefined | null> = {
      sort_field: "send_time",
      sort_dir: "DESC",
      fields:
        "campaigns.id,campaigns.type,campaigns.status,campaigns.send_time,campaigns.create_time," +
        "campaigns.emails_sent,campaigns.archive_url,campaigns.long_archive_url," +
        "campaigns.settings.subject_line,campaigns.settings.preview_text,campaigns.settings.title," +
        "campaigns.settings.from_name,campaigns.settings.reply_to," +
        "campaigns.recipients.list_id,campaigns.recipients.list_name,campaigns.recipients.segment_text," +
        "campaigns.recipients.recipient_count,total_items",
    };

    if (options.sinceSendTime) {
      params.since_send_time = options.sinceSendTime;
    }

    if (options.status) {
      params.status = options.status;
    }

    return this.paginate<MailchimpCampaignSummary, MailchimpCampaignsResponse>(
      "/campaigns",
      (response) => response.campaigns ?? [],
      params,
    );
  }

  async getCampaignReport(campaignId: string): Promise<MailchimpCampaignReport> {
    return this.request<MailchimpCampaignReport>(`/reports/${encodeURIComponent(campaignId)}`);
  }

  async listLists(): Promise<MailchimpList[]> {
    return this.paginate<MailchimpList, MailchimpListsResponse>(
      "/lists",
      (response) => response.lists ?? [],
      {
        fields:
          "lists.id,lists.name," +
          "lists.stats.member_count,lists.stats.unsubscribe_count,lists.stats.cleaned_count," +
          "lists.stats.member_count_since_send,lists.stats.unsubscribe_count_since_send," +
          "lists.stats.cleaned_count_since_send,total_items",
      },
    );
  }

  async getListGrowthHistory(listId: string, monthsBack = 12): Promise<MailchimpGrowthHistory[]> {
    const response = await this.request<MailchimpGrowthHistoryResponse>(
      `/lists/${encodeURIComponent(listId)}/growth-history`,
      {
        count: monthsBack,
        sort_field: "month",
        sort_dir: "DESC",
      },
    );

    return response.history ?? [];
  }
}
