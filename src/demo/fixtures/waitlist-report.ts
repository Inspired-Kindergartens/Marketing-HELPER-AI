import type {
  WaitlistDiscoveryReport,
  WaitlistReportTableRow,
  WaitlistReportDistributionRow,
  WaitlistAgeProfileRow,
  WaitlistThreshold,
  RecentDemandRow,
} from "../../infocare/waitlist-report.js";
import { DEMO_RUN_DATE } from "./centres.js";

const LARGEST: WaitlistReportTableRow[] = [
  { centre: "Sunrise Early Learning", waitlist: 42, medianDays: 88, oldestDays: 412, winsorizedMeanDays: 96, shortWaitCount: 10, typicalWaitCount: 22, longRunningWaitCount: 8, veryLongRunningWaitCount: 2 },
  { centre: "Whetu Tamariki Centre", waitlist: 36, medianDays: 102, oldestDays: 365, winsorizedMeanDays: 105, shortWaitCount: 7, typicalWaitCount: 18, longRunningWaitCount: 9, veryLongRunningWaitCount: 2 },
  { centre: "Bluebell Early Years", waitlist: 31, medianDays: 76, oldestDays: 305, winsorizedMeanDays: 84, shortWaitCount: 9, typicalWaitCount: 16, longRunningWaitCount: 5, veryLongRunningWaitCount: 1 },
  { centre: "Kowhai Early Childhood", waitlist: 22, medianDays: 62, oldestDays: 198, winsorizedMeanDays: 67, shortWaitCount: 8, typicalWaitCount: 11, longRunningWaitCount: 3, veryLongRunningWaitCount: 0 },
  { centre: "Riverbend Learning Centre", waitlist: 18, medianDays: 65, oldestDays: 240, winsorizedMeanDays: 71, shortWaitCount: 6, typicalWaitCount: 9, longRunningWaitCount: 3, veryLongRunningWaitCount: 0 },
  { centre: "Pinewood Tamariki House", waitlist: 14, medianDays: 54, oldestDays: 175, winsorizedMeanDays: 58, shortWaitCount: 5, typicalWaitCount: 7, longRunningWaitCount: 2, veryLongRunningWaitCount: 0 },
];

const LONG_TAIL: WaitlistReportTableRow[] = [
  { centre: "Maple Grove Childcare", waitlist: 9, medianDays: 28, oldestDays: 88, winsorizedMeanDays: 32, shortWaitCount: 6, typicalWaitCount: 3, longRunningWaitCount: 0, veryLongRunningWaitCount: 0 },
  { centre: "Cedar Hollow Preschool", waitlist: 7, medianDays: 38, oldestDays: 110, winsorizedMeanDays: 42, shortWaitCount: 3, typicalWaitCount: 3, longRunningWaitCount: 1, veryLongRunningWaitCount: 0 },
  { centre: "Oakridge Kids Hub", waitlist: 4, medianDays: 22, oldestDays: 60, winsorizedMeanDays: 24, shortWaitCount: 3, typicalWaitCount: 1, longRunningWaitCount: 0, veryLongRunningWaitCount: 0 },
  { centre: "Harbourview Kindergarten", waitlist: 2, medianDays: 16, oldestDays: 35, winsorizedMeanDays: 18, shortWaitCount: 2, typicalWaitCount: 0, longRunningWaitCount: 0, veryLongRunningWaitCount: 0 },
];

const DISTRIBUTION: WaitlistReportDistributionRow[] = [
  { label: "0–30 days", count: 62, share: "33%" },
  { label: "31–90 days", count: 58, share: "31%" },
  { label: "91–180 days", count: 39, share: "21%" },
  { label: "181–365 days", count: 22, share: "12%" },
  { label: "365+ days", count: 4, share: "2%" },
];

const AGE_PROFILE: WaitlistAgeProfileRow[] = [
  { category: "0–30 days", under5: 48, turning5: 9, aged5Plus: 1, unknownDob: 4, total: 62 },
  { category: "31–90 days", under5: 41, turning5: 12, aged5Plus: 2, unknownDob: 3, total: 58 },
  { category: "91–180 days", under5: 25, turning5: 10, aged5Plus: 1, unknownDob: 3, total: 39 },
  { category: "181–365 days", under5: 12, turning5: 7, aged5Plus: 1, unknownDob: 2, total: 22 },
  { category: "365+ days", under5: 1, turning5: 2, aged5Plus: 1, unknownDob: 0, total: 4 },
];

const THRESHOLDS: WaitlistThreshold[] = [
  { label: "Short wait", range: "0–30 days" },
  { label: "Typical wait", range: "31–90 days" },
  { label: "Long-running wait", range: "91–180 days" },
  { label: "Very long-running wait", range: "181+ days" },
];

const RECENT_LAST_MONTH: RecentDemandRow[] = [
  { centre: "Sunrise Early Learning", newEnrolments: 3, newWaitlistEntries: 9, combined: 12 },
  { centre: "Maple Grove Childcare", newEnrolments: 5, newWaitlistEntries: 4, combined: 9 },
  { centre: "Bluebell Early Years", newEnrolments: 2, newWaitlistEntries: 7, combined: 9 },
  { centre: "Whetu Tamariki Centre", newEnrolments: 1, newWaitlistEntries: 8, combined: 9 },
  { centre: "Riverbend Learning Centre", newEnrolments: 4, newWaitlistEntries: 4, combined: 8 },
];

const RECENT_TWO_MONTHS: RecentDemandRow[] = RECENT_LAST_MONTH.map((row) => ({
  ...row,
  newEnrolments: row.newEnrolments * 2 + 1,
  newWaitlistEntries: row.newWaitlistEntries * 2,
  combined: row.combined * 2 + 1,
}));

const RECENT_THREE_MONTHS: RecentDemandRow[] = RECENT_LAST_MONTH.map((row) => ({
  ...row,
  newEnrolments: row.newEnrolments * 3,
  newWaitlistEntries: row.newWaitlistEntries * 3 + 1,
  combined: row.combined * 3 + 1,
}));

export const DEMO_WAITLIST_REPORT: WaitlistDiscoveryReport = {
  generatedAt: `${DEMO_RUN_DATE}T08:00:00.000Z`,
  openCentreCount: 10,
  totalWaitlistCount: 185,
  waitlistStartingDateCount: 172,
  startDateCount: 172,
  missingStartDateCount: 13,
  medianDays: 64,
  averageDays: 78,
  oldestDays: 412,
  shortPlusTypicalCount: 120,
  shortPlusTypicalTotal: 185,
  longRunningCount: 26,
  longRunningTotal: 185,
  largestWaitlists: LARGEST,
  longTailWaitlists: LONG_TAIL,
  distribution: DISTRIBUTION,
  ageProfileByThreshold: AGE_PROFILE,
  thresholds: THRESHOLDS,
  recentDemand: {
    lastMonth: RECENT_LAST_MONTH,
    lastTwoMonths: RECENT_TWO_MONTHS,
    lastThreeMonths: RECENT_THREE_MONTHS,
  },
};

export function loadDemoWaitlistReport(): WaitlistDiscoveryReport {
  return DEMO_WAITLIST_REPORT;
}
