// Read-only: finds a word (a regular expression) in the live Info Sheet text,
// the shared template and every kindergarten's own fields.
//   npx tsx scripts/one-pager-find-text.ts "immuni|vaccin"
import "../src/load-env.js";
import { prisma } from "../src/db.js";

const pattern = new RegExp(process.argv[2] ?? "immuni|vaccin|inoculat", "i");
try {
  const hits: { where: string; field: string; text: string }[] = [];
  const scan = (where: string, row: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "string" && pattern.test(value)) hits.push({ where, field, text: value });
    }
  };
  const template = await prisma.onePagerTemplate.findFirst();
  if (template) scan("Shared template", template);
  const pagers = await prisma.onePager.findMany({ include: { centre: true }, orderBy: { centreKey: "asc" } });
  for (const pager of pagers) {
    const { centre, ...fields } = pager;
    const name = (centre as Record<string, unknown>).name ?? (centre as Record<string, unknown>).centreName ?? "";
    scan(`${pager.centreKey} ${String(name)} [${pager.serviceModel}]`, fields);
  }
  console.log(JSON.stringify({ sheets: pagers.length, hits }, null, 2));
} finally {
  await prisma.$disconnect();
}
process.exit(0);
