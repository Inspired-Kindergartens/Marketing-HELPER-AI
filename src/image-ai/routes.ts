// AI images: the backend any page can plug in to. JSON in and out, no HTML.
//
//   GET  /api/image-ai/status              is it set up, and what it accepts
//   POST /api/image-ai/transcribe          a recording -> { text }
//   POST /api/image-ai/images              typed words or a recording -> a stored image
//   GET  /api/image-ai/images              the stored images, newest first
//   GET  /api/image-ai/images/:id          one image's details
//   GET  /api/image-ai/images/:id/file     the picture (?download=1 to save it)
//   POST /api/image-ai/images/:id/delete   remove it
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {} from "@fastify/multipart";

import type { AiImageRecord, AiImageStore } from "../storage/ai-image-store.js";
import { getImageAiConfig, readImageAiConfigStatus, type ImageAiEnv } from "./config.js";
import {
  AUDIO_EXTENSIONS,
  IMAGE_BACKGROUNDS,
  IMAGE_DEFAULT_SIZE,
  IMAGE_FORMATS,
  IMAGE_PROMPT_MAX_LENGTH,
  IMAGE_QUALITIES,
  ImageAiError,
  generateImage,
  parseImageOptions,
  transcribeAudio,
  type AudioUpload,
  type FetchLike,
} from "./openai.js";

export const AI_IMAGE_DIR = join("uploads", "ai-images");
const LIST_DEFAULT = 50;
const LIST_MAX = 200;

export type ImageAiRouteOptions = {
  env: ImageAiEnv;
  store: AiImageStore;
  // The folder storagePath is relative to (the project folder).
  rootDir?: string;
  fetchImpl?: FetchLike;
};

type Input = { fields: Record<string, string>; audio: AudioUpload | null };

function parseId(value: unknown): number | null {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// A page may post JSON, a plain form, or multipart with a recording in it.
async function readInput(request: FastifyRequest): Promise<Input> {
  const fields: Record<string, string> = {};
  let audio: AudioUpload | null = null;

  if (request.isMultipart()) {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        const bytes = await part.toBuffer();
        audio ??= { bytes, filename: part.filename || "", mimeType: part.mimetype || "" };
      } else {
        fields[part.fieldname] = String(part.value ?? "");
      }
    }
    return { fields, audio };
  }

  const body = request.body;
  if (body && typeof body === "object") {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value != null) fields[key] = String(value);
    }
  }
  return { fields, audio };
}

function toJson(image: AiImageRecord) {
  return {
    id: image.id,
    prompt: image.prompt,
    source: image.source,
    model: image.model,
    size: image.size,
    quality: image.quality,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    createdAt: image.createdAt.toISOString(),
    url: `/api/image-ai/images/${image.id}/file`,
    downloadUrl: `/api/image-ai/images/${image.id}/file?download=1`,
  };
}

function extensionOf(mimeType: string): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
}

export function registerImageAiRoutes(app: FastifyInstance, options: ImageAiRouteOptions): void {
  const { env, store } = options;
  const rootDir = options.rootDir ?? process.cwd();
  const fetchImpl = options.fetchImpl ?? fetch;
  const status = readImageAiConfigStatus(env);

  function fail(reply: FastifyReply, error: unknown) {
    if (error instanceof ImageAiError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }

  // Null (and a 503 already sent) when the OpenAI key is not in .env yet.
  function configOr503(reply: FastifyReply) {
    if (status.isConfigured) return getImageAiConfig(env);
    reply.code(503).send({
      error: "AI images are not set up yet: add OPENAI_API_KEY to the .env file and restart the app.",
      missingKeys: status.missingKeys,
    });
    return null;
  }

  app.get("/api/image-ai/status", async () => ({
    isConfigured: status.isConfigured,
    missingKeys: status.missingKeys,
    imageModel: status.imageModel,
    transcribeModel: status.transcribeModel,
    promptMaxLength: IMAGE_PROMPT_MAX_LENGTH,
    defaultSize: IMAGE_DEFAULT_SIZE,
    qualities: IMAGE_QUALITIES,
    formats: IMAGE_FORMATS,
    backgrounds: IMAGE_BACKGROUNDS,
    audioTypes: AUDIO_EXTENSIONS,
  }));

  // Speech to text only, for a page that shows the words before making the image.
  app.post("/api/image-ai/transcribe", async (request, reply) => {
    const config = configOr503(reply);
    if (!config) return reply;

    try {
      const { audio } = await readInput(request);
      if (!audio) throw new ImageAiError("Send the recording as a file in a multipart form.", 400);
      const text = await transcribeAudio(config, audio, fetchImpl);
      if (!text) throw new ImageAiError("No speech was heard in the recording.", 422);
      return { text };
    } catch (error) {
      return fail(reply, error);
    }
  });

  // Typed: { prompt }. Spoken: a multipart form with the recording; its words
  // become the prompt (after any typed prompt sent with it).
  app.post("/api/image-ai/images", async (request, reply) => {
    const config = configOr503(reply);
    if (!config) return reply;

    try {
      const { fields, audio } = await readInput(request);
      let transcript: string | null = null;
      if (audio) {
        transcript = await transcribeAudio(config, audio, fetchImpl);
        if (!transcript) throw new ImageAiError("No speech was heard in the recording.", 422);
      }

      const typed = (fields.prompt ?? "").trim();
      const imageOptions = parseImageOptions({ ...fields, prompt: [typed, transcript].filter(Boolean).join("\n") });
      const generated = await generateImage(config, imageOptions, fetchImpl);

      const storedName = `${randomUUID()}.${extensionOf(generated.mimeType)}`;
      const storagePath = join(AI_IMAGE_DIR, storedName);
      const absolutePath = join(rootDir, storagePath);
      await mkdir(join(rootDir, AI_IMAGE_DIR), { recursive: true });
      await writeFile(absolutePath, generated.bytes, { flag: "wx" });

      try {
        const image = await store.create({
          prompt: imageOptions.prompt,
          source: transcript ? "spoken" : "typed",
          model: config.imageModel,
          size: imageOptions.size,
          quality: imageOptions.quality,
          storedName,
          storagePath,
          mimeType: generated.mimeType,
          sizeBytes: generated.bytes.length,
        });
        return reply.code(201).send({ image: toJson(image), transcript });
      } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Querystring: { limit?: string } }>("/api/image-ai/images", async (request) => {
    const limit = Math.min(parseId(request.query?.limit) ?? LIST_DEFAULT, LIST_MAX);
    return { images: (await store.list(limit)).map(toJson) };
  });

  app.get<{ Params: { id: string } }>("/api/image-ai/images/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const image = id == null ? null : await store.get(id);
    if (!image) return reply.code(404).send({ error: "Image not found." });
    return { image: toJson(image) };
  });

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>("/api/image-ai/images/:id/file", async (request, reply) => {
    const id = parseId(request.params.id);
    const image = id == null ? null : await store.get(id);
    if (!image) return reply.code(404).send({ error: "Image not found." });

    const file = await readFile(join(rootDir, image.storagePath)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!file) return reply.code(404).send({ error: "The image file is missing." });

    const filename = `ai-image-${image.id}.${extensionOf(image.mimeType)}`;
    return reply
      .type(image.mimeType)
      .header("Content-Length", String(file.length))
      .header("Cache-Control", "private, max-age=86400")
      .header("Content-Disposition", `${request.query?.download ? "attachment" : "inline"}; filename="${filename}"`)
      .send(file);
  });

  app.post<{ Params: { id: string } }>("/api/image-ai/images/:id/delete", async (request, reply) => {
    const id = parseId(request.params.id);
    if (id == null) return reply.code(400).send({ error: "Valid image id is required." });

    const image = await store.delete(id);
    if (image) {
      await unlink(join(rootDir, image.storagePath)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    return { ok: true };
  });
}
