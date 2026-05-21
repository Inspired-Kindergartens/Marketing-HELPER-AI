import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderReadmePage() {
  let body: string;

  try {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
    const rendered = await marked.parse(readme);
    body = `<article class="readme-md">${rendered}</article>`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    body = `<p class="readme-error">Unable to read README.md: ${escapeHtml(message)}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Read Me — Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="readme-body">
    <main class="readme">
      <p class="readme__back"><a href="/"><i class="bi bi-arrow-left-short" aria-hidden="true"></i> Back to landing</a></p>
      <h1 class="readme__title">Read Me</h1>
      ${body}
    </main>
  </body>
</html>`;
}
