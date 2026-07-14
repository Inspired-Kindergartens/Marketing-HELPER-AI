import type { AiConfig } from "./config.js";
import { runBuiltinChat } from "./builtin.js";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  done?: boolean;
  error?: string;
};

export class AiClientError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
  }
}

// Thinking models (e.g. qwen3) emit <think>…</think> reasoning blocks in
// message content; strip them so the UI only sees the actual reply.
function stripThinkBlocks(content: string) {
  return content.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

// Stateful chunk filter for streaming: drops <think>…</think> spans that may
// be split across chunks, holding back partial tags at chunk boundaries.
function createThinkStreamFilter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inThink = false;
  let pending = "";
  let emittedAny = false;

  function take(chunk: string) {
    pending += chunk;
    let out = "";

    while (true) {
      if (inThink) {
        const end = pending.indexOf(CLOSE);

        if (end === -1) {
          pending = pending.slice(-(CLOSE.length - 1));
          break;
        }

        pending = pending.slice(end + CLOSE.length);
        inThink = false;
      } else {
        const start = pending.indexOf(OPEN);

        if (start === -1) {
          const holdback = OPEN.length - 1;

          if (pending.length > holdback) {
            out += pending.slice(0, pending.length - holdback);
            pending = pending.slice(-holdback);
          }

          break;
        }

        out += pending.slice(0, start);
        pending = pending.slice(start + OPEN.length);
        inThink = true;
      }
    }

    if (!emittedAny) {
      out = out.replace(/^\s+/, "");
      emittedAny = out.length > 0;
    }

    return out;
  }

  function flush() {
    const rest = inThink ? "" : pending;
    pending = "";

    return emittedAny ? rest : rest.replace(/^\s+/, "");
  }

  return { take, flush };
}

export async function runLocalChat(config: AiConfig, messages: AiChatMessage[]) {
  if (config.AI_PROVIDER === "builtin") {
    return runBuiltinChat(messages);
  }

  if (config.AI_PROVIDER !== "ollama") {
    throw new AiClientError(`Unsupported AI provider: ${config.AI_PROVIDER}`, 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.AI_CHAT_MODEL,
        stream: false,
        messages,
        options: {
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;

    if (!response.ok) {
      throw new AiClientError(
        payload.error || `Local AI request failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    const content = stripThinkBlocks(payload.message?.content ?? "");

    if (!content) {
      throw new AiClientError("Local AI returned an empty response.");
    }

    return content;
  } catch (error) {
    if (error instanceof AiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiClientError("Local AI request timed out.");
    }

    throw new AiClientError(
      error instanceof Error
        ? `Local AI is unavailable: ${error.message}`
        : "Local AI is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function* streamLocalChat(config: AiConfig, messages: AiChatMessage[]) {
  if (config.AI_PROVIDER === "builtin") {
    yield runBuiltinChat(messages);
    return;
  }

  if (config.AI_PROVIDER !== "ollama") {
    throw new AiClientError(`Unsupported AI provider: ${config.AI_PROVIDER}`, 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.AI_CHAT_MODEL,
        stream: true,
        messages,
        options: {
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;

      throw new AiClientError(
        payload.error || `Local AI request failed with HTTP ${response.status}.`,
        response.status,
      );
    }

    if (!response.body) {
      throw new AiClientError("Local AI returned an empty stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const thinkFilter = createThinkStreamFilter();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        const payload = JSON.parse(trimmed) as OllamaChatResponse;

        if (payload.error) {
          throw new AiClientError(payload.error);
        }

        const content = payload.message?.content ? thinkFilter.take(payload.message.content) : "";

        if (content) {
          yield content;
        }
      }
    }

    const remainder = thinkFilter.flush();

    if (remainder) {
      yield remainder;
    }
  } catch (error) {
    if (error instanceof AiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiClientError("Local AI request timed out.");
    }

    throw new AiClientError(
      error instanceof Error
        ? `Local AI is unavailable: ${error.message}`
        : "Local AI is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
