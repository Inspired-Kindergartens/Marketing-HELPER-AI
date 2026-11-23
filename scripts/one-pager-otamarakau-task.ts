// A one-off: Otamarakau's old sheet has a photo of a child where the team
// photo goes, so the audit (which checks caption names) had nothing to check
// and raised no task. This raises its team photo task, once. The photo is
// left where it is (the user, 2026-11-17).
//
//   npx tsx scripts/one-pager-otamarakau-task.ts
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { STAFF_PHOTO_TASK_DAYS, staffPhotoTaskTitle } from "../src/one-pager/staff-photo.js";
import { staffPhotoStore } from "../src/storage/staff-photo-store.js";

try {
  const centre = (await staffPhotoStore.listCentres()).find((row) => /^otamarakau\b/i.test(row.name));
  if (!centre) throw new Error("Otamarakau Kindergarten has no info sheet");
  if (centre.staffPhotoTaskId != null) {
    console.log(JSON.stringify({ kindergarten: centre.name, outcome: "skipped: already has a team photo task", task: centre.staffPhotoTaskId }));
  } else {
    const due = new Date();
    due.setDate(due.getDate() + STAFF_PHOTO_TASK_DAYS);
    const task = await staffPhotoStore.createTask({
      title: staffPhotoTaskTitle(centre.name),
      description: [
        `The team photo on the ${centre.name} info sheet is not a team photo: it is a photo of a child, carried over from its old sheet, and there are no names under it.`,
        "Get a team photo from the kindergarten, then put it on the info sheet: Info Sheets, the kindergarten, Photos, Team photo. Add the caption under it and save a new version.",
      ].join("\n"),
      centreKey: centre.centreKey,
      dueDate: due.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }),
    });
    await staffPhotoStore.mark(centre.onePagerId, new Date(), task);
    console.log(JSON.stringify({ kindergarten: centre.name, outcome: "task raised", task }));
  }
} finally {
  await prisma.$disconnect();
}
process.exit(0);
