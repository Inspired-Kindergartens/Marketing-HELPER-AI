// Builds the One Pager template artwork in src/assets/one-pager from the
// pictures scripts/one-pager-extract.ts pulled out of the Avenues one pager.
// Run once; the results are checked in.
//
//   npx tsx scripts/one-pager-assets.ts "<extract folder>"
//
// band.png, brush.png and butterfly.png are copied as they are; fern.png is
// the original mirrored left to right. logo.png is not from here: it is the
// newer logo, made by scripts/one-pager-logo-artwork.ts.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const OUT_DIR = join("src", "assets", "one-pager");
const COPIES: Array<[string, string]> = [
  ["image-1.png", "band.png"],
  ["image-9.png", "brush.png"],
  ["image-7.png", "butterfly.png"],
];

// The fern is mirrored (the user, 2026-11-17): its stems then come in from the
// left edge of the page, where it sits hard left, instead of from mid-page.
async function buildFern(sourcePath: string): Promise<Buffer> {
  const image = await loadImage(sourcePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.translate(image.width, 0);
  context.scale(-1, 1);
  context.drawImage(image, 0, 0);
  return canvas.toBuffer("image/png");
}

async function main() {
  const [extractDir] = process.argv.slice(2);
  if (!extractDir) {
    console.error('Usage: npx tsx scripts/one-pager-assets.ts "<extract folder>"');
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const [from, to] of COPIES) await copyFile(join(extractDir, from), join(OUT_DIR, to));
  await writeFile(join(OUT_DIR, "fern.png"), await buildFern(join(extractDir, "image-8.png")));
  console.log(`Artwork written to ${OUT_DIR}`);
}

await main();
