import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderLandingPage } from "../src/ui/landing-page.js";
import { THEME_HEAD_SCRIPT, THEME_STORAGE_KEY } from "../src/ui/theme.js";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

test("the landing footer offers the Default, Light and Dark looks", () => {
  const html = renderLandingPage({});
  const footer = html.slice(html.indexOf('<footer class="landing__footer'), html.indexOf("</footer>"));

  assert.match(footer, /<select class="form-control" data-theme-picker/);
  assert.match(footer, /<option value="">Default<\/option><option value="light">Light<\/option><option value="dark">Dark<\/option>/);
  assert.match(footer, /window\.setAppTheme\(picker\.value\)/);
});

test("the head script applies the remembered look and announces changes", () => {
  assert.match(THEME_HEAD_SCRIPT, new RegExp(`localStorage\\.getItem\\(KEY\\)`));
  assert.match(THEME_HEAD_SCRIPT, new RegExp(`var KEY = "${THEME_STORAGE_KEY}"`));
  assert.match(THEME_HEAD_SCRIPT, /setAttribute\("data-theme", theme\)/);
  assert.match(THEME_HEAD_SCRIPT, /removeAttribute\("data-theme"\)/);
  assert.match(THEME_HEAD_SCRIPT, /new Event\("themechange"\)/);
  assert.match(THEME_HEAD_SCRIPT, /addEventListener\("storage"/);
});

test("every page head applies the look right after the theme stylesheet", () => {
  const files = sourceFiles("src").filter((file) => readFileSync(file, "utf8").includes('href="/app.css"'));
  assert.ok(files.length >= 12, `expected the page shells, found ${files.length}`);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const links = source.match(/<link rel="stylesheet" href="\/app\.css" \/>\s*<link rel="stylesheet" href="\/themes\.css" \/>\s*\$\{THEME_HEAD_SCRIPT\}/g) ?? [];
    const heads = source.match(/href="\/app\.css"/g) ?? [];
    assert.equal(links.length, heads.length, `${file}: app.css, themes.css and the theme script must sit together`);
  }

  assert.match(renderLandingPage({}), /window\.setAppTheme = function/);
});

test("the waitlist charts redraw when the look changes", () => {
  const source = readFileSync("src/ui/app-shell.ts", "utf8");

  assert.match(source, /document\.addEventListener\("themechange", renderCharts\)/);
  assert.match(source, /chart\?\.destroy\(\)/);
});
