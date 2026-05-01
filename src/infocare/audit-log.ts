import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

type InfocareAuditEvent = {
  at: string;
  event: "infocare_request";
  mode: string;
  outcome: "success" | "error";
  durationMs: number;
  responseBytes?: number;
  parameterKeys: string[];
  message?: string;
};

const AUDIT_LOG_PATH = join(process.cwd(), "logs", "infocare-audit.log");

export async function appendInfocareAuditEvent(event: InfocareAuditEvent) {
  await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
  await appendFile(AUDIT_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
}
