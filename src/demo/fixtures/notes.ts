import type {
  MetaNotificationHistoryRow,
  MetaRecommendationNotificationView,
} from "../../storage/meta-recommendation-notifications-store.js";
import type { MetaRecommendationNoteView } from "../../storage/meta-recommendation-notes-store.js";
import { DEMO_RUN_DATE } from "./centres.js";

const ISO = (date: string, time = "08:00:00.000Z") => `${date}T${time}`;

function notificationId(centreKey: number, windowKey: string) {
  return `demo-${centreKey}-${windowKey}`;
}

export const DEMO_META_RECOMMENDATION_NOTIFICATIONS: MetaRecommendationNotificationView[] = [
  {
    notificationId: notificationId(9004, "3M"),
    centreKey: 9004,
    centreName: "Oakridge Kids Hub",
    windowKey: "3M",
    recommendation: "Needs ads",
    message: "11 children leaving in the next month and waitlist cover is well below replacement. Launch enrolment campaign within 7 days.",
    priority: 1,
    openPlaces: 14,
    actionableWaitlist: 3,
    waitlistCount: 4,
    replacementPressure: 19,
    activeCampaignCount: 0,
    spend30d: 78.4,
    firstSeenAt: ISO("2026-05-08"),
    lastSeenAt: ISO(DEMO_RUN_DATE),
    dismissedAt: null,
  },
  {
    notificationId: notificationId(9007, "3M"),
    centreKey: 9007,
    centreName: "Harbourview Kindergarten",
    windowKey: "3M",
    recommendation: "Needs ads",
    message: "Last campaign ran in February. Only 2 on the waitlist against 12 leaving in 3 months. Strongly suggest enrolment ads.",
    priority: 1,
    openPlaces: 11,
    actionableWaitlist: 1,
    waitlistCount: 2,
    replacementPressure: 8,
    activeCampaignCount: 0,
    spend30d: 0,
    firstSeenAt: ISO("2026-04-22"),
    lastSeenAt: ISO(DEMO_RUN_DATE),
    dismissedAt: null,
  },
  {
    notificationId: notificationId(9009, "3M"),
    centreKey: 9009,
    centreName: "Cedar Hollow Preschool",
    windowKey: "3M",
    recommendation: "Waitlist cover low",
    message: "Replacement pressure is climbing through Q3; consider boosting the existing learning-limited ad set.",
    priority: 2,
    openPlaces: 11,
    actionableWaitlist: 4,
    waitlistCount: 7,
    replacementPressure: 17,
    activeCampaignCount: 1,
    spend30d: 224.6,
    firstSeenAt: ISO("2026-05-02"),
    lastSeenAt: ISO(DEMO_RUN_DATE),
    dismissedAt: null,
  },
  {
    notificationId: notificationId(9010, "3M"),
    centreKey: 9010,
    centreName: "Whetu Tamariki Centre",
    windowKey: "3M",
    recommendation: "Over-covered",
    message: "36-deep waitlist with strong cover ratio. Pause active campaign to redirect spend to under-covered centres.",
    priority: 3,
    openPlaces: 0,
    actionableWaitlist: 22,
    waitlistCount: 36,
    replacementPressure: 6,
    activeCampaignCount: 1,
    spend30d: 351.9,
    firstSeenAt: ISO("2026-05-10"),
    lastSeenAt: ISO(DEMO_RUN_DATE),
    dismissedAt: null,
  },
  {
    notificationId: notificationId(9002, "3M"),
    centreKey: 9002,
    centreName: "Maple Grove Childcare",
    windowKey: "3M",
    recommendation: "Watch waitlist depth",
    message: "Lead campaign performing well; waitlist still shallow against expected leavers in Q3. Keep ads running.",
    priority: 2,
    openPlaces: 9,
    actionableWaitlist: 5,
    waitlistCount: 9,
    replacementPressure: 13,
    activeCampaignCount: 2,
    spend30d: 638.2,
    firstSeenAt: ISO("2026-04-30"),
    lastSeenAt: ISO(DEMO_RUN_DATE),
    dismissedAt: ISO("2026-05-12"),
  },
];

export const DEMO_META_RECOMMENDATION_NOTES: MetaRecommendationNoteView[] = [
  {
    id: 1,
    notificationId: notificationId(9004, "3M"),
    text: "Talked with the centre manager — they want to launch a fresh lead-gen campaign before end of month. Budget approved $400/wk.",
    submittedAt: ISO("2026-05-11", "09:20:00.000Z"),
    deletedAt: null,
  },
  {
    id: 2,
    notificationId: notificationId(9004, "3M"),
    text: "Draft creative shared with parents-group focus panel; positive feedback on the 'tour day' framing.",
    submittedAt: ISO("2026-05-13", "14:05:00.000Z"),
    deletedAt: null,
  },
  {
    id: 3,
    notificationId: notificationId(9007, "3M"),
    text: "Tried reactivating the Feb campaign last week — Meta flagged it for review. Resubmitting with new imagery.",
    submittedAt: ISO("2026-05-12", "11:40:00.000Z"),
    deletedAt: null,
  },
  {
    id: 4,
    notificationId: notificationId(9009, "3M"),
    text: "Boosted budget to $250/wk to push out of Learning Limited. Will reassess in 7 days.",
    submittedAt: ISO("2026-05-09", "16:15:00.000Z"),
    deletedAt: null,
  },
  {
    id: 5,
    notificationId: notificationId(9010, "3M"),
    text: "Pausing this week — redirecting spend to Oakridge and Harbourview as agreed at Monday's review.",
    submittedAt: ISO("2026-05-14", "08:45:00.000Z"),
    deletedAt: null,
  },
];

export const DEMO_NOTIFICATION_COUNT = DEMO_META_RECOMMENDATION_NOTIFICATIONS.filter(
  (notification) => notification.dismissedAt == null,
).length;

export function loadDemoNotesForCentre(centreKey: number): MetaNotificationHistoryRow[] {
  const matchingNotifications = DEMO_META_RECOMMENDATION_NOTIFICATIONS.filter(
    (notification) => notification.centreKey === centreKey,
  );
  if (matchingNotifications.length === 0) return [];
  const notificationIds = new Set(matchingNotifications.map((notification) => notification.notificationId));
  const noteRows: MetaNotificationHistoryRow[] = DEMO_META_RECOMMENDATION_NOTES.filter(
    (note) => notificationIds.has(note.notificationId) && note.deletedAt == null,
  ).map((note) => {
    const notification = matchingNotifications.find((n) => n.notificationId === note.notificationId);
    return {
      kind: "Note" as const,
      centreKey,
      centreName: notification?.centreName ?? "Demo centre",
      notificationId: note.notificationId,
      heading: notification?.recommendation ?? "Recommendation",
      message: note.text,
      status: notification?.dismissedAt ? "Dismissed" : "Active",
      openPlaces: String(notification?.openPlaces ?? ""),
      waitlist: String(notification?.waitlistCount ?? ""),
      pressure: String(notification?.replacementPressure ?? ""),
      occurredAt: note.submittedAt,
    };
  });
  return noteRows
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 3);
}
