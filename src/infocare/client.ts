import { z } from "zod";

import { appendInfocareAuditEvent } from "./audit-log.js";
import { infocareEnvelopeSchema } from "./models.js";

export const ALLOWED_INFOCARE_MODES = [
  "get_centre_list",
  "get_child_list",
  "get_child",
  "get_license_list",
  "get_booking_list",
] as const;

export const BLOCKED_INFOCARE_MODES = [
  "create_child",
  "create_timetable",
  "create_contact",
  "update_roster",
  "create_staff",
  "delete_roster",
  "update_attendance_list",
] as const;

export const BLOCKED_INFOCARE_MODE_PREFIXES = [
  "create_",
  "update_",
  "delete_",
  "set_",
] as const;

const INFOCARE_BASE_URL =
  "https://infocare.digiweb.net.nz/charley/servlet/RubyServlet";
const RETRY_DELAYS_MS = [10_000, 20_000, 40_000];
const MAX_RETRY_AFTER_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;

function isRetryableHttpStatus(status: number) {
  return status === 429 || (status >= 500 && status <= 599);
}

function isNetworkOrTimeoutError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return true;
    }
    if (error instanceof TypeError) {
      return true;
    }
  }

  return false;
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();

  if (trimmed === "") {
    return null;
  }

  const seconds = Number(trimmed);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(trimmed);

  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();

    return delta > 0 ? Math.min(delta, MAX_RETRY_AFTER_MS) : 0;
  }

  return null;
}

const requestModeSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_]+$/, "Infocare mode must be lowercase snake_case.");

const infoCareEnvSchema = z.object({
  INFOCAREUSER: z.string().trim().min(1),
  INFOCAREPASS: z.string().trim().min(1),
  INFOCARE_BASE_URL: z.string().url().default(INFOCARE_BASE_URL),
});

export type InfocareMode = (typeof ALLOWED_INFOCARE_MODES)[number];
export type InfocareRequestParameters = Record<string, unknown>;
export type InfocareEnv = z.infer<typeof infoCareEnvSchema>;

type RequestInitOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

function redactSecrets(value: string, env: InfocareEnv) {
  return value
    .replaceAll(env.INFOCAREUSER, "[REDACTED_INFOCARE_USER]")
    .replaceAll(env.INFOCAREPASS, "[REDACTED_INFOCARE_PASS]");
}

function toSafeErrorMessage(error: unknown, env: InfocareEnv) {
  if (error instanceof Error) {
    return redactSecrets(error.message, env);
  }

  return redactSecrets(String(error), env);
}

function isBlockedMode(mode: string) {
  return (
    BLOCKED_INFOCARE_MODES.includes(mode as (typeof BLOCKED_INFOCARE_MODES)[number]) ||
    BLOCKED_INFOCARE_MODE_PREFIXES.some((prefix) => mode.startsWith(prefix))
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableInfocareMessage(message: string) {
  return message.toLowerCase().includes("rate limit");
}

export function validateInfocareMode(mode: string): InfocareMode {
  const parsedMode = requestModeSchema.parse(mode.trim());

  if (parsedMode !== mode) {
    throw new Error(`Infocare mode "${mode}" must not include surrounding whitespace.`);
  }

  if (isBlockedMode(parsedMode)) {
    throw new Error(`Infocare mode "${parsedMode}" is blocked.`);
  }

  if (!ALLOWED_INFOCARE_MODES.includes(parsedMode as InfocareMode)) {
    throw new Error(`Infocare mode "${parsedMode}" is not allowlisted.`);
  }

  return parsedMode as InfocareMode;
}

export function getInfocareEnv(env: NodeJS.ProcessEnv = process.env): InfocareEnv {
  return infoCareEnvSchema.parse(env);
}

export function createInfocareClient(options: RequestInitOptions = {}) {
  const env = getInfocareEnv(options.env);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request<TResponse>(
      mode: string,
      parameters: InfocareRequestParameters = {},
    ): Promise<TResponse> {
      const startedAt = Date.now();
      const parameterKeys = Object.keys(parameters).sort();
      const attemptedMode = mode;

      try {
        const validatedMode = validateInfocareMode(mode);
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
          let response: Response;

          try {
            response = await fetchImpl(env.INFOCARE_BASE_URL, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
              },
              body: JSON.stringify({
                username: env.INFOCAREUSER,
                password: env.INFOCAREPASS,
                mode: validatedMode,
                parameters,
              }),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
          } catch (fetchError) {
            if (isNetworkOrTimeoutError(fetchError) && attempt < RETRY_DELAYS_MS.length) {
              lastError =
                fetchError instanceof Error
                  ? new Error(`Infocare request network error: ${fetchError.message}`)
                  : new Error("Infocare request network error.");
              await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
              continue;
            }

            throw fetchError;
          }

          const responseText = await response.text();

          if (!response.ok) {
            lastError = new Error(
              `Infocare request failed with status ${response.status} ${response.statusText}: ${responseText}`,
            );

            if (isRetryableHttpStatus(response.status) && attempt < RETRY_DELAYS_MS.length) {
              const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
              const backoffMs = RETRY_DELAYS_MS[attempt] ?? 0;
              const waitMs = retryAfterMs != null ? Math.max(retryAfterMs, backoffMs) : backoffMs;

              await sleep(waitMs);
              continue;
            }

            throw lastError;
          }

          let parsedJson: unknown;

          try {
            parsedJson = JSON.parse(responseText);
          } catch {
            throw new Error("Infocare response was not valid JSON.");
          }

          const parsedResponse = infocareEnvelopeSchema.parse(parsedJson);

          if (parsedResponse.msg_status.toLowerCase() === "error") {
            lastError = new Error(parsedResponse.message ?? "Infocare returned an error response.");

            if (
              isRetryableInfocareMessage(lastError.message) &&
              attempt < RETRY_DELAYS_MS.length
            ) {
              await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
              continue;
            }

            throw lastError;
          }

          await appendInfocareAuditEvent({
            at: new Date().toISOString(),
            event: "infocare_request",
            mode: validatedMode,
            outcome: "success",
            durationMs: Date.now() - startedAt,
            responseBytes: Buffer.byteLength(responseText, "utf8"),
            parameterKeys,
          });

          return parsedResponse as TResponse;
        }

        throw lastError ?? new Error("Infocare request failed.");
      } catch (error) {
        await appendInfocareAuditEvent({
          at: new Date().toISOString(),
          event: "infocare_request",
          mode: attemptedMode,
          outcome: "error",
          durationMs: Date.now() - startedAt,
          parameterKeys,
          message: toSafeErrorMessage(error, env),
        });

        throw error;
      }
    },
  };
}
