// Reads only. For every photo taken from an old info sheet PDF, shows the
// pixels the PDF really holds beside the pixels the info sheet has now.
//
//   npx tsx scripts/one-pager-photo-resolution.ts
import "../src/load-env.js";
import { readFile } from "node:fs/promises";
import { loadImage } from "@napi-rs/canvas";

import { prisma } from "../src/db.js";
import { ONE_PAGER_SLOTS } from "../src/one-pager/template.js";
import { onePagerStore } from "../src/storage/one-pager-store.js";
import { extractOnePagerPdf } from "./one-pager-extract.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";

try {
  const centres = await onePagerStore.listCentres();
  const records = await onePagerStore.list();
  const rows: Array<Record<string, unknown>> = [];
  for (const reference of ONE_PAGER_REFERENCES) {
    const centre = centres.find((entry) => entry.name.toLowerCase().startsWith(reference.centreName.toLowerCase()));
    const record = centre ? records.find((entry) => entry.centreKey === centre.centreKey) : null;
    const extracted = await extractOnePagerPdf(reference.pdf);
    for (const slot of ONE_PAGER_SLOTS) {
      const source = reference.slots ? extracted.images[reference.slots[slot]] : null;
      const box = reference.photoBoxes?.[slot];
      const stored = record?.images.find((image) => image.slot === slot);
      const bytes = stored ? await readFile(stored.storagePath).catch(() => null) : null;
      const now = bytes ? await loadImage(bytes).catch(() => null) : null;
      // The part of the embedded picture that shows in the box, in its own pixels.
      const perPoint = source?.pixels ? source.pixels[0] / source.width : 0;
      const visible = source?.pixels && box ? `${Math.round(Math.min(box[2], source.width) * perPoint)}x${Math.round(Math.min(box[3], source.height) * perPoint)}` : "";
      rows.push({
        kindergarten: reference.centreName.replace(/ Kindergarten$/, ""),
        slot,
        inPdf: source?.pixels ? source.pixels.join("x") : "none",
        pdfDpi: perPoint ? Math.round(perPoint * 72) : "",
        visibleInPdf: visible,
        storedNow: now ? `${now.width}x${now.height}` : "none",
        ai: stored?.aiGenerated ? "AI" : "",
      });
    }
  }
  console.table(rows);
} finally {
  await prisma.$disconnect();
}
process.exit(0);
