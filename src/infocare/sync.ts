import { createInfocareClient } from "./client.js";
import { fetchCentreReferences } from "./centres.js";
import type { CentreReference } from "./models.js";

const DEFAULT_CENTRE_CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type InfocareClientLike = ReturnType<typeof createInfocareClient>;

export type CentreReferenceStore = {
  loadCentreReferences(): Promise<CentreReference[]>;
  upsertCentreReferences(centres: readonly CentreReference[]): Promise<void>;
};

export type CentreSyncResult = {
  centreReferences: CentreReference[];
  fetchedAt: string;
  source: "cache" | "infocare";
};

export type SyncCentreReferencesOptions = {
  client?: InfocareClientLike;
  store?: CentreReferenceStore;
  now?: Date;
  force?: boolean;
  staleAfterMs?: number;
};

function parseLastSyncedAt(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

export function isCentreReferenceStale(
  centreReference: CentreReference,
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_CENTRE_CACHE_STALE_AFTER_MS,
) {
  const lastSyncedAt = parseLastSyncedAt(centreReference.lastSyncedAt);

  if (lastSyncedAt === null) {
    return true;
  }

  return now.getTime() - lastSyncedAt >= staleAfterMs;
}

export function areCentreReferencesStale(
  centreReferences: readonly CentreReference[],
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_CENTRE_CACHE_STALE_AFTER_MS,
) {
  if (centreReferences.length === 0) {
    return true;
  }

  return centreReferences.some((centreReference) =>
    isCentreReferenceStale(centreReference, now, staleAfterMs),
  );
}

export async function loadCachedCentreReferences(store?: CentreReferenceStore) {
  if (!store) {
    return [];
  }

  return store.loadCentreReferences();
}

export async function persistCentreReferences(
  centreReferences: readonly CentreReference[],
  store?: CentreReferenceStore,
) {
  if (!store) {
    return;
  }

  await store.upsertCentreReferences(centreReferences);
}

export async function syncCentreReferences(
  options: SyncCentreReferencesOptions = {},
): Promise<CentreSyncResult> {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_CENTRE_CACHE_STALE_AFTER_MS;
  const cachedCentreReferences = await loadCachedCentreReferences(options.store);
  const shouldRefresh =
    options.force === true ||
    areCentreReferencesStale(cachedCentreReferences, now, staleAfterMs);

  if (!shouldRefresh) {
    return {
      centreReferences: cachedCentreReferences,
      fetchedAt: now.toISOString(),
      source: "cache",
    };
  }

  const client = options.client ?? createInfocareClient();
  const centreReferences = await fetchCentreReferences(client, now);

  await persistCentreReferences(centreReferences, options.store);

  return {
    centreReferences,
    fetchedAt: now.toISOString(),
    source: "infocare",
  };
}
