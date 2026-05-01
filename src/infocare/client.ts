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
        const response = await fetchImpl(env.INFOCARE_BASE_URL, {
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
        });

        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(
            `Infocare request failed with status ${response.status} ${response.statusText}: ${responseText}`,
          );
        }

        let parsedJson: unknown;

        try {
          parsedJson = JSON.parse(responseText);
        } catch {
          throw new Error("Infocare response was not valid JSON.");
        }

        const parsedResponse = infocareEnvelopeSchema.parse(parsedJson);

        if (parsedResponse.msg_status.toLowerCase() === "error") {
          throw new Error(parsedResponse.message ?? "Infocare returned an error response.");
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
