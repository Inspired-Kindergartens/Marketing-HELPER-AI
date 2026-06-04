import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";
import type { CentreReferenceStore } from "../infocare/sync.js";
import type {
  CentreReference,
  ServiceAnalyticsSnapshot,
  UrgencyBand,
  WindowScopedCounts,
} from "../infocare/models.js";

type PrismaTransactionClient = Prisma.TransactionClient;
const db = prisma as GeneratedPrismaClient;

type CentreReferenceUpsertInput = Omit<CentreReference, "lastSyncedAt"> & {
  lastSyncedAt: string | Date;
};

type AnalyticsSnapshotSetInput = {
  runDate: string | Date;
  source?: string;
  snapshots: ServiceAnalyticsSnapshot[];
};

export type ManualCentreCapacity = {
  centreKey: number;
  licensedCapacity: number;
  maxU2?: number;
  maxO2?: number;
  notes?: string;
  updatedAt: string;
};

type ManualCentreCapacityUpsertInput = {
  centreKey: number;
  licensedCapacity: number;
  maxU2?: number;
  maxO2?: number;
  notes?: string;
};

export type LatestSnapshotSet = {
  runDate: string;
  source: string;
  createdAt: string;
  snapshots: ServiceAnalyticsSnapshot[];
};

export type CentreSnapshotHistoryEntry = {
  runDate: string;
  source: string;
  createdAt: string;
  snapshot: ServiceAnalyticsSnapshot;
};

function toDateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: { toString(): string }) {
  return Number(value.toString());
}

function parseWindowScopedCounts(value: Prisma.JsonValue): WindowScopedCounts {
  const source = (value ?? {}) as Record<string, unknown>;

  return {
    "1W": Number(source["1W"] ?? 0),
    "2W": Number(source["2W"] ?? 0),
    "3W": Number(source["3W"] ?? 0),
    "1M": Number(source["1M"] ?? 0),
    "2M": Number(source["2M"] ?? 0),
    "3M": Number(source["3M"] ?? 0),
    "6M": Number(source["6M"] ?? 0),
    "12M": Number(source["12M"] ?? 0),
  };
}

function averageWindowScopedCounts(
  entries: ServiceAnalyticsSnapshot[],
  selector: (entry: ServiceAnalyticsSnapshot) => WindowScopedCounts,
): WindowScopedCounts {
  const counts: WindowScopedCounts = {
    "1W": 0,
    "2W": 0,
    "3W": 0,
    "1M": 0,
    "2M": 0,
    "3M": 0,
    "6M": 0,
    "12M": 0,
  };

  for (const key of Object.keys(counts) as (keyof WindowScopedCounts)[]) {
    counts[key] = Math.round(
      entries.reduce((sum, entry) => sum + selector(entry)[key], 0) / entries.length,
    );
  }

  return counts;
}

function getFallbackReplacementPressureCounts(entry: ServiceAnalyticsSnapshot): WindowScopedCounts {
  return {
    "1W": entry.agedOutCount + entry.knownLeavingCountsByWindow["1W"] + entry.approachingFiveCountsByWindow["1W"],
    "2W": entry.agedOutCount + entry.knownLeavingCountsByWindow["2W"] + entry.approachingFiveCountsByWindow["2W"],
    "3W": entry.agedOutCount + entry.knownLeavingCountsByWindow["3W"] + entry.approachingFiveCountsByWindow["3W"],
    "1M": entry.agedOutCount + entry.knownLeavingCountsByWindow["1M"] + entry.approachingFiveCountsByWindow["1M"],
    "2M": entry.agedOutCount + entry.knownLeavingCountsByWindow["2M"] + entry.approachingFiveCountsByWindow["2M"],
    "3M": entry.agedOutCount + entry.knownLeavingCountsByWindow["3M"] + entry.approachingFiveCountsByWindow["3M"],
    "6M": entry.agedOutCount + entry.knownLeavingCountsByWindow["6M"] + entry.approachingFiveCountsByWindow["6M"],
    "12M": entry.agedOutCount + entry.knownLeavingCountsByWindow["12M"] + entry.approachingFiveCountsByWindow["12M"],
  };
}

function mapCentreReference(record: {
  centreKey: number;
  name: string;
  openStatus: string;
  licenseNumber: number | null;
  regionName: string | null;
  areaName: string | null;
  subgroupName: string | null;
  ignored: boolean;
  lastSyncedAt: Date;
}): CentreReference {
  return {
    centreKey: record.centreKey,
    name: record.name,
    openStatus: record.openStatus,
    licenseNumber: record.licenseNumber ?? undefined,
    regionName: record.regionName ?? undefined,
    areaName: record.areaName ?? undefined,
    subgroupName: record.subgroupName ?? undefined,
    ignored: record.ignored,
    lastSyncedAt: record.lastSyncedAt.toISOString(),
  };
}

function mapSnapshot(record: {
  centreKey: number;
  serviceName: string;
  date: Date;
  enrolledCount: number;
  enrolledFteCount: { toString(): string };
  bookedAverageDailyCount: { toString(): string };
  bookedUtilisationRatio: { toString(): string };
  enrolledUnder2Count: number;
  enrolledOver2Count: number;
  licensedCapacity: number;
  licensedUnder2Capacity: number | null;
  licensedOver2Capacity: number | null;
  enrolmentRatio: { toString(): string };
  waitlistCount: number;
  waitlistUnder2Count?: number | null;
  waitlistUnder5Count: number;
  waitlistTurning5ThisYearCount: number;
  waitlistAged5PlusCount: number;
  waitlistUnknownAgeCount: number;
  waitlistOldestEntryDays: number | null;
  waitlistAverageEntryDays: { toString(): string } | null;
  knownLeavingCount: number;
  knownLeavingCountsByWindow: Prisma.JsonValue;
  agedOutCount: number;
  approachingFiveCount: number;
  approachingFiveCountsByWindow: Prisma.JsonValue;
  replacementPressureCountsByWindow: Prisma.JsonValue | null;
  replacementPressure: number;
  waitlistCoverRatio: { toString(): string };
  urgencyScore: { toString(): string };
  urgencyBand: string;
}): ServiceAnalyticsSnapshot {
  return {
    centreKey: record.centreKey,
    serviceName: record.serviceName,
    date: toDateOnlyString(record.date),
    enrolledCount: record.enrolledCount,
    enrolledFteCount: toNumber(record.enrolledFteCount),
    bookedAverageDailyCount: toNumber(record.bookedAverageDailyCount),
    bookedUtilisationRatio: toNumber(record.bookedUtilisationRatio),
    enrolledUnder2Count: record.enrolledUnder2Count,
    enrolledOver2Count: record.enrolledOver2Count,
    licensedCapacity: record.licensedCapacity,
    licensedUnder2Capacity: record.licensedUnder2Capacity,
    licensedOver2Capacity: record.licensedOver2Capacity,
    enrolmentRatio: toNumber(record.enrolmentRatio),
    waitlistCount: record.waitlistCount,
    waitlistUnder2Count: record.waitlistUnder2Count ?? 0,
    waitlistUnder5Count: record.waitlistUnder5Count,
    waitlistTurning5ThisYearCount: record.waitlistTurning5ThisYearCount,
    waitlistAged5PlusCount: record.waitlistAged5PlusCount,
    waitlistUnknownAgeCount: record.waitlistUnknownAgeCount,
    waitlistOldestEntryDays: record.waitlistOldestEntryDays,
    waitlistAverageEntryDays: record.waitlistAverageEntryDays
      ? toNumber(record.waitlistAverageEntryDays)
      : null,
    knownLeavingCount: record.knownLeavingCount,
    knownLeavingCountsByWindow: parseWindowScopedCounts(record.knownLeavingCountsByWindow),
    agedOutCount: record.agedOutCount,
    approachingFiveCount: record.approachingFiveCount,
    approachingFiveCountsByWindow: parseWindowScopedCounts(record.approachingFiveCountsByWindow),
    replacementPressureCountsByWindow: parseWindowScopedCounts(
      record.replacementPressureCountsByWindow,
    ),
    replacementPressure: record.replacementPressure,
    waitlistCoverRatio: toNumber(record.waitlistCoverRatio),
    urgencyScore: toNumber(record.urgencyScore),
    urgencyBand: record.urgencyBand as UrgencyBand,
  };
}

function mapManualCentreCapacity(record: {
  centreKey: number;
  licensedCapacity: number;
  maxU2: number | null;
  maxO2: number | null;
  notes: string | null;
  updatedAt: Date;
}): ManualCentreCapacity {
  return {
    centreKey: record.centreKey,
    licensedCapacity: record.licensedCapacity,
    maxU2: record.maxU2 ?? undefined,
    maxO2: record.maxO2 ?? undefined,
    notes: record.notes ?? undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function readCentreReferences() {
  const records = await db.centreReference.findMany({
    orderBy: [{ ignored: "asc" }, { name: "asc" }],
  });

  return records.map(mapCentreReference);
}

export async function readOpenCentreReferences() {
  const records = await db.centreReference.findMany({
    where: {
      ignored: false,
      openStatus: "Open",
    },
    orderBy: [{ name: "asc" }],
  });

  return records.map(mapCentreReference);
}

export async function upsertCentreReferences(centres: CentreReferenceUpsertInput[]) {
  if (centres.length === 0) {
    return [];
  }

  const syncedCentreKeys = centres.map((centre) => centre.centreKey);

  await db.$transaction(async (tx) => {
    await Promise.all(
      centres.map((centre) =>
        tx.centreReference.upsert({
          where: { centreKey: centre.centreKey },
          update: {
            name: centre.name,
            openStatus: centre.openStatus,
            licenseNumber: centre.licenseNumber,
            regionName: centre.regionName,
            areaName: centre.areaName,
            subgroupName: centre.subgroupName,
            ignored: centre.ignored,
            lastSyncedAt: new Date(centre.lastSyncedAt),
          },
          create: {
            centreKey: centre.centreKey,
            name: centre.name,
            openStatus: centre.openStatus,
            licenseNumber: centre.licenseNumber,
            regionName: centre.regionName,
            areaName: centre.areaName,
            subgroupName: centre.subgroupName,
            ignored: centre.ignored,
            lastSyncedAt: new Date(centre.lastSyncedAt),
          },
        }),
      ),
    );

    await tx.centreReference.updateMany({
      where: {
        centreKey: {
          notIn: syncedCentreKeys,
        },
      },
      data: {
        ignored: true,
      },
    });
  });

  return readCentreReferences();
}

async function appendSnapshotRows(
  tx: PrismaTransactionClient,
  runId: number,
  snapshots: ServiceAnalyticsSnapshot[],
) {
  if (snapshots.length === 0) {
    return;
  }

  await tx.serviceAnalyticsSnapshot.createMany({
    data: snapshots.map((snapshot) => ({
      runId,
      centreKey: snapshot.centreKey,
      serviceName: snapshot.serviceName,
      date: new Date(snapshot.date),
      enrolledCount: snapshot.enrolledCount,
      enrolledFteCount: snapshot.enrolledFteCount,
      bookedAverageDailyCount: snapshot.bookedAverageDailyCount,
      bookedUtilisationRatio: snapshot.bookedUtilisationRatio,
      enrolledUnder2Count: snapshot.enrolledUnder2Count,
      enrolledOver2Count: snapshot.enrolledOver2Count,
      licensedCapacity: snapshot.licensedCapacity,
      licensedUnder2Capacity: snapshot.licensedUnder2Capacity,
      licensedOver2Capacity: snapshot.licensedOver2Capacity,
      enrolmentRatio: snapshot.enrolmentRatio,
      waitlistCount: snapshot.waitlistCount,
      waitlistUnder2Count: snapshot.waitlistUnder2Count ?? 0,
      waitlistUnder5Count: snapshot.waitlistUnder5Count,
      waitlistTurning5ThisYearCount: snapshot.waitlistTurning5ThisYearCount,
      waitlistAged5PlusCount: snapshot.waitlistAged5PlusCount,
      waitlistUnknownAgeCount: snapshot.waitlistUnknownAgeCount,
      waitlistOldestEntryDays: snapshot.waitlistOldestEntryDays,
      waitlistAverageEntryDays: snapshot.waitlistAverageEntryDays,
      knownLeavingCount: snapshot.knownLeavingCount,
      knownLeavingCountsByWindow: snapshot.knownLeavingCountsByWindow as Prisma.InputJsonValue,
      agedOutCount: snapshot.agedOutCount,
      approachingFiveCount: snapshot.approachingFiveCount,
      approachingFiveCountsByWindow:
        snapshot.approachingFiveCountsByWindow as Prisma.InputJsonValue,
      replacementPressureCountsByWindow:
        (snapshot.replacementPressureCountsByWindow ??
          getFallbackReplacementPressureCounts(snapshot)) as Prisma.InputJsonValue,
      replacementPressure: snapshot.replacementPressure,
      waitlistCoverRatio: snapshot.waitlistCoverRatio,
      urgencyScore: snapshot.urgencyScore,
      urgencyBand: snapshot.urgencyBand,
    })),
  });
}

export async function writeAnalyticsSnapshotSet(input: AnalyticsSnapshotSetInput) {
  const runDate = new Date(input.runDate);
  const source = input.source ?? "manual";

  const run = await db.$transaction(async (tx) => {
    const snapshotRun = await tx.analyticsSnapshotRun.create({
      data: {
        runDate,
        source,
      },
    });

    await appendSnapshotRows(tx, snapshotRun.id, input.snapshots);

    return snapshotRun;
  });

  return readSnapshotSetByRunId(run.id);
}

export async function readLatestAnalyticsSnapshotSet(): Promise<LatestSnapshotSet | null> {
  const run = await db.analyticsSnapshotRun.findFirst({
    orderBy: [{ runDate: "desc" }, { createdAt: "desc" }],
    include: {
      snapshots: {
        orderBy: [{ urgencyScore: "desc" }, { serviceName: "asc" }],
      },
    },
  });

  if (!run) {
    return null;
  }

  return {
    runDate: run.runDate.toISOString(),
    source: run.source,
    createdAt: run.createdAt.toISOString(),
    snapshots: run.snapshots.map(mapSnapshot),
  };
}

export async function readWindowAnalyticsSnapshotSet(
  fromDateInput: string | Date,
  toDateInput: string | Date,
): Promise<LatestSnapshotSet | null> {
  const fromDate = new Date(fromDateInput);
  const toDate = new Date(toDateInput);
  const runs = await db.analyticsSnapshotRun.findMany({
    where: {
      runDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: [{ runDate: "asc" }, { createdAt: "asc" }],
    include: {
      snapshots: {
        orderBy: [{ urgencyScore: "desc" }, { serviceName: "asc" }],
      },
    },
  });

  if (runs.length === 0) {
    return null;
  }

  const latestRun = runs[runs.length - 1];
  const grouped = new Map<number, ServiceAnalyticsSnapshot[]>();

  for (const run of runs) {
    for (const snapshot of run.snapshots.map(mapSnapshot)) {
      const existing = grouped.get(snapshot.centreKey) ?? [];
      existing.push(snapshot);
      grouped.set(snapshot.centreKey, existing);
    }
  }

  const aggregatedSnapshots = [...grouped.values()]
    .map((entries) => {
      const latest = entries[entries.length - 1];
      const latestValidAgeBandEntry =
        [...entries]
          .reverse()
          .find(
            (entry) =>
              entry.licensedUnder2Capacity != null ||
              entry.licensedOver2Capacity != null ||
              entry.enrolledUnder2Count > 0 ||
              entry.enrolledOver2Count > 0,
          ) ?? latest;
      const count = entries.length;
      const average = (selector: (entry: ServiceAnalyticsSnapshot) => number) =>
        entries.reduce((sum, entry) => sum + selector(entry), 0) / count;
      const averageKnown = (selector: (entry: ServiceAnalyticsSnapshot) => number) => {
        const knownEntries = entries.filter((entry) => selector(entry) > 0);

        if (knownEntries.length === 0) {
          return 0;
        }

        return (
          knownEntries.reduce((sum, entry) => sum + selector(entry), 0) / knownEntries.length
        );
      };

      return {
        ...latest,
        enrolledCount: Math.round(average((entry) => entry.enrolledCount)),
        enrolledFteCount: Number(average((entry) => entry.enrolledFteCount).toFixed(2)),
        bookedAverageDailyCount: Number(
          averageKnown((entry) => entry.bookedAverageDailyCount).toFixed(2),
        ),
        bookedUtilisationRatio: Number(
          averageKnown((entry) => entry.bookedUtilisationRatio).toFixed(4),
        ),
        enrolledUnder2Count: latestValidAgeBandEntry.enrolledUnder2Count,
        enrolledOver2Count: latestValidAgeBandEntry.enrolledOver2Count,
        licensedUnder2Capacity: latestValidAgeBandEntry.licensedUnder2Capacity,
        licensedOver2Capacity: latestValidAgeBandEntry.licensedOver2Capacity,
        waitlistCount: Math.round(average((entry) => entry.waitlistCount)),
        waitlistUnder2Count: Math.round(average((entry) => entry.waitlistUnder2Count ?? 0)),
        waitlistUnder5Count: Math.round(average((entry) => entry.waitlistUnder5Count)),
        waitlistTurning5ThisYearCount: Math.round(
          average((entry) => entry.waitlistTurning5ThisYearCount),
        ),
        waitlistAged5PlusCount: Math.round(average((entry) => entry.waitlistAged5PlusCount)),
        waitlistUnknownAgeCount: Math.round(average((entry) => entry.waitlistUnknownAgeCount)),
        waitlistOldestEntryDays:
          entries.some((entry) => entry.waitlistOldestEntryDays != null)
            ? Math.max(...entries.map((entry) => entry.waitlistOldestEntryDays ?? 0))
            : null,
        waitlistAverageEntryDays:
          entries.some((entry) => entry.waitlistAverageEntryDays != null)
            ? Number(
                (
                  entries.reduce(
                    (sum, entry) => sum + (entry.waitlistAverageEntryDays ?? 0),
                    0,
                  ) /
                  entries.filter((entry) => entry.waitlistAverageEntryDays != null).length
                ).toFixed(2),
              )
            : null,
        knownLeavingCount: Math.round(average((entry) => entry.knownLeavingCount)),
        knownLeavingCountsByWindow: averageWindowScopedCounts(
          entries,
          (entry) => entry.knownLeavingCountsByWindow,
        ),
        agedOutCount: Math.round(average((entry) => entry.agedOutCount)),
        approachingFiveCount: Math.round(average((entry) => entry.approachingFiveCount)),
        approachingFiveCountsByWindow: averageWindowScopedCounts(
          entries,
          (entry) => entry.approachingFiveCountsByWindow,
        ),
        replacementPressureCountsByWindow: averageWindowScopedCounts(
          entries,
          (entry) =>
            entry.replacementPressureCountsByWindow ??
            getFallbackReplacementPressureCounts(entry),
        ),
        replacementPressure: Math.round(average((entry) => entry.replacementPressure)),
        waitlistCoverRatio: Number(average((entry) => entry.waitlistCoverRatio).toFixed(2)),
        urgencyScore: Number(average((entry) => entry.urgencyScore).toFixed(2)),
        enrolmentRatio: Number(average((entry) => entry.enrolmentRatio).toFixed(4)),
      };
    })
    .sort(
      (left, right) =>
        right.urgencyScore - left.urgencyScore ||
        left.serviceName.localeCompare(right.serviceName),
    );

  return {
    runDate: latestRun.runDate.toISOString(),
    source: latestRun.source,
    createdAt: latestRun.createdAt.toISOString(),
    snapshots: aggregatedSnapshots,
  };
}

export async function readAnalyticsSnapshotSetForDate(dateInput: string | Date): Promise<LatestSnapshotSet | null> {
  const date = new Date(dateInput);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return readAnalyticsSnapshotSetInRange(dayStart, dayEnd);
}

export async function readAnalyticsSnapshotSetSince(sinceInput: string | Date): Promise<LatestSnapshotSet | null> {
  const since = new Date(sinceInput);

  return readAnalyticsSnapshotSetInRange(since, new Date(8640000000000000));
}

async function readAnalyticsSnapshotSetInRange(start: Date, end: Date): Promise<LatestSnapshotSet | null> {
  const run = await db.analyticsSnapshotRun.findFirst({
    where: {
      runDate: {
        gte: start,
        lte: end,
      },
    },
    orderBy: [{ runDate: "desc" }, { createdAt: "desc" }],
    include: {
      snapshots: {
        orderBy: [{ urgencyScore: "desc" }, { serviceName: "asc" }],
      },
    },
  });

  if (!run) {
    return null;
  }

  return {
    runDate: run.runDate.toISOString(),
    source: run.source,
    createdAt: run.createdAt.toISOString(),
    snapshots: run.snapshots.map(mapSnapshot),
  };
}

export async function readSnapshotSetByRunDate(runDateInput: string | Date): Promise<LatestSnapshotSet | null> {
  const runDate = new Date(runDateInput);
  const run = await db.analyticsSnapshotRun.findFirst({
    where: { runDate },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      snapshots: {
        orderBy: [{ urgencyScore: "desc" }, { serviceName: "asc" }],
      },
    },
  });

  if (!run) {
    return null;
  }

  return {
    runDate: run.runDate.toISOString(),
    source: run.source,
    createdAt: run.createdAt.toISOString(),
    snapshots: run.snapshots.map(mapSnapshot),
  };
}

async function readSnapshotSetByRunId(runId: number): Promise<LatestSnapshotSet | null> {
  const run = await db.analyticsSnapshotRun.findUnique({
    where: { id: runId },
    include: {
      snapshots: {
        orderBy: [{ urgencyScore: "desc" }, { serviceName: "asc" }],
      },
    },
  });

  if (!run) {
    return null;
  }

  return {
    runDate: run.runDate.toISOString(),
    source: run.source,
    createdAt: run.createdAt.toISOString(),
    snapshots: run.snapshots.map(mapSnapshot),
  };
}

type ReadCentreSnapshotHistoryOptions = {
  fromDate?: string | Date;
  toDate?: string | Date;
};

export async function readCentreSnapshotHistory(
  centreKey: number,
  options: ReadCentreSnapshotHistoryOptions = {},
): Promise<CentreSnapshotHistoryEntry[]> {
  const fromDate = options.fromDate ? new Date(options.fromDate) : undefined;
  const toDate = options.toDate ? new Date(options.toDate) : undefined;
  const runDateFilter =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;
  const runs = await db.analyticsSnapshotRun.findMany({
    where: {
      ...(runDateFilter ? { runDate: runDateFilter } : {}),
      snapshots: {
        some: {
          centreKey,
        },
      },
    },
    orderBy: [{ runDate: "asc" }, { createdAt: "asc" }],
    include: {
      snapshots: {
        where: {
          centreKey,
        },
        take: 1,
      },
    },
  });

  return runs
    .map((run) => {
      const snapshot = run.snapshots[0];

      if (!snapshot) {
        return null;
      }

      return {
        runDate: run.runDate.toISOString(),
        source: run.source,
        createdAt: run.createdAt.toISOString(),
        snapshot: mapSnapshot(snapshot),
      };
    })
    .filter((entry): entry is CentreSnapshotHistoryEntry => entry !== null);
}

export async function readCentreReferenceByKey(centreKey: number) {
  const record = await db.centreReference.findUnique({
    where: { centreKey },
  });

  return record ? mapCentreReference(record) : null;
}

export async function readManualCentreCapacities() {
  const records = await db.manualCentreCapacity.findMany({
    orderBy: [{ centreKey: "asc" }],
  });

  return records.map(mapManualCentreCapacity);
}

export async function readManualCentreCapacityByKey(centreKey: number) {
  const record = await db.manualCentreCapacity.findUnique({
    where: { centreKey },
  });

  return record ? mapManualCentreCapacity(record) : null;
}

export async function upsertManualCentreCapacities(capacities: ManualCentreCapacityUpsertInput[]) {
  if (capacities.length === 0) {
    return [];
  }

  await db.$transaction(
    capacities.map((capacity) =>
      db.manualCentreCapacity.upsert({
        where: { centreKey: capacity.centreKey },
        update: {
          licensedCapacity: capacity.licensedCapacity,
          maxU2: capacity.maxU2,
          maxO2: capacity.maxO2,
          notes: capacity.notes,
        },
        create: {
          centreKey: capacity.centreKey,
          licensedCapacity: capacity.licensedCapacity,
          maxU2: capacity.maxU2,
          maxO2: capacity.maxO2,
          notes: capacity.notes,
        },
      }),
    ),
  );

  return readManualCentreCapacities();
}

export function createCentreReferenceStore(): CentreReferenceStore {
  return {
    async loadCentreReferences() {
      return readCentreReferences();
    },
    async upsertCentreReferences(centres) {
      await upsertCentreReferences([...centres]);
    },
  };
}
