import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ONE_PAGER_SLOTS } from "../src/one-pager/template.js";
import type { OnePagerImages } from "../src/ui/one-pager-pdf.js";
import type { OnePagerReference } from "./one-pager-reference.js";
import { extractOnePagerPdf } from "./one-pager-extract.js";

export async function renderSourcePage(pdfPath: string, scale = 3) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(pdfPath)), useWorkerFetch: false, isOffscreenCanvasSupported: false, verbosity: 0 });
  const document = await task.promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport, background: "white" }).promise;
    return canvas;
  } finally { await task.destroy(); }
}

export async function referencePhotos(reference: OnePagerReference): Promise<OnePagerImages> {
  const images: OnePagerImages = {};
  if (reference.photoBoxes) {
    const scale = 3;
    const extracted = reference.slots ? await extractOnePagerPdf(reference.pdf) : null;
    const page = extracted ? null : await renderSourcePage(reference.pdf, scale);
    for (const slot of ONE_PAGER_SLOTS) {
      // A slot with no box has no photo to take (OPEYS's team photo was a placeholder).
      const box = reference.photoBoxes[slot];
      if (!box) continue;
      const [x, y, w, h] = box;
      if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error(`Invalid ${reference.centreName} ${slot} box`);
      const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (extracted && reference.slots) {
        const source = extracted.images[reference.slots[slot]];
        if (!source?.png) throw new Error(`Missing ${reference.centreName} ${slot} source photo`);
        // Reapply only the photo's visible rectangle, without baking the
        // separate butterfly/fern or overlaid text into an editable photo.
        const raw = await loadImage(source.png);
        context.drawImage(raw, (source.x - x) * scale, (source.y - y) * scale, source.width * scale, source.height * scale);
      } else if (page) {
        context.drawImage(page, x * scale, y * scale, w * scale, h * scale, 0, 0, canvas.width, canvas.height);
      }
      images[slot] = { bytes: canvas.toBuffer("image/jpeg", 95), mimeType: "image/jpeg" };
    }
  } else if (reference.slots) {
    const extracted = await extractOnePagerPdf(reference.pdf);
    for (const slot of ONE_PAGER_SLOTS) {
      const jpeg = extracted.images[reference.slots[slot]]?.jpeg;
      if (jpeg) images[slot] = { bytes: jpeg, mimeType: "image/jpeg" };
    }
  }
  return images;
}
