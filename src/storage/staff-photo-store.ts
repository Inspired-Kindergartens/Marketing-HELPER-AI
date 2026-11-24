// Info Sheets, team photo upkeep: what the staff photo check reads and
// writes. Staff lists come from the Infocare replies already stored
// (ExternalApiCapture, get_staff_list); Infocare itself is not called.
import { prisma } from "../db.js";
import type { NamedStaff, StaffPhotoDeps, StaffRow } from "../one-pager/staff-photo.js";
import { createTask } from "./task-store.js";

export const staffPhotoStore: StaffPhotoDeps = {
  async listCentres() {
    const rows = await prisma.onePager.findMany({
      // A sheet that is not in use (the list's tick box) needs no team photo.
      where: { inUse: true, centre: { ignored: false, openStatus: "Open" } },
      include: { centre: { select: { name: true } }, images: { where: { slot: "team" }, select: { createdAt: true } } },
    });
    return rows.map((row) => ({
      centreKey: row.centreKey,
      name: row.centre.name.replace(/\s+/g, " ").trim(),
      onePagerId: row.id,
      teamPhotoAt: row.images[0]?.createdAt ?? null,
      createdAt: row.createdAt,
      staffPhotoCheckedAt: row.staffPhotoCheckedAt,
      staffPhotoTaskId: row.staffPhotoTaskId,
    }));
  },

  async staff(centreKey) {
    const captures: Array<{ payload: unknown }> = await prisma.$queryRaw`
      SELECT "payload" FROM "ExternalApiCapture"
      WHERE "source" = 'infocare' AND "operation" = 'get_staff_list' AND "outcome" = 'success'
        AND ("requestContext"->'parameters'->>'centre_key')::int = ${centreKey}
      ORDER BY "receivedAt" DESC LIMIT 1`;
    const list = (captures[0]?.payload as { staff_list?: Array<Record<string, unknown>> } | undefined)?.staff_list ?? [];
    return list.map(
      (row): StaffRow => ({ job: String(row.job ?? ""), startingDate: String(row.starting_date ?? ""), leavingDate: String(row.leaving_date ?? "") }),
    );
  },

  adverts: (centreKey) =>
    prisma.jobDescription.findMany({ where: { centreKey, closingAt: { not: null } }, select: { jobTitle: true, positionType: true, closingAt: true } }),

  async taskOpen(taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    return task != null && task.status !== "done";
  },

  createTask: (input) => createTask(input),

  async mark(onePagerId, at, taskId) {
    // Not an edit of the sheet, so its "last edited" stays where it was.
    const current = await prisma.onePager.findUniqueOrThrow({ where: { id: onePagerId }, select: { updatedAt: true } });
    await prisma.onePager.update({
      where: { id: onePagerId },
      data: { staffPhotoCheckedAt: at, updatedAt: current.updatedAt, ...(taskId != null ? { staffPhotoTaskId: taskId } : {}) },
    });
  },
};

// The newest stored Infocare staff list for a centre, with names, for the
// one-off comparison with the team photo's caption.
export async function readNamedStaff(centreKey: number): Promise<NamedStaff[]> {
  const captures: Array<{ payload: unknown }> = await prisma.$queryRaw`
    SELECT "payload" FROM "ExternalApiCapture"
    WHERE "source" = 'infocare' AND "operation" = 'get_staff_list' AND "outcome" = 'success'
      AND ("requestContext"->'parameters'->>'centre_key')::int = ${centreKey}
    ORDER BY "receivedAt" DESC LIMIT 1`;
  const list = (captures[0]?.payload as { staff_list?: Array<Record<string, unknown>> } | undefined)?.staff_list ?? [];
  return list.map((row) => ({
    firstName: String(row.first_name ?? "").trim(),
    lastName: String(row.last_name ?? "").trim(),
    job: String(row.job ?? ""),
    leavingDate: String(row.leaving_date ?? ""),
  }));
}

// The open team photo task of each kindergarten that has one, by centreKey.
// One whose sheet is not in use is left out: no photo is asked of it.
export async function readOpenStaffPhotoTasks(): Promise<Map<number, number>> {
  const rows = await prisma.onePager.findMany({ where: { inUse: true, staffPhotoTaskId: { not: null } }, select: { centreKey: true, staffPhotoTaskId: true } });
  const ids = rows.map((row) => row.staffPhotoTaskId as number);
  if (ids.length === 0) return new Map();
  const open = new Set((await prisma.task.findMany({ where: { id: { in: ids }, status: { not: "done" } }, select: { id: true } })).map((task) => task.id));
  return new Map(rows.filter((row) => open.has(row.staffPhotoTaskId as number)).map((row) => [row.centreKey, row.staffPhotoTaskId as number]));
}
