// Makes all reviewed one pagers without the database, for comparison with
// their supplied originals.
//
//   npx tsx scripts/one-pager-sample.ts "<output folder>"
//
// Writes <name>.pdf and <name>.png (the page as a picture) for each.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

import { DEFAULT_ONE_PAGER_TEMPLATE, resolveOnePagerContent } from "../src/one-pager/template.js";
import { describeOnePagerFit, renderOnePagerPdf } from "../src/ui/one-pager-pdf.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";
import { referencePhotos } from "./one-pager-reference-photos.js";

// The first page of a PDF as a PNG, 2 pixels a point.
export async function pdfPageToPng(pdf: Buffer, scale = 2): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdf), useWorkerFetch: false, isOffscreenCanvasSupported: false, verbosity: 0 }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
  return canvas.toBuffer("image/png");
}

async function main() {
  const [outDir, only] = process.argv.slice(2);
  if (!outDir) {
    console.error('Usage: npx tsx scripts/one-pager-sample.ts "<output folder>" [pdf to turn into a png]');
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  // With a second argument: just turn that PDF's first page into a PNG.
  if (only) {
    await writeFile(join(outDir, "page.png"), await pdfPageToPng(await readFile(only)));
    console.log(`page.png -> ${outDir}`);
    process.exit(0);
  }

  for (const reference of ONE_PAGER_REFERENCES) {
    const images = await referencePhotos(reference);
    const started = Date.now();
    const result = await renderOnePagerPdf(resolveOnePagerContent(reference.centreName, reference.fields, DEFAULT_ONE_PAGER_TEMPLATE), images);
    const base = reference.centreName.replace(/\s+/g, "-").toLowerCase();
    await writeFile(join(outDir, `${base}.pdf`), result.buffer);
    await writeFile(join(outDir, `${base}.png`), await pdfPageToPng(result.buffer));
    console.log(`${reference.centreName}: ${result.fits ? "fits" : describeOnePagerFit(result.fit)} (${Date.now() - started} ms, ${Math.round(result.buffer.length / 1024)} KB)`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
