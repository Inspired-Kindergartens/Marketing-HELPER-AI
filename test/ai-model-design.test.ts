import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { RECOMMENDED_AI_MODEL } from "../src/ai/config.js";

// Enforces the design in README.md: one model, held in AI_CHAT_MODEL, named only
// by RECOMMENDED_AI_MODEL. Do not loosen these checks to get a change through.

const MODEL_NAME = /\b(llama|qwen|mistral|gemma|phi|deepseek)[-_]?\d/i;
const COMMENT = /^\s*(\/\/|\*|\/\*|#|rem\b)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs|ps1|cmd)$/.test(name) ? [path] : [];
  });
}

const files = [...sourceFiles("src"), ...sourceFiles("scripts")];

test("no code names a chat model except RECOMMENDED_AI_MODEL", () => {
  const offenders = files
    .filter((path) => path !== join("src", "ai", "config.ts"))
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((line) => !COMMENT.test(line) && MODEL_NAME.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );

  assert.deepEqual(offenders, []);
});

test("no function overrides the model variable", () => {
  const offenders = files.filter((path) => {
    const text = readFileSync(path, "utf8");
    return /\.\.\.\w*[aA]iConfig\b[^}]*AI_CHAT_MODEL/.test(text) || /AI_CHAT_MODEL:\s*["'`]/.test(text);
  });

  assert.deepEqual(offenders, []);
});

test(".env.example defaults to the recommended model", () => {
  const match = /^AI_CHAT_MODEL=(.+)$/m.exec(readFileSync(".env.example", "utf8"));

  assert.equal(match?.[1]?.trim(), RECOMMENDED_AI_MODEL);
});

test("every launch path keeps models in the one app folder", () => {
  assert.match(readFileSync("src/server.ts", "utf8"), /process\.env\.OLLAMA_MODELS = join\(process\.cwd\(\), "\.local", "ollama-models"\)/);
  assert.match(readFileSync("scripts/open-marketing-helper.ps1", "utf8"), /\$env:OLLAMA_MODELS = Join-Path \$repoRoot "\.local\\ollama-models"/);
  assert.match(readFileSync("scripts/setup-ai.ps1", "utf8"), /\[string\]\$ModelsDir = "\.local\\ollama-models"/);
});
