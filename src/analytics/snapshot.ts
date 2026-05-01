import { extractCentreBundles, type ExtractionDateRange } from "../infocare/extraction.js";
import {
  readAnalyticsSnapshotSetForDate,
  readManualCentreCapacities,
  readOpenCentreReferences,
  writeAnalyticsSnapshotSet,
} from "../storage/analytics-store.js";
import { computeAnalyticsSnapshots } from "./compute.js";

type RefreshAnalyticsSnapshotOptions = {
  dateRange?: ExtractionDateRange;
  referenceDate?: Date;
  source?: string;
};

export async function refreshAnalyticsSnapshot(options: RefreshAnalyticsSnapshotOptions = {}) {
  const referenceDate = options.referenceDate ?? new Date();
  const centres = await readOpenCentreReferences();
  const bundles = await extractCentreBundles({
    centres,
    dateRange: options.dateRange,
  });
  const manualCapacities = await readManualCentreCapacities();
  const computation = computeAnalyticsSnapshots(bundles, manualCapacities, referenceDate);
  const snapshotSet = await writeAnalyticsSnapshotSet({
    runDate: referenceDate,
    source: options.source ?? "manual-refresh",
    snapshots: computation.snapshots,
  });

  return {
    centresProcessed: bundles.length,
    manualCapacityCount: manualCapacities.length,
    computedCount: computation.computed.length,
    skipped: computation.skipped,
    snapshotSet,
  };
}

export async function ensureDailyAnalyticsSnapshot(referenceDate: Date = new Date()) {
  const existing = await readAnalyticsSnapshotSetForDate(referenceDate);

  if (existing) {
    return existing;
  }

  return refreshAnalyticsSnapshot({
    source: "daily-auto",
    referenceDate,
  });
}
