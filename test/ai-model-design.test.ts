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

// The named exceptions that are not chat models: AI images (AI_IMAGE_MODEL) and
// speech-to-text (AI_TRANSCRIBE_MODEL), both OpenAI. They are named in one file,
// stay in their own folder, and are never a way to chat on another model.
const OPENAI_MODEL_NAME = /\b(gpt-[a-z0-9]|whisper-\d|dall-e|chatgpt)/i;
const IMAGE_AI_DIR = join("src", "image-ai");

test("no code names an OpenAI model except src/image-ai/config.ts", () => {
  const offenders = files
    .filter((path) => path !== join(IMAGE_AI_DIR, "config.ts"))
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((line) => !COMMENT.test(line) && OPENAI_MODEL_NAME.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );

  assert.deepEqual(offenders, []);
});

test("the OpenAI models only make images and hear speech", () => {
  const imageAiFiles = sourceFiles(IMAGE_AI_DIR);
  const elsewhere = files.filter((path) => !imageAiFiles.includes(path));

  // Nothing outside the image feature calls OpenAI or reads its models.
  const callers = elsewhere.filter((path) => {
    const text = readFileSync(path, "utf8");
    return /api\.openai\.com/.test(text) || /\benv\.(AI_IMAGE_MODEL|AI_TRANSCRIBE_MODEL|OPENAI_API_KEY)\b/.test(text);
  });
  assert.deepEqual(callers, []);

  // The image feature uses OpenAI for those two jobs only, and never the chat model.
  for (const path of imageAiFiles) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /AI_CHAT_MODEL|chat\/completions|\/responses\b/, `${path} must not chat`);
  }
  const endpoints = imageAiFiles.flatMap((path) => [...readFileSync(path, "utf8").matchAll(/\$\{config\.baseUrl\}(\/[\w/]+)/g)].map((match) => match[1]));
  // /images/edits (added 2026-11-17,the user's Regenerate button) is the same
  // image model drawing a picture, from a picture and a description. It is the
  // one endpoint that uploads an image; test/one-pager.test.ts holds it behind
  // the "real children" check.
  assert.deepEqual(endpoints.sort(), ["/audio/transcriptions", "/images/edits", "/images/generations"]);
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
