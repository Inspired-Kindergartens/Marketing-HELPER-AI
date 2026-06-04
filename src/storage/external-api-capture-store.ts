import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";

export type ExternalApiCaptureInput = {
  source: string;
  operation: string;
  receivedAt?: string | Date;
  httpStatus?: number | null;
  outcome: "success" | "error" | "unsupported";
  requestContext?: unknown;
  payload: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function appendExternalApiCapture(input: ExternalApiCaptureInput) {
  return prisma.externalApiCapture.create({
    data: {
      source: input.source,
      operation: input.operation,
      receivedAt: new Date(input.receivedAt ?? new Date()),
      httpStatus: input.httpStatus ?? null,
      outcome: input.outcome,
      requestContext: input.requestContext == null ? undefined : toJson(input.requestContext),
      payload: toJson(input.payload),
    },
  });
}
