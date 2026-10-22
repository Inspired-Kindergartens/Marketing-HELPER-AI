import type { AiConfig } from "./config.js";
import { AI_KEEP_ALIVE } from "./runtime.js";

// nomic-embed-text is trained with task prefixes: documents and queries are
// embedded differently, and similarity is noticeably worse without them.
export type EmbeddingKind = "document" | "query";

const PREFIX: Record<EmbeddingKind, string> = {
  document: "search_document: ",
  query: "search_query: ",
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  error?: string;
};

/**
 * Embeds texts with the local Ollama embedding model, returning unit-length
 * vectors so cosine similarity is a plain dot product.
 *
 * Runs on the CPU (`num_gpu: 0`): the 4GB GPU only fits the 8B chat model, and
 * a GPU-loaded embedder would evict it and make every chat reply cold. The
 * embedder is 137M parameters, so CPU is fast enough for a query.
 */
export async function embedTexts(
  config: Pick<AiConfig, "AI_PROVIDER" | "AI_BASE_URL">,
  model: string,
  texts: string[],
  kind: EmbeddingKind,
  timeoutMs = 120_000,
): Promise<Float32Array[]> {
  if (config.AI_PROVIDER !== "ollama") {
    throw new Error("Embeddings need the Ollama provider.");
  }
  if (texts.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: texts.map((text) => PREFIX[kind] + text),
        keep_alive: AI_KEEP_ALIVE,
        // The model's context is 2048 tokens; truncate rather than fail on a long chunk.
        truncate: true,
        options: { num_gpu: 0 },
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as OllamaEmbedResponse;
    if (!response.ok || !payload.embeddings) {
      throw new Error(payload.error || `Embedding request failed with HTTP ${response.status}.`);
    }
    if (payload.embeddings.length !== texts.length) {
      throw new Error("Embedding count did not match the input.");
    }
    return payload.embeddings.map(normalizeVector);
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeVector(values: ArrayLike<number>): Float32Array {
  const vector = Float32Array.from(values);
  let norm = 0;
  for (let index = 0; index < vector.length; index++) norm += vector[index] * vector[index];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let index = 0; index < vector.length; index++) vector[index] /= norm;
  }
  return vector;
}

// Both vectors are unit length, so this is cosine similarity.
export function dot(left: Float32Array, right: Float32Array): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index++) sum += left[index] * right[index];
  return sum;
}
