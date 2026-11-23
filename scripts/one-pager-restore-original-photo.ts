// Puts a kindergarten's photo from its old info sheet PDF (docs/One Pager)
// back in its slot, and copies it into the shared photo folder.
//
//   npx tsx scripts/one-pager-restore-original-photo.ts "<kindergarten>" <slot> ["<folder>"]
//
// The photo it replaces is kept as the slot's previous photo, so Revert on
// the page undoes this. The restored photo is stored as an ordinary upload
// (never flagged AI generated). Nothing is sent anywhere.
import "../src/load-env.js";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { prisma } from "../src/db.js";
import { ONE_PAGER_IMAGE_DIR } from "../src/one-pager/routes.js";
import { ONE_PAGER_SLOT_LABEL, isOnePagerSlot } from "../src/one-pager/template.js";
import { onePagerStore } from "../src/storage/one-pager-store.js";
import { referencePhotos } from "./one-pager-reference-photos.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";

const [wanted = "", slot = "", folder = join("..", "Info Sheet Photos")] = process.argv.slice(2);

try {
  if (!isOnePagerSlot(slot)) throw new Error(`Unknown slot "${slot}".`);
  const centres = (await onePagerStore.listCentres()).filter((centre) => centre.name.toLowerCase().startsWith(wanted.toLowerCase()));
  if (!wanted || centres.length !== 1) throw new Error(`"${wanted}" matches ${centres.length} kindergartens: ${centres.map((centre) => centre.name).join(", ")}`);
  const centre = centres[0];
  const reference = ONE_PAGER_REFERENCES.find((entry) => centre.name.toLowerCase().startsWith(entry.centreName.toLowerCase()));
  if (!reference) throw new Error(`No old info sheet is held for ${centre.name}.`);
  const jpeg = (await referencePhotos(reference))[slot]?.bytes;
  if (!jpeg) throw new Error(`${reference.pdf} has no ${ONE_PAGER_SLOT_LABEL[slot]}.`);
  const onePager = await onePagerStore.get(centre.centreKey);
  if (!onePager) throw new Error(`${centre.name} has no info sheet yet.`);

  const storedName = `${randomUUID()}.jpg`;
  const storagePath = join(ONE_PAGER_IMAGE_DIR, storedName);
  await mkdir(ONE_PAGER_IMAGE_DIR, { recursive: true });
  await writeFile(storagePath, jpeg, { flag: "wx" });
  const dropped = await onePagerStore.setImage(onePager.id, slot, { storedName, storagePath, mimeType: "image/jpeg", sizeBytes: jpeg.length });
  if (dropped) await unlink(dropped.storagePath).catch(() => undefined);
  console.log(`${centre.name} ${ONE_PAGER_SLOT_LABEL[slot]} restored from ${reference.pdf} (${jpeg.length} bytes)`);

  // Beside the copy already in the folder, never over it.
  const outDir = resolve(folder);
  await mkdir(outDir, { recursive: true });
  const filename = `${centre.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()} ${ONE_PAGER_SLOT_LABEL[slot]} (original).jpg`;
  await copyFile(storagePath, join(outDir, filename), constants.COPYFILE_EXCL);
  console.log(`Copied to ${join(outDir, filename)}`);
} finally {
  await prisma.$disconnect();
}
process.exit(0);
