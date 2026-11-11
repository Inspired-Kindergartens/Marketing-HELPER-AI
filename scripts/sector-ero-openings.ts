// Reads every Sector Insight centre's ERO page for when it opened, without
// waiting for the monthly update (which does the same). One request at a
// time; under an hour for ~400 centres the first time. Safe to run again: stated dates and
// first reviews are kept and not read again.
//   npm run sector:opened
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { refreshEroOpenings } from "../src/sector/sync.js";

const log = {
  info: (payload: object, message?: string) => console.log(message ?? "", payload),
  warn: (payload: object, message?: string) => console.warn(message ?? "", payload),
};

try {
  const notes: string[] = [];
  const result = await refreshEroOpenings(notes, log);
  const tally = await prisma.sectorCentre.groupBy({ by: ["openedBasis"], where: { inDirectory: true }, _count: true });
  console.log(result, notes.join(" "));
  console.table(tally.map((row) => ({ basis: row.openedBasis || "(not known)", centres: row._count })));
} finally {
  await prisma.$disconnect();
}
