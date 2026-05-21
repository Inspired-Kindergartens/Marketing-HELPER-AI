import {
  extractCentreBundlesPartial,
  type CentreExtractionFailure,
  type ExtractionDateRange,
} from "../infocare/extraction.js";
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
