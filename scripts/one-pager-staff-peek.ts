// Shows what the team photo check sees for each kindergarten, without raising
// any task: when changes are counted from, how many teaching staff the stored
// Infocare staff list holds, the teacher adverts on file, and what it would raise.
//   npx tsx scripts/one-pager-staff-peek.ts
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { checkStaffPhotos, isFullTimeTeacherAdvert, isTeachingJob } from "../src/one-pager/staff-photo.js";
import { staffPhotoStore } from "../src/storage/staff-photo-store.js";

try {
  const wouldRaise = new Map<number, string>();
  // The real check with its two writes replaced, so nothing is saved.
  await checkStaffPhotos({
    ...staffPhotoStore,
    createTask: async (input) => {
      wouldRaise.set(input.centreKey, input.description);
      return 0;
    },
    mark: async () => undefined,
  });
  for (const centre of await staffPhotoStore.listCentres()) {
    const staff = await staffPhotoStore.staff(centre.centreKey);
    const adverts = (await staffPhotoStore.adverts(centre.centreKey)).filter(isFullTimeTeacherAdvert);
    console.log(
      JSON.stringify({
        kindergarten: centre.name,
        teamPhotoAt: centre.teamPhotoAt?.toISOString().slice(0, 10) ?? null,
        teachingStaff: staff.filter((person) => isTeachingJob(person.job) && !person.leavingDate).length,
        newestStart: staff.filter((person) => isTeachingJob(person.job)).map((person) => person.startingDate).sort().pop() ?? null,
        fullTimeTeacherAdverts: adverts.map((advert) => advert.closingAt?.toISOString().slice(0, 10)),
        wouldRaise: wouldRaise.get(centre.centreKey) ?? "",
      }),
    );
  }
} finally {
  await prisma.$disconnect();
}
process.exit(0);
