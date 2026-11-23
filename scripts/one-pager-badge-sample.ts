// Renders one reference sheet with both preview badges over a stand-in team
// photo, to look at them without the database:
//   npx tsx scripts/one-pager-badge-sample.ts <out.pdf>
// then  npx tsx scripts/one-pager-sample.ts <folder> <out.pdf>  for a picture.
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

import { TEAM_PHOTO_EMAIL_SENT_BADGE, TEAM_PHOTO_NEEDED_BADGE } from "../src/one-pager/email.js";
import { DEFAULT_ONE_PAGER_TEMPLATE, resolveOnePagerContent } from "../src/one-pager/template.js";
import { renderOnePagerPdf } from "../src/ui/one-pager-pdf.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";

const out = process.argv[2];
if (!out) throw new Error("Give the PDF file to write.");

const canvas = createCanvas(800, 600);
const context = canvas.getContext("2d");
context.fillStyle = "#5b7f4f";
context.fillRect(0, 0, 800, 600);

const reference = ONE_PAGER_REFERENCES[0];
const content = resolveOnePagerContent(reference.centreName, reference.fields, DEFAULT_ONE_PAGER_TEMPLATE);
const pdf = await renderOnePagerPdf(content, { team: { bytes: canvas.toBuffer("image/png"), mimeType: "image/png" } }, { teamBadges: [TEAM_PHOTO_NEEDED_BADGE, TEAM_PHOTO_EMAIL_SENT_BADGE] });
writeFileSync(out, pdf.buffer);
console.log(`${reference.centreName}: ${out}`);
