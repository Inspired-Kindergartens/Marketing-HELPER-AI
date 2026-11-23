import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import multipart from "@fastify/multipart";

import { DEFAULT_AI_IMAGE_MODEL, DEFAULT_AI_TRANSCRIBE_MODEL, getImageAiConfig, readImageAiConfigStatus } from "../src/image-ai/config.js";
import { IMAGE_DEFAULT_SIZE, IMAGE_MAX_PIXELS, ImageAiError, audioFilename, isValidImageSize, parseImageOptions } from "../src/image-ai/openai.js";
import { SLOT_IMAGE_SIZE, createSlotImageGenerator } from "../src/image-ai/photo-slot.js";
import { AI_IMAGE_DIR, registerImageAiRoutes } from "../src/image-ai/routes.js";
import type { AiImageRecord, AiImageStore } from "../src/storage/ai-image-store.js";

const PNG = Buffer.from("fake-png-bytes");

function memoryStore(): AiImageStore & { rows: AiImageRecord[] } {
  const rows: AiImageRecord[] = [];
  return {
    rows,
    async create(input) {
      const row = { ...input, id: rows.length + 1, createdAt: new Date("2026-11-14T00:00:00Z") };
      rows.push(row);
      return row;
    },
    async get(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async list(limit) {
      return [...rows].reverse().slice(0, limit);
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id);
      return index < 0 ? null : rows.splice(index, 1)[0];
    },
  };
}

type Call = { url: string; headers: Record<string, string>; body: unknown };

// Stands in for OpenAI: answers the two endpoints and records what was sent.
function fakeOpenAi(overrides: { transcript?: string; imageStatus?: number; imageError?: string } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof body === "string" ? JSON.parse(body) : body,
    });
    if (String(url).endsWith("/audio/transcriptions")) {
      return Response.json({ text: overrides.transcript ?? "a red kite over the playground" });
    }
    if (overrides.imageStatus) {
      return Response.json({ error: { message: overrides.imageError } }, { status: overrides.imageStatus });
    }
    return Response.json({ data: [{ b64_json: PNG.toString("base64") }] });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function buildApp(env: Record<string, string>, openAi = fakeOpenAi()) {
  const rootDir = mkdtempSync(join(tmpdir(), "image-ai-test-"));
  const store = memoryStore();
  const app = Fastify();
  await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
  registerImageAiRoutes(app, { env, store, rootDir, fetchImpl: openAi.fetchImpl });
  return { app, store, rootDir, openAi, close: () => rmSync(rootDir, { recursive: true, force: true }) };
}

function multipartBody(fields: Record<string, string>, file?: { name: string; type: string; bytes: Buffer }) {
  const boundary = "----imageaitest";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
      file.bytes,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

const KEYED = { OPENAI_API_KEY: "sk-test-key" };

test("image AI config: models default, and only the key is required", () => {
  const empty = readImageAiConfigStatus({});
  assert.equal(empty.isConfigured, false);
  assert.deepEqual(empty.missingKeys, ["OPENAI_API_KEY"]);
  assert.equal(empty.imageModel, DEFAULT_AI_IMAGE_MODEL);
  assert.equal(empty.transcribeModel, DEFAULT_AI_TRANSCRIBE_MODEL);
  assert.throws(() => getImageAiConfig({}), /OPENAI_API_KEY/);

  const config = getImageAiConfig({ OPENAI_API_KEY: " sk-1 ", AI_IMAGE_MODEL: "other-image", AI_TRANSCRIBE_MODEL: " " });
  assert.equal(config.apiKey, "sk-1");
  assert.equal(config.imageModel, "other-image");
  assert.equal(config.transcribeModel, DEFAULT_AI_TRANSCRIBE_MODEL);
});

test("image sizes follow the model's limits", () => {
  for (const size of ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x864", "3840x2160"]) {
    assert.equal(isValidImageSize(size), true, size);
  }
  // Too small, not a multiple of 16, over 3:1, an edge over 3840, not a size.
  for (const size of ["512x512", "1000x1000", "3072x1008", "4096x1024", "big", "1024"]) {
    assert.equal(isValidImageSize(size), false, size);
  }
});

test("print quality: the sizes the app picks are the largest the model makes", async () => {
  const pixels = (size: string) => size.split("x").map(Number).reduce((width, height) => width * height);
  const [slotWidth, slotHeight] = SLOT_IMAGE_SIZE.split("x").map(Number);

  for (const size of [IMAGE_DEFAULT_SIZE, SLOT_IMAGE_SIZE]) {
    assert.equal(isValidImageSize(size), true, size);
    assert.ok(pixels(size) <= IMAGE_MAX_PIXELS, size);
  }
  assert.equal(pixels(IMAGE_DEFAULT_SIZE), IMAGE_MAX_PIXELS);
  assert.equal(pixels(SLOT_IMAGE_SIZE), IMAGE_MAX_PIXELS);
  // One more step (16 pixels) on either edge is more than the model makes.
  assert.equal(isValidImageSize(`${slotWidth + 16}x${slotHeight}`), false);
  assert.equal(isValidImageSize(`${slotWidth}x${slotHeight + 16}`), false);
  // The info sheet's photo slots are 172.4 by 120.6 points.
  assert.ok(Math.abs(slotWidth / slotHeight - 172.4 / 120.6) < 0.02);

  const openAi = fakeOpenAi();
  const generate = createSlotImageGenerator({ OPENAI_API_KEY: "sk-1" }, openAi.fetchImpl);
  assert.ok(generate);
  await generate("a sandpit under a tree");
  assert.equal((openAi.calls[0].body as { size: string }).size, SLOT_IMAGE_SIZE);
});

test("image options: defaults, and a 400 for anything not accepted", () => {
  assert.deepEqual(parseImageOptions({ prompt: "  a kite  " }), {
    prompt: "a kite",
    size: "2880x2880",
    quality: "auto",
    format: "png",
    background: "auto",
  });
  const refused = (input: Parameters<typeof parseImageOptions>[0]) =>
    assert.throws(() => parseImageOptions(input), (error) => error instanceof ImageAiError && error.statusCode === 400);
  refused({ prompt: "   " });
  refused({ prompt: "a kite", quality: "best" });
  refused({ prompt: "a kite", size: "512x512" });
  refused({ prompt: "a kite", format: "jpeg", background: "transparent" });
});

test("a browser recording gets a file name OpenAI can read", () => {
  assert.equal(audioFilename({ filename: "blob", mimeType: "audio/webm;codecs=opus" }), "recording.webm");
  assert.equal(audioFilename({ filename: "voice memo.m4a", mimeType: "application/octet-stream" }), "recording.m4a");
  assert.equal(audioFilename({ filename: "notes.txt", mimeType: "text/plain" }), null);
});

test("without a key every OpenAI route answers 503 and calls nothing", async () => {
  const { app, openAi, close } = await buildApp({});
  try {
    const status = await app.inject({ method: "GET", url: "/api/image-ai/status" });
    assert.equal(status.json().isConfigured, false);

    const generate = await app.inject({ method: "POST", url: "/api/image-ai/images", payload: { prompt: "a kite" } });
    assert.equal(generate.statusCode, 503);
    assert.deepEqual(generate.json().missingKeys, ["OPENAI_API_KEY"]);

    const transcribe = await app.inject({ method: "POST", url: "/api/image-ai/transcribe", ...multipartBody({}, { name: "a.webm", type: "audio/webm", bytes: Buffer.from("x") }) });
    assert.equal(transcribe.statusCode, 503);
    assert.equal(openAi.calls.length, 0);
  } finally {
    close();
  }
});

test("a typed description makes, stores, serves and deletes an image", async () => {
  const { app, store, rootDir, openAi, close } = await buildApp(KEYED);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/image-ai/images",
      payload: { prompt: "a red kite", size: "1536x1024", quality: "low", format: "jpeg" },
    });
    assert.equal(created.statusCode, 201);
    const { image, transcript } = created.json();
    assert.equal(transcript, null);
    assert.equal(image.source, "typed");
    assert.equal(image.prompt, "a red kite");
    assert.equal(image.mimeType, "image/jpeg");
    assert.equal(image.model, DEFAULT_AI_IMAGE_MODEL);

    assert.equal(openAi.calls.length, 1);
    assert.match(openAi.calls[0].url, /\/v1\/images\/generations$/);
    assert.equal(openAi.calls[0].headers.Authorization, "Bearer sk-test-key");
    assert.deepEqual(openAi.calls[0].body, {
      model: DEFAULT_AI_IMAGE_MODEL,
      prompt: "a red kite",
      n: 1,
      output_format: "jpeg",
      size: "1536x1024",
      quality: "low",
    });

    assert.equal(readdirSync(join(rootDir, AI_IMAGE_DIR)).length, 1);
    assert.match(store.rows[0].storedName, /\.jpg$/);

    const file = await app.inject({ method: "GET", url: image.url });
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers["content-type"], "image/jpeg");
    assert.match(String(file.headers["content-disposition"]), /^inline/);
    assert.deepEqual(file.rawPayload, PNG);
    const download = await app.inject({ method: "GET", url: image.downloadUrl });
    assert.match(String(download.headers["content-disposition"]), /^attachment; filename="ai-image-1\.jpg"/);

    const list = await app.inject({ method: "GET", url: "/api/image-ai/images" });
    assert.equal(list.json().images.length, 1);
    // The key never leaves the server.
    assert.doesNotMatch(created.body + list.body, /sk-test-key/);

    const removed = await app.inject({ method: "POST", url: `/api/image-ai/images/${image.id}/delete` });
    assert.equal(removed.statusCode, 200);
    assert.equal(readdirSync(join(rootDir, AI_IMAGE_DIR)).length, 0);
    assert.equal((await app.inject({ method: "GET", url: image.url })).statusCode, 404);
  } finally {
    close();
  }
});

test("a recording is transcribed and its words become the image", async () => {
  const { app, openAi, close } = await buildApp(KEYED);
  try {
    const heard = await app.inject({
      method: "POST",
      url: "/api/image-ai/transcribe",
      ...multipartBody({}, { name: "blob", type: "audio/webm;codecs=opus", bytes: Buffer.from("sound") }),
    });
    assert.equal(heard.statusCode, 200);
    assert.equal(heard.json().text, "a red kite over the playground");
    const form = openAi.calls[0].body as FormData;
    assert.equal(form.get("model"), DEFAULT_AI_TRANSCRIBE_MODEL);
    assert.equal((form.get("file") as File).name, "recording.webm");

    const created = await app.inject({
      method: "POST",
      url: "/api/image-ai/images",
      ...multipartBody({ prompt: "Watercolour style.", quality: "low" }, { name: "blob", type: "audio/webm", bytes: Buffer.from("sound") }),
    });
    assert.equal(created.statusCode, 201);
    const { image, transcript } = created.json();
    assert.equal(transcript, "a red kite over the playground");
    assert.equal(image.source, "spoken");
    assert.equal(image.prompt, "Watercolour style.\na red kite over the playground");
    assert.equal((openAi.calls[2].body as { prompt: string }).prompt, image.prompt);
  } finally {
    close();
  }
});

test("silence, a wrong file and an OpenAI refusal are reported, and nothing is stored", async () => {
  const silent = await buildApp(KEYED, fakeOpenAi({ transcript: "  " }));
  try {
    const response = await silent.app.inject({
      method: "POST",
      url: "/api/image-ai/images",
      ...multipartBody({}, { name: "blob", type: "audio/webm", bytes: Buffer.from("sound") }),
    });
    assert.equal(response.statusCode, 422);
    assert.equal(silent.openAi.calls.length, 1, "no image is made from silence");

    const wrongFile = await silent.app.inject({
      method: "POST",
      url: "/api/image-ai/transcribe",
      ...multipartBody({}, { name: "notes.txt", type: "text/plain", bytes: Buffer.from("hello") }),
    });
    assert.equal(wrongFile.statusCode, 400);
  } finally {
    silent.close();
  }

  const refusing = await buildApp(KEYED, fakeOpenAi({ imageStatus: 400, imageError: "Rejected by the safety system." }));
  try {
    const response = await refusing.app.inject({ method: "POST", url: "/api/image-ai/images", payload: { prompt: "something refused" } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Rejected by the safety system.");
    assert.equal(refusing.store.rows.length, 0);
  } finally {
    refusing.close();
  }

  const badKey = await buildApp(KEYED, fakeOpenAi({ imageStatus: 401, imageError: "Incorrect API key provided: sk-test-key" }));
  try {
    const response = await badKey.app.inject({ method: "POST", url: "/api/image-ai/images", payload: { prompt: "a kite" } });
    assert.equal(response.statusCode, 502);
    assert.doesNotMatch(response.body, /sk-test-key/);
  } finally {
    badKey.close();
  }
});
