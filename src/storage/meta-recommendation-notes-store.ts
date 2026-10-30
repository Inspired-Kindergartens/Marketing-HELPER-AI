import { prisma } from "../db.js";

export type MetaRecommendationNoteView = {
  id: number;
  notificationId: string;
  text: string;
  submittedAt: string;
  deletedAt: string | null;
  centreName?: string | null;
  heading?: string | null;
};

function mapNote(note: {
  id: number;
  notificationId: string;
  text: string;
  submittedAt: Date;
  deletedAt: Date | null;
  centreName?: string | null;
  heading?: string | null;
}): MetaRecommendationNoteView {
  return {
    id: note.id,
    notificationId: note.notificationId,
    text: note.text,
    submittedAt: note.submittedAt.toISOString(),
    deletedAt: note.deletedAt?.toISOString() ?? null,
    centreName: note.centreName ?? null,
    heading: note.heading ?? null,
  };
}

export async function readActiveMetaRecommendationNotes() {
  const notes = await prisma.$queryRaw<
    {
      id: number;
      notificationId: string;
      text: string;
      submittedAt: Date;
      deletedAt: Date | null;
      centreName: string | null;
      heading: string | null;
    }[]
  >`
    SELECT
      note."id",
      note."notificationId",
      note."text",
      note."submittedAt",
      note."deletedAt",
      notification."centreName",
      notification."recommendation" AS "heading"
    FROM "MetaRecommendationNote" note
    LEFT JOIN "MetaRecommendationNotification" notification
      ON notification."notificationId" = note."notificationId"
    WHERE note."deletedAt" IS NULL
    ORDER BY note."submittedAt" DESC, note."id" DESC
  `;

  return notes.map(mapNote);
}

export async function readLatestMetaRecommendationNotesForNotification(notificationId: string, take = 3) {
  const notes = await prisma.metaRecommendationNote.findMany({
    where: {
      notificationId,
      deletedAt: null,
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: Math.max(1, Math.min(10, Math.trunc(take))),
  });

  return notes.map(mapNote);
}

export async function createMetaRecommendationNote(input: { notificationId: string; text: string }) {
  const note = await prisma.metaRecommendationNote.create({
    data: {
      notificationId: input.notificationId,
      text: input.text,
    },
  });

  return mapNote(note);
}

export async function updateMetaRecommendationNote(id: number, text: string) {
  const note = await prisma.metaRecommendationNote.update({
    where: { id },
    data: { text },
  });

  return mapNote(note);
}

export async function softDeleteMetaRecommendationNote(id: number) {
  const note = await prisma.metaRecommendationNote.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });

  return mapNote(note);
}

export async function restoreMetaRecommendationNote(id: number) {
  const note = await prisma.metaRecommendationNote.update({
    where: { id },
    data: {
      deletedAt: null,
    },
  });

  return mapNote(note);
}
