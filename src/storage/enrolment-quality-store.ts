import { prisma as db } from "../db.js";
import type {
  OperatingCapacity,
  RollMonthSummary,
  StoredRollMonth,
} from "../analytics/enrolment-quality.js";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

// Monthly summaries are derived data, recalculated while a month is still
// running, so they are upserted (the raw Infocare replies stay append-only in
// ExternalApiCapture).
export async function upsertCentreMonthlyRoll(centreKey: number, summary: RollMonthSummary, complete: boolean) {
  const data = {
    openDays: summary.openDays,
    avgPlacements: summary.avgPlacements,
    avgAm: summary.avgAm,
    avgPm: summary.avgPm,
    avgLicence: summary.avgLicence,
    avgLicenceU2: summary.avgLicenceU2,
    contactStaff: summary.contactStaff,
    sessional: summary.sessional,
    complete,
    fetchedAt: new Date(),
  };
  await db.centreMonthlyRoll.upsert({
    where: { centreKey_month: { centreKey, month: summary.month } },
    create: { centreKey, month: summary.month, ...data },
    update: data,
  });
}

export async function readCentreMonthlyRolls(fromMonth: string, toMonth: string): Promise<StoredRollMonth[]> {
  const records = await db.centreMonthlyRoll.findMany({
    where: { month: { gte: fromMonth, lte: toMonth } },
    orderBy: [{ centreKey: "asc" }, { month: "asc" }],
  });
  return records.map((record) => ({
    centreKey: record.centreKey,
    month: record.month,
    openDays: record.openDays,
    avgPlacements: record.avgPlacements,
    avgAm: record.avgAm,
    avgPm: record.avgPm,
    avgLicence: record.avgLicence,
    avgLicenceU2: record.avgLicenceU2,
    contactStaff: record.contactStaff,
    sessional: record.sessional,
  }));
}

// Months already stored as complete for each centre, so a history fetch can
// skip them and resume after a restart.
export async function readCompleteRollMonths(): Promise<Map<number, Set<string>>> {
  const records = await db.centreMonthlyRoll.findMany({
    where: { complete: true },
    select: { centreKey: true, month: true },
  });
  const byCentre = new Map<number, Set<string>>();
  for (const record of records) {
    const set = byCentre.get(record.centreKey) ?? new Set<string>();
    set.add(record.month);
    byCentre.set(record.centreKey, set);
  }
  return byCentre;
}

export async function readLatestRollFetch(): Promise<Date | null> {
  const record = await db.centreMonthlyRoll.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } });
  return record?.fetchedAt ?? null;
}

export async function readOperatingCapacities(): Promise<OperatingCapacity[]> {
  const records = await db.centreOperatingCapacity.findMany({ orderBy: [{ centreKey: "asc" }, { effectiveFrom: "asc" }] });
  return records.map((record) => ({
    centreKey: record.centreKey,
    effectiveFrom: record.effectiveFrom,
    capacity: record.capacity,
    under2Capacity: record.under2Capacity,
    note: record.note,
  }));
}

export async function saveOperatingCapacity(input: OperatingCapacity) {
  const note = input.note?.trim() || null;
  await db.centreOperatingCapacity.upsert({
    where: { centreKey_effectiveFrom: { centreKey: input.centreKey, effectiveFrom: input.effectiveFrom } },
    create: { centreKey: input.centreKey, effectiveFrom: input.effectiveFrom, capacity: input.capacity, under2Capacity: input.under2Capacity, note },
    update: { capacity: input.capacity, under2Capacity: input.under2Capacity, note },
  });
}

export async function deleteOperatingCapacity(centreKey: number, effectiveFrom: string) {
  await db.centreOperatingCapacity.deleteMany({ where: { centreKey, effectiveFrom } });
}
