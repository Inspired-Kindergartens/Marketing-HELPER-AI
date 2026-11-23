// Pulls the pictures and text out of an existing one pager PDF, with where
// each sits on the page. Used to get the template artwork and to seed the
// kindergartens that already have a one pager.
//
//   npx tsx scripts/one-pager-extract.ts "<pdf>" "<output folder>"
//
// Writes image-<n>.png for every picture and manifest.json (page size, each
// picture's box in points from the top left, each text run with its font).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, ImageData, type Canvas } from "@napi-rs/canvas";

type Matrix = [number, number, number, number, number, number];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

const round = (value: number) => Math.round(value * 10) / 10;

type RawImage = { width: number; height: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: unknown };

function toCanvas(image: RawImage): Canvas | null {
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (image.bitmap) {
    context.drawImage(image.bitmap as never, 0, 0);
    return canvas;
  }
  if (!image.data) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const data = image.data;
  if (data.length === width * height * 4) {
    rgba.set(data);
  } else if (data.length === width * height * 3) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
  } else {
    // 1 bit per pixel, rows padded to a byte.
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const j = (y * width + x) * 4;
        rgba[j] = rgba[j + 1] = rgba[j + 2] = bit ? 255 : 0;
        rgba[j + 3] = 255;
      }
    }
  }
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

export type ExtractedImage = {
  png: Buffer | null;
  jpeg: Buffer | null;
  pixels: [number, number] | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedText = { text: string; x: number; y: number; size: number; width: number; font: string };

export type ExtractedOnePager = {
  page: { width: number; height: number };
  images: ExtractedImage[];
  text: ExtractedText[];
};

// The first page's pictures (in drawing order) and text runs.
export async function extractOnePagerPdf(pdfPath: string): Promise<ExtractedOnePager> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    disableFontFace: true,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  }).promise;

  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const operators = await page.getOperatorList();
  const OPS = pdfjs.OPS;

  const images: ExtractedImage[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < operators.fnArray.length; i += 1) {
    const fn = operators.fnArray[i];
    const args = operators.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args as unknown as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) ctm = multiply(ctm, Array.from(args[0] as number[]) as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const ref = args[0];
      let raw: RawImage | null = null;
      if (typeof ref === "string") {
        const store = ref.startsWith("g_") ? page.commonObjs : page.objs;
        raw = await new Promise<RawImage | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 5000);
          store.get(ref, (value: unknown) => {
            clearTimeout(timer);
            resolve(value as RawImage);
          });
        });
      } else if (ref && typeof ref === "object") {
        raw = ref as RawImage;
      }
      const canvas = raw ? toCanvas(raw) : null;
      // The unit square maps to the picture's box; PDF y runs upwards.
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      images.push({
        png: canvas ? canvas.toBuffer("image/png") : null,
        jpeg: canvas ? canvas.toBuffer("image/jpeg", 92) : null,
        pixels: raw ? [raw.width, raw.height] : null,
        x: round(Math.min(...xs)),
        y: round(pageHeight - Math.max(...ys)),
        width: round(Math.max(...xs) - Math.min(...xs)),
        height: round(Math.max(...ys) - Math.min(...ys)),
      });
    }
  }

  const textContent = await page.getTextContent();
  const text: ExtractedText[] = [];
  for (const item of textContent.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    let font = item.fontName;
    try {
      font = (page.commonObjs.get(item.fontName) as { name?: string } | undefined)?.name ?? font;
    } catch {
      // font not loaded; keep its id
    }
    text.push({
      text: item.str,
      x: round(item.transform[4]),
      y: round(pageHeight - item.transform[5]),
      size: round(Math.hypot(item.transform[2], item.transform[3])),
      width: round(item.width),
      font,
    });
  }

  return { page: { width: round(viewport.width), height: round(pageHeight) }, images, text };
}

async function main() {
  const [pdfPath, outDir] = process.argv.slice(2);
  if (!pdfPath || !outDir) {
    console.error('Usage: npx tsx scripts/one-pager-extract.ts "<pdf>" "<output folder>"');
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });
  const extracted = await extractOnePagerPdf(pdfPath);
  const images = [];
  for (const [index, image] of extracted.images.entries()) {
    const file = image.png ? `image-${index + 1}.png` : null;
    if (file && image.png) await writeFile(join(outDir, file), image.png);
    images.push({ file, pixels: image.pixels, x: image.x, y: image.y, width: image.width, height: image.height });
  }
  await writeFile(join(outDir, "manifest.json"), JSON.stringify({ page: extracted.page, images, text: extracted.text }, null, 1));
  console.log(`${images.length} pictures, ${extracted.text.length} text runs -> ${outDir}`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
