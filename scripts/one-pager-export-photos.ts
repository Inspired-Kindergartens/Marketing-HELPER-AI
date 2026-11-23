// Copies every info sheet photo (Photo 1-3, not the team photo) into one
// folder, named after its kindergarten: "<Kindergarten> Photo 1.jpg".
//
//   npx tsx scripts/one-pager-export-photos.ts ["<folder>"]
//
// The folder defaults to "Info Sheet Photos" beside the project folder. The
// app's own files are copied, never moved, and nothing is sent anywhere.
import "../src/load-env.js";
import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { prisma } from "../src/db.js";
import { ONE_PAGER_SLOT_LABEL, isOnePagerSlot } from "../src/one-pager/template.js";
import { onePagerStore } from "../src/storage/one-pager-store.js";

const outDir = resolve(process.argv[2] ?? join("..", "Info Sheet Photos"));

try {
  const centres = await onePagerStore.listCentres();
  const records = await onePagerStore.list();
  await mkdir(outDir, { recursive: true });

  let copied = 0;
  const missing: string[] = [];
  const none: string[] = [];
  const skipped: string[] = [];
  for (const centre of centres) {
    const images = (records.find((record) => record.centreKey === centre.centreKey)?.images ?? [])
      .filter((image) => isOnePagerSlot(image.slot) && image.slot !== "team")
      .sort((a, b) => a.slot.localeCompare(b.slot));
    if (!images.length) none.push(centre.name);
    for (const image of images) {
      if (!isOnePagerSlot(image.slot)) continue;
      const safeName = centre.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      const filename = `${safeName} ${ONE_PAGER_SLOT_LABEL[image.slot]}.${image.mimeType === "image/png" ? "png" : "jpg"}`;
      try {
        // Never writes over a file that is already in the folder.
        await copyFile(image.storagePath, join(outDir, filename), constants.COPYFILE_EXCL);
        copied += 1;
      } catch (error) {
        if ((error as { code?: string }).code === "EEXIST") skipped.push(filename);
        else missing.push(filename);
      }
    }
  }

  console.log(`${copied} photos copied to ${outDir}`);
  if (skipped.length) console.log(`Already in the folder, left as they were: ${skipped.join(", ")}`);
  if (missing.length) console.log(`File not found for: ${missing.join(", ")}`);
  if (none.length) console.log(`No photos held for: ${none.join(", ")}`);
} finally {
  await prisma.$disconnect();
}
process.exit(0);
