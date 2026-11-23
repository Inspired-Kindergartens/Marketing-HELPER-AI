// Tai o Fenua's own artwork, from its supplied PDF (vector there, so drawn
// large and cut out). Run once; the results are checked in.
//
//   npx tsx scripts/one-pager-tai-artwork.ts
//
// tai-o-fenua-header.png: its logo beside ours, as at the top of its sheet.
// tai-o-fenua-hibiscus.png: the hibiscus outline in the teal half-circle at
// the foot of its sheet, on a clear background (the sheet's page edge cuts
// the flower off at the bottom, so the picture's bottom edge is that cut).
import { writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { renderSourcePage } from "./one-pager-reference-photos.js";

const PDF = "docs/One Pager/Tai o Fenua Kindergarten 1 pager Infosheet A4_Nov 2023.pdf";

const header = await renderSourcePage(PDF, 4);
const headerCanvas = createCanvas(310 * 4, 75 * 4);
headerCanvas.getContext("2d").drawImage(header, 250 * 4, 10 * 4, 310 * 4, 75 * 4, 0, 0, headerCanvas.width, headerCanvas.height);
await writeFile("src/assets/one-pager/tai-o-fenua-header.png", headerCanvas.toBuffer("image/png"));

// The hibiscus: 32 x 24.4 pt at the foot of the page, 8 pixels a point.
const SCALE = 8;
const BOX = { x: 280, y: 817.5, width: 32, height: 24.4 };
const page = await renderSourcePage(PDF, SCALE);
const width = Math.round(BOX.width * SCALE);
const height = Math.round(BOX.height * SCALE);
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
context.drawImage(page, BOX.x * SCALE, BOX.y * SCALE, width, height, 0, 0, width, height);
const image = context.getImageData(0, 0, width, height);
const data = image.data;
// The flower is orange on teal. Blue tells them apart: the teal's is high,
// the orange's low. The top left pixel is teal; the least blue one is orange.
const tealBlue = data[2];
let orange = [245, 160, 47];
let leastBlue = 255;
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 2] < leastBlue) {
    leastBlue = data[i + 2];
    orange = [data[i], data[i + 1], data[i + 2]];
  }
}
for (let i = 0; i < data.length; i += 4) {
  const cover = Math.max(0, Math.min(1, (tealBlue - data[i + 2]) / (tealBlue - leastBlue)));
  data[i] = orange[0];
  data[i + 1] = orange[1];
  data[i + 2] = orange[2];
  data[i + 3] = Math.round(cover * 255);
}
context.putImageData(image, 0, 0);
await writeFile("src/assets/one-pager/tai-o-fenua-hibiscus.png", canvas.toBuffer("image/png"));
console.log(`tai-o-fenua-header.png ${headerCanvas.width}x${headerCanvas.height}; tai-o-fenua-hibiscus.png ${width}x${height}, orange ${orange.join(",")}`);
process.exit(0);
