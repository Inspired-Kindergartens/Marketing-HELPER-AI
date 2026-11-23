// Extract the supplied originals for a reviewable import; cache under .local.
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractOnePagerPdf } from "./one-pager-extract.js";

const root = join(".local", "one-pager-import");
await mkdir(root, { recursive: true });
for (const file of (await readdir("docs/One Pager")).filter(file => file.endsWith(".pdf"))) {
  const out = join(root, file.replace(/\.pdf$/, ""));
  await mkdir(out, { recursive: true });
  const extracted = await extractOnePagerPdf(join("docs/One Pager", file));
  const images = [];
  for (const [index, image] of extracted.images.entries()) {
    if (image.jpeg) await writeFile(join(out, `${index}.jpg`), image.jpeg);
    images.push({ ...image, png: undefined, jpeg: undefined, index });
  }
  await writeFile(join(out, "manifest.json"), JSON.stringify({ ...extracted, images }, null, 2));
  console.log(file, extracted.text.length, "text runs;", images.length, "images");
}
process.exit(0);
