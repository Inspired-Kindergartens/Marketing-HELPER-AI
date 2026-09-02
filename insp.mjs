import { prisma } from "./dist/src/db.js";
for (const id of [56, 63]) {
  const r = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!r) { console.log(`${id}: gone`); continue; }
  console.log(`--- ${id}: ${r.title}`);
  console.log(`  category : ${r.category}`);
  console.log(`  tags     : ${JSON.stringify(r.tags)}`);
  console.log(`  summary  : ${JSON.stringify(r.summary)}`);
  console.log(`  bodyLen  : ${r.contentHtml.length}`);
  console.log(`  body     : ${JSON.stringify(r.contentHtml.slice(0, 200))}`);
  console.log(`  updatedAt: ${r.updatedAt.toISOString()}`);
}
await prisma.$disconnect();
