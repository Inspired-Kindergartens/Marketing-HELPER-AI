// The info sheet logo: the Inspired Kindergartens logo with "Ngā Kōhungahunga
// Manawanui" under it, as on the newer sheets. It is vector artwork in Matua's
// supplied PDF, so it is drawn from there at 6 pixels a point and cut out.
// Run once; the result is checked in.
//
//   npx tsx scripts/one-pager-logo-artwork.ts
//
// The box is the LOGO constant in src/ui/one-pager-pdf.ts, so the logo lands
// on the page exactly where it sits on Matua's sheet.
import { writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { renderSourcePage } from "./one-pager-reference-photos.js";

const SCALE = 6;
const BOX = { x: 214, y: 13, width: 170, height: 76 };

const page = await renderSourcePage("docs/One Pager/Matua Kindergarten 1 pager Infosheet A4_Jan 2024_LR.pdf", SCALE);
const canvas = createCanvas(BOX.width * SCALE, BOX.height * SCALE);
canvas.getContext("2d").drawImage(page, BOX.x * SCALE, BOX.y * SCALE, BOX.width * SCALE, BOX.height * SCALE, 0, 0, canvas.width, canvas.height);
await writeFile("src/assets/one-pager/logo.png", canvas.toBuffer("image/png"));
console.log(`logo.png ${canvas.width}x${canvas.height}`);
process.exit(0);
