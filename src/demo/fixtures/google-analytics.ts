import type { GoogleAnalyticsDailySnapshotView } from "../../storage/google-analytics-store.js";
import { DEMO_RUN_DATE } from "./centres.js";

const SNAPSHOT_DATE = DEMO_RUN_DATE;
const RANGE_START = "2026-04-15";
const RANGE_END = DEMO_RUN_DATE;
const PULLED_AT = `${DEMO_RUN_DATE}T08:35:00.000Z`;
const ISO = `${DEMO_RUN_DATE}T08:35:00.000Z`;

export const DEMO_GA_SNAPSHOT: GoogleAnalyticsDailySnapshotView = {
  id: 1,
  propertyId: "demo-property",
  snapshotDate: SNAPSHOT_DATE,
  rangeStartDate: RANGE_START,
  rangeEndDate: RANGE_END,
  pulledAt: PULLED_AT,
  createdAt: ISO,
  updatedAt: ISO,
  activeUsers: 4218,
  sessions: 6402,
  engagedSessions: 4180,
  screenPageViews: 18420,
  conversions: 142,
  totalRevenue: 0,
  engagementRate: 0.653,
  averageSessionDuration: 138.4,
  pages: [
    { id: 1, pagePath: "/", pageTitle: "iKindergartens — Home", activeUsers: 1820, sessions: 2640, screenPageViews: 5210, engagementRate: 0.71 },
    { id: 2, pagePath: "/centres", pageTitle: "Find a centre", activeUsers: 1140, sessions: 1690, screenPageViews: 3210, engagementRate: 0.68 },
    { id: 3, pagePath: "/centres/sunrise-early-learning", pageTitle: "Sunrise Early Learning", activeUsers: 312, sessions: 458, screenPageViews: 720, engagementRate: 0.74 },
    { id: 4, pagePath: "/centres/maple-grove-childcare", pageTitle: "Maple Grove Childcare", activeUsers: 528, sessions: 760, screenPageViews: 1180, engagementRate: 0.76 },
    { id: 5, pagePath: "/centres/riverbend-learning-centre", pageTitle: "Riverbend Learning Centre", activeUsers: 410, sessions: 612, screenPageViews: 980, engagementRate: 0.72 },
    { id: 6, pagePath: "/centres/oakridge-kids-hub", pageTitle: "Oakridge Kids Hub", activeUsers: 88, sessions: 120, screenPageViews: 198, engagementRate: 0.51 },
    { id: 7, pagePath: "/centres/bluebell-early-years", pageTitle: "Bluebell Early Years", activeUsers: 264, sessions: 390, screenPageViews: 612, engagementRate: 0.69 },
    { id: 8, pagePath: "/centres/pinewood-tamariki-house", pageTitle: "Pinewood Tamariki House", activeUsers: 218, sessions: 320, screenPageViews: 504, engagementRate: 0.66 },
    { id: 9, pagePath: "/centres/harbourview-kindergarten", pageTitle: "Harbourview Kindergarten", activeUsers: 64, sessions: 92, screenPageViews: 138, engagementRate: 0.48 },
    { id: 10, pagePath: "/centres/kowhai-early-childhood", pageTitle: "Kowhai Early Childhood", activeUsers: 392, sessions: 580, screenPageViews: 904, engagementRate: 0.73 },
    { id: 11, pagePath: "/centres/cedar-hollow-preschool", pageTitle: "Cedar Hollow Preschool", activeUsers: 174, sessions: 260, screenPageViews: 412, engagementRate: 0.6 },
    { id: 12, pagePath: "/centres/whetu-tamariki-centre", pageTitle: "Whetu Tamariki Centre", activeUsers: 286, sessions: 420, screenPageViews: 660, engagementRate: 0.72 },
    { id: 13, pagePath: "/enrol", pageTitle: "Enrol your child", activeUsers: 920, sessions: 1240, screenPageViews: 1810, engagementRate: 0.69 },
    { id: 14, pagePath: "/about", pageTitle: "About iKindergartens", activeUsers: 412, sessions: 540, screenPageViews: 720, engagementRate: 0.58 },
    { id: 15, pagePath: "/contact", pageTitle: "Contact us", activeUsers: 318, sessions: 420, screenPageViews: 552, engagementRate: 0.62 },
  ],
};

export function loadDemoGoogleAnalyticsSnapshot(): GoogleAnalyticsDailySnapshotView {
  return DEMO_GA_SNAPSHOT;
}
