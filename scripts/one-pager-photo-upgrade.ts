// Re-takes the photos that came from the old info sheet PDFs at the full
// resolution the PDF holds (the first import took them at 216 dpi).
//
//   npx tsx scripts/one-pager-photo-upgrade.ts            what it would do
//   npx tsx scripts/one-pager-photo-upgrade.ts --apply    do it
//
// A slot is only touched when it still holds exactly the imported picture, so
// anything uploaded, generated or regenerated since is left alone, and only
// when the PDF holds more than the import took. The replaced picture is kept
// as the slot's previous photo (Revert). Photo 1-3 are also copied into the
// shared photo folder. Nothing is sent anywhere.
import "../src/load-env.js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { prisma } from "../src/db.js";
import { ONE_PAGER_IMAGE_DIR } from "../src/one-pager/routes.js";
import { ONE_PAGER_SLOTS, ONE_PAGER_SLOT_LABEL } from "../src/one-pager/template.js";
import { onePagerStore } from "../src/storage/one-pager-store.js";
import { extractOnePagerPdf } from "./one-pager-extract.js";
import { referencePhotos } from "./one-pager-reference-photos.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";

const apply = process.argv.includes("--apply");
const outDir = resolve(join("..", "Info Sheet Photos"));
// Pixels per PDF point the first import used, and the widest picture kept.
const IMPORT_SCALE = 3;
const MAX_WIDTH = 2400;

try {
  const centres = await onePagerStore.listCentres();
  const records = await onePagerStore.list();
  const rows: Array<Record<string, unknown>> = [];
  if (apply) {
    await mkdir(ONE_PAGER_IMAGE_DIR, { recursive: true });
    await mkdir(outDir, { recursive: true });
  }

  for (const reference of ONE_PAGER_REFERENCES) {
    if (!reference.photoBoxes || !reference.slots) continue;
    const centre = centres.find((entry) => entry.name.toLowerCase().startsWith(reference.centreName.toLowerCase()));
    const record = centre ? records.find((entry) => entry.centreKey === centre.centreKey) : null;
    if (!centre || !record) continue;
    const extracted = await extractOnePagerPdf(reference.pdf);
    const imported = await referencePhotos(reference);

    for (const slot of ONE_PAGER_SLOTS) {
      const box = reference.photoBoxes[slot];
      const source = extracted.images[reference.slots[slot]];
      const stored = record.images.find((image) => image.slot === slot);
      if (!box || !source?.png || !source.pixels || !stored) continue;
      const row: Record<string, unknown> = { kindergarten: centre.name, slot };
      rows.push(row);

      const bytes = await readFile(stored.storagePath).catch(() => null);
      const before = bytes ? await loadImage(bytes) : null;
      row.before = before ? `${before.width}x${before.height}` : "file missing";
      if (!bytes || !imported[slot]?.bytes.equals(bytes)) {
        row.result = "left: changed since the import";
        continue;
      }
      const [x, y, w, h] = box;
      const scale = Math.min(source.pixels[0] / source.width, MAX_WIDTH / w);
      if (scale <= IMPORT_SCALE * 1.05) {
        row.result = "left: the PDF holds no more";
        continue;
      }

      // The same cut as the import, at the picture's own resolution.
      const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(await loadImage(source.png), (source.x - x) * scale, (source.y - y) * scale, source.width * scale, source.height * scale);
      const jpeg = canvas.toBuffer("image/jpeg", 95);
      row.after = `${canvas.width}x${canvas.height}`;
      row.result = apply ? "upgraded" : "would upgrade";
      if (!apply) continue;

      const storedName = `${randomUUID()}.jpg`;
      const storagePath = join(ONE_PAGER_IMAGE_DIR, storedName);
      await writeFile(storagePath, jpeg, { flag: "wx" });
      const dropped = await onePagerStore.setImage(record.id, slot, { storedName, storagePath, mimeType: "image/jpeg", sizeBytes: jpeg.length });
      if (dropped) await unlink(dropped.storagePath).catch(() => undefined);
      // It is the same photo, so it keeps the date it went on the sheet (the
      // team photo check counts staff changes from that date).
      await prisma.onePagerImage.update({ where: { storedName }, data: { createdAt: stored.createdAt } });

      if (slot !== "team") {
        const name = `${centre.name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()} ${ONE_PAGER_SLOT_LABEL[slot]}`;
        // Where the folder holds this photo as "(original)" beside another picture, that copy is the one renewed.
        const original = join(outDir, `${name} (original).jpg`);
        await copyFile(storagePath, existsSync(original) ? original : join(outDir, `${name}.jpg`));
        row.folder = "copied";
      }
    }
  }
  console.table(rows);
} finally {
  await prisma.$disconnect();
}
process.exit(0);
