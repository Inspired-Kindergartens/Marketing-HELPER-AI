import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

import { prisma } from "../db.js";

const POSTMARK_WEBHOOK_IPS = new Set([
  "3.134.147.250",
  "50.31.156.6",
  "50.31.156.77",
  "18.217.206.57",
]);

const SUPPORTED_RECORD_TYPES = new Set(["Delivery", "Bounce", "Open", "Click"]);

export function verifyBasicAuth(request: FastifyRequest, expectedPassword: string): boolean {
  if (!expectedPassword) return false;

  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const colonIndex = decoded.indexOf(":");
  if (colonIndex < 0) return false;
  const providedPassword = decoded.slice(colonIndex + 1);

  const a = Buffer.from(providedPassword, "utf8");
  const b = Buffer.from(expectedPassword, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isPostmarkSourceIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return POSTMARK_WEBHOOK_IPS.has(ip);
}

type RawPostmarkPayload = Record<string, unknown>;

type NormalizedEvent = {
  serverToken: string;
  messageId: string;
  eventType: string;
  recipient: string | null;
  tag: string | null;
  occurredAt: Date;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeEvent(payload: RawPostmarkPayload, serverToken: string): NormalizedEvent | null {
  const recordType = asString(payload.RecordType);
  if (!recordType || !SUPPORTED_RECORD_TYPES.has(recordType)) return null;

  const messageId = asString(payload.MessageID);
  if (!messageId) return null;

  // Bounce uses `Email`; Delivery / Open / Click use `Recipient`.
  const recipient = asString(payload.Recipient) ?? asString(payload.Email);
  const tag = asString(payload.Tag);

  // Timestamp field name varies by event type.
  const timestampRaw =
    asString(payload.DeliveredAt) ??
    asString(payload.BouncedAt) ??
    asString(payload.ReceivedAt);
  const occurredAt = timestampRaw ? new Date(timestampRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return null;

  return {
    serverToken,
    messageId,
    eventType: recordType,
    recipient,
    tag,
    occurredAt,
  };
}

export async function ingestPostmarkEvent(
  payload: unknown,
  serverToken: string,
): Promise<{ stored: boolean; reason?: string }> {
  if (!payload || typeof payload !== "object") {
    return { stored: false, reason: "payload-not-object" };
  }

  const normalized = normalizeEvent(payload as RawPostmarkPayload, serverToken);
  if (!normalized) {
    return { stored: false, reason: "unsupported-or-malformed" };
  }

  await prisma.postmarkMessageEvent.upsert({
    where: {
      serverToken_messageId_eventType_occurredAt: {
        serverToken: normalized.serverToken,
        messageId: normalized.messageId,
        eventType: normalized.eventType,
        occurredAt: normalized.occurredAt,
      },
    },
    create: {
      serverToken: normalized.serverToken,
      messageId: normalized.messageId,
      eventType: normalized.eventType,
      recipient: normalized.recipient,
      tag: normalized.tag,
      occurredAt: normalized.occurredAt,
      receivedAt: new Date(),
      raw: payload as object,
    },
    update: {
      recipient: normalized.recipient,
      tag: normalized.tag,
      raw: payload as object,
    },
  });

  return { stored: true };
}
