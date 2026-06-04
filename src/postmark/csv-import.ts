import { readFile } from "node:fs/promises";

import { prisma } from "../db.js";
import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";
import { matchPostmarkEventToCentre } from "./centre-match.js";

type CsvRow = {
  "Message ID": string;
  Status: string;
  "Email Address": string;
  Subject: string;
  Tag: string;
  "Date & Time": string;
  "Bounce reason": string;
};

export type PostmarkCsvImportResult = {
  rowsRead: number;
  eventsStored: number;
  messageCount: number;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  if (!headers) return [];

  return values.map((cells) => Object.fromEntries(
    headers.map((header, index) => [header, cells[index] ?? ""]),
  ) as CsvRow);
}

function normalizeEventType(status: string) {
  if (status === "Delivered") return "Delivery";
  if (status === "Opened") return "Open";
  if (status === "Clicked") return "Click";
  if (status === "Bounced") return "Bounce";
  return status;
}

export async function importPostmarkActivityCsv(path: string): Promise<PostmarkCsvImportResult> {
  const rows = parseCsv(await readFile(path, "utf8"));
  const centres = await prisma.centreReference.findMany({
    where: { ignored: false, openStatus: "Open" },
    select: { centreKey: true, name: true },
  });
  const receivedAt = new Date();
  let eventsStored = 0;

  await appendExternalApiCapture({
    source: "postmark",
    operation: "activity-csv-import",
    outcome: "success",
    requestContext: { path, rowsRead: rows.length },
    payload: rows,
  });

  for (const row of rows) {
    const occurredAt = new Date(row["Date & Time"]);
    if (!row["Message ID"] || !row.Status || Number.isNaN(occurredAt.getTime())) continue;
    const recipient = row["Email Address"].trim() || null;
    const tag = row.Tag.trim() || null;
    const centreKey = matchPostmarkEventToCentre({ tag, recipient }, centres)?.centreKey ?? null;
    const stored = await prisma.postmarkMessageEvent.createMany({
      data: [{
        serverToken: "unknown",
        messageId: row["Message ID"],
        eventType: normalizeEventType(row.Status),
        recipient,
        tag,
        centreKey,
        occurredAt,
        receivedAt,
        raw: row,
      }],
      skipDuplicates: true,
    });

    eventsStored += stored.count;
  }

  return {
    rowsRead: rows.length,
    eventsStored,
    messageCount: new Set(rows.map((row) => row["Message ID"])).size,
  };
}
