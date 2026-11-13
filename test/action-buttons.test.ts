import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PRINT_ICON, REFRESH_ICON, renderPrintAction, renderRefreshAction } from "../src/ui/action-buttons.js";

// Text inside a rendered button, with the tags stripped.
function visibleText(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

test("refresh and print buttons are one icon each and never text", () => {
  const refresh = renderRefreshAction({ label: "Refresh Meta Ads data", href: "/actions/refresh-meta-ads" });
  assert.match(refresh, new RegExp(`class="panel-action-button action-refresh"`));
  assert.match(refresh, new RegExp(`bi ${REFRESH_ICON} ui-icon`));
  assert.match(refresh, /title="Refresh Meta Ads data"/);
  assert.equal(visibleText(refresh), "");

  const running = renderRefreshAction({ label: "Updating", attributes: "data-sector-sync", running: true });
  assert.match(running, /<button[^>]*disabled/);
  assert.match(running, new RegExp(`${REFRESH_ICON} panel-action-button__spinner`));
  assert.equal(visibleText(running), "");

  const print = renderPrintAction({ label: "Download as a PDF to print", href: "/api/sector/pdf" });
  assert.match(print, /class="panel-action-button action-print"/);
  assert.match(print, / download /);
  assert.match(print, new RegExp(`bi ${PRINT_ICON} ui-icon`));
  assert.equal(visibleText(print), "");
});

// Every refresh / recrawl uses the refresh icon and every print the print
// icon: nothing in the UI goes back to the download or CSV icons.
test("no page uses the old download or export icons", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts") && /bi-download|bi-filetype-csv|bi-file-earmark-pdf/.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  walk(path.join(process.cwd(), "src", "ui"));
  assert.deepEqual(offenders, []);
});
