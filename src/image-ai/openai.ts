// AI images: the two OpenAI calls. Text in, picture out (generateImage), and a
// recording in, text out (transcribeAudio). Nothing here stores anything.
import type { ImageAiConfig } from "./config.js";

export const IMAGE_PROMPT_MAX_LENGTH = 32_000;
export const IMAGE_QUALITIES = ["auto", "low", "medium", "high", "xhigh", "max"] as const;
export const IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
export const IMAGE_BACKGROUNDS = ["auto", "opaque", "transparent"] as const;
// The most pixels the image model makes (see isValidImageSize). Pictures are
// made for print, so every size this app picks itself is the largest one of
// its shape that fits under this.
export const IMAGE_MAX_PIXELS = 8_294_400;
// The largest square: 2880 x 2880 is exactly IMAGE_MAX_PIXELS.
export const IMAGE_DEFAULT_SIZE = "2880x2880";
// Recordings the transcription model accepts, by file extension.
export const AUDIO_EXTENSIONS = ["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"] as const;

export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];

export type ImageOptions = {
  prompt: string;
  size: string;
  quality: ImageQuality;
  format: ImageFormat;
  background: ImageBackground;
};

export type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
};

export type AudioUpload = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

export type FetchLike = typeof fetch;

// statusCode is what this app answers with, not what OpenAI answered.
export class ImageAiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageAiError";
  }
}

// Generous: a picture at the largest size takes the model several minutes.
const IMAGE_TIMEOUT_MS = 600_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// "auto", or WIDTHxHEIGHT within the image model's limits: both edges a
// multiple of 16 and at most 3840, no more than 3:1, 655,360 to 8,294,400 pixels.
export function isValidImageSize(size: string): boolean {
  if (size === "auto") return true;
  const match = /^(\d{1,4})x(\d{1,4})$/.exec(size);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  if (Math.max(width, height) > 3840) return false;
  if (Math.max(width, height) > Math.min(width, height) * 3) return false;
  const pixels = width * height;
  return pixels >= 655_360 && pixels <= IMAGE_MAX_PIXELS;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (!(allowed as readonly string[]).includes(text)) {
    throw new ImageAiError(`${label} must be one of: ${allowed.join(", ")}.`, 400);
  }
  return text as T;
}

// Turns what a page posted into the options for one image, or throws a 400.
export function parseImageOptions(input: {
  prompt?: unknown;
  size?: unknown;
  quality?: unknown;
  format?: unknown;
  background?: unknown;
}): ImageOptions {
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) throw new ImageAiError("Describe the image you want.", 400);
  if (prompt.length > IMAGE_PROMPT_MAX_LENGTH) {
    throw new ImageAiError(`Keep the description under ${IMAGE_PROMPT_MAX_LENGTH} characters.`, 400);
  }

  const size = String(input.size ?? "").trim().toLowerCase() || IMAGE_DEFAULT_SIZE;
  if (!isValidImageSize(size)) {
    throw new ImageAiError(
      "Size must be auto or WIDTHxHEIGHT (for example 2880x2880, 3456x2400, 2400x3456): each side a multiple of 16, no side over 3840 and no more than 3:1.",
      400,
    );
  }

  const format = pick(input.format, IMAGE_FORMATS, "png", "Format");
  const background = pick(input.background, IMAGE_BACKGROUNDS, "auto", "Background");
  if (background === "transparent" && format === "jpeg") {
    throw new ImageAiError("A transparent background needs the png or webp format.", 400);
  }

  return { prompt, size, quality: pick(input.quality, IMAGE_QUALITIES, "auto", "Quality"), format, background };
}

type OpenAiErrorPayload = { error?: { message?: string; code?: string | null; type?: string | null } };

async function openAiFailure(response: Response, what: string): Promise<ImageAiError> {
  const payload = (await response.json().catch(() => ({}))) as OpenAiErrorPayload;
  const detail = payload.error?.message?.trim();

  if (response.status === 401) {
    return new ImageAiError("OpenAI did not accept the API key (OPENAI_API_KEY).", 502);
  }
  if (response.status === 429) {
    return new ImageAiError(detail || "OpenAI is refusing requests for now: the rate limit or the account's credit has run out.", 502);
  }
  // A 400 is about what was asked for (a description the safety system
  // refused, a size the model does not make), so it is the caller's to fix.
  if (response.status === 400) {
    return new ImageAiError(detail || `OpenAI refused the ${what}.`, 400);
  }
  return new ImageAiError(detail || `OpenAI ${what} failed with HTTP ${response.status}.`, 502);
}

async function callOpenAi(what: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await run(controller.signal);
    if (!response.ok) throw await openAiFailure(response, what);
    return response;
  } catch (error) {
    if (error instanceof ImageAiError) throw error;
    if (controller.signal.aborted) {
      throw new ImageAiError(`OpenAI took longer than ${Math.round(timeoutMs / 1000)} seconds for the ${what}.`, 504);
    }
    throw new ImageAiError(`Could not reach OpenAI for the ${what}.`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateImage(config: ImageAiConfig, options: ImageOptions, fetchImpl: FetchLike = fetch): Promise<GeneratedImage> {
  // "auto" is the model's own default, so it is left out rather than sent.
  const body: Record<string, unknown> = {
    model: config.imageModel,
    prompt: options.prompt,
    n: 1,
    output_format: options.format,
  };
  if (options.size !== "auto") body.size = options.size;
  if (options.quality !== "auto") body.quality = options.quality;
  if (options.background !== "auto") body.background = options.background;

  const response = await callOpenAi("image", IMAGE_TIMEOUT_MS, (signal) =>
    fetchImpl(`${config.baseUrl}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),
  );

  const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }> };
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new ImageAiError("OpenAI answered without an image.", 502);

  return { bytes: Buffer.from(encoded, "base64"), mimeType: MIME_BY_FORMAT[options.format] };
}

// Draws a new picture from an existing one and a description. The picture is
// uploaded to OpenAI, so every caller must first pass assertNoRealChildren
// (photo-slot.ts): an image of real children is never sent.
export async function editImage(
  config: ImageAiConfig,
  image: { bytes: Buffer; mimeType: string },
  options: ImageOptions,
  fetchImpl: FetchLike = fetch,
): Promise<GeneratedImage> {
  const form = new FormData();
  form.append("model", config.imageModel);
  form.append("prompt", options.prompt);
  form.append("n", "1");
  form.append("output_format", options.format);
  if (options.size !== "auto") form.append("size", options.size);
  if (options.quality !== "auto") form.append("quality", options.quality);
  const extension = image.mimeType === "image/png" ? "png" : "jpg";
  form.append("image", new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `photo.${extension}`);

  const response = await callOpenAi("image", IMAGE_TIMEOUT_MS, (signal) =>
    fetchImpl(`${config.baseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal,
    }),
  );

  const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }> };
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new ImageAiError("OpenAI answered without an image.", 502);

  return { bytes: Buffer.from(encoded, "base64"), mimeType: MIME_BY_FORMAT[options.format] };
}

const EXTENSION_BY_AUDIO_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

// OpenAI reads the recording's type from its file name, so the name must end
// in a supported extension. Browsers record as webm, ogg or mp4 and often
// name the upload "blob"; the extension then comes from the MIME type.
export function audioFilename(upload: Pick<AudioUpload, "filename" | "mimeType">): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(upload.filename)?.[1]?.toLowerCase();
  if (extension && (AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return `recording.${extension}`;
  const fromMime = EXTENSION_BY_AUDIO_MIME[upload.mimeType.split(";")[0].trim().toLowerCase()];
  return fromMime ? `recording.${fromMime}` : null;
}

export async function transcribeAudio(config: ImageAiConfig, upload: AudioUpload, fetchImpl: FetchLike = fetch): Promise<string> {
  if (upload.bytes.length === 0) throw new ImageAiError("The recording is empty.", 400);
  const filename = audioFilename(upload);
  if (!filename) {
    throw new ImageAiError(`The recording must be one of: ${AUDIO_EXTENSIONS.join(", ")}.`, 400);
  }

  const response = await callOpenAi("transcription", TRANSCRIBE_TIMEOUT_MS, (signal) => {
    const form = new FormData();
    form.set("model", config.transcribeModel);
    form.set("response_format", "json");
    form.set("file", new Blob([new Uint8Array(upload.bytes)], { type: upload.mimeType.split(";")[0] || "application/octet-stream" }), filename);
    return fetchImpl(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal,
    });
  });

  const payload = (await response.json().catch(() => ({}))) as { text?: string };
  return String(payload.text ?? "").trim();
}
