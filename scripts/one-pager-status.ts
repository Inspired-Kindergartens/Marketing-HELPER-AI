import "../src/load-env.js";
import { writeFile, mkdir } from "node:fs/promises";
import { onePagerStore } from "../src/storage/one-pager-store.js";
import { prisma } from "../src/db.js";
try {
  const centres = await onePagerStore.listCentres();
  const records = await onePagerStore.list();
  if (process.argv.includes("--snapshot")) {
    await mkdir(".local/one-pager-import", { recursive: true });
    await writeFile(`.local/one-pager-import/before-${Date.now()}.json`, JSON.stringify({ centres, records, template: await onePagerStore.getTemplate() }, null, 2));
  }
  console.log(JSON.stringify(centres.map(c => ({ ...c, fields: records.find(r => r.centreKey === c.centreKey), })), null, 2));
} finally { await prisma.$disconnect(); }
process.exit(0);
