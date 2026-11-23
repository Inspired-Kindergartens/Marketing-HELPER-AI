// A one-off check of the team photos that came in from the old info sheets:
// the names in each caption against today's staff in Infocare (the stored
// staff lists; Infocare is not called), and kindergartens with no team photo.
//
//   npx tsx scripts/one-pager-team-photo-audit.ts            show what it finds
//   npx tsx scripts/one-pager-team-photo-audit.ts --apply    also raise the tasks, once
//
// Once only: a kindergarten that has ever had a team photo task is skipped,
// so running it again raises nothing more. From then on the daily check
// (src/one-pager/staff-photo.ts) handles new staff changes.
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { STAFF_PHOTO_TASK_DAYS, compareCaptionWithStaff, staffPhotoTaskTitle } from "../src/one-pager/staff-photo.js";
import { readNamedStaff, staffPhotoStore } from "../src/storage/staff-photo-store.js";

const apply = process.argv.includes("--apply");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
const HOW = "Get a new team photo from the kindergarten, then put it on the info sheet: Info Sheets, the kindergarten, Photos, Team photo. Update the caption under it and save a new version.";

try {
  const captions = new Map((await prisma.onePager.findMany({ select: { id: true, teamCaption: true } })).map((row) => [row.id, row.teamCaption]));
  for (const centre of await staffPhotoStore.listCentres()) {
    const caption = captions.get(centre.onePagerId) ?? "";
    let outcome = "";
    let description = "";

    if (centre.staffPhotoTaskId != null) {
      outcome = "skipped: already has a team photo task";
    } else if (!centre.teamPhotoAt) {
      outcome = "no team photo";
      description = [`${centre.name} has no team photo on its info sheet.`, HOW].join("\n");
    } else if (!caption.trim()) {
      outcome = "photo but no caption: names cannot be checked (no task)";
    } else {
      const staff = await readNamedStaff(centre.centreKey);
      if (staff.length === 0) {
        outcome = "no staff list stored: cannot be checked (no task)";
      } else {
        const { notNamed, notOnStaff } = compareCaptionWithStaff(caption, staff, today);
        if (notNamed.length === 0 && notOnStaff.length === 0) {
          outcome = "caption matches today's staff";
        } else {
          outcome = `differs: not named ${JSON.stringify(notNamed)}; not on staff ${JSON.stringify(notOnStaff)}`;
          description = [
            `The team photo on the ${centre.name} info sheet came from its old sheet, and the names under it do not match today's staff in Infocare. Check whether the photo is still right.`,
            notOnStaff.length ? `- Named under the photo but not on the staff list now: ${notOnStaff.join(", ")}.` : "",
            notNamed.length ? `- Teachers on the staff list now but not named under the photo: ${notNamed.join(", ")}.` : "",
            "A shortened or preferred name can show as a difference when the person is the same.",
            HOW,
          ]
            .filter(Boolean)
            .join("\n");
        }
      }
    }

    let taskId: number | null = null;
    if (apply && description) {
      const due = new Date();
      due.setDate(due.getDate() + STAFF_PHOTO_TASK_DAYS);
      taskId = await staffPhotoStore.createTask({
        title: staffPhotoTaskTitle(centre.name),
        description,
        centreKey: centre.centreKey,
        dueDate: due.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }),
      });
      await staffPhotoStore.mark(centre.onePagerId, new Date(), taskId);
    }
    console.log(JSON.stringify({ kindergarten: centre.name, outcome, ...(apply ? { task: taskId } : { wouldRaiseTask: Boolean(description) }) }));
  }
} finally {
  await prisma.$disconnect();
}
process.exit(0);
