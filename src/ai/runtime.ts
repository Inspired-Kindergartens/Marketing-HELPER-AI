import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { AiConfig } from "./config.js";

// Keeps the local Ollama runtime available to any page that needs AI. The
// PowerShell launcher already does this at startup; this is the same logic for
// the case where the server is already running and Ollama has since stopped
// (or was never started because the app was opened directly).

const READY_PROBE_TIMEOUT_MS = 2000;
const START_WAIT_TIMEOUT_MS = 30000;
const START_POLL_INTERVAL_MS = 1000;

// How long Ollama keeps a model in memory after its last request. The default
// (5 minutes) meant most visits paid a cold load first, which on this machine
// can take over a minute and pushed requests past their timeout.
export const AI_KEEP_ALIVE = "30m";

export async function isAiReady(config: AiConfig): Promise<boolean> {
  // The built-in provider needs no external runtime, so it is always ready.
  if (config.AI_PROVIDER !== "ollama") return true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READY_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Same discovery order as scripts/open-marketing-helper.ps1: PATH, then the
// repo-local copy, then a per-user install.
function findOllamaExecutable(): string | null {
  const candidates: string[] = [];

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(join(localAppData, "Programs", "Ollama", "ollama.exe"));
  }
  candidates.push(join(process.cwd(), ".local", "ollama", "ollama.exe"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Fall back to the bare command name and let the OS resolve it on PATH.
  return process.platform === "win32" ? "ollama.exe" : "ollama";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

// One shared in-flight promise, so several pages loading at once spawn at most
// one server process between them.
let startPromise: Promise<boolean> | null = null;

async function startOllama(config: AiConfig, log?: Logger): Promise<boolean> {
  const executable = findOllamaExecutable();
  if (!executable) {
    log?.warn("Ollama executable not found; AI features stay unavailable.");
    return false;
  }

  try {
    const child = spawn(executable, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    // Let the server outlive this process, matching how the launcher starts it.
    child.unref();
    child.on("error", () => {
      // Swallowed: the readiness poll below decides success, not the spawn.
    });
  } catch {
    log?.warn("Could not start Ollama; AI features stay unavailable.");
    return false;
  }

  const deadline = Date.now() + START_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(START_POLL_INTERVAL_MS);
    if (await isAiReady(config)) {
      log?.info("Local AI runtime is ready.");
      return true;
    }
  }

  log?.warn("Ollama did not become ready in time.");
  return false;
}

function aiUrl(config: AiConfig, path: string) {
  return `${config.AI_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function isModelLoaded(config: AiConfig): Promise<boolean> {
  try {
    const response = await fetch(aiUrl(config, "/api/ps"), {
      signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS),
    });
    const payload = (await response.json()) as { models?: { name?: string; model?: string }[] };
    return (payload.models ?? []).some(
      (m) => m.name === config.AI_CHAT_MODEL || m.model === config.AI_CHAT_MODEL,
    );
  } catch {
    return false;
  }
}

// One in-flight load per model, so concurrent page loads don't stack requests.
const warmPromises = new Map<string, Promise<void>>();

// Loads the configured model into memory ahead of the first real request. An
// empty /api/generate call does exactly that and returns once it is resident.
function warmModel(config: AiConfig, log?: Logger): Promise<void> {
  const model = config.AI_CHAT_MODEL;
  const existing = warmPromises.get(model);
  if (existing) return existing;

  const promise = (async () => {
    if (await isModelLoaded(config)) return;

    log?.info(`Loading local AI model ${model}.`);
    try {
      const response = await fetch(aiUrl(config, "/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, keep_alive: AI_KEEP_ALIVE }),
        signal: AbortSignal.timeout(Math.max(config.AI_TIMEOUT_MS, 120000)),
      });
      if (response.ok) {
        log?.info(`Local AI model ${model} is loaded.`);
      } else {
        log?.warn(`Local AI model ${model} failed to load (HTTP ${response.status}).`);
      }
    } catch {
      log?.warn(`Local AI model ${model} did not load in time; it will load on first use.`);
    }
  })().finally(() => {
    warmPromises.delete(model);
  });

  warmPromises.set(model, promise);
  return promise;
}

/**
 * Ensures the local AI runtime is up, starting it if it is not. Safe to call
 * unawaited from a page route: it never throws, and concurrent callers share a
 * single start attempt. Once the runtime answers, it also loads
 * `config.AI_CHAT_MODEL` in the background so the first request is not a cold
 * start - pass a config with a different model to warm that one instead.
 */
export async function ensureAiRunning(config: AiConfig, log?: Logger): Promise<boolean> {
  if (config.AI_PROVIDER !== "ollama") return true;

  let ready = await isAiReady(config);

  if (!ready) {
    if (!startPromise) {
      log?.info("Local AI runtime is not responding; starting Ollama.");
      startPromise = startOllama(config, log).finally(() => {
        startPromise = null;
      });
    }
    ready = await startPromise;
  }

  if (ready) void warmModel(config, log);
  return ready;
}

export const __testing = { findOllamaExecutable };
