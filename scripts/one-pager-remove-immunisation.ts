// One-off (2026-11-18): takes "and immunisation record(s)" out of the enrolment
// text on every Info Sheet and in the shared text, so it reads as Brookfield's
// does: "Please bring a copy of your child's birth certificate."
// The text as it was is saved first under .local/one-pager-import.
//   npx tsx scripts/one-pager-remove-immunisation.ts
import "../src/load-env.js";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/db.js";

const phrase = /\s+and immunisation records?/gi;
const fix = (text: string) => text.replace(phrase, "");

try {
  const template = await prisma.onePagerTemplate.findFirst();
  const pagers = await prisma.onePager.findMany({ include: { centre: true }, orderBy: { centreKey: "asc" } });
  await mkdir(".local/one-pager-import", { recursive: true });
  const backup = `.local/one-pager-import/before-immunisation-${Date.now()}.json`;
  await writeFile(
    backup,
    JSON.stringify({ template, pagers: pagers.map((pager) => ({ centreKey: pager.centreKey, enrolOverride: pager.enrolOverride })) }, null, 2),
  );

  const changed: { where: string; text: string }[] = [];
  if (template) {
    const enrolText = fix(template.enrolText);
    const allDayEnrolText = fix(template.allDayEnrolText);
    if (enrolText !== template.enrolText || allDayEnrolText !== template.allDayEnrolText) {
      await prisma.onePagerTemplate.update({ where: { id: template.id }, data: { enrolText, allDayEnrolText } });
      if (enrolText !== template.enrolText) changed.push({ where: "Shared text (kindergarten)", text: enrolText });
      if (allDayEnrolText !== template.allDayEnrolText) changed.push({ where: "Shared text (All Day)", text: allDayEnrolText });
    }
  }
  for (const pager of pagers) {
    const enrolOverride = fix(pager.enrolOverride);
    if (enrolOverride === pager.enrolOverride) continue;
    await prisma.onePager.update({ where: { id: pager.id }, data: { enrolOverride } });
    const centre = pager.centre as Record<string, unknown>;
    changed.push({ where: `${pager.centreKey} ${String(centre.name ?? "")}`, text: enrolOverride });
  }
  console.log(JSON.stringify({ backup, changed: changed.length, rows: changed }, null, 2));
} finally {
  await prisma.$disconnect();
}
process.exit(0);
