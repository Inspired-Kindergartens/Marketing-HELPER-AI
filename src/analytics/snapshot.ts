import {
  extractCentreBundlesPartial,
  type CentreExtractionFailure,
  type ExtractionDateRange,
} from "../infocare/extraction.js";
import {
  readAnalyticsSnapshotSetSince,
  readManualCentreCapacities,
  readOpenCentreReferences,
  writeAnalyticsSnapshotSet,
} from "../storage/analytics-store.js";

const WEEKLY_SNAPSHOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
import { computeAnalyticsSnapshots } from "./compute.js";

type RefreshAnalyticsSnapshotOptions = {
  dateRange?: ExtractionDateRange;
  referenceDate?: Date;
  source?: string;
};

export type RefreshAnalyticsSnapshotResult = {
  centresAttempted: number;
  centresProcessed: number;
  centresFailed: number;
  failedCentres: CentreExtractionFailure[];
  manualCapacityCount: number;
  computedCount: number;
  skipped: ReturnType<typeof computeAnalyticsSnapshots>["skipped"];
  snapshotSet: Awaited<ReturnType<typeof writeAnalyticsSnapshotSet>> | null;
};

export async function refreshAnalyticsSnapshot(
  options: RefreshAnalyticsSnapshotOptions = {},
): Promise<RefreshAnalyticsSnapshotResult> {
  const referenceDate = options.referenceDate ?? new Date();
  const centres = await readOpenCentreReferences();
  const { bundles, failures } = await extractCentreBundlesPartial({
    centres,
    dateRange: options.dateRange,
  });
  const manualCapacities = await readManualCentreCapacities();
  const computation = computeAnalyticsSnapshots(bundles, manualCapacities, referenceDate);
  const baseSource = options.source ?? "manual-refresh";
  const source = failures.length > 0 ? `${baseSource}-partial` : baseSource;
  const snapshotSet =
    bundles.length > 0
      ? await writeAnalyticsSnapshotSet({
          runDate: referenceDate,
          source,
          snapshots: computation.snapshots,
        })
      : null;

  return {
    centresAttempted: centres.length,
    centresProcessed: bundles.length,
    centresFailed: failures.length,
    failedCentres: failures,
    manualCapacityCount: manualCapacities.length,
    computedCount: computation.computed.length,
    skipped: computation.skipped,
    snapshotSet,
  };
}

export async function ensureWeeklyAnalyticsSnapshot(referenceDate: Date = new Date()) {
  const sevenDaysAgo = new Date(referenceDate.getTime() - WEEKLY_SNAPSHOT_WINDOW_MS);
  const existing = await readAnalyticsSnapshotSetSince(sevenDaysAgo);

  if (existing) {
    return existing;
  }

  return refreshAnalyticsSnapshot({
    source: "weekly-auto",
    referenceDate,
  });
}
