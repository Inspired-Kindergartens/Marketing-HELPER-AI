import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { HELP_SOURCES } from "../src/help-kb/sources.js";
import { renderInfocareLoginPage } from "../src/ui/infocare-login-page.js";

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listTs(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
  );
}

// The AI must have no route to credentials: AI code never reads the
// environment (beyond the Windows app-data folder used to find Ollama) or the
// .env file, and never names a credential key.
test("AI code does not read environment variables or .env", () => {
  for (const file of listTs(join("src", "ai"))) {
    const source = readFileSync(file, "utf8");
    const envReads = [...source.matchAll(/process\.env\.?(\w*)/g)].map((m) => m[1]).filter((key) => key !== "LOCALAPPDATA");
    assert.deepEqual(envReads, [], `${file} reads process.env`);
    assert.doesNotMatch(source, /["'`]\.env["'`]/, `${file} references the .env file`);
    assert.doesNotMatch(source, /INFOCAREUSER|INFOCAREPASS|_TOKEN\b|API_KEY|BASIC_AUTH|DATABASE_URL/, `${file} names a credential`);
    assert.doesNotMatch(source, /from ["'][./]*(secrets|env-file|load-env)\.js["']/, `${file} imports the credential encryption modules`);
  }
});

test("AI knowledge base never indexes credential files", () => {
  const secretFiles = /(^|\/)(\.env|OAuth\.json|google-oauth-token\.json|marketing-helper-ai-[\w-]+\.json)$/;
  for (const source of Object.values(HELP_SOURCES)) {
    for (const path of source.localPaths) {
      assert.doesNotMatch(path, secretFiles);
      assert.ok(path !== "." && path !== "", "knowledge base must not index the project root");
    }
  }
});

test("Infocare login page never contains the current login", () => {
  const before = { user: process.env.INFOCAREUSER, pass: process.env.INFOCAREPASS };
  process.env.INFOCAREUSER = "sentinel-user-123";
  process.env.INFOCAREPASS = "sentinel-pass-456";
  try {
    const html = renderInfocareLoginPage({ isConfigured: true, updatedAt: null });
    assert.doesNotMatch(html, /sentinel-user-123|sentinel-pass-456/);
    assert.doesNotMatch(html, /\bvalue=/, "inputs must never be pre-filled");
  } finally {
    process.env.INFOCAREUSER = before.user;
    process.env.INFOCAREPASS = before.pass;
  }
});
