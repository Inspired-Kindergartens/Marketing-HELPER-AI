import { config as loadDotenv } from "dotenv";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";

import { buildAiChatMessages, buildDeterministicChatAnswer, type AiChatHistoryMessageInput } from "./ai/chat.js";
import { runLocalChat, streamLocalChat, AiClientError } from "./ai/client.js";
import { buildAiDashboardContext, buildDashboardSystemPrompt } from "./ai/context.js";
import { readAiConfig } from "./ai/config.js";
import { ensureDailyAnalyticsSnapshot, refreshAnalyticsSnapshot } from "./analytics/snapshot.js";
import { resolveWindowKey, resolveWindowStartDate } from "./analytics/windows.js";
import { prisma } from "./db.js";
import { getGoogleAnalyticsConfig, readGoogleAnalyticsConfigStatus } from "./google-analytics/config.js";
import {
  ensureDailyGoogleAnalyticsSnapshot,
  ensureGoogleAnalyticsMonthlySnapshots,
  getGoogleAnalyticsMonthRanges,
} from "./google-analytics/refresh.js";
import { syncStoredCentreReferences } from "./infocare/centre-sync.js";
import { readWaitlistDiscoveryReport } from "./infocare/waitlist-report.js";
import { ensureWeeklyWaitlistReport, refreshWaitlistReport } from "./infocare/waitlist-refresh.js";
import { getInfocareEnv } from "./infocare/client.js";
import { getMetaConfig, readMetaConfigStatus } from "./meta/config.js";
import { refreshMetaAds } from "./meta/refresh.js";
import {
  readCentreSnapshotHistory,
  readLatestAnalyticsSnapshotSet,
} from "./storage/analytics-store.js";
import { readCentreContactList } from "./storage/centre-contact-store.js";
import {
  aggregateGoogleAnalyticsSnapshots,
  readGoogleAnalyticsRangeSnapshot,
  readGoogleAnalyticsRangeSnapshots,
  readLatestGoogleAnalyticsDailySnapshot,
} from "./storage/google-analytics-store.js";
import { readMetaAdsDashboardData } from "./storage/meta-store.js";
import {
  buildMetaRecommendationNotificationInputs,
  countMetaRecommendationNotifications,
  dismissMetaRecommendationNotification,
  type MetaRecommendationNotificationInput,
  readLatestMetaRecommendationNotesForCentre,
  readMetaNotificationHistoryPage,
  readMetaRecommendationNotifications,
  syncMetaRecommendationNotifications,
  upsertMetaRecommendationNotification,
} from "./storage/meta-recommendation-notifications-store.js";
import {
  createMetaRecommendationNote,
  readActiveMetaRecommendationNotes,
  readLatestMetaRecommendationNotesForNotification,
  restoreMetaRecommendationNote,
  softDeleteMetaRecommendationNote,
} from "./storage/meta-recommendation-notes-store.js";
import {
  readMetaEmailContent,
  upsertMetaEmailContent,
} from "./storage/meta-email-content-store.js";
import {
  renderAppShell,
  renderMetaRecommendationNotePopup,
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
  AI_PROVIDER: z.enum(["builtin", "ollama"]).default("builtin"),
  AI_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  AI_CHAT_MODEL: z.string().trim().default("llama3.1:8b"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
});

const env = envSchema.parse(process.env);
const aiConfig = readAiConfig(env);
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

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getGoogleAnalyticsDefaultRange(referenceDate = new Date()) {
  const endDate = getUtcDateOnly(referenceDate);
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  return { startDate, endDate };
}

function parseGoogleAnalyticsMonthYear(monthInput?: string | null, yearInput?: string | null) {
  const month = Number.parseInt(String(monthInput ?? ""), 10);
  const year = Number.parseInt(String(yearInput ?? ""), 10);

  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year)
    ? { month, year }
    : null;
}

function parseGoogleAnalyticsMonthKey(input?: string | null) {
  const match = String(input ?? "").match(/^(\d{4})-(\d{2})$/);

  return match ? { year: Number.parseInt(match[1], 10), month: Number.parseInt(match[2], 10) } : null;
}

function formatGoogleAnalyticsMonthQuery(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function resolveGoogleAnalyticsMonthSelection(input: {
  gaRange?: string | null;
  gaFrom?: string | null;
  gaTo?: string | null;
  gaFromMonth?: string | null;
  gaFromYear?: string | null;
  gaToMonth?: string | null;
  gaToYear?: string | null;
}, referenceDate = new Date()) {
  const ranges = getGoogleAnalyticsMonthRanges(referenceDate);
  const firstRange = ranges[0];
  const lastRange = ranges.at(-1);
  const validMonths = new Set(ranges.map((range) => formatMonthKey(range.startDate)));
  const defaultRange = getGoogleAnalyticsDefaultRange(referenceDate);
  const defaultFrom = formatMonthKey(defaultRange.startDate);
  const defaultTo = formatMonthKey(defaultRange.endDate);
  const rawFrom =
    parseGoogleAnalyticsMonthYear(input.gaFromMonth, input.gaFromYear) ??
    parseGoogleAnalyticsMonthKey(input.gaFrom);
  const rawTo =
    parseGoogleAnalyticsMonthYear(input.gaToMonth, input.gaToYear) ??
    parseGoogleAnalyticsMonthKey(input.gaTo);
  const hasCompleteMonthRangeQuery =
    input.gaRange === "months" &&
    rawFrom != null &&
    rawTo != null;
  const fromMonth = rawFrom ? formatGoogleAnalyticsMonthQuery(rawFrom.year, rawFrom.month) : defaultFrom;
  const toMonth = rawTo ? formatGoogleAnalyticsMonthQuery(rawTo.year, rawTo.month) : defaultTo;
  const boundedFrom = validMonths.has(fromMonth) ? fromMonth : (firstRange ? formatMonthKey(firstRange.startDate) : defaultFrom);
  const boundedTo = validMonths.has(toMonth) ? toMonth : (lastRange ? formatMonthKey(lastRange.startDate) : defaultTo);

  if (boundedFrom > boundedTo) {
    const [year, month] = boundedTo.split("-").map(Number);

    return { fromMonth: month, fromYear: year, toMonth: month, toYear: year, mode: hasCompleteMonthRangeQuery ? "months" : "currentMonth" };
  }

  const [fromYear, fromMonthNumber] = boundedFrom.split("-").map(Number);
  const [toYear, toMonthNumber] = boundedTo.split("-").map(Number);

  return {
    fromMonth: fromMonthNumber,
    fromYear,
    toMonth: toMonthNumber,
    toYear,
    mode: hasCompleteMonthRangeQuery ? "months" : "currentMonth",
  };
}

function resolveGoogleAnalyticsSelectedDateRange(
  selection: ReturnType<typeof resolveGoogleAnalyticsMonthSelection>,
  referenceDate = new Date(),
) {
  if (selection.mode === "currentMonth") {
    return getGoogleAnalyticsDefaultRange(referenceDate);
  }

  const ranges = getGoogleAnalyticsMonthRanges(referenceDate);
  const fromMonth = formatGoogleAnalyticsMonthQuery(selection.fromYear, selection.fromMonth);
  const toMonth = formatGoogleAnalyticsMonthQuery(selection.toYear, selection.toMonth);
  const selected = ranges.filter((range) => {
    const monthKey = formatMonthKey(range.startDate);

    return monthKey >= fromMonth && monthKey <= toMonth;
  });
  const first = selected[0];
  const last = selected.at(-1);

  return first && last ? { startDate: first.startDate, endDate: last.endDate } : null;
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) ? parsed : fallback;
}

function getMetaRecommendationPriority(recommendation: string) {
  if (recommendation === "Needs ads" || recommendation === "Prepare campaign") {
    return 3;
  }

  if (recommendation === "Ads active, monitor" || recommendation === "Review spend") {
    return 2;
  }

  return 1;
}

function parseMetaNotificationContext(input: {
  notificationId?: unknown;
  centreKey?: unknown;
  centreName?: unknown;
  windowKey?: unknown;
  recommendation?: unknown;
  heading?: unknown;
  message?: unknown;
  priority?: unknown;
  openPlaces?: unknown;
  actionableWaitlist?: unknown;
  waitlistCount?: unknown;
  replacementPressure?: unknown;
  activeCampaignCount?: unknown;
  spend30d?: unknown;
}): MetaRecommendationNotificationInput | null {
  const notificationId = String(input.notificationId ?? "").trim();
  const [, , parsedWindowKey, parsedCentreKey] = notificationId.split(":");
  const centreKey = parseInteger(input.centreKey, parseInteger(parsedCentreKey, 0));
  const recommendation = String(input.recommendation ?? input.heading ?? "").trim();
  const centreName = String(input.centreName ?? "").trim();
  const windowKey = String(input.windowKey ?? parsedWindowKey ?? "").trim();

  if (!notificationId || centreKey <= 0 || !centreName || !windowKey || !recommendation) {
    return null;
  }

  return {
    notificationId,
    centreKey,
    centreName,
    windowKey,
    recommendation,
    message: String(input.message ?? "").trim(),
    priority: parseInteger(input.priority, getMetaRecommendationPriority(recommendation)),
    openPlaces: parseInteger(input.openPlaces, 0),
    actionableWaitlist: parseInteger(input.actionableWaitlist, 0),
    waitlistCount: parseInteger(input.waitlistCount, 0),
    replacementPressure: parseInteger(input.replacementPressure, 0),
    activeCampaignCount: parseInteger(input.activeCampaignCount, 0),
    spend30d: parseNumber(input.spend30d, 0),
  };
}

app.get<{ Querystring: { centre?: string; window?: string; panel?: string; sort?: string; waitlistSection?: string; googleAnalyticsSection?: string; gaRange?: string; gaFrom?: string; gaTo?: string; gaFromMonth?: string; gaFromYear?: string; gaToMonth?: string; gaToYear?: string; metaRefreshed?: string } }>("/", async (request, reply) => {
  const latestSnapshotSet = await readLatestAnalyticsSnapshotSet();
  const centre = Number.parseInt(String(request.query?.centre ?? ""), 10);
  const selectedWindowKey = resolveWindowKey(request.query?.window);
  const serviceSort = request.query?.sort ?? null;
  const selectedCentreKey = Number.isNaN(centre) ? null : centre;
  const focusPanelId =
    VALID_PANEL_IDS.has(request.query?.panel ?? "") ? request.query?.panel ?? null : null;

  const latestRunDate = latestSnapshotSet ? new Date(latestSnapshotSet.runDate) : new Date();
  const windowStartDate = resolveWindowStartDate(latestRunDate, selectedWindowKey);
  const snapshotSet = latestSnapshotSet;
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
  const waitlistReport = await readWaitlistDiscoveryReport();
  let metaAdsDashboardData = await readMetaAdsDashboardData({
    fromDate: windowStartDate,
    toDate: latestRunDate,
  });
  const googleAnalyticsMonthSelection = resolveGoogleAnalyticsMonthSelection(request.query);
  const googleAnalyticsDateRange = resolveGoogleAnalyticsSelectedDateRange(googleAnalyticsMonthSelection);
  let googleAnalyticsSnapshot = await readLatestGoogleAnalyticsDailySnapshot(env.GOOGLE_ANALYTICS_PROPERTY_ID);

  if (
    focusPanelId === "meta-ads" &&
    request.query?.metaRefreshed !== "1" &&
    !isRecentMetaAdsSnapshot(metaAdsDashboardData.latestPullAt)
  ) {
    await refreshMetaAdsIfConfigured();
    metaAdsDashboardData = await readMetaAdsDashboardData({
      fromDate: windowStartDate,
      toDate: latestRunDate,
    });
  }

  if (focusPanelId === "google-analytics") {
    let googleAnalyticsConfig;

    try {
      googleAnalyticsConfig = getGoogleAnalyticsConfig(env);
    } catch (error) {
      app.log.error({ error }, "Google Analytics monthly snapshot blocked by missing server configuration");
    }

    if (googleAnalyticsConfig) {
      try {
        if (googleAnalyticsDateRange && googleAnalyticsMonthSelection.mode === "months") {
          const monthlySnapshots = await readGoogleAnalyticsRangeSnapshots(
            googleAnalyticsConfig.propertyId,
            googleAnalyticsDateRange.startDate,
            googleAnalyticsDateRange.endDate,
          );

          googleAnalyticsSnapshot =
            aggregateGoogleAnalyticsSnapshots(
              monthlySnapshots,
              googleAnalyticsConfig.propertyId,
              googleAnalyticsDateRange.startDate,
              googleAnalyticsDateRange.endDate,
            ) ?? googleAnalyticsSnapshot;
        } else if (googleAnalyticsDateRange) {
          googleAnalyticsSnapshot =
            await readGoogleAnalyticsRangeSnapshot(
              googleAnalyticsConfig.propertyId,
              googleAnalyticsDateRange.startDate,
              googleAnalyticsDateRange.endDate,
            ) ??
            await ensureDailyGoogleAnalyticsSnapshot(googleAnalyticsConfig) ??
            googleAnalyticsSnapshot;
        }

        void ensureGoogleAnalyticsMonthlySnapshots(googleAnalyticsConfig)
          .then((snapshots) => {
            app.log.info(
              {
                propertyId: googleAnalyticsConfig.propertyId,
                snapshotCount: snapshots.length,
              },
              "Google Analytics monthly preload completed",
            );
          })
          .catch((error) => {
            app.log.error(
              {
                error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
              },
              "Google Analytics monthly preload failed",
            );
          });
      } catch (error) {
        app.log.error(
          {
            error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          },
          "Google Analytics monthly snapshot failed",
        );

        googleAnalyticsSnapshot = await ensureGoogleAnalyticsSnapshotIfConfigured() ?? googleAnalyticsSnapshot;
      }
    }
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
  const latestMetaRecommendationNotesForCentre =
    resolvedSelectedCentreKey == null
      ? []
      : await readLatestMetaRecommendationNotesForCentre(resolvedSelectedCentreKey, 3);
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
        waitlistSnapshotSet: latestSnapshotSet,
        waitlistReport,
        waitlistSection: request.query?.waitlistSection ?? null,
        googleAnalyticsSection: request.query?.googleAnalyticsSection ?? null,
        metaConfigStatus,
        metaAdsDashboardData,
        googleAnalyticsConfigStatus,
        googleAnalyticsSnapshot,
        googleAnalyticsRangeMode: googleAnalyticsMonthSelection.mode,
        googleAnalyticsFromMonth: String(googleAnalyticsMonthSelection.fromMonth),
        googleAnalyticsFromYear: String(googleAnalyticsMonthSelection.fromYear),
        googleAnalyticsToMonth: String(googleAnalyticsMonthSelection.toMonth),
        googleAnalyticsToYear: String(googleAnalyticsMonthSelection.toYear),
        metaRecommendationNotifications,
        metaRecommendationNotificationCount,
        metaRecommendationNotes,
        latestMetaRecommendationNotesForCentre,
        centreContacts,
      }),
    );
});

app.get<{ Querystring: {
  notificationId?: string;
  centreName?: string;
  heading?: string;
  message?: string;
  centreKey?: string;
  windowKey?: string;
  recommendation?: string;
  priority?: string;
  openPlaces?: string;
  actionableWaitlist?: string;
  waitlistCount?: string;
  replacementPressure?: string;
  activeCampaignCount?: string;
  spend30d?: string;
} }>(
  "/meta-note-popup",
  async (request, reply) => {
    const notificationId = String(request.query?.notificationId ?? "").trim();

    if (!notificationId) {
      reply.code(400);

      return reply.type("text/plain; charset=utf-8").send("notificationId is required.");
    }

    const notes = await readLatestMetaRecommendationNotesForNotification(notificationId, 3);
    const notification = parseMetaNotificationContext({ ...request.query, notificationId });

    return reply.type("text/html; charset=utf-8").send(
      renderMetaRecommendationNotePopup({
        notificationId,
        centreName: String(request.query?.centreName ?? "").trim(),
        heading: String(request.query?.heading ?? "").trim(),
        message: String(request.query?.message ?? "").trim(),
        notes,
        notification,
      }),
    );
  },
);

app.get<{ Querystring: { centre?: string; window?: string; sort?: string; gaRange?: string; gaFrom?: string; gaTo?: string; gaFromMonth?: string; gaFromYear?: string; gaToMonth?: string; gaToYear?: string } }>("/actions/refresh-google-analytics", async (request, reply) => {
  let googleAnalyticsConfig;

  try {
    googleAnalyticsConfig = getGoogleAnalyticsConfig(env);
  } catch (error) {
    app.log.error({ error }, "Google Analytics refresh blocked by missing server configuration");
    reply.code(500);

    return reply.type("text/plain; charset=utf-8").send("Google Analytics is not configured on the server.");
  }

  try {
    await ensureGoogleAnalyticsMonthlySnapshots(googleAnalyticsConfig);
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

  const googleAnalyticsMonthSelection = resolveGoogleAnalyticsMonthSelection(request.query);

  if (googleAnalyticsMonthSelection.mode === "months") {
    params.set("gaRange", "months");
    params.set("gaFromMonth", String(googleAnalyticsMonthSelection.fromMonth));
    params.set("gaFromYear", String(googleAnalyticsMonthSelection.fromYear));
    params.set("gaToMonth", String(googleAnalyticsMonthSelection.toMonth));
    params.set("gaToYear", String(googleAnalyticsMonthSelection.toYear));
  }

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

app.get<{ Querystring: { centre?: string; limit?: string } }>("/api/meta-recommendation-notes/latest", async (request, reply) => {
  const centreKey = Number.parseInt(String(request.query?.centre ?? ""), 10);
  const limit = Number.parseInt(String(request.query?.limit ?? "3"), 10);

  if (!Number.isInteger(centreKey) || centreKey <= 0) {
    reply.code(400);

    return { error: "Valid centre is required." };
  }

  const rows = await readLatestMetaRecommendationNotesForCentre(
    centreKey,
    Number.isInteger(limit) ? limit : 3,
  );

  return {
    notes: rows.map((row) => ({
      notificationId: row.notificationId,
      text: row.message,
      submittedAt: row.occurredAt,
      heading: row.heading,
      centreName: row.centreName,
    })),
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

app.post<{ Body: { notificationId?: string; text?: string; notification?: Partial<MetaRecommendationNotificationInput> | null } }>("/api/meta-recommendation-notes", async (request, reply) => {
  const notificationId = String(request.body?.notificationId ?? "").trim();
  const text = String(request.body?.text ?? "").trim();

  if (!notificationId || !text) {
    reply.code(400);

    return { error: "notificationId and text are required." };
  }

  const notification = request.body?.notification
    ? parseMetaNotificationContext({ ...request.body.notification, notificationId })
    : null;

  if (notification) {
    await upsertMetaRecommendationNotification(notification);
  }

  const note = await createMetaRecommendationNote({ notificationId, text });

  return reply.code(201).send({ note });
});

app.get<{ Params: { centreKey: string } }>("/api/meta-email-content/:centreKey", async (request, reply) => {
  const centreKey = Number.parseInt(request.params.centreKey, 10);

  if (!Number.isInteger(centreKey) || centreKey <= 0) {
    reply.code(400);

    return { error: "Valid centre is required." };
  }

  const content = await readMetaEmailContent(centreKey);

  return {
    content: content ?? {
      centreKey,
      headingText: "",
      primaryText: "",
      updatedAt: null,
    },
  };
});

app.post<{ Params: { centreKey: string }; Body: { headingText?: string; primaryText?: string } }>("/api/meta-email-content/:centreKey", async (request, reply) => {
  const centreKey = Number.parseInt(request.params.centreKey, 10);
  const headingText = String(request.body?.headingText ?? "").trim();
  const primaryText = String(request.body?.primaryText ?? "").trim();

  if (!Number.isInteger(centreKey) || centreKey <= 0) {
    reply.code(400);

    return { error: "Valid centre is required." };
  }

  if (headingText.length > 500 || primaryText.length > 4000) {
    reply.code(400);

    return { error: "Email text is too long." };
  }

  const content = await upsertMetaEmailContent({
    centreKey,
    headingText,
    primaryText,
  });

  return reply.code(201).send({ content });
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

app.post<{
  Body: {
    prompt?: string;
    centreKey?: number | string | null;
    windowKey?: string | null;
    messages?: AiChatHistoryMessageInput[];
  };
}>("/api/ai/chat", async (request, reply) => {
  const prompt = String(request.body?.prompt ?? "").trim();
  const centreKey = Number.parseInt(String(request.body?.centreKey ?? ""), 10);
  const selectedCentreKey = Number.isInteger(centreKey) && centreKey > 0 ? centreKey : null;
  const selectedWindowKey = resolveWindowKey(request.body?.windowKey);

  if (!prompt) {
    reply.code(400);

    return { error: "Prompt is required." };
  }

  if (prompt.length > 2000) {
    reply.code(400);

    return { error: "Prompt is too long. Keep it under 2,000 characters." };
  }

  const latestSnapshotSet = await readLatestAnalyticsSnapshotSet();
  const latestRunDate = latestSnapshotSet ? new Date(latestSnapshotSet.runDate) : new Date();
  const windowStartDate = resolveWindowStartDate(latestRunDate, selectedWindowKey);
  const metaAdsDashboardData = await readMetaAdsDashboardData({
    fromDate: windowStartDate,
    toDate: latestRunDate,
  });
  const googleAnalyticsSnapshot = await readLatestGoogleAnalyticsDailySnapshot(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const selectedCentreNotes =
    selectedCentreKey == null
      ? []
      : await readLatestMetaRecommendationNotesForCentre(selectedCentreKey, 10);
  const context = buildAiDashboardContext({
    snapshotSet: latestSnapshotSet,
    selectedCentreKey,
    selectedWindowKey,
    metaAdsDashboardData,
    googleAnalyticsSnapshot,
    selectedCentreNotes,
  });

  const deterministicAnswer = buildDeterministicChatAnswer(context, prompt);

  if (deterministicAnswer && aiConfig.AI_PROVIDER === "builtin") {
    return {
      answer: deterministicAnswer,
      model: "built-in campaign timing",
      context: {
        selectedCentre: context.selectedCentre?.serviceName ?? null,
        selectedWindowKey: context.selectedWindowKey,
        snapshotCreatedAt: context.snapshot?.createdAt ?? null,
      },
    };
  }

  try {
    const answer = await runLocalChat(
      aiConfig,
      buildAiChatMessages(buildDashboardSystemPrompt(), context, prompt, request.body?.messages),
    );

    return {
      answer,
      model: aiConfig.AI_CHAT_MODEL,
      context: {
        selectedCentre: context.selectedCentre?.serviceName ?? null,
        selectedWindowKey: context.selectedWindowKey,
        snapshotCreatedAt: context.snapshot?.createdAt ?? null,
      },
    };
  } catch (error) {
    if (deterministicAnswer) {
      return {
        answer: deterministicAnswer,
        model: "built-in campaign timing fallback",
        context: {
          selectedCentre: context.selectedCentre?.serviceName ?? null,
          selectedWindowKey: context.selectedWindowKey,
          snapshotCreatedAt: context.snapshot?.createdAt ?? null,
        },
      };
    }

    const statusCode = error instanceof AiClientError ? error.statusCode : 502;

    reply.code(statusCode);

    return {
      error:
        error instanceof Error
          ? error.message
          : "Local AI request failed.",
      setup:
        aiConfig.AI_PROVIDER === "ollama"
          ? `Start a local Ollama server and make sure model "${aiConfig.AI_CHAT_MODEL}" is available, or update AI_CHAT_MODEL in .env.`
          : "Use AI_PROVIDER=ollama only when a local Ollama runtime is installed and reachable.",
    };
  }
});

app.post<{
  Body: {
    prompt?: string;
    centreKey?: number | string | null;
    windowKey?: string | null;
    messages?: AiChatHistoryMessageInput[];
  };
}>("/api/ai/chat/stream", async (request, reply) => {
  const prompt = String(request.body?.prompt ?? "").trim();
  const centreKey = Number.parseInt(String(request.body?.centreKey ?? ""), 10);
  const selectedCentreKey = Number.isInteger(centreKey) && centreKey > 0 ? centreKey : null;
  const selectedWindowKey = resolveWindowKey(request.body?.windowKey);

  if (!prompt) {
    reply.code(400);

    return { error: "Prompt is required." };
  }

  if (prompt.length > 2000) {
    reply.code(400);

    return { error: "Prompt is too long. Keep it under 2,000 characters." };
  }

  const latestSnapshotSet = await readLatestAnalyticsSnapshotSet();
  const latestRunDate = latestSnapshotSet ? new Date(latestSnapshotSet.runDate) : new Date();
  const windowStartDate = resolveWindowStartDate(latestRunDate, selectedWindowKey);
  const metaAdsDashboardData = await readMetaAdsDashboardData({
    fromDate: windowStartDate,
    toDate: latestRunDate,
  });
  const googleAnalyticsSnapshot = await readLatestGoogleAnalyticsDailySnapshot(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const selectedCentreNotes =
    selectedCentreKey == null
      ? []
      : await readLatestMetaRecommendationNotesForCentre(selectedCentreKey, 10);
  const context = buildAiDashboardContext({
    snapshotSet: latestSnapshotSet,
    selectedCentreKey,
    selectedWindowKey,
    metaAdsDashboardData,
    googleAnalyticsSnapshot,
    selectedCentreNotes,
  });
  const messages = buildAiChatMessages(buildDashboardSystemPrompt(), context, prompt, request.body?.messages);
  const deterministicAnswer = buildDeterministicChatAnswer(context, prompt);

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const writeEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const writeAnswerChunks = (answer: string) => {
    for (const chunk of answer.split(/(\s+)/).filter(Boolean)) {
      writeEvent("chunk", { chunk });
    }
  };

  writeEvent("meta", {
    model: aiConfig.AI_CHAT_MODEL,
    context: {
      selectedCentre: context.selectedCentre?.serviceName ?? null,
      selectedCentreKey: context.selectedCentre?.centreKey ?? null,
      selectedWindowKey: context.selectedWindowKey,
      snapshotCreatedAt: context.snapshot?.createdAt ?? null,
    },
  });

  try {
    if (deterministicAnswer && aiConfig.AI_PROVIDER === "builtin") {
      writeAnswerChunks(deterministicAnswer);
      writeEvent("done", {});
      return;
    }

    for await (const chunk of streamLocalChat(aiConfig, messages)) {
      writeEvent("chunk", { chunk });
    }

    writeEvent("done", {});
  } catch (error) {
    if (deterministicAnswer) {
      writeAnswerChunks(deterministicAnswer);
      writeEvent("done", {});
      return;
    }

    writeEvent("error", {
      error:
        error instanceof Error
          ? error.message
          : "Local AI request failed.",
      setup:
        aiConfig.AI_PROVIDER === "ollama"
          ? `Start a local Ollama server and make sure model "${aiConfig.AI_CHAT_MODEL}" is available, or update AI_CHAT_MODEL in .env.`
          : "Use AI_PROVIDER=ollama only when a local Ollama runtime is installed and reachable.",
    });
  } finally {
    reply.raw.end();
  }
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

app.get("/favicon.ico", async (_request, reply) => {
  const icon = await readFile(join(process.cwd(), "assets", "images", "ico.png"));

  return reply.type("image/png").send(icon);
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
