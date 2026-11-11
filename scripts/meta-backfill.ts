// Re-pulls every day of Meta results that Meta still keeps (37 months) into
// the database, filling any gaps from times the app was not refreshed for
// more than 30 days. Safe to run again: each day keeps its newest pull.
//   npm run meta:backfill            all the history Meta keeps
//   npm run meta:backfill 2026-07-01 from that day on
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { getMetaConfig } from "../src/meta/config.js";
import { refreshMetaAds } from "../src/meta/refresh.js";

const from = process.argv[2] ?? "1970-01-01";
if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error(`Expected a date like 2026-07-01, got "${from}".`);
  process.exit(1);
}

try {
  const result = await refreshMetaAds(getMetaConfig(process.env), { historyFrom: from });
  console.log(result);
} finally {
  await prisma.$disconnect();
}
