import { prisma } from "../db.js";

// Reads the last ingested source id for a cursor key, defaulting to 0 so a
// fresh install pulls the full backlog the Cloudflare Worker has buffered.
export async function readSyncCursor(key: string): Promise<bigint> {
  const cursor = await prisma.syncCursor.findUnique({
    where: { key },
    select: { lastId: true },
  });

  return cursor?.lastId ?? 0n;
}

// Advances the cursor to `lastId`, but never backwards: a guarded updateMany
// (lastId < incoming) makes a duplicate or out-of-order pull a no-op rather than
// rewinding progress and re-pulling events already stored.
export async function advanceSyncCursor(key: string, lastId: bigint): Promise<void> {
  const updated = await prisma.syncCursor.updateMany({
    where: { key, lastId: { lt: lastId } },
    data: { lastId },
  });

  if (updated.count === 0) {
    // No row yet (first run) — create it. If a concurrent run created it first,
    // the unique key makes this throw P2002; the row is already at/ahead of us.
    await prisma.syncCursor
      .create({ data: { key, lastId } })
      .catch(() => undefined);
  }
}
