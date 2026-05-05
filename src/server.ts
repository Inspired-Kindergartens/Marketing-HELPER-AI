import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";

import { ensureDailyAnalyticsSnapshot, refreshAnalyticsSnapshot } from "./analytics/snapshot.js";
import { resolveWindowKey, resolveWindowStartDate } from "./analytics/windows.js";
import { prisma } from "./db";
import { syncStoredCentreReferences } from "./infocare/centre-sync.js";
import { readWaitlistDiscoveryReport } from "./infocare/waitlist-report.js";
import { ensureWeeklyWaitlistReport, refreshWaitlistReport } from "./infocare/waitlist-refresh.js";
import { getInfocareEnv } from "./infocare/client.js";
import {
  readCentreSnapshotHistory,
  readLatestAnalyticsSnapshotSet,
  readManualCentreCapacityByKey,
  readWindowAnalyticsSnapshotSet,
} from "./storage/analytics-store.js";
import { renderAppShell } from "./ui/app-shell.js";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  AUTO_DAILY_SNAPSHOT: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase() === "true")
    .default(false),
  INFOCAREUSER: z.string().trim().min(1),
  INFOCAREPASS: z.string().trim().min(1),
  INFOCARE_BASE_URL: z
    .string()
    .url()
    .default("https://infocare.digiweb.net.nz/charley/servlet/RubyServlet"),
});

const env = envSchema.parse(process.env);
getInfocareEnv(process.env);

if (env.HOST !== "127.0.0.1" && env.HOST.toLowerCase() !== "localhost") {
  throw new Error(`Refusing to start with non-local HOST "${env.HOST}". Use 127.0.0.1.`);
}

const app = Fastify({
  logger: env.NODE_ENV !== "test",
});

const VALID_PANEL_IDS = new Set(["analytics", "waitlist", "status", "chat"]);

app.get<{ Querystring: { centre?: string; window?: string; panel?: string; sort?: string; waitlistSection?: string } }>("/", async (request, reply) => {
  const latestSnapshotSet = await readLatestAnalyticsSnapshotSet();
  const centre = Number.parseInt(String(request.query?.centre ?? ""), 10);
  const selectedWindowKey = resolveWindowKey(request.query?.window);
  const serviceSort = request.query?.sort ?? null;
  const selectedCentreKey = Number.isNaN(centre) ? null : centre;
  const latestRunDate = latestSnapshotSet ? new Date(latestSnapshotSet.runDate) : new Date();
  const windowStartDate = resolveWindowStartDate(latestRunDate, selectedWindowKey);
  const snapshotSet =
    latestSnapshotSet == null
      ? null
      : (await readWindowAnalyticsSnapshotSet(windowStartDate, latestRunDate)) ?? latestSnapshotSet;
  const resolvedSelectedCentreKey =
    selectedCentreKey ??
    snapshotSet?.snapshots[0]?.centreKey ??
    null;
  const centreHistory =
    resolvedSelectedCentreKey == null
      ? []
      : await readCentreSnapshotHistory(resolvedSelectedCentreKey, {
          fromDate: windowStartDate,
          toDate: latestRunDate,
        });
  const annualHistory =
    resolvedSelectedCentreKey == null
      ? []
      : await readCentreSnapshotHistory(resolvedSelectedCentreKey, {
          fromDate: resolveWindowStartDate(latestRunDate, "12M"),
          toDate: latestRunDate,
        });
  const manualCapacity =
    resolvedSelectedCentreKey == null
      ? null
      : await readManualCentreCapacityByKey(resolvedSelectedCentreKey);
  const waitlistReport = await readWaitlistDiscoveryReport();
  const focusPanelId =
    VALID_PANEL_IDS.has(request.query?.panel ?? "") ? request.query?.panel ?? null : null;

  return reply
    .type("text/html; charset=utf-8")
    .send(
      renderAppShell(snapshotSet, {
        selectedCentreKey: resolvedSelectedCentreKey,
        selectedWindowKey,
        serviceSort,
        focusPanelId,
        centreHistory,
        annualHistory,
        manualCapacity,
        waitlistSnapshotSet: latestSnapshotSet,
        waitlistReport,
        waitlistSection: request.query?.waitlistSection ?? null,
      }),
    );
});

app.get<{ Querystring: { centre?: string; window?: string; sort?: string } }>("/actions/refresh-centres", async (request, reply) => {
  await syncStoredCentreReferences({ force: true });
  const centre = request.query?.centre;
  const windowKey = resolveWindowKey(request.query?.window);
  const serviceSort = request.query?.sort;
  const params = new URLSearchParams();

  if (centre) {
    params.set("centre", centre);
  }

  params.set("window", windowKey);

  if (serviceSort) {
    params.set("sort", serviceSort);
  }
  const redirectTarget = `/?${params.toString()}`;

  reply.code(303);

  return reply.redirect(redirectTarget);
});

app.get<{ Querystring: { centre?: string; window?: string; sort?: string } }>("/actions/refresh-snapshot", async (request, reply) => {
  await refreshAnalyticsSnapshot({ source: "manual-refresh" });
  await refreshWaitlistReport();
  const centre = request.query?.centre;
  const params = new URLSearchParams();

  if (centre) {
    params.set("centre", centre);
  }

  params.set("window", "3M");
  const redirectTarget = `/?${params.toString()}`;

  reply.code(303);

  return reply.redirect(redirectTarget);
});

app.get("/app.css", async (_request, reply) => {
  const css = await readFile(join(process.cwd(), "src", "ui", "app.css"), "utf8");

  return reply.type("text/css; charset=utf-8").send(css);
});

app.get("/vendor/bootstrap-icons.css", async (_request, reply) => {
  const css = await readFile(
    join(process.cwd(), "node_modules", "bootstrap-icons", "font", "bootstrap-icons.css"),
    "utf8",
  );

  return reply.type("text/css; charset=utf-8").send(css);
});

app.get("/vendor/chart.umd.js", async (_request, reply) => {
  const script = await readFile(
    join(process.cwd(), "node_modules", "chart.js", "dist", "chart.umd.js"),
    "utf8",
  );

  return reply.type("application/javascript; charset=utf-8").send(script);
});

app.get<{ Params: { file: string } }>("/vendor/fonts/:file", async (request, reply) => {
  const file = request.params.file;

  if (!["bootstrap-icons.woff", "bootstrap-icons.woff2"].includes(file)) {
    reply.code(404);
    return reply.send("Not found");
  }

  const asset = await readFile(
    join(process.cwd(), "node_modules", "bootstrap-icons", "font", "fonts", file),
  );
  const mimeType = file.endsWith(".woff2") ? "font/woff2" : "font/woff";

  return reply.type(mimeType).send(asset);
});

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;

  return { ok: true };
});

async function start() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;

  if (env.AUTO_DAILY_SNAPSHOT) {
    await ensureDailyAnalyticsSnapshot();
  }
  await ensureWeeklyWaitlistReport();

  await app.listen({
    host: "127.0.0.1",
    port: env.PORT,
  });
}

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
