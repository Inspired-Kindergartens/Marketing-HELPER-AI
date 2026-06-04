import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";
import type { FormstackConfig } from "./config.js";

export class FormstackApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "FormstackApiError";
  }
}

export type FormstackFormApiRecord = {
  id: string | number;
  name?: string;
  folder?: string | number | { name?: string } | null;
  submissions?: number | string;
  submissionsCount?: number | string;
  submission_count?: number | string;
  views?: number | string;
  view_count?: number | string;
  last_submission_time?: string | null;
  last_submission_at?: string | null;
};

export type FormstackSubmissionApiRecord = {
  id: string | number;
  timestamp?: string | null;
  submitted_at?: string | null;
  date?: string | null;
  created_at?: string | null;
  submittedAt?: string | null;
  created?: string | null;
  [key: string]: unknown;
};

type PaginatedResponse<T> = {
  forms?: T[];
  submissions?: T[];
  data?: T[];
  pages?: number | string;
  total_pages?: number | string;
  pageInfo?: {
    totalPages?: number;
  };
  page?: {
    totalPages?: number;
  } | number | string;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value));
  }

  const text = query.toString();
  return text ? `?${text}` : "";
}

function itemArray<T>(payload: PaginatedResponse<T>, collection: "forms" | "submissions") {
  return payload[collection] ?? payload.data ?? [];
}

export class FormstackClient {
  constructor(private readonly config: FormstackConfig) {}

  private async request<T>(path: string, params: Record<string, string | number | undefined> = {}) {
    const response = await fetch(`${this.config.baseUrl}${path}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const bodyText = await response.text();
    let payload: unknown = bodyText;

    try {
      payload = JSON.parse(bodyText);
    } catch {
      // Preserve non-JSON API responses verbatim in raw capture storage.
    }

    await appendExternalApiCapture({
      source: "formstack",
      operation: path,
      httpStatus: response.status,
      outcome: response.ok ? "success" : "error",
      requestContext: { params },
      payload,
    });

    if (!response.ok) {
      throw new FormstackApiError(`Formstack ${response.status} on ${path}`, response.status, payload);
    }

    return payload as T;
  }

  private async paginate<T>(path: string, collection: "forms" | "submissions") {
    const records: T[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await this.request<PaginatedResponse<T>>(path, { pageNumber: page, pageSize: PAGE_SIZE });
      const rows = itemArray(payload, collection);
      const pageCount = Number(
        typeof payload.page === "object"
          ? payload.page.totalPages ?? 0
          : payload.total_pages ?? payload.pages ?? payload.pageInfo?.totalPages ?? 0,
      );

      records.push(...rows);

      if (rows.length < PAGE_SIZE || (Number.isFinite(pageCount) && pageCount > 0 && page >= pageCount)) {
        break;
      }
    }

    return records;
  }

  listForms() {
    return this.paginate<FormstackFormApiRecord>("/forms", "forms");
  }

  listSubmissions(formId: string) {
    return this.paginate<FormstackSubmissionApiRecord>(
      `/forms/${encodeURIComponent(formId)}/submissions`,
      "submissions",
    );
  }
}
