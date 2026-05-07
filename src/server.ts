import { config as loadDotenv } from "dotenv";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";

import { ensureDailyAnalyticsSnapshot, refreshAnalyticsSnapshot } from "./analytics/snapshot.js";
import { resolveWindowKey, resolveWindowStartDate } from "./analytics/windows.js";
import { prisma } from "./db";
import { getGoogleAnalyticsConfig, readGoogleAnalyticsConfigStatus } from "./google-analytics/config.js";
import { ensureDailyGoogleAnalyticsSnapshot, refreshGoogleAnalyticsSnapshot } from "./google-analytics/refresh.js";
import { syncStoredCentreReferences } from "./infocare/centre-sync.js";
import { readWaitlistDiscoveryReport } from "./infocare/waitlist-report.js";
import { ensureWeeklyWaitlistReport, refreshWaitlistReport } from "./infocare/waitlist-refresh.js";
import { getInfocareEnv } from "./infocare/client.js";
import { getMetaConfig, readMetaConfigStatus } from "./meta/config.js";
import { refreshMetaAds } from "./meta/refresh.js";
import {
  readCentreSnapshotHistory,
  readLatestAnalyticsSnapshotSet,
  readManualCentreCapacityByKey,
  readWindowAnalyticsSnapshotSet,
} from "./storage/analytics-store.js";
import { readCentreContactList } from "./storage/centre-contact-store.js";
import { readLatestGoogleAnalyticsDailySnapshot } from "./storage/google-analytics-store.js";
import { readMetaAdsDashboardData } from "./storage/meta-store.js";
import {
  buildMetaRecommendationNotificationInputs,
  countMetaRecommendationNotifications,
  dismissMetaRecommendationNotification,
  readMetaNotificationHistoryPage,
  readMetaRecommendationNotifications,
  syncMetaRecommendationNotifications,
} from "./storage/meta-recommendation-notifications-store.js";
import {
  createMetaRecommendationNote,
  readActiveMetaRecommendationNotes,
  restoreMetaRecommendationNote,
  softDeleteMetaRecommendationNote,
} from "./storage/meta-recommendation-notes-store.js";
import {
  renderAppShell,
  renderMetaNotificationHistoryPagination,
  renderMetaNotificationHistoryRows,
} from "./ui/app-shell.js";

loadDotenv({ override: true });

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
  META_USER_ID: z.string().trim().default(""),
  META_ACCESS_TOKEN: z.string().trim().default(""),
  META_APP_TOKEN: z.string().trim().default(""),
  META_AD_ACCOUNT_ID: z.string().trim().default(""),
  GOOGLE_ANALYTICS_PROPERTY_ID: z.string().trim().default(""),
  GOOGLE_ANALYTICS_OAUTH_PATH: z.string().trim().default("OAuth.json"),
  GOOGLE_ANALYTICS_TOKEN_PATH: z.string().trim().default("google-oauth-token.json"),
  GOOGLE_ANALYTICS_REFRESH_TOKEN: z.string().trim().default(""),
});

const env = envSchema.parse(process.env);
getInfocareEnv(process.env);
const metaConfigStatus = readMetaConfigStatus(env);
const googleAnalyticsConfigStatus = readGoogleAnalyticsConfigStatus(env);

if (env.HOST !== "127.0.0.1" && env.HOST.toLowerCase() !== "localhost") {
  throw new Error(`Refusing to start with non-local HOST "${env.HOST}". Use 127.0.0.1.`);
}

const app = Fastify({
  logger: env.NODE_ENV !== "test",
});

const VALID_PANEL_IDS = new Set(["analytics", "waitlist", "meta-ads", "google-analytics", "chat"]);
const META_ADS_AUTO_REFRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecentMetaAdsSnapshot(latestPullAt: string | null | undefined, now = new Date()) {
  if (!latestPullAt) {
    return false;
  }

  const pulledAt = new Date(latestPullAt);

  if (Number.isNaN(pulledAt.getTime())) {
    return false;
  }

  return now.getTime() - pulledAt.getTime() < META_ADS_AUTO_REFRESH_MAX_AGE_MS;
}

async function refreshMetaAdsIfConfigured() {
  let metaConfig;

  try {
    metaConfig = getMetaConfig(env);
  } catch (error) {
    app.log.error({ error }, "Meta Ads auto-refresh blocked by missing server configuration");

    return;
  }

  try {
    const result = await refreshMetaAds(metaConfig);

    app.log.info(result, "Meta Ads auto-refresh completed");
  } catch (error) {
    app.log.error({ error }, "Meta Ads auto-refresh failed");
  }
}

async function ensureGoogleAnalyticsSnapshotIfConfigured() {
  let googleAnalyticsConfig;

  try {
    googleAnalyticsConfig = getGoogleAnalyticsConfig(env);
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Google Analytics snapshot blocked by missing server configuration",
    );

    return null;
  }

  try {
    const snapshot = await ensureDailyGoogleAnalyticsSnapshot(googleAnalyticsConfig);

    app.log.info(
      {
        propertyId: googleAnalyticsConfig.propertyId,
        snapshotDate: snapshot.snapshotDate,
        pulledAt: snapshot.pulledAt,
      },
      "Google Analytics daily snapshot ready",
    );

    return snapshot;
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Google Analytics daily snapshot failed",
    );

    return null;
  }
}

app.get<{ Querystring: { centre?: string; window?: string; panel?: string; sort?: string; waitlistSection?: string; metaRefreshed?: string } }>("/", async (request, reply) => {
  const latestSnapshotSet = await readLatestAnalyticsSnapshotSet();
  const centre = Number.parseInt(String(request.query?.centre ?? ""), 10);
  const selectedWindowKey = resolveWindowKey(request.query?.window);
  const serviceSort = request.query?.sort ?? null;
  const selectedCentreKey = Number.isNaN(centre) ? null : centre;
  const focusPanelId =
    VALID_PANEL_IDS.has(request.query?.panel ?? "") ? request.query?.panel ?? null : null;

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
  let metaAdsDashboardData = await readMetaAdsDashboardData();
  let googleAnalyticsSnapshot = await readLatestGoogleAnalyticsDailySnapshot(env.GOOGLE_ANALYTICS_PROPERTY_ID);

  if (
    focusPanelId === "meta-ads" &&
    request.query?.metaRefreshed !== "1" &&
    !isRecentMetaAdsSnapshot(metaAdsDashboardData.latestPullAt)
  ) {
    await refreshMetaAdsIfConfigured();
    metaAdsDashboardData = await readMetaAdsDashboardData();
  }

  if (focusPanelId === "google-analytics") {
    googleAnalyticsSnapshot = await ensureGoogleAnalyticsSnapshotIfConfigured() ?? googleAnalyticsSnapshot;
  }

  const currentMetaRecommendationNotifications = buildMetaRecommendationNotificationInputs(
    snapshotSet,
    selectedWindowKey,
    metaAdsDashboardData,
  );
  await syncMetaRecommendationNotifications(currentMetaRecommendationNotifications);
  const metaRecommendationNotifications = await readMetaRecommendationNotifications();
  const metaRecommendationNotificationCount = await countMetaRecommendationNotifications();
  const metaRecommendationNotes = await readActiveMetaRecommendationNotes();
  const centreContacts = await readCentreContactList();

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
        metaConfigStatus,
        metaAdsDashboardData,
        googleAnalyticsConfigStatus,
        googleAnalyticsSnapshot,
        metaRecommendationNotifications,
        metaRecommendationNotificationCount,
        metaRecommendationNotes,
        centreContacts,
      }),
    );
});

app.get<{ Querystring: { centre?: string; window?: string; sort?: string } }>("/actions/refresh-google-analytics", async (request, reply) => {
  let googleAnalyticsConfig;

  try {
    googleAnalyticsConfig = getGoogleAnalyticsConfig(env);
  } catch (error) {
    app.log.error({ error }, "Google Analytics refresh blocked by missing server configuration");
    reply.code(500);

    return reply.type("text/plain; charset=utf-8").send("Google Analytics is not configured on the server.");
  }

  try {
    await refreshGoogleAnalyticsSnapshot(googleAnalyticsConfig);
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Google Analytics refresh failed",
    );
    reply.code(502);

    return reply.type("text/plain; charset=utf-8").send("Google Analytics refresh failed. Check server logs for details.");
  }

  const params = new URLSearchParams();

  if (request.query?.centre) {
    params.set("centre", request.query.centre);
  }

  params.set("window", resolveWindowKey(request.query?.window));
  params.set("panel", "google-analytics");

  if (request.query?.sort) {
    params.set("sort", request.query.sort);
  }

  reply.code(303);

  return reply.redirect(`/?${params.toString()}`);
});

app.get<{ Querystring: { page?: string; pageSize?: string; centre?: string; kind?: string } }>("/api/meta-recommendation-notifications/history", async (request) => {
  const page = Number.parseInt(String(request.query?.page ?? "1"), 10);
  const pageSize = Number.parseInt(String(request.query?.pageSize ?? "25"), 10);
  const centreKey = Number.parseInt(String(request.query?.centre ?? ""), 10);
  const kind = request.query?.kind === "Notification" || request.query?.kind === "Note" ? request.query.kind : null;
  const pageData = await readMetaNotificationHistoryPage({
    page: Number.isNaN(page) ? 1 : page,
    pageSize: Number.isNaN(pageSize) ? 25 : pageSize,
    centreKey: Number.isNaN(centreKey) ? null : centreKey,
    kind,
  });

  return {
    rowsHtml: renderMetaNotificationHistoryRows(pageData.rows),
    paginationHtml: renderMetaNotificationHistoryPagination(pageData),
    centreOptions: pageData.centreOptions,
    page: pageData.page,
    pageSize: pageData.pageSize,
    totalRows: pageData.totalRows,
    totalPages: pageData.totalPages,
  };
});

app.post<{ Body: { notificationId?: string } }>("/api/meta-recommendation-notifications/dismiss", async (request, reply) => {
  const notificationId = String(request.body?.notificationId ?? "").trim();

  if (!notificationId) {
    reply.code(400);

    return { error: "notificationId is required." };
  }

  const notification = await dismissMetaRecommendationNotification(notificationId);

  return { notification };
});

app.post<{ Body: { notificationId?: string; text?: string } }>("/api/meta-recommendation-notes", async (request, reply) => {
  const notificationId = String(request.body?.notificationId ?? "").trim();
  const text = String(request.body?.text ?? "").trim();

  if (!notificationId || !text) {
    reply.code(400);

    return { error: "notificationId and text are required." };
  }

  const note = await createMetaRecommendationNote({ notificationId, text });

  return reply.code(201).send({ note });
});

app.post<{ Params: { id: string } }>("/api/meta-recommendation-notes/:id/delete", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);

    return { error: "Valid note id is required." };
  }

  const note = await softDeleteMetaRecommendationNote(id);

  return { note };
});

app.post<{ Params: { id: string } }>("/api/meta-recommendation-notes/:id/restore", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);

    return { error: "Valid note id is required." };
  }

  const note = await restoreMetaRecommendationNote(id);

  return { note };
});

app.get<{ Querystring: { centre?: string; window?: string; sort?: string } }>("/actions/refresh-meta-ads", async (request, reply) => {
  let metaConfig;

  try {
    metaConfig = getMetaConfig(env);
  } catch (error) {
    app.log.error({ error }, "Meta Ads refresh blocked by missing server configuration");
    reply.code(500);

    return reply.type("text/plain; charset=utf-8").send("Meta Ads refresh is not configured on the server.");
  }

  try {
    const result = await refreshMetaAds(metaConfig);

    app.log.info(result, "Meta Ads refresh completed");
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Meta Ads refresh failed",
    );
    reply.code(502);

    return reply.type("text/plain; charset=utf-8").send("Meta Ads refresh failed. Check server logs for details.");
  }

  const params = new URLSearchParams();

  if (request.query?.centre) {
    params.set("centre", request.query.centre);
  }

  params.set("window", resolveWindowKey(request.query?.window));
  params.set("panel", "meta-ads");
  params.set("metaRefreshed", "1");

  if (request.query?.sort) {
    params.set("sort", request.query.sort);
  }

  reply.code(303);

  return reply.redirect(`/?${params.toString()}`);
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
