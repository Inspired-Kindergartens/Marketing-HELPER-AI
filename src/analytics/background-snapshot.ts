import { readLatestAnalyticsSnapshotSet } from "../storage/analytics-store.js";
import { refreshWaitlistReport } from "../infocare/waitlist-refresh.js";
import type { CentreExtractionFailure } from "../infocare/extraction.js";
import { refreshAnalyticsSnapshot } from "./snapshot.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type SnapshotRefreshStatus = "idle" | "in-progress" | "ready" | "error";

type SnapshotRefreshState = {
  status: SnapshotRefreshStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  centresAttempted: number | null;
  centresProcessed: number | null;
  centresFailed: number | null;
  failedCentres: CentreExtractionFailure[];
};

const state: SnapshotRefreshState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  centresAttempted: null,
  centresProcessed: null,
  centresFailed: null,
  failedCentres: [],
};

type Logger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const defaultLogger: Logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

export function getSnapshotRefreshState(): SnapshotRefreshState {
  return { ...state };
}

export function markSnapshotRefreshAcknowledged() {
  if (state.status === "ready" || state.status === "error") {
    state.status = "idle";
    state.errorMessage = null;
    state.failedCentres = [];
    state.centresAttempted = null;
    state.centresProcessed = null;
    state.centresFailed = null;
  }
}

export function recordSnapshotRefreshOutcome(result: {
  centresAttempted: number;
  centresProcessed: number;
  centresFailed: number;
  failedCentres: CentreExtractionFailure[];
  errorMessage?: string;
}) {
  state.centresAttempted = result.centresAttempted;
  state.centresProcessed = result.centresProcessed;
  state.centresFailed = result.centresFailed;
  state.failedCentres = result.failedCentres;
  state.errorMessage = result.errorMessage ?? null;
  state.completedAt = new Date().toISOString();

  if (result.centresFailed > 0 || result.errorMessage) {
    state.status = "error";
  }
}

export function clearSnapshotRefreshOutcome() {
  state.errorMessage = null;
  state.failedCentres = [];
  state.centresAttempted = null;
  state.centresProcessed = null;
  state.centresFailed = null;

  if (state.status === "error") {
    state.status = "idle";
  }
}

async function isSnapshotStale(now: Date) {
  const latest = await readLatestAnalyticsSnapshotSet();

  if (!latest) {
    return true;
  }

  const runDate = new Date(latest.runDate);

  if (Number.isNaN(runDate.getTime())) {
    return true;
  }

  return now.getTime() - runDate.getTime() >= WEEK_MS;
}

export async function tickWeeklySnapshotRefresh(logger: Logger = defaultLogger, now: Date = new Date()) {
  if (state.status === "in-progress" || state.status === "ready") {
    return;
  }

  if (!(await isSnapshotStale(now))) {
    return;
  }

  state.status = "in-progress";
  state.startedAt = new Date().toISOString();
  state.completedAt = null;
  state.errorMessage = null;
  state.failedCentres = [];
  state.centresAttempted = null;
  state.centresProcessed = null;
  state.centresFailed = null;

  logger.info({ startedAt: state.startedAt }, "Background snapshot refresh started");

  void (async () => {
    try {
      const result = await refreshAnalyticsSnapshot({ source: "background-weekly" });

      state.centresAttempted = result.centresAttempted;
      state.centresProcessed = result.centresProcessed;
      state.centresFailed = result.centresFailed;
      state.failedCentres = result.failedCentres;

      try {
        await refreshWaitlistReport();
      } catch (waitlistError) {
        logger.error({ error: waitlistError }, "Background waitlist refresh failed");
        state.errorMessage =
          waitlistError instanceof Error ? waitlistError.message : String(waitlistError);
      }

      state.status = "ready";
      state.completedAt = new Date().toISOString();
      logger.info(
        {
          completedAt: state.completedAt,
          centresProcessed: state.centresProcessed,
          centresFailed: state.centresFailed,
        },
        "Background snapshot refresh completed",
      );
    } catch (error) {
      state.status = "error";
      state.completedAt = new Date().toISOString();
      state.errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Background snapshot refresh failed");
    }
  })();
}
