import { advanceSyncCursor, readSyncCursor } from "../storage/sync-cursor-store.js";
import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";
import { ingestPostmarkEvent } from "./webhook.js";

// Cursor key under which we persist the highest Cloudflare event id ingested.
const CLOUDFLARE_SYNC_CURSOR_KEY = "postmark:cloudflare";

export type CloudflareSyncConfig = {
  // Base URL of the worker, e.g. https://postmark-webhook-events.<sub>.workers.dev
  baseUrl: string;
  syncToken: string;
  serverToken: string;
};

export type CloudflareSyncResult = {
  eventsFetched: number;
  eventsStored: number;
  lastSeenId: bigint;
};

// One worker row: an opaque incrementing id plus the raw Postmark webhook body
// stored as a JSON string in `payload`.
type CloudflareEvent = {
  id: number | string;
  payload: string;
};

function toBigInt(value: number | string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// Reads CLOUDFLARE sync settings from env, supporting both the underscored names
// and the hyphenated `CLOUDFLARE-SYNC-TOKEN` the project's .env originally used.
export function readCloudflareSyncConfig(
  source: NodeJS.ProcessEnv,
  serverToken: string,
): CloudflareSyncConfig | null {
  const baseUrl = (source.CLOUDFLARE_SYNC_URL ?? "").trim();
  const syncToken =
    (source.CLOUDFLARE_SYNC_TOKEN ?? source["CLOUDFLARE-SYNC-TOKEN"] ?? "").trim();

  if (!baseUrl || !syncToken) {
    return null;
  }

  return { baseUrl, syncToken, serverToken };
}

// Pulls every event newer than the persisted cursor from the Cloudflare Worker,
// ingests each through the same path the live webhook uses, then advances the
// cursor. Safe to call repeatedly: ingestion de-dupes and the cursor only moves
// forward, so an overlapping pull stores nothing twice.
export async function syncPostmarkEventsFromCloudflare(
  config: CloudflareSyncConfig,
): Promise<CloudflareSyncResult> {
  const lastSeenId = await readSyncCursor(CLOUDFLARE_SYNC_CURSOR_KEY);
  const url = new URL("/api/postmark/events", config.baseUrl);
  url.searchParams.set("after_id", lastSeenId.toString());

  const response = await fetch(url, {
    headers: { "X-Sync-Token": config.syncToken },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    await appendExternalApiCapture({
      source: "postmark",
      operation: "cloudflare-sync",
      outcome: "error",
      httpStatus: response.status,
      requestContext: { afterId: lastSeenId.toString() },
      payload: { status: response.status, body: body.slice(0, 2000) },
    });

    throw new Error(`Cloudflare sync failed: HTTP ${response.status}`);
  }

  const events = (await response.json()) as CloudflareEvent[];

  await appendExternalApiCapture({
    source: "postmark",
    operation: "cloudflare-sync",
    outcome: "success",
    requestContext: { afterId: lastSeenId.toString(), eventsFetched: events.length },
    payload: events,
  });

  let eventsStored = 0;
  let maxId = lastSeenId;

  for (const event of events) {
    const id = toBigInt(event.id);
    if (id == null) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(event.payload);
    } catch {
      // Malformed row — still advance past it so it doesn't block the cursor.
      if (id > maxId) maxId = id;
      continue;
    }

    const result = await ingestPostmarkEvent(payload, config.serverToken);
    if (result.stored) eventsStored += 1;
    if (id > maxId) maxId = id;
  }

  if (maxId > lastSeenId) {
    await advanceSyncCursor(CLOUDFLARE_SYNC_CURSOR_KEY, maxId);
  }

  return { eventsFetched: events.length, eventsStored, lastSeenId: maxId };
}
