// Raises a team photo task, as In progress, for every info sheet in use that
// has no team photo (never put in, removed, or its file gone) and no open
// team photo task.
//
//   npx tsx scripts/one-pager-missing-team-photo-tasks.ts            show what it finds
//   npx tsx scripts/one-pager-missing-team-photo-tasks.ts --apply    also raise the tasks
//
// Safe to run again: a kindergarten whose team photo task is open is skipped.
import "../src/load-env.js";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/db.js";
import { STAFF_PHOTO_TASK_DAYS, missingTeamPhotoTaskDescription, staffPhotoTaskTitle } from "../src/one-pager/staff-photo.js";
import { staffPhotoStore } from "../src/storage/staff-photo-store.js";
import { createTask } from "../src/storage/task-store.js";

const apply = process.argv.includes("--apply");

try {
  const teamFiles = new Map((await prisma.onePagerImage.findMany({ where: { slot: "team" }, select: { onePagerId: true, storagePath: true } })).map((row) => [row.onePagerId, row.storagePath]));
  for (const centre of await staffPhotoStore.listCentres()) {
    const path = teamFiles.get(centre.onePagerId);
    const missing = !path || !(await access(join(process.cwd(), path)).then(() => true, () => false));
    if (!missing) continue;

    const title = staffPhotoTaskTitle(centre.name);
    // Its own team photo task, or any other task of that name for it, still open.
    const linkedOpen = centre.staffPhotoTaskId != null && (await staffPhotoStore.taskOpen(centre.staffPhotoTaskId));
    const sameOpen = await prisma.task.findFirst({ where: { centreKey: centre.centreKey, title, status: { not: "done" } }, select: { id: true } });
    if (linkedOpen || sameOpen) {
      console.log(JSON.stringify({ kindergarten: centre.name, outcome: "no team photo: task already open", task: linkedOpen ? centre.staffPhotoTaskId : sameOpen?.id }));
      continue;
    }

    let taskId: number | null = null;
    if (apply) {
      const due = new Date();
      due.setDate(due.getDate() + STAFF_PHOTO_TASK_DAYS);
      taskId = await createTask({
        title,
        description: missingTeamPhotoTaskDescription(centre.name),
        status: "in_progress",
        centreKey: centre.centreKey,
        dueDate: due.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }),
      });
      await staffPhotoStore.mark(centre.onePagerId, new Date(), taskId);
    }
    console.log(JSON.stringify({ kindergarten: centre.name, outcome: "no team photo", ...(apply ? { task: taskId } : { wouldRaiseTask: true }) }));
  }
} finally {
  await prisma.$disconnect();
}
process.exit(0);
