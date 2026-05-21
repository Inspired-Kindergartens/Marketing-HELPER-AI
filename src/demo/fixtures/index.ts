import type { LatestSnapshotSet, CentreSnapshotHistoryEntry } from "../../storage/analytics-store.js";
import type { ServiceAnalyticsSnapshot } from "../../infocare/models.js";
import type { CentreContact } from "../../storage/centre-contact-store.js";
import { DEMO_CENTRES, DEMO_CONTACTS, DEMO_RUN_DATE, DEMO_SNAPSHOTS } from "./centres.js";
import { DEMO_META_DASHBOARD } from "./meta-ads.js";
import { DEMO_GA_SNAPSHOT } from "./google-analytics.js";
import { DEMO_WAITLIST_REPORT } from "./waitlist-report.js";
import {
  DEMO_META_RECOMMENDATION_NOTES,
  DEMO_META_RECOMMENDATION_NOTIFICATIONS,
  DEMO_NOTIFICATION_COUNT,
  loadDemoNotesForCentre,
} from "./notes.js";

export const DEMO_PROPERTY_ID = "demo-property";

const SET_CREATED_AT = `${DEMO_RUN_DATE}T08:00:00.000Z`;

export const DEMO_LATEST_SNAPSHOT_SET: LatestSnapshotSet = {
  runDate: DEMO_RUN_DATE,
  source: "demo",
  createdAt: SET_CREATED_AT,
  snapshots: DEMO_SNAPSHOTS,
};

function jitter(value: number, dayOffset: number, scale = 0.07): number {
  if (value === 0) return 0;
  const sign = dayOffset % 2 === 0 ? 1 : -1;
  const drift = 1 + sign * scale * (dayOffset / 12);
  return Math.max(0, Math.round(value * drift));
}

function shiftDateBackwards(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildDemoCentreHistory(centreKey: number, dayCount: number): CentreSnapshotHistoryEntry[] {
  const centre = DEMO_CENTRES.find((c) => c.centreKey === centreKey);
  if (!centre) return [];
  const base = centre.snapshot;
  const entries: CentreSnapshotHistoryEntry[] = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = shiftDateBackwards(DEMO_RUN_DATE, offset);
    const snapshot: ServiceAnalyticsSnapshot = {
      ...base,
      date,
      enrolledCount: jitter(base.enrolledCount, offset, 0.04),
      enrolledFteCount: Number((base.enrolledFteCount * (1 + (offset % 2 === 0 ? 0.02 : -0.02))).toFixed(1)),
      bookedAverageDailyCount: Number((base.bookedAverageDailyCount * (1 + (offset % 3 === 0 ? 0.03 : -0.01))).toFixed(1)),
      bookedUtilisationRatio: Math.max(0, Math.min(1.05, base.bookedUtilisationRatio + (offset % 2 === 0 ? 0.01 : -0.01))),
      waitlistCount: jitter(base.waitlistCount, offset, 0.08),
      waitlistUnder5Count: jitter(base.waitlistUnder5Count, offset, 0.08),
      waitlistTurning5ThisYearCount: jitter(base.waitlistTurning5ThisYearCount, offset, 0.06),
      enrolmentRatio: Math.max(0, Math.min(1.05, base.enrolmentRatio + (offset % 2 === 0 ? 0.01 : -0.01))),
    };
    entries.push({
      runDate: date,
      source: "demo",
      createdAt: `${date}T08:00:00.000Z`,
      snapshot,
    });
  }
  return entries;
}

export function loadDemoLatestSnapshotSet(): LatestSnapshotSet {
  return DEMO_LATEST_SNAPSHOT_SET;
}

export function loadDemoContacts(): CentreContact[] {
  return DEMO_CONTACTS;
}

export {
  DEMO_CENTRES,
  DEMO_CONTACTS,
  DEMO_GA_SNAPSHOT,
  DEMO_META_DASHBOARD,
  DEMO_META_RECOMMENDATION_NOTES,
  DEMO_META_RECOMMENDATION_NOTIFICATIONS,
  DEMO_NOTIFICATION_COUNT,
  DEMO_RUN_DATE,
  DEMO_SNAPSHOTS,
  DEMO_WAITLIST_REPORT,
  loadDemoNotesForCentre,
};
