import type { MetaNotificationHistoryRow } from "../storage/meta-recommendation-notifications-store.js";
import type { MetaRecommendationNoteView } from "../storage/meta-recommendation-notes-store.js";
import {
  DEMO_META_RECOMMENDATION_NOTES,
  DEMO_META_RECOMMENDATION_NOTIFICATIONS,
} from "./fixtures/notes.js";

type Notification = (typeof DEMO_META_RECOMMENDATION_NOTIFICATIONS)[number];

const notifications = new Map<string, Notification>(
  DEMO_META_RECOMMENDATION_NOTIFICATIONS.map((notification) => [notification.notificationId, { ...notification }]),
);

const notes = new Map<number, MetaRecommendationNoteView>(
  DEMO_META_RECOMMENDATION_NOTES.map((note) => [note.id, { ...note }]),
);

let nextNoteId = DEMO_META_RECOMMENDATION_NOTES.reduce((max, note) => Math.max(max, note.id), 0) + 1;

function nowIso() {
  return new Date().toISOString();
}

export function listDemoNotifications(): Notification[] {
  return Array.from(notifications.values()).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

export function countActiveDemoNotifications(): number {
  let count = 0;
  for (const notification of notifications.values()) {
    if (notification.dismissedAt == null) count += 1;
  }
  return count;
}

export function listDemoNotes(): MetaRecommendationNoteView[] {
  return Array.from(notes.values()).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}

export function dismissDemoNotification(notificationId: string): Notification | null {
  const existing = notifications.get(notificationId);
  if (!existing) return null;
  const updated = { ...existing, dismissedAt: nowIso() };
  notifications.set(notificationId, updated);
  return updated;
}

export function createDemoNote(input: { notificationId: string; text: string }): MetaRecommendationNoteView {
  const id = nextNoteId;
  nextNoteId += 1;
  const note: MetaRecommendationNoteView = {
    id,
    notificationId: input.notificationId,
    text: input.text,
    submittedAt: nowIso(),
    deletedAt: null,
  };
  notes.set(id, note);
  return note;
}

export function softDeleteDemoNote(id: number): MetaRecommendationNoteView | null {
  const existing = notes.get(id);
  if (!existing) return null;
  const updated = { ...existing, deletedAt: nowIso() };
  notes.set(id, updated);
  return updated;
}

export function restoreDemoNote(id: number): MetaRecommendationNoteView | null {
  const existing = notes.get(id);
  if (!existing) return null;
  const updated = { ...existing, deletedAt: null };
  notes.set(id, updated);
  return updated;
}

export function latestDemoNotesForCentre(centreKey: number, limit = 3): MetaNotificationHistoryRow[] {
  const centreNotificationIds = new Set(
    Array.from(notifications.values())
      .filter((notification) => notification.centreKey === centreKey)
      .map((notification) => notification.notificationId),
  );
  const rows: MetaNotificationHistoryRow[] = [];
  for (const note of notes.values()) {
    if (note.deletedAt != null) continue;
    if (!centreNotificationIds.has(note.notificationId)) continue;
    const notification = notifications.get(note.notificationId);
    if (!notification) continue;
    rows.push({
      kind: "Note",
      centreKey,
      centreName: notification.centreName,
      notificationId: note.notificationId,
      heading: notification.recommendation,
      message: note.text,
      status: notification.dismissedAt ? "Dismissed" : "Active",
      openPlaces: String(notification.openPlaces),
      waitlist: String(notification.waitlistCount),
      pressure: String(notification.replacementPressure),
      occurredAt: note.submittedAt,
    });
  }
  rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return rows.slice(0, limit);
}

type HistoryPage = {
  rows: MetaNotificationHistoryRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  centreOptions: { centreKey: number; centreName: string }[];
};

export function readDemoNotificationHistoryPage(options: {
  page: number;
  pageSize: number;
  centreKey: number | null;
  kind: "Notification" | "Note" | null;
}): HistoryPage {
  const allNotifications = Array.from(notifications.values());
  const allNotes = Array.from(notes.values()).filter((note) => note.deletedAt == null);
  const rows: MetaNotificationHistoryRow[] = [];

  for (const notification of allNotifications) {
    if (options.centreKey != null && notification.centreKey !== options.centreKey) continue;
    if (options.kind === "Note") continue;
    rows.push({
      kind: "Notification",
      centreKey: notification.centreKey,
      centreName: notification.centreName,
      notificationId: notification.notificationId,
      heading: notification.recommendation,
      message: notification.message,
      status: notification.dismissedAt ? "Dismissed" : "Active",
      openPlaces: String(notification.openPlaces),
      waitlist: String(notification.waitlistCount),
      pressure: String(notification.replacementPressure),
      occurredAt: notification.lastSeenAt,
    });
  }

  for (const note of allNotes) {
    const notification = notifications.get(note.notificationId);
    if (!notification) continue;
    if (options.centreKey != null && notification.centreKey !== options.centreKey) continue;
    if (options.kind === "Notification") continue;
    rows.push({
      kind: "Note",
      centreKey: notification.centreKey,
      centreName: notification.centreName,
      notificationId: note.notificationId,
      heading: notification.recommendation,
      message: note.text,
      status: notification.dismissedAt ? "Dismissed" : "Active",
      openPlaces: String(notification.openPlaces),
      waitlist: String(notification.waitlistCount),
      pressure: String(notification.replacementPressure),
      occurredAt: note.submittedAt,
    });
  }

  rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  const totalRows = rows.length;
  const pageSize = Math.max(1, options.pageSize);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, options.page), totalPages);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const centreOptions = Array.from(
    new Map(
      allNotifications.map((notification) => [notification.centreKey, notification.centreName]),
    ).entries(),
  )
    .map(([centreKey, centreName]) => ({ centreKey, centreName }))
    .sort((a, b) => a.centreName.localeCompare(b.centreName));

  return {
    rows: pageRows,
    page,
    pageSize,
    totalRows,
    totalPages,
    centreOptions,
  };
}
