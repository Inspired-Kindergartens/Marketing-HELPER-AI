import { config as loadDotenv } from "dotenv";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { basename, extname, join } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";

import { buildAiChatMessages, buildDeterministicChatAnswer, type AiChatHistoryMessageInput } from "./ai/chat.js";
import { buildHistoryChatMemory, findMentionedCentres } from "./ai/chat-memory.js";
import { runLocalChat, streamLocalChat, AiClientError } from "./ai/client.js";
import {
  buildBuiltinCommsAnswer,
  buildCommsAiChatMessages,
  buildCommsAiDashboardContext,
  buildLocalCommunicationsGrounding,
  isLocalCommunicationsPrompt,
} from "./ai/comms-context.js";
import { buildBuiltinTasksAnswer, buildTasksAiChatMessages, buildTasksAiDashboardContext } from "./ai/tasks-context.js";
import { buildAiDashboardContext, buildDashboardSystemPrompt } from "./ai/context.js";
import {
  buildLiveInfocareGrounding,
  formatLiveInfocareAnswer,
  isLiveInfocarePrompt,
  planLiveInfocareRequest,
  runLiveInfocareRequest,
} from "./ai/infocare-live.js";
import { readAiConfig } from "./ai/config.js";
import { buildChatDocumentPrompt, extractChatDocument } from "./ai/document-reader.js";
import {
  clearSnapshotRefreshOutcome,
  getSnapshotRefreshState,
  markSnapshotRefreshAcknowledged,
  recordSnapshotRefreshOutcome,
  tickWeeklySnapshotRefresh,
} from "./analytics/background-snapshot.js";
import { ensureWeeklyAnalyticsSnapshot, refreshAnalyticsSnapshot } from "./analytics/snapshot.js";
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
import { getFormstackConfig, readFormstackConfigStatus } from "./formstack/config.js";
import { refreshFormstackData } from "./formstack/refresh.js";
import { getMailchimpConfig, readMailchimpConfigStatus } from "./mailchimp/config.js";
import { ensureDailyMailchimpSnapshot, refreshMailchimpSnapshot } from "./mailchimp/refresh.js";
import { getMetaConfig, readMetaConfigStatus } from "./meta/config.js";
import { refreshMetaAds } from "./meta/refresh.js";
import {
  readCentreReferences,
  readCentreSnapshotHistory,
  readLatestAnalyticsSnapshotSet,
} from "./storage/analytics-store.js";
import { readCentreContactList, readCentreContactListStats } from "./storage/centre-contact-store.js";
import {
  addGeneralChatMessage,
  buildGeneralChatMemory,
  buildGeneralChatMessages,
  createGeneralChatConversation,
  createGeneralChatGroup,
  deleteGeneralChatConversation,
  deleteGeneralChatGroup,
  deleteGeneralChatMessage,
  getGeneralChatPageData,
  renameGeneralChatGroup,
  updateGeneralChatConversation,
} from "./storage/general-chat-store.js";
import {
  aggregateGoogleAnalyticsSnapshots,
  readGoogleAnalyticsRangeSnapshot,
  readGoogleAnalyticsRangeSnapshots,
  readLatestGoogleAnalyticsDailySnapshot,
} from "./storage/google-analytics-store.js";
import { readMetaAdsDashboardData } from "./storage/meta-store.js";
import { readFormstackDashboardData } from "./storage/formstack-store.js";
import { readMailchimpDashboardData } from "./storage/mailchimp-store.js";
import { readPostmarkDashboardData, readPostmarkWebhookCheck } from "./storage/postmark-store.js";
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
  updateMetaRecommendationNote,
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
  resolveDefaultAnalyticsCentreKey,
} from "./ui/app-shell.js";
import { renderCommsAppShell, VALID_COMMS_PANEL_IDS } from "./ui/comms-app-shell.js";
import { renderPostmarkMessageList } from "./ui/comms/postmark-panel.js";
import { ingestPostmarkEvent, isPostmarkSourceIp, verifyBasicAuth } from "./postmark/webhook.js";
import { readCloudflareSyncConfig, syncPostmarkEventsFromCloudflare } from "./postmark/cloudflare-sync.js";
import { renderLandingIntelligenceFeed, renderLandingPage } from "./ui/landing-page.js";
import {
  addLandingIntelligenceSearchText,
  getLandingIntelligenceFeed,
  readLandingIntelligenceSearchTexts,
  refreshLandingIntelligenceFeed,
  removeLandingIntelligenceSearchText,
  startLandingIntelligenceFeedLoop,
} from "./landing-intelligence.js";
import { renderGeneralChatPage } from "./ui/general-chat-page.js";
import {
  getDueAndOverdueTasks,
  listTasks,
  getTask,
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  startTaskTimer,
  stopTaskTimer,
  logTaskTime,
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  attachTaskToProject,
  saveTaskEmailDraft,
  createTaskAttachment,
  getTaskAttachment,
  deleteTaskAttachment,
} from "./storage/task-store.js";
import {
  listProjects,
  getProjectRollup,
  createProject,
  updateProject,
  deleteProject,
  createTaskGroup,
  deleteTaskGroup,
  addProjectMember,
  removeProjectMember,
} from "./storage/project-store.js";
import {
  listMembers,
  createMember,
  updateMember,
  setMemberActive,
  deleteMember,
  listEmailContactSuggestions,
} from "./storage/member-store.js";
import { renderTasksAppShell, resolveTasksFocusPanelId } from "./ui/tasks-app-shell.js";
import { renderReadmePage } from "./ui/readme-page.js";
import {
  listJobDescriptions,
  getJobDescription,
  createJobDescription,
  updateJobDescription,
  deleteJobDescription,
  duplicateJobDescription,
  listTitleProfiles,
  listCentreProfiles,
  getGlobalSettings,
  updateGlobalSettings,
  upsertCentreProfile,
  upsertTitleProfile,
  saveBlurb,
  listBlurbVersions,
  restoreBlurbVersion,
  listBlurbsForCentre,
  listRecentBlurbsAcrossCentres,
  listIntroParagraphExamples,
  listKnowledgeDocsForCentre,
  getGenericKnowledgeDoc,
  upsertKnowledgeDoc,
  getAgreementStatus,
  type RoleSection,
} from "./storage/jd-store.js";
import { renderJdAppShell, resolveJdFocusPanelId } from "./ui/jd-app-shell.js";
import { buildImmovableBoilerplateHtml, buildJdBlurbChatMessages, buildJdIntroChatMessages } from "./ai/jd-context.js";
import { generateJdPdfBuffer, jdPdfAssetUrl, jdPdfFilename } from "./ui/jd/jd-pdf.js";
import {
  applyWikiTagging,
  buildWikiChatGrounding,
  createWikiArticle,
  createWikiCategory,
  deleteWikiArticle,
  deleteWikiCategory,
  duplicateWikiArticle,
  getWikiArticle,
  listWikiArticles,
  listWikiCategories,
  listWikiCategoriesWithCounts,
  renameWikiCategory,
  updateWikiArticle,
  wikiHtmlToPlainText,
} from "./storage/wiki-store.js";
import { buildWikiTaggingChatMessages, parseWikiTaggingResponse } from "./ai/wiki-context.js";
import { ensureAiRunning, isAiReady } from "./ai/runtime.js";
import { renderWikiAppShell, resolveWikiFocusPanelId } from "./ui/wiki-app-shell.js";

loadDotenv({ override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  AUTO_WEEKLY_SNAPSHOT: z
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
  META_AD_ACCOUNT_ID: z.string().trim().default(""),
  GOOGLE_ANALYTICS_PROPERTY_ID: z.string().trim().default(""),
  GOOGLE_ANALYTICS_OAUTH_PATH: z.string().trim().default("OAuth.json"),
  GOOGLE_ANALYTICS_TOKEN_PATH: z.string().trim().default("google-oauth-token.json"),
  GOOGLE_ANALYTICS_REFRESH_TOKEN: z.string().trim().default(""),
  AI_PROVIDER: z.enum(["builtin", "ollama"]).default("builtin"),
  AI_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  AI_CHAT_MODEL: z.string().trim().default("llama3.1:8b"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  POSTMARK_WEBHOOK_BASIC_AUTH: z.string().trim().default(""),
  POSTMARK_SERVER_TOKEN: z.string().trim().default(""),
  CLOUDFLARE_SYNC_URL: z
    .string()
    .trim()
    .default("https://postmark-webhook-events.marketing-884.workers.dev"),
  // Accept either the underscored name or the original hyphenated env key.
  CLOUDFLARE_SYNC_TOKEN: z.string().trim().default(""),
  MAILCHIMP_API_KEY: z.string().trim().default(""),
  MAILCHIMP_SERVER_PREFIX: z.string().trim().default(""),
  FORMSTACK_API_TOKEN: z.string().trim().default(""),
});

const env = envSchema.parse(process.env);
const aiConfig = readAiConfig(env);
getInfocareEnv(process.env);
const metaConfigStatus = readMetaConfigStatus(env);
const googleAnalyticsConfigStatus = readGoogleAnalyticsConfigStatus(env);
const mailchimpConfigStatus = readMailchimpConfigStatus(env);
const formstackConfigStatus = readFormstackConfigStatus(env);

if (env.HOST !== "127.0.0.1" && env.HOST.toLowerCase() !== "localhost") {
  throw new Error(`Refusing to start with non-local HOST "${env.HOST}". Use 127.0.0.1.`);
}

const app = Fastify({
  logger: env.NODE_ENV !== "test",
});

const TASK_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const TASK_ATTACHMENT_DIR = join("uploads", "task-attachments");

await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: TASK_ATTACHMENT_MAX_BYTES,
  },
});

const VALID_PANEL_IDS = new Set(["analytics", "waitlist", "meta-ads", "google-analytics", "notes", "chat"]);
const META_ADS_AUTO_REFRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECOMMENDED_AI_CHAT_MODEL = "qwen3:8b";
let aiModelUpdateInProgress = false;
let aiModelUpdateStatus: {
  state: "idle" | "downloading" | "success" | "error";
  model: string;
  progress: number | null;
  detail: string | null;
} = { state: "idle", model: RECOMMENDED_AI_CHAT_MODEL, progress: null, detail: null };

async function readGeneralChatStreamInput(request: { headers: Record<string, string | string[] | undefined>; body?: { prompt?: string }; parts?: () => AsyncIterable<unknown> }) {
  const contentType = String(request.headers["content-type"] ?? "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    return { prompt: String(request.body?.prompt ?? "").trim() };
  }

  let prompt = "";
  let documentPrompt: string | null = null;

  if (!request.parts) {
    throw new Error("Document upload support is not available.");
  }

  for await (const part of request.parts()) {
    const item = part as {
      type?: string;
      fieldname?: string;
      value?: unknown;
      filename?: string;
      mimetype?: string;
      toBuffer?: () => Promise<Buffer>;
    };

    if (item.type === "field" && item.fieldname === "prompt") {
      prompt = String(item.value ?? "").trim();
      continue;
    }

    if (item.type === "file" && item.fieldname === "document" && item.filename && item.toBuffer) {
      const document = await extractChatDocument({
        filename: item.filename,
        mimeType: item.mimetype,
        buffer: await item.toBuffer(),
      });
      documentPrompt = buildChatDocumentPrompt(prompt || "Read this document.", document);
    }
  }

  return {
    prompt,
    modelPrompt: documentPrompt ?? prompt,
    hasDocument: documentPrompt != null,
  };
}

function trackAiModelPullProgress(chunk: unknown) {
  const text = String(chunk);
  const percentMatches = text.match(/(\d{1,3})%/g);

  if (percentMatches?.length) {
    const percent = Number.parseInt(percentMatches[percentMatches.length - 1], 10);

    if (percent >= 0 && percent <= 100) {
      aiModelUpdateStatus = { ...aiModelUpdateStatus, progress: percent };
    }
  }

  const sizeMatches = text.match(/(\d+(?:\.\d+)?\s*[KMG]B)\s*\/\s*(\d+(?:\.\d+)?\s*[KMG]B)/g);

  if (sizeMatches?.length) {
    aiModelUpdateStatus = { ...aiModelUpdateStatus, detail: sizeMatches[sizeMatches.length - 1] };
  }
}

async function setDotenvValue(key: string, value: string) {
  const envPath = join(process.cwd(), ".env");
  const escaped = `${key}=${value}`;
  let content = "";

  try {
    content = await readFile(envPath, "utf8");
  } catch {
    await writeFile(envPath, `${escaped}\n`, "utf8");
    return;
  }

  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(content)
    ? content.replace(pattern, escaped)
    : `${content.trimEnd()}\n${escaped}\n`;

  await writeFile(envPath, next, "utf8");
}

async function readDotenvValue(key: string) {
  try {
    const content = await readFile(join(process.cwd(), ".env"), "utf8");
    const pattern = new RegExp(`^${key}=(.*)$`, "m");
    const match = content.match(pattern);

    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

async function deleteDotenvValue(key: string) {
  const envPath = join(process.cwd(), ".env");

  try {
    const content = await readFile(envPath, "utf8");
    const pattern = new RegExp(`^${key}=.*\\r?\\n?`, "m");
    await writeFile(envPath, content.replace(pattern, ""), "utf8");
  } catch {
    return;
  }
}

async function updateRecommendedAiModel() {
  if (aiModelUpdateInProgress) {
    return { started: false, inProgress: true, model: RECOMMENDED_AI_CHAT_MODEL };
  }

  const currentModel = aiConfig.AI_CHAT_MODEL;
  const fallbackModel = process.env.AI_CHAT_MODEL_FALLBACK || await readDotenvValue("AI_CHAT_MODEL_FALLBACK");

  aiModelUpdateInProgress = true;
  aiModelUpdateStatus = { state: "downloading", model: RECOMMENDED_AI_CHAT_MODEL, progress: null, detail: null };
  const child = spawn("ollama", ["pull", RECOMMENDED_AI_CHAT_MODEL], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => {
    trackAiModelPullProgress(chunk);
    app.log.info({ output: String(chunk).trim() }, "Ollama model update output");
  });
  child.stderr.on("data", (chunk) => {
    trackAiModelPullProgress(chunk);
    app.log.warn({ output: String(chunk).trim() }, "Ollama model update output");
  });
  child.on("error", (error) => {
    aiModelUpdateInProgress = false;
    aiModelUpdateStatus = {
      state: "error",
      model: RECOMMENDED_AI_CHAT_MODEL,
      progress: null,
      detail: error instanceof Error ? error.message : "Ollama could not be started.",
    };
    app.log.error({ error }, "Ollama model update failed to start");
  });
  child.on("exit", (code) => {
    void (async () => {
      try {
        if (code === 0) {
          if (fallbackModel && fallbackModel !== currentModel && fallbackModel !== RECOMMENDED_AI_CHAT_MODEL) {
            await setDotenvValue("AI_CHAT_MODEL_SECONDARY_FALLBACK", fallbackModel);
            process.env.AI_CHAT_MODEL_SECONDARY_FALLBACK = fallbackModel;
          }
          if (currentModel !== RECOMMENDED_AI_CHAT_MODEL) {
            await setDotenvValue("AI_CHAT_MODEL_FALLBACK", currentModel);
            process.env.AI_CHAT_MODEL_FALLBACK = currentModel;
          }
          await setDotenvValue("AI_CHAT_MODEL", RECOMMENDED_AI_CHAT_MODEL);
          aiConfig.AI_CHAT_MODEL = RECOMMENDED_AI_CHAT_MODEL;
          process.env.AI_CHAT_MODEL = RECOMMENDED_AI_CHAT_MODEL;
          app.log.info({ model: RECOMMENDED_AI_CHAT_MODEL }, "AI chat model updated");
          // Load the new model into Ollama's memory now so the first chat message
          // doesn't pay the cold-start cost.
          aiModelUpdateStatus = { state: "downloading", model: RECOMMENDED_AI_CHAT_MODEL, progress: 100, detail: "loading model" };
          await fetch(`${aiConfig.AI_BASE_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: RECOMMENDED_AI_CHAT_MODEL, prompt: "", stream: false }),
            signal: AbortSignal.timeout(120000),
          }).catch((error) => {
            app.log.warn({ error }, "New AI model warm-up failed; it will load on first chat instead");
          });
          // Refresh the feed before reporting success so the reloaded landing page
          // no longer shows the upgrade card or the update button.
          aiModelUpdateStatus = { state: "downloading", model: RECOMMENDED_AI_CHAT_MODEL, progress: 100, detail: "finalising" };
          await refreshLandingIntelligenceFeed(aiConfig, app.log).catch(() => undefined);
          aiModelUpdateStatus = { state: "success", model: RECOMMENDED_AI_CHAT_MODEL, progress: 100, detail: null };
        } else {
          aiModelUpdateStatus = {
            state: "error",
            model: RECOMMENDED_AI_CHAT_MODEL,
            progress: null,
            detail: `Ollama pull exited with code ${code}.`,
          };
          app.log.error({ code, model: RECOMMENDED_AI_CHAT_MODEL }, "Ollama model update failed");
        }
      } catch (error) {
        aiModelUpdateStatus = {
          state: "error",
          model: RECOMMENDED_AI_CHAT_MODEL,
          progress: null,
          detail: error instanceof Error ? error.message : "AI model update failed.",
        };
        app.log.error({ error, model: RECOMMENDED_AI_CHAT_MODEL }, "Ollama model update failed");
      } finally {
        aiModelUpdateInProgress = false;
      }
    })();
  });

  return { started: true, inProgress: true, model: RECOMMENDED_AI_CHAT_MODEL };
}

async function rollbackAiModel() {
  const fallbackModel = process.env.AI_CHAT_MODEL_FALLBACK || await readDotenvValue("AI_CHAT_MODEL_FALLBACK");

  if (!fallbackModel) {
    throw new Error("No AI model rollback fallback is configured.");
  }

  const currentModel = aiConfig.AI_CHAT_MODEL;

  await setDotenvValue("AI_CHAT_MODEL", fallbackModel);
  await setDotenvValue("AI_CHAT_MODEL_FALLBACK", currentModel);
  aiConfig.AI_CHAT_MODEL = fallbackModel;
  process.env.AI_CHAT_MODEL = fallbackModel;
  process.env.AI_CHAT_MODEL_FALLBACK = currentModel;
  void refreshLandingIntelligenceFeed(aiConfig, app.log);

  return { model: fallbackModel, fallbackModel: currentModel };
}

async function deleteSecondaryFallbackModel() {
  const secondaryFallbackModel =
    process.env.AI_CHAT_MODEL_SECONDARY_FALLBACK || await readDotenvValue("AI_CHAT_MODEL_SECONDARY_FALLBACK");

  if (!secondaryFallbackModel) {
    throw new Error("No older secondary fallback model is configured for deletion.");
  }

  if (secondaryFallbackModel === aiConfig.AI_CHAT_MODEL || secondaryFallbackModel === process.env.AI_CHAT_MODEL_FALLBACK) {
    throw new Error("Refusing to delete the active model or primary rollback fallback.");
  }

  const child = spawn("ollama", ["rm", secondaryFallbackModel], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => {
    app.log.info({ output: String(chunk).trim() }, "Ollama fallback deletion output");
  });
  child.stderr.on("data", (chunk) => {
    app.log.warn({ output: String(chunk).trim() }, "Ollama fallback deletion output");
  });
  child.on("error", (error) => {
    app.log.error({ error }, "Ollama fallback deletion failed to start");
  });
  child.on("exit", (code) => {
    void (async () => {
      if (code === 0) {
        await deleteDotenvValue("AI_CHAT_MODEL_SECONDARY_FALLBACK");
        delete process.env.AI_CHAT_MODEL_SECONDARY_FALLBACK;
        app.log.info({ model: secondaryFallbackModel }, "Secondary AI fallback model deleted");
        void refreshLandingIntelligenceFeed(aiConfig, app.log);
      } else {
        app.log.error({ code, model: secondaryFallbackModel }, "Secondary AI fallback model deletion failed");
      }
    })();
  });

  return { model: secondaryFallbackModel };
}

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

const INTEGRATION_ERROR_MAX_LENGTH = 800;

function resolveIntegrationErrorFromQuery(raw: string | undefined, focusPanelId: string | null) {
  const trimmed = (raw ?? "").trim();

  if (!trimmed) {
    return null;
  }

  const source: "google-analytics" | "meta-ads" =
    focusPanelId === "meta-ads" ? "meta-ads" : "google-analytics";

  return {
    source,
    message: trimmed.slice(0, INTEGRATION_ERROR_MAX_LENGTH),
  };
}

function describeIntegrationError(source: "google-analytics" | "meta-ads" | "mailchimp" | "formstack", error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const sourceLabel =
    source === "google-analytics"
      ? "Google Analytics"
      : source === "meta-ads"
        ? "Meta Ads"
        : source === "formstack"
          ? "Formstack"
          : "Mailchimp";

  if (/Missing\s+(Google Analytics|Meta Ads|Mailchimp|Formstack)\s+configuration/i.test(message)) {
    return `${sourceLabel} is not configured on the server. Check the .env values and restart.`;
  }

  if (
    source === "meta-ads" &&
    /Application request limit reached|request limit reached|"code":4\b|"error_subcode":150402[0-9]|Too many API requests|"is_transient":true/i.test(message)
  ) {
    return "Meta is rate-limiting requests (too many calls in a short window). Wait a minute or two and try the refresh again.";
  }

  if (
    source === "meta-ads" &&
    /Invalid OAuth access token|Session has expired|invalid_token|"code":190\b|"code":102\b/i.test(message)
  ) {
    return (
      "Meta access token is invalid or expired. Generate a new one: " +
      "Business Manager → Business Settings → Users → System Users → pick your System User → " +
      "Generate New Token → select your Meta App → scopes ads_read + business_management → " +
      "expiry Never → copy. Paste it into .env as META_ACCESS_TOKEN=\"...\" and restart the server. " +
      "(Short-lived fallback: developers.facebook.com/tools/explorer — lasts ~1 hour.)"
    );
  }

  if (
    /invalid_grant|Token has been expired or revoked|invalid_token|invalid_client/i.test(message)
  ) {
    return `${sourceLabel} credentials have expired or been revoked. Re-authorise the integration and try again.`;
  }

  if (/runReport failed with 403|insufficient(_| )?permissions|PERMISSION_DENIED/i.test(message)) {
    return `${sourceLabel} rejected the request: the service account or token lacks permission for this property.`;
  }

  if (/runReport failed with 429|rate(_| )?limit|too many requests/i.test(message)) {
    return `${sourceLabel} is rate-limiting requests. Wait a minute and try again.`;
  }

  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message)) {
    return `Could not reach ${sourceLabel}. Check the server's internet connection and try again.`;
  }

  return `${sourceLabel} refresh failed. Check server logs for details.`;
}

function resolveCommsMetaAdsFilter(input?: string | null) {
  return input === "active-recent" ? "active-recent" : "all";
}

function getCurrentOrRecentMetaAdvertCentreKeys(metaAdsDashboardData: Awaited<ReturnType<typeof readMetaAdsDashboardData>> | null) {
  const relevantStatuses = new Set(["Active", "Learning", "Learning Limited", "Completed"]);

  return [...new Set(
    (metaAdsDashboardData?.currentAds ?? [])
      .filter((ad) => ad.centreKey != null && relevantStatuses.has(ad.status))
      .map((ad) => ad.centreKey as number),
  )];
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

async function ensureMailchimpSnapshotIfConfigured() {
  let mailchimpConfig;

  try {
    mailchimpConfig = getMailchimpConfig(env);
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Mailchimp snapshot blocked by missing server configuration",
    );

    return null;
  }

  try {
    const result = await ensureDailyMailchimpSnapshot(mailchimpConfig);

    app.log.info(
      {
        serverPrefix: mailchimpConfig.serverPrefix,
        ...result,
      },
      "Mailchimp daily snapshot ready",
    );

    return result;
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Mailchimp daily snapshot failed",
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string) {
  return escapeHtml(value);
}

function cdata(value: string) {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function buildPostmarkRecentMessagesRss(input: {
  checkedAt: Date;
  weekStart: Date;
  relevantMessageCount: number;
  latestReceivedAt: string | null;
}) {
  const feedUrl = "http://127.0.0.1:3000/rss/postmark-recent-messages";
  const hasRecentMessages = input.relevantMessageCount > 0;
  const statusColor = hasRecentMessages ? "#166534" : "#b42318";
  const daysSinceLatest = input.latestReceivedAt
    ? Math.max(0, Math.floor((input.checkedAt.getTime() - new Date(input.latestReceivedAt).getTime()) / (24 * 60 * 60 * 1000)))
    : 7;
  const alertMessage = `ALERT: No emails have been sent from our website for ${daysSinceLatest} days`;
  const title = hasRecentMessages ? "Postmark Recent messages current" : alertMessage;
  const detail = hasRecentMessages
    ? `${input.relevantMessageCount} relevant Postmark email${input.relevantMessageCount === 1 ? "" : "s"} found in Recent messages in the past week.`
    : alertMessage;
  const latest = input.latestReceivedAt
    ? `Latest stored email activity: ${new Date(input.latestReceivedAt).toLocaleString("en-NZ")}.`
    : "No stored email activity exists yet.";
  const description = `<p style="color:${statusColor};font-weight:700;">${escapeHtml(detail)}</p><p>${escapeHtml(latest)}</p>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Marketing Helper AI - Postmark Recent messages</title>
    <link>${escapeXml(feedUrl)}</link>
    <description>Webhook email health check for the Webmail Recent messages list.</description>
    <lastBuildDate>${input.checkedAt.toUTCString()}</lastBuildDate>
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(feedUrl)}</link>
      <guid isPermaLink="false">postmark-recent-messages:${input.weekStart.toISOString().slice(0, 10)}</guid>
      <pubDate>${input.checkedAt.toUTCString()}</pubDate>
      <category>${hasRecentMessages ? "ok" : "red"}</category>
      <description>${cdata(description)}</description>
    </item>
  </channel>
</rss>`;
}

function renderContactUploadPage(input: {
  status?: string;
  contactCount?: string;
  rowCount?: string;
  error?: string;
  currentContactCount: number;
  currentRowCount: number;
  updatedAt: string | null;
}) {
  const uploadedRowCount = input.rowCount ?? String(input.currentRowCount);
  const uploadedContactCount = input.contactCount ?? String(input.currentContactCount);
  const availabilityNote =
    uploadedRowCount === uploadedContactCount ? "" : ` ${escapeHtml(uploadedContactCount)} usable contacts are available.`;
  const status =
    input.status === "uploaded"
      ? `<p class="contact-upload__status">Contacts updated. ${escapeHtml(uploadedRowCount)} workbook rows uploaded.${availabilityNote}</p>`
      : input.error
        ? `<p class="contact-upload__error">${escapeHtml(input.error)}</p>`
        : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Upload Contacts - Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="landing-body">
    <main class="contact-upload">
      <a class="contact-upload__back" href="/">Back to landing</a>
      <h1>Upload Contacts</h1>
      <p>Update the contacts list from the <a href="https://ikindergartens.sharepoint.com/sites/InspiredKindergartenTeam/Lists/Kindergarten%20Contact%20List/AllItems.aspx" target="_blank" rel="noopener noreferrer">Kindergarten Contact List</a> from the Staff Portal Sharepoint site</p>
      ${status}
      <dl class="contact-upload__meta">
        <div><dt>Current rows</dt><dd>${input.currentRowCount}</dd></div>
        <div><dt>Usable contacts</dt><dd>${input.currentContactCount}</dd></div>
        <div><dt>Current file</dt><dd>${input.updatedAt ? escapeHtml(input.updatedAt) : "Not found"}</dd></div>
      </dl>
      <form class="contact-upload__form" action="/contacts/upload" method="post" enctype="multipart/form-data">
        <label>
          <span>Excel workbook</span>
          <input type="file" name="contacts" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button type="submit"><i class="bi bi-upload" aria-hidden="true"></i><span>Upload contacts</span></button>
      </form>
    </main>
  </body>
</html>`;
}

app.get("/", async (_request, reply) => {
  void tickWeeklySnapshotRefresh(app.log);
  const [reminders, agreementStatus] = await Promise.all([getDueAndOverdueTasks(), getAgreementStatus()]);
  const ktcaReminder =
    agreementStatus.expired || agreementStatus.expiringSoon
      ? { expired: agreementStatus.expired, daysUntilExpiry: agreementStatus.daysUntilExpiry ?? 0 }
      : null;
  return reply
    .type("text/html; charset=utf-8")
    .send(renderLandingPage({ reminders, intelligenceFeed: getLandingIntelligenceFeed(), ktcaReminder }));
});

app.get("/api/landing-intelligence", async (_request, reply) => {
  const cached = getLandingIntelligenceFeed();
  const isStale = !cached.generatedAt || (cached.nextRefreshAt != null && new Date(cached.nextRefreshAt).getTime() <= Date.now());

  if (cached.items.length > 0 && !isStale) {
    return reply.type("text/html; charset=utf-8").send(renderLandingIntelligenceFeed(cached));
  }

  void refreshLandingIntelligenceFeed(aiConfig, app.log);

  return reply.type("text/html; charset=utf-8").send(renderLandingIntelligenceFeed(cached));
});

app.get("/api/landing-intelligence/search-texts", async (_request, reply) => {
  return reply.type("application/json; charset=utf-8").send({
    ok: true,
    searchTexts: await readLandingIntelligenceSearchTexts(),
  });
});

app.get("/rss/postmark-recent-messages", async (_request, reply) => {
  const checkedAt = new Date();
  const weekStart = new Date(checkedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [recentDashboardData, allDashboardData] = await Promise.all([
    readPostmarkDashboardData({ fromDate: weekStart }),
    readPostmarkDashboardData(),
  ]);

  return reply.type("application/rss+xml; charset=utf-8").send(
    buildPostmarkRecentMessagesRss({
      checkedAt,
      weekStart,
      relevantMessageCount: recentDashboardData.relevantMessageCount,
      latestReceivedAt: allDashboardData.recentMessages[0]?.latestOccurredAt ?? null,
    }),
  );
});

app.post<{ Body: { text?: string } }>("/api/landing-intelligence/search-texts", async (request, reply) => {
  const body = z.object({ text: z.string().trim().min(1).max(180) }).parse(request.body ?? {});
  const searchTexts = await addLandingIntelligenceSearchText(body.text);
  const feed = await refreshLandingIntelligenceFeed(aiConfig, app.log, { force: true });

  return reply.type("application/json; charset=utf-8").send({
    ok: true,
    searchTexts,
    html: renderLandingIntelligenceFeed(feed),
  });
});

app.post<{ Body: { text?: string } }>("/api/landing-intelligence/search-texts/remove", async (request, reply) => {
  const body = z.object({ text: z.string().trim().min(1).max(180) }).parse(request.body ?? {});
  const searchTexts = await removeLandingIntelligenceSearchText(body.text);
  const feed = await refreshLandingIntelligenceFeed(aiConfig, app.log, { force: true });

  return reply.type("application/json; charset=utf-8").send({
    ok: true,
    searchTexts,
    html: renderLandingIntelligenceFeed(feed),
  });
});

app.get("/readme", async (_request, reply) => {
  return reply.type("text/html; charset=utf-8").send(await renderReadmePage());
});

app.get<{ Querystring: { status?: string; contactCount?: string; rowCount?: string; error?: string } }>("/contacts/upload", async (request, reply) => {
  const [contactStats, stat] = await Promise.all([
    readCentreContactListStats(),
    import("node:fs/promises")
      .then((fs) => fs.stat(join(process.cwd(), "centre-contact-list.xlsx")))
      .catch(() => null),
  ]);

  return reply.type("text/html; charset=utf-8").send(
    renderContactUploadPage({
      status: request.query?.status,
      contactCount: request.query?.contactCount,
      rowCount: request.query?.rowCount,
      error: request.query?.error,
      currentContactCount: contactStats.contacts.length,
      currentRowCount: contactStats.rowCount,
      updatedAt: stat?.mtime ? stat.mtime.toLocaleString("en-NZ") : null,
    }),
  );
});

app.post("/contacts/upload", async (request, reply) => {
  const file = await request.file();

  if (!file) {
    reply.code(303);
    return reply.redirect("/contacts/upload?error=Choose%20a%20contacts%20workbook%20to%20upload.");
  }

  if (extname(file.filename).toLowerCase() !== ".xlsx") {
    reply.code(303);
    return reply.redirect("/contacts/upload?error=Upload%20an%20.xlsx%20contacts%20workbook.");
  }

  const buffer = await file.toBuffer();
  const tempDir = join(process.cwd(), "uploads");
  const tempPath = join(tempDir, `contact-list-${randomUUID()}.xlsx`);

  await mkdir(tempDir, { recursive: true });
  await writeFile(tempPath, buffer);

  try {
    const parsed = await readCentreContactListStats(tempPath);

    if (parsed.contacts.length === 0) {
      reply.code(303);
      return reply.redirect(
        "/contacts/upload?error=The%20workbook%20must%20include%20Kindergarten%2C%20Head%20Teacher%2C%20Administrator%2C%20and%20Email%20columns.",
      );
    }

    await writeFile(join(process.cwd(), "centre-contact-list.xlsx"), buffer);
    void refreshLandingIntelligenceFeed(aiConfig, app.log);
    reply.code(303);
    return reply.redirect(
      `/contacts/upload?status=uploaded&rowCount=${parsed.rowCount}&contactCount=${parsed.contacts.length}`,
    );
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
});

app.get<{ Querystring: { conversation?: string; group?: string } }>("/chat", async (request, reply) => {
  // Every AI-dependent page warms the local runtime the same way.
  void ensureAiRunning(aiConfig, app.log);

  const conversationId = Number.parseInt(String(request.query?.conversation ?? ""), 10);
  const groupId = Number.parseInt(String(request.query?.group ?? ""), 10);
  const data = await getGeneralChatPageData({
    selectedConversationId: Number.isInteger(conversationId) ? conversationId : null,
    selectedGroupId: Number.isInteger(groupId) && groupId > 0 ? groupId : null,
  });
  return reply.type("text/html; charset=utf-8").send(renderGeneralChatPage(data));
});

app.post<{ Body: { name?: string } }>("/api/general-chat/groups", async (request, reply) => {
  const name = String(request.body?.name ?? "").trim();
  if (!name) {
    reply.code(400);
    return { error: "Group name is required." };
  }

  const id = await createGeneralChatGroup(name);
  return { id };
});

app.patch<{ Params: { id: string }; Body: { name?: string } }>(
  "/api/general-chat/groups/:id",
  async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    const name = String(request.body?.name ?? "").trim();
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400);
      return { error: "Valid group id is required." };
    }
    if (!name) {
      reply.code(400);
      return { error: "Group name is required." };
    }

    await renameGeneralChatGroup(id, name);
    return { ok: true };
  },
);

app.delete<{ Params: { id: string } }>("/api/general-chat/groups/:id", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);
    return { error: "Valid group id is required." };
  }

  await deleteGeneralChatGroup(id);
  return { ok: true };
});

app.post<{ Body: { title?: string; groupId?: number | string | null } }>(
  "/api/general-chat/conversations",
  async (request) => {
    const groupId = Number.parseInt(String(request.body?.groupId ?? ""), 10);
    const id = await createGeneralChatConversation({
      title: request.body?.title,
      groupId: Number.isInteger(groupId) && groupId > 0 ? groupId : null,
    });
    return { id };
  },
);

app.patch<{ Params: { id: string }; Body: { title?: string; groupId?: number | string | null } }>(
  "/api/general-chat/conversations/:id",
  async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400);
      return { error: "Valid conversation id is required." };
    }

    const groupId =
      request.body?.groupId === null
        ? null
        : Number.parseInt(String(request.body?.groupId ?? ""), 10);
    await updateGeneralChatConversation(id, {
      title: request.body?.title,
      groupId:
        request.body?.groupId === undefined
          ? undefined
          : groupId === null
            ? null
            : Number.isInteger(groupId) && groupId > 0
              ? groupId
              : null,
    });
    return { ok: true };
  },
);

app.delete<{ Params: { id: string } }>("/api/general-chat/conversations/:id", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);
    return { error: "Valid conversation id is required." };
  }

  await deleteGeneralChatConversation(id);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>("/api/general-chat/messages/:id", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);
    return { error: "Valid message id is required." };
  }

  const result = await deleteGeneralChatMessage(id);
  if (!result) {
    reply.code(404);
    return { error: "Message not found." };
  }

  return result;
});

app.post<{ Params: { id: string }; Body: { prompt?: string } }>(
  "/api/general-chat/conversations/:id/stream",
  async (request, reply) => {
    const conversationId = Number.parseInt(request.params.id, 10);
    let streamInput;

    try {
      streamInput = await readGeneralChatStreamInput(request);
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : "The attached document could not be read.",
      };
    }

    const prompt = streamInput.prompt;
    const modelPrompt = streamInput.modelPrompt ?? prompt;

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      reply.code(400);
      return { error: "Valid conversation id is required." };
    }

    if (!prompt && !streamInput.hasDocument) {
      reply.code(400);
      return { error: "Prompt is required." };
    }

    if (prompt.length > 6000) {
      reply.code(400);
      return { error: "Prompt is too long. Keep it under 6,000 characters." };
    }

    const userMessage = await addGeneralChatMessage(conversationId, "user", modelPrompt);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let answer = "";
    try {
      writeEvent("saved", { role: "user", messageId: userMessage.id, messageCount: userMessage.messageCount });

      const centreReferences = await readCentreReferences();
      let liveGrounding: string | null = null;

      if (!streamInput.hasDocument && isLiveInfocarePrompt(prompt)) {
        const memory = await buildGeneralChatMemory(conversationId, centreReferences);
        const livePlan = planLiveInfocareRequest(prompt, centreReferences, memory.selectedCentreKey);

        if (!livePlan.intent) {
          writeEvent("error", { error: livePlan.error ?? "I could not determine which live Infocare data to read." });
          return;
        }

        const liveResult = await runLiveInfocareRequest(livePlan.intent);
        answer = formatLiveInfocareAnswer(liveResult, prompt);
        for (const chunk of answer.split(/(\s+)/).filter(Boolean)) {
          writeEvent("chunk", { chunk });
        }

        const assistantMessage = await addGeneralChatMessage(conversationId, "assistant", answer);
        writeEvent("saved", {
          role: "assistant",
          messageId: assistantMessage.id,
          messageCount: assistantMessage.messageCount,
        });
        writeEvent("done", { messageCount: assistantMessage.messageCount });
        return;
      }

      const groundingWithWiki = streamInput.hasDocument
        ? liveGrounding
        : await withWikiGrounding(prompt, liveGrounding);
      const messages = await buildGeneralChatMessages(conversationId, centreReferences, groundingWithWiki);

      for await (const chunk of streamLocalChat(aiConfig, messages)) {
        answer += chunk;
        writeEvent("chunk", { chunk });
      }

      let messageCount = userMessage.messageCount;
      if (answer.trim()) {
        const assistantMessage = await addGeneralChatMessage(conversationId, "assistant", answer);
        messageCount = assistantMessage.messageCount;
        writeEvent("saved", {
          role: "assistant",
          messageId: assistantMessage.id,
          messageCount: assistantMessage.messageCount,
        });
      }

      writeEvent("done", { messageCount });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Local AI request failed.";
      app.log.warn({ error }, "General chat stream failed");
      writeEvent("error", { error: message });
    } finally {
      reply.raw.end();
    }
  },
);

app.get<{ Querystring: { centre?: string; window?: string; panel?: string; sort?: string; waitlistSection?: string; googleAnalyticsSection?: string; gaRange?: string; gaFrom?: string; gaTo?: string; gaFromMonth?: string; gaFromYear?: string; gaToMonth?: string; gaToYear?: string; metaRefreshed?: string; integrationError?: string } }>("/app", async (request, reply) => {
  void tickWeeklySnapshotRefresh(app.log);
  void ensureAiRunning(aiConfig, app.log);

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
    resolveDefaultAnalyticsCentreKey(snapshotSet, selectedWindowKey, serviceSort);
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
  const snapshotRefreshState = getSnapshotRefreshState();

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
        snapshotRefreshStatus: snapshotRefreshState.status,
        snapshotRefreshOutcome:
          snapshotRefreshState.centresFailed != null || snapshotRefreshState.errorMessage
            ? {
                centresAttempted: snapshotRefreshState.centresAttempted,
                centresProcessed: snapshotRefreshState.centresProcessed,
                centresFailed: snapshotRefreshState.centresFailed,
                failedCentres: snapshotRefreshState.failedCentres.map((failure) => ({
                  centreName: failure.centreName,
                  message: failure.message,
                })),
                errorMessage: snapshotRefreshState.errorMessage,
              }
            : null,
        integrationError: resolveIntegrationErrorFromQuery(request.query?.integrationError, focusPanelId),
      }),
    );
});

app.get<{ Querystring: { panel?: string; window?: string; metaAdsFilter?: string; integrationError?: string; integrationSource?: string; webmailPage?: string } }>("/comms", async (request, reply) => {
  const panel = String(request.query?.panel ?? "");
  const focusPanelId = VALID_COMMS_PANEL_IDS.has(panel) ? panel : null;
  const selectedWindowKey = resolveWindowKey(request.query?.window);
  const windowStartDate = resolveWindowStartDate(new Date(), selectedWindowKey);
  const metaAdsFilter = resolveCommsMetaAdsFilter(request.query?.metaAdsFilter);
  let integrationError = (request.query?.integrationError ?? "").trim().slice(0, INTEGRATION_ERROR_MAX_LENGTH) || null;
  const integrationSource = request.query?.integrationSource === "formstack"
    ? "formstack"
    : request.query?.integrationSource === "postmark"
      ? "postmark"
      : "mailchimp";
  let mailchimpDashboardData = null;
  let formstackDashboardData = null;
  let postmarkDashboardData = null;
  const metaAdsDashboardForFilter = metaAdsFilter === "active-recent"
    ? await readMetaAdsDashboardData({ fromDate: windowStartDate, toDate: new Date() })
    : null;
  const metaAdvertCentreKeys = metaAdsFilter === "active-recent"
    ? getCurrentOrRecentMetaAdvertCentreKeys(metaAdsDashboardForFilter)
    : null;

  try {
    postmarkDashboardData = await readPostmarkDashboardData({
      messagePage: Number(request.query?.webmailPage ?? 1),
      fromDate: windowStartDate,
      centreKeys: metaAdvertCentreKeys,
    });
  } catch (error) {
    app.log.error({ error }, "Postmark dashboard read failed");
    integrationError ??= "Webmail dashboard storage is unavailable until database migrations have been applied.";
  }

  try {
    mailchimpDashboardData = await readMailchimpDashboardData({
      serverPrefix: mailchimpConfigStatus.serverPrefix ?? undefined,
    });
  } catch (error) {
    app.log.error({ error }, "Mailchimp dashboard read failed");
    integrationError ??= "Mailchimp dashboard storage is unavailable until database migrations have been applied.";
  }

  try {
    formstackDashboardData = await readFormstackDashboardData();
  } catch (error) {
    app.log.error({ error }, "Formstack dashboard read failed");
    integrationError ??= "Formstack dashboard storage is unavailable until database migrations have been applied.";
  }

  return reply
    .type("text/html; charset=utf-8")
    .send(renderCommsAppShell({
      focusPanelId,
      mailchimpDashboardData,
      mailchimpConfigStatus,
      formstackDashboardData,
      formstackConfigStatus,
      postmarkDashboardData,
      selectedWindowKey,
      metaAdsFilter,
      metaAdvertCentreCount: metaAdvertCentreKeys?.length ?? null,
      integrationError,
      integrationSource,
    }));
});

// --- Tasks & Projects ----------------------------------------------------

function parsePositiveInt(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toNullableId(value: unknown): number | null {
  return parsePositiveInt(value);
}

function sanitizeAttachmentName(value: string | undefined): string {
  const name = basename(value || "attachment").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return name.length > 0 ? name.slice(0, 240) : "attachment";
}

function attachmentDownloadHeader(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function attachmentPath(storagePath: string): string {
  return join(process.cwd(), storagePath);
}

app.get<{ Querystring: { panel?: string; project?: string; task?: string } }>(
  "/tasks",
  async (request, reply) => {
    const selectedTaskId = parsePositiveInt(request.query?.task);
    const selectedProjectId = parsePositiveInt(request.query?.project);

    // A ?task= link (e.g. from the landing reminders) implies the detail panel.
    const focusPanelId =
      resolveTasksFocusPanelId(request.query?.panel) ??
      (selectedTaskId != null ? "task-detail" : selectedProjectId != null ? "projects" : null);

    const [tasks, projects, members] = await Promise.all([
      listTasks(),
      listProjects(),
      listMembers(),
    ]);

    const selectedTask = selectedTaskId != null ? await getTask(selectedTaskId) : null;
    const selectedProject =
      selectedProjectId != null ? await getProjectRollup(selectedProjectId) : null;
    const selectedTaskProject =
      selectedTask?.projectId != null ? await getProjectRollup(selectedTask.projectId) : null;

    // The contact autocomplete is only needed when the email compose editor is
    // on screen (a task is selected). Skip the XLSX/member read otherwise.
    const contactSuggestions = selectedTask != null ? await listEmailContactSuggestions() : [];

    return reply.type("text/html; charset=utf-8").send(
      renderTasksAppShell({
        focusPanelId,
        tasks,
        projects,
        members,
        selectedTask,
        selectedProject,
        selectedTaskProject,
        contactSuggestions,
      }),
    );
  },
);

// --- Job Descriptions ------------------------------------------------------

// The JD editor form posts role sections as bracket-form keys
// ("roleSections[0][heading]", "roleSections[0][bullets][1][text]") since it
// isn't a fixed shape. Rebuilds the RoleSection[] array from those flat keys.
function parseRoleSectionsFromForm(body: Record<string, unknown>): RoleSection[] | undefined {
  type SectionDraft = { heading: string; intro?: string; bullets: Map<number, { text: string; boldLeadIn?: string }> };
  const sectionPattern = /^roleSections\[(\d+)\]\[(heading|intro)\]$/;
  const bulletPattern = /^roleSections\[(\d+)\]\[bullets\]\[(\d+)\]\[(text|boldLeadIn)\]$/;
  const sections = new Map<number, SectionDraft>();
  let found = false;

  for (const [key, rawValue] of Object.entries(body)) {
    const value = typeof rawValue === "string" ? rawValue : "";
    const sectionMatch = sectionPattern.exec(key);
    if (sectionMatch) {
      found = true;
      const index = Number(sectionMatch[1]);
      const field = sectionMatch[2] as "heading" | "intro";
      const section: SectionDraft = sections.get(index) ?? { heading: "", bullets: new Map() };
      section[field] = value;
      sections.set(index, section);
      continue;
    }
    const bulletMatch = bulletPattern.exec(key);
    if (bulletMatch) {
      found = true;
      const index = Number(bulletMatch[1]);
      const bulletIndex = Number(bulletMatch[2]);
      const field = bulletMatch[3] as "text" | "boldLeadIn";
      const section: SectionDraft = sections.get(index) ?? { heading: "", bullets: new Map() };
      const bullet = section.bullets.get(bulletIndex) ?? { text: "" };
      bullet[field] = value;
      section.bullets.set(bulletIndex, bullet);
      sections.set(index, section);
    }
  }

  if (!found) return undefined;

  return Array.from(sections.entries())
    .sort(([a], [b]) => a - b)
    .map(([, section]) => ({
      heading: section.heading,
      ...(section.intro ? { intro: section.intro } : {}),
      bullets: Array.from(section.bullets.entries())
        .sort(([a], [b]) => a - b)
        .map(([, bullet]) => ({
          text: bullet.text,
          ...(bullet.boldLeadIn ? { boldLeadIn: bullet.boldLeadIn } : {}),
        })),
    }));
}

function parseExtrasFromForm(body: Record<string, unknown>): Record<string, string> | undefined {
  const pattern = /^extras\[(\w+)\]$/;
  const extras: Record<string, string> = {};
  let found = false;
  for (const [key, rawValue] of Object.entries(body)) {
    const match = pattern.exec(key);
    if (match) {
      found = true;
      extras[match[1]] = typeof rawValue === "string" ? rawValue : "";
    }
  }
  return found ? extras : undefined;
}

app.get<{ Querystring: { panel?: string; jd?: string } }>("/jd", async (request, reply) => {
  const selectedJdId = parsePositiveInt(request.query?.jd);
  const focusPanelId =
    resolveJdFocusPanelId(request.query?.panel) ?? (selectedJdId != null ? "jd-editor" : null);

  const [jobDescriptions, titleProfiles, centreProfiles, agreementStatus] = await Promise.all([
    listJobDescriptions(),
    listTitleProfiles(),
    listCentreProfiles(),
    getAgreementStatus(),
  ]);
  const globalSettings = await getGlobalSettings();

  const selectedJd = selectedJdId != null ? await getJobDescription(selectedJdId) : null;
  const genericDoc = await getGenericKnowledgeDoc();
  const knowledgeDocs = selectedJd?.centreKey != null ? await listKnowledgeDocsForCentre(selectedJd.centreKey) : [];
  const blurbVersions = selectedJd != null ? await listBlurbVersions(selectedJd.id) : [];
  const boilerplateHtml = selectedJd
    ? buildImmovableBoilerplateHtml(selectedJd, jdPdfAssetUrl(selectedJd))
    : "";

  return reply.type("text/html; charset=utf-8").send(
    renderJdAppShell({
      focusPanelId,
      list: { jobDescriptions, titleProfiles, centreProfiles },
      editor: { jobDescription: selectedJd, titleProfiles, centreProfiles },
      blurb: { jobDescription: selectedJd, boilerplateHtml, versions: blurbVersions },
      settings: { centreProfiles, titleProfiles, knowledgeDocs: genericDoc ? [genericDoc, ...knowledgeDocs] : knowledgeDocs, agreementStatus, globalSettings },
    }),
  );
});

app.post<{ Body: { jobTitleProfileId?: string; centreKey?: string } }>("/api/jd", async (request, reply) => {
  const jobTitleProfileId = parsePositiveInt(request.body?.jobTitleProfileId);
  const centreKey = parsePositiveInt(request.body?.centreKey);
  if (jobTitleProfileId == null) {
    reply.code(400);
    return { error: "A job title is required." };
  }
  if (centreKey == null) {
    // Non-centre-specific titles hide the Location step, but creating a JD
    // still needs a centre for the intro paragraph, Senior Teacher and PDF
    // footer. Say so plainly rather than failing with a generic message.
    const profile = (await listTitleProfiles()).find((row) => row.id === jobTitleProfileId);
    reply.code(400);
    return {
      error:
        profile && !profile.isCentreSpecific
          ? `"${profile.jobTitle}" is not centre specific. Creating job descriptions for org-wide roles is not supported yet - tick "Centre specific" in Settings to use it for now.`
          : "A job title and location are required.",
    };
  }
  try {
    const id = await createJobDescription({ jobTitleProfileId, centreKey });
    // Kick off the first blurb draft in the background so it's often ready
    // by the time the user opens the blurb panel. Fire-and-forget: a failure
    // here (AI unavailable, timeout) just leaves the blurb empty for the
    // user to generate manually — it must not fail JD creation.
    let introGenerated = false;

    try {
      introGenerated = (await generateJdIntroParagraphIfEmpty(id)) != null;
    } catch (error) {
      app.log.warn({ error, jobDescriptionId: id }, "Automatic JD intro paragraph generation failed");
    }

    void generateJdBlurb(id).catch((error) => {
      app.log.warn({ error, jobDescriptionId: id }, "Automatic JD blurb generation failed");
    });
    return reply.code(201).send({ ok: true, id, introGenerated });
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : "Could not create job description." };
  }
});

app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/jd/:id", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  const body = request.body ?? {};
  const roleSections = parseRoleSectionsFromForm(body);
  const extras = parseExtrasFromForm(body);
  await updateJobDescription(id, {
    ...(typeof body.jobTitle === "string" ? { jobTitle: body.jobTitle } : {}),
    ...(body.titleProfileId !== undefined ? { titleProfileId: body.titleProfileId ? Number(body.titleProfileId) : null } : {}),
    ...(body.centreKey !== undefined ? { centreKey: body.centreKey ? Number(body.centreKey) : null } : {}),
    ...(typeof body.locationDisplay === "string" ? { locationDisplay: body.locationDisplay } : {}),
    ...(typeof body.positionType === "string" ? { positionType: body.positionType } : {}),
    ...(body.fte !== undefined ? { fte: body.fte ? Number(body.fte) : null } : {}),
    ...(typeof body.jobCategory === "string" ? { jobCategory: body.jobCategory } : {}),
    ...(body.layoutVariant === "standard" || body.layoutVariant === "administrator" || body.layoutVariant === "professional"
      ? { layoutVariant: body.layoutVariant }
      : {}),
    ...(typeof body.agreementText === "string" ? { agreementText: body.agreementText } : {}),
    ...(typeof body.salaryRangeText === "string" ? { salaryRangeText: body.salaryRangeText } : {}),
    ...(body.dateAdvertised !== undefined ? { dateAdvertised: (body.dateAdvertised as string) || null } : {}),
    ...(body.closingAt !== undefined ? { closingAt: (body.closingAt as string) || null } : {}),
    ...(typeof body.startDateText === "string" ? { startDateText: body.startDateText } : {}),
    ...(typeof body.qualificationsText === "string" ? { qualificationsText: body.qualificationsText } : {}),
    ...(typeof body.introParagraph === "string" ? { introParagraph: body.introParagraph } : {}),
    ...(roleSections ? { roleSections } : {}),
    ...(extras ? { extras } : {}),
    ...(typeof body.seniorTeacherName === "string" ? { seniorTeacherName: body.seniorTeacherName } : {}),
    ...(typeof body.reviewedByAcronym === "string" ? { reviewedByAcronym: body.reviewedByAcronym } : {}),
    ...(typeof body.approvedByAcronym === "string" ? { approvedByAcronym: body.approvedByAcronym } : {}),
    ...(typeof body.lastUpdatedByAcronym === "string" ? { lastUpdatedByAcronym: body.lastUpdatedByAcronym } : {}),
  });
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/jd/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  await deleteJobDescription(id);
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/jd/:id/duplicate", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  const newId = await duplicateJobDescription(id);
  return reply.code(201).send({ ok: true, id: newId });
});

// Lightweight poll target for the blurb panel while an auto-generated first
// draft is still running in the background — avoids re-fetching the whole page.
app.get<{ Params: { id: string } }>("/api/jd/:id/blurb/status", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  const jd = await getJobDescription(id);
  if (!jd) {
    reply.code(404);
    return { error: "Job description not found." };
  }
  return { hasBlurb: jd.blurbHtml != null };
});

app.get<{ Params: { id: string } }>("/api/jd/:id/pdf", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  const jd = await getJobDescription(id);
  if (!jd) {
    reply.code(404);
    return { error: "Job description not found." };
  }
  const buffer = await generateJdPdfBuffer(jd);
  return reply
    .type("application/pdf")
    .header("Content-Disposition", attachmentDownloadHeader(jdPdfFilename(jd)))
    .send(buffer);
});

app.post<{ Params: { id: string }; Body: { html?: string } }>("/api/jd/:id/blurb", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  try {
    await saveBlurb(id, request.body?.html ?? "");
    return { ok: true };
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : "Could not save blurb." };
  }
});

function cleanGeneratedIntroParagraph(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateJdIntroParagraphIfEmpty(id: number): Promise<string | null> {
  const jd = await getJobDescription(id);
  if (!jd || jd.centreKey == null) {
    throw new Error("Job description not found.");
  }

  if (jd.introParagraph.trim()) {
    return jd.introParagraph;
  }

  const [centreProfiles, knowledgeDocs, latestSnapshotSet, centreExamples, fallbackExamples] = await Promise.all([
    listCentreProfiles(),
    listKnowledgeDocsForCentre(jd.centreKey),
    readLatestAnalyticsSnapshotSet(),
    listIntroParagraphExamples({ centreKey: jd.centreKey, limit: 3 }),
    listIntroParagraphExamples({ excludeCentreKey: jd.centreKey, limit: 6 }),
  ]);
  const centreProfile = centreProfiles.find((c) => c.centreKey === jd.centreKey) ?? null;
  const centreName = centreProfile?.centreName ?? jd.locationDisplay;
  const currentServiceDoc = knowledgeDocs.find((doc) => doc.kind === "service" && doc.label === "current") ?? null;
  const oldServiceDoc = knowledgeDocs.find((doc) => doc.kind === "service" && doc.label === "old") ?? null;
  const snapshot = latestSnapshotSet?.snapshots.find((entry) => entry.centreKey === jd.centreKey) ?? null;
  const messages = buildJdIntroChatMessages({
    jobDescription: jd,
    centreName,
    currentServiceDoc,
    oldServiceDoc,
    infocareFacts: snapshot
      ? {
          snapshotDate: snapshot.date,
          enrolledCount: snapshot.enrolledCount,
          enrolledFteCount: snapshot.enrolledFteCount,
          licensedCapacity: snapshot.licensedCapacity,
          licensedUnder2Capacity: snapshot.licensedUnder2Capacity ?? null,
          licensedOver2Capacity: snapshot.licensedOver2Capacity ?? null,
        }
      : null,
    centreExamples,
    fallbackExamples,
  });
  const JD_INTRO_AI_MODEL = "llama3.1:8b";
  const JD_INTRO_AI_TIMEOUT_MS = 120000;
  const introParagraph = cleanGeneratedIntroParagraph(
    await runLocalChat(
      { ...aiConfig, AI_CHAT_MODEL: JD_INTRO_AI_MODEL, AI_TIMEOUT_MS: JD_INTRO_AI_TIMEOUT_MS },
      messages,
    ),
  );

  if (!introParagraph) {
    return null;
  }

  await updateJobDescription(id, { introParagraph });
  return introParagraph;
}

// Shared by the explicit "Generate with AI" button and the fire-and-forget
// auto-generation kicked off when a JD is first created.
async function generateJdBlurb(id: number): Promise<string> {
  const jd = await getJobDescription(id);
  if (!jd || jd.centreKey == null) {
    throw new Error("Job description not found.");
  }

  const [centreProfiles, knowledgeDocs, genericDoc, priorBlurbs] = await Promise.all([
    listCentreProfiles(),
    listKnowledgeDocsForCentre(jd.centreKey),
    getGenericKnowledgeDoc(),
    listBlurbsForCentre(jd.centreKey, 3),
  ]);
  const fallbackBlurbs =
    priorBlurbs.length === 0 ? await listRecentBlurbsAcrossCentres(6, jd.centreKey) : [];
  const centreProfile = centreProfiles.find((c) => c.centreKey === jd.centreKey) ?? null;
  const centreName = centreProfile?.centreName ?? jd.locationDisplay;
  const currentServiceDoc = knowledgeDocs.find((doc) => doc.kind === "service" && doc.label === "current") ?? null;
  const oldServiceDoc = knowledgeDocs.find((doc) => doc.kind === "service" && doc.label === "old") ?? null;

  const messages = buildJdBlurbChatMessages({
    jobDescription: jd,
    centreName,
    genericDoc,
    currentServiceDoc,
    oldServiceDoc,
    priorBlurbs,
    fallbackBlurbs,
    isEnviroschool: centreProfile?.isEnviroschool ?? false,
  });
  // JD blurb generation deliberately uses llama3.1:8b instead of whatever
  // model the dashboard chat is configured for: it's not a "thinking" model,
  // so it skips the multi-minute hidden <think> reasoning that made qwen3
  // time out on this hardware for a multi-paragraph draft (measured ~13
  // tokens/sec, 39s+ for even a one-sentence reply). Still generous on
  // timeout since it's a background/explicit action, not interactive chat.
  const JD_BLURB_AI_MODEL = "llama3.1:8b";
  const JD_BLURB_AI_TIMEOUT_MS = 120000;
  const html = await runLocalChat(
    { ...aiConfig, AI_CHAT_MODEL: JD_BLURB_AI_MODEL, AI_TIMEOUT_MS: JD_BLURB_AI_TIMEOUT_MS },
    messages,
  );
  await saveBlurb(id, html);
  return html;
}

app.post<{ Params: { id: string } }>("/api/jd/:id/blurb/generate", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid job description id is required." };
  }
  try {
    const html = await generateJdBlurb(id);
    return { ok: true, html };
  } catch (error) {
    reply.code(error instanceof AiClientError ? error.statusCode : 500);
    return { error: error instanceof Error ? error.message : "Blurb generation failed." };
  }
});

app.post<{ Params: { id: string; blurbId: string } }>("/api/jd/:id/blurb/:blurbId/restore", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  const blurbId = parsePositiveInt(request.params.blurbId);
  if (id == null || blurbId == null) {
    reply.code(400);
    return { error: "Valid job description and blurb ids are required." };
  }
  try {
    await restoreBlurbVersion(id, blurbId);
    return { ok: true };
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : "Could not restore blurb version." };
  }
});

app.post<{ Params: { centreKey: string }; Body: Record<string, unknown> }>(
  "/api/jd/settings/centre/:centreKey",
  async (request, reply) => {
    const centreKey = parsePositiveInt(request.params.centreKey);
    if (centreKey == null) {
      reply.code(400);
      return { error: "Valid centre key is required." };
    }
    const body = request.body ?? {};
    await upsertCentreProfile(centreKey, {
      locationDisplay: typeof body.locationDisplay === "string" ? body.locationDisplay : "",
      introParagraph: typeof body.introParagraph === "string" ? body.introParagraph : "",
      seniorTeacherName: typeof body.seniorTeacherName === "string" ? body.seniorTeacherName : "",
      seniorTeacherAcronym: typeof body.seniorTeacherAcronym === "string" ? body.seniorTeacherAcronym : "",
      isEnviroschool: body.isEnviroschool === "on" || body.isEnviroschool === true,
    });
    return { ok: true };
  },
);

app.post<{ Body: { jobTitle?: string; qualificationsText?: string; isCentreSpecific?: unknown } }>(
  "/api/jd/settings/title",
  async (request, reply) => {
    const jobTitle = String(request.body?.jobTitle ?? "").trim();
    if (!jobTitle) {
      reply.code(400);
      return { error: "Job title is required." };
    }
    const existing = (await listTitleProfiles()).find((profile) => profile.jobTitle === jobTitle);
    if (!existing) {
      reply.code(404);
      return { error: "Unknown job title profile." };
    }
    const rawCentreSpecific = request.body?.isCentreSpecific;
    await upsertTitleProfile({
      ...existing,
      qualificationsText: request.body?.qualificationsText ?? existing.qualificationsText,
      // An unchecked checkbox is simply absent from the submitted form, so a
      // missing value means false rather than "leave unchanged".
      isCentreSpecific: rawCentreSpecific === "on" || rawCentreSpecific === true,
    });
    return { ok: true };
  },
);

app.post<{ Body: { lastReviewedByAcronym?: string } }>(
  "/api/jd/settings/global",
  async (request) => {
    await updateGlobalSettings({ lastReviewedByAcronym: request.body?.lastReviewedByAcronym ?? "" });
    return { ok: true };
  },
);

app.post<{ Body: { jobTitle?: string; jobCategory?: string; isCentreSpecific?: unknown } }>(
  "/api/jd/settings/title/create",
  async (request, reply) => {
    const jobTitle = String(request.body?.jobTitle ?? "").trim();
    const jobCategory = String(request.body?.jobCategory ?? "").trim();
    if (!jobTitle || !jobCategory) {
      reply.code(400);
      return { error: "Job title and job category are required." };
    }

    const profiles = await listTitleProfiles();
    if (profiles.some((profile) => profile.jobTitle.toLowerCase() === jobTitle.toLowerCase())) {
      reply.code(409);
      return { error: `"${jobTitle}" already exists.` };
    }

    const rawCentreSpecific = request.body?.isCentreSpecific;
    await upsertTitleProfile({
      jobTitle,
      jobCategory,
      // Append to the end of the existing ordering.
      sortOrder: profiles.reduce((max, profile) => Math.max(max, profile.sortOrder), 0) + 1,
      qualificationsText: "",
      roleSections: [],
      isCentreSpecific: rawCentreSpecific === "on" || rawCentreSpecific === true,
    });
    return { ok: true };
  },
);

app.post<{ Body: { id?: string; kind?: string; centreKey?: string; label?: string; contentHtml?: string } }>(
  "/api/jd/settings/knowledge-doc",
  async (request, reply) => {
    const kind = request.body?.kind === "generic" ? "generic" : "service";
    const label = String(request.body?.label ?? "").trim();
    if (!label) {
      reply.code(400);
      return { error: "Document label is required." };
    }
    await upsertKnowledgeDoc({
      kind,
      centreKey: kind === "service" ? parsePositiveInt(request.body?.centreKey) : null,
      label,
      contentHtml: request.body?.contentHtml ?? "",
    });
    return { ok: true };
  },
);

app.post("/api/jd/settings/ktca-import", async (request, reply) => {
  const upload = await request.file();
  if (!upload) {
    reply.code(400);
    return { error: "Choose a KTCA PDF to import." };
  }
  await upload.toBuffer();
  // Full AI-assisted rate extraction is not yet implemented; acknowledge the
  // upload so the settings panel can prompt for manual entry in the meantime.
  return {
    ok: true,
    message: "KTCA PDF received. Automatic rate extraction isn't available yet — update pay scales manually below.",
  };
});

// Both AI chats ground on the wiki. The retrieval picks the articles matching
// the prompt and appends them to whatever grounding the caller already had
// (e.g. a live Infocare read), so the two sources travel as one extra message.
async function withWikiGrounding(prompt: string, existingGrounding: string | null): Promise<string | null> {
  try {
    const wiki = await buildWikiChatGrounding(prompt);
    if (!wiki) return existingGrounding;
    return existingGrounding?.trim() ? [existingGrounding.trim(), "", wiki.text].join("\n") : wiki.text;
  } catch (error) {
    // The wiki is an enhancement: if the lookup fails the chat still answers.
    app.log.warn({ error }, "Wiki grounding unavailable");
    return existingGrounding;
  }
}

// --- Things To Know (marketing wiki) -----------------------------------------
// Same shape as the JD section: one page route that renders the shell, plus
// JSON POST mutations that the delegated client script reloads on.

app.get<{ Querystring: { panel?: string; article?: string; q?: string } }>(
  "/wiki",
  async (request, reply) => {
    // Warm the local AI in the background so tag generation is available
    // shortly after the page loads. Unawaited: the page must never block on it.
    void ensureAiRunning(aiConfig, app.log);

    const selectedArticleId = parsePositiveInt(request.query?.article);
    const search = String(request.query?.q ?? "").trim();
    // Selecting an article opens it for reading; editing is an explicit step.
    const focusPanelId =
      resolveWikiFocusPanelId(request.query?.panel) ?? (selectedArticleId != null ? "wiki-article" : null);

    const [articles, categories] = await Promise.all([
      listWikiArticles(search),
      listWikiCategoriesWithCounts(),
    ]);
    const selectedArticle = selectedArticleId != null ? await getWikiArticle(selectedArticleId) : null;
    const isEditing = focusPanelId === "wiki-editor";

    return reply.type("text/html; charset=utf-8").send(
      renderWikiAppShell({
        focusPanelId,
        list: { articles, search, categories },
        article: { article: isEditing ? null : selectedArticle },
        editor: {
          article: isEditing ? selectedArticle : null,
          categories: categories.map((category) => category.name),
        },
      }),
    );
  },
);

// Lets any AI-dependent page show a live "starting local AI" state instead of
// silently failing while Ollama warms up.
app.get("/api/ai/status", async () => {
  const ready = await isAiReady(aiConfig);
  return { ready, provider: aiConfig.AI_PROVIDER, model: aiConfig.AI_CHAT_MODEL };
});

// Reads an article, asks the local model for a category and tags, and writes
// them back. Used by the editor's Regenerate button and by the background pass
// that runs after an untagged article gains content.
async function runWikiTagging(id: number): Promise<{ category: string; tags: string[] } | null> {
  const article = await getWikiArticle(id);
  if (!article) return null;

  // The model may only file an article under a category that currently exists.
  const categories = await listWikiCategories();
  const raw = await runLocalChat(
    aiConfig,
    buildWikiTaggingChatMessages({
      title: article.title,
      bodyText: wikiHtmlToPlainText(article.contentHtml),
      categories,
    }),
  );
  const result = parseWikiTaggingResponse(raw, categories);
  await applyWikiTagging(id, result);
  return result;
}

// The background pass competes with anything else using the model (a chat
// turn, a bulk seed), and a busy Ollama makes runLocalChat time out. Retry with
// a backoff so a transient clash leaves the article tagged rather than silently
// untagged, and give up quietly once the user can still press Regenerate.
async function runWikiTaggingWithRetry(id: number): Promise<void> {
  const delaysMs = [0, 30_000, 120_000];

  for (const [attempt, waitMs] of delaysMs.entries()) {
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    try {
      const article = await getWikiArticle(id);
      // Deleted, or tagged in the meantime (e.g. the user pressed Regenerate).
      if (!article || article.tags.length > 0) return;

      await runWikiTagging(id);
      return;
    } catch (error) {
      app.log.warn(
        { error, articleId: id, attempt: attempt + 1 },
        "Background wiki tagging attempt failed",
      );
    }
  }

  app.log.warn({ articleId: id }, "Background wiki tagging gave up; use Regenerate tags");
}

app.post<{ Params: { id: string } }>("/api/wiki/:id/generate-tags", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid article id is required." };
  }

  await ensureAiRunning(aiConfig, app.log);

  try {
    const result = await runWikiTagging(id);
    if (!result) {
      reply.code(404);
      return { error: "That article no longer exists." };
    }
    return { ok: true, ...result };
  } catch (error) {
    const statusCode = error instanceof AiClientError ? error.statusCode : 502;
    reply.code(statusCode);
    return {
      error: error instanceof Error ? error.message : "Could not generate tags.",
    };
  }
});

app.post<{ Body: Record<string, unknown> }>("/api/wiki", async (request, reply) => {
  const title = String(request.body?.title ?? "").trim();
  if (!title) {
    reply.code(400);
    return { error: "An article title is required." };
  }
  const id = await createWikiArticle({ ...request.body, title });
  return reply.code(201).send({ ok: true, id });
});

app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/wiki/:id", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid article id is required." };
  }
  const before = await getWikiArticle(id);
  if (before == null) {
    reply.code(404);
    return { error: "That article no longer exists." };
  }
  await updateWikiArticle(id, request.body ?? {});

  // An article that has gained content but has never been tagged gets a
  // background pass, so the user never has to think about tagging. Unawaited so
  // the save returns immediately; the row polls for the result.
  const gainedContent = String(request.body?.contentHtml ?? "").trim().length > 0;
  if (before.tags.length === 0 && gainedContent) {
    void runWikiTaggingWithRetry(id);
  }

  return { ok: true };
});

app.post<{ Params: { id: string }; Body: { isPinned?: unknown } }>("/api/wiki/:id/pin", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid article id is required." };
  }
  await updateWikiArticle(id, { isPinned: request.body?.isPinned === true });
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/wiki/:id/duplicate", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid article id is required." };
  }
  const newId = await duplicateWikiArticle(id);
  if (newId == null) {
    reply.code(404);
    return { error: "That article no longer exists." };
  }
  return { ok: true, id: newId };
});

app.post<{ Params: { id: string } }>("/api/wiki/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid article id is required." };
  }
  await deleteWikiArticle(id);
  return { ok: true };
});

// Categories are global: renaming re-files every article under the old name,
// and deleting moves them to the default rather than destroying them.
app.post<{ Body: { name?: string } }>("/api/wiki/categories", async (request, reply) => {
  const result = await createWikiCategory(request.body?.name);
  if ("error" in result) {
    reply.code(400);
    return result;
  }
  return { ok: true, id: result.id };
});

app.post<{ Params: { id: string }; Body: { name?: string } }>(
  "/api/wiki/categories/:id",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid category id is required." };
    }
    const result = await renameWikiCategory(id, request.body?.name);
    if ("error" in result) {
      reply.code(400);
      return result;
    }
    return { ok: true };
  },
);

app.post<{ Params: { id: string } }>("/api/wiki/categories/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid category id is required." };
  }
  const result = await deleteWikiCategory(id);
  if ("error" in result) {
    reply.code(400);
    return result;
  }
  return { ok: true, moved: result.moved };
});

// All mutations are JSON POSTs (matching the existing notes/notifications
// convention). They reply with { ok: true } and the client reloads /tasks so the
// server re-renders the new state.

app.post<{ Body: { title?: string; dueDate?: string; estimatedMinutes?: string; projectId?: string; taskGroupId?: string; assigneeId?: string; centreKey?: string } }>(
  "/api/tasks",
  async (request, reply) => {
    const title = String(request.body?.title ?? "").trim();
    if (!title) {
      reply.code(400);
      return { error: "Task title is required." };
    }
    const id = await createTask({
      title,
      dueDate: request.body?.dueDate ?? null,
      estimatedMinutes: request.body?.estimatedMinutes != null ? Number(request.body.estimatedMinutes) : null,
      projectId: toNullableId(request.body?.projectId),
      taskGroupId: toNullableId(request.body?.taskGroupId),
      assigneeId: toNullableId(request.body?.assigneeId),
      centreKey: toNullableId(request.body?.centreKey),
    });
    return reply.code(201).send({ ok: true, id });
  },
);

app.post<{ Params: { id: string }; Body: { title?: string; description?: string; dueDate?: string; estimatedMinutes?: string; projectId?: string; taskGroupId?: string; assigneeId?: string; centreKey?: string } }>(
  "/api/tasks/:id",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid task id is required." };
    }
    const title = String(request.body?.title ?? "").trim();
    if (!title) {
      reply.code(400);
      return { error: "Task title is required." };
    }
    await updateTask(id, {
      title,
      description: request.body?.description ?? null,
      dueDate: request.body?.dueDate ?? null,
      estimatedMinutes: request.body?.estimatedMinutes != null ? Number(request.body.estimatedMinutes) : null,
      projectId: toNullableId(request.body?.projectId),
      taskGroupId: toNullableId(request.body?.taskGroupId),
      assigneeId: toNullableId(request.body?.assigneeId),
      centreKey: toNullableId(request.body?.centreKey),
    });
    return { ok: true };
  },
);

app.post<{ Params: { id: string }; Body: { status?: string } }>("/api/tasks/:id/status", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid task id is required." };
  }
  await setTaskStatus(id, String(request.body?.status ?? ""));
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/tasks/:id/timer/start", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid task id is required." };
  }
  await startTaskTimer(id);
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/tasks/:id/timer/stop", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid task id is required." };
  }
  await stopTaskTimer(id);
  return { ok: true };
});

app.post<{ Params: { id: string }; Body: { minutes?: string | number; note?: string } }>(
  "/api/tasks/:id/time",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid task id is required." };
    }
    const minutes = Number(request.body?.minutes ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      reply.code(400);
      return { error: "Logged minutes must be a positive number." };
    }
    await logTaskTime(id, minutes, request.body?.note ?? null);
    return { ok: true };
  },
);

app.post<{ Params: { id: string } }>("/api/tasks/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid task id is required." };
  }
  await deleteTask(id);
  return { ok: true };
});

// Remembers the task's email draft (subject/body) and the recipient used, so the
// compose editor pre-fills next time. The actual send is a client-side mailto:
// handoff to Outlook — this only persists state.
app.post<{ Params: { id: string }; Body: { to?: string; toName?: string; subject?: string; body?: string } }>(
  "/api/tasks/:id/email",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid task id is required." };
    }
    await saveTaskEmailDraft(id, {
      to: request.body?.to ?? null,
      toName: request.body?.toName ?? null,
      subject: request.body?.subject ?? null,
      body: request.body?.body ?? null,
    });
    return { ok: true };
  },
);

app.post<{ Params: { id: string } }>(
  "/api/tasks/:id/attachments",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid task id is required." };
    }
    const task = await getTask(id);
    if (!task) {
      reply.code(404);
      return { error: "Task not found." };
    }

    const upload = await request.file();
    if (!upload) {
      reply.code(400);
      return { error: "Choose a file to attach." };
    }

    const originalName = sanitizeAttachmentName(upload.filename);
    const extension = extname(originalName).slice(0, 32);
    const storedName = `${randomUUID()}${extension}`;
    const storagePath = join(TASK_ATTACHMENT_DIR, storedName);
    const absolutePath = attachmentPath(storagePath);
    const bytes = await upload.toBuffer();

    await mkdir(join(process.cwd(), TASK_ATTACHMENT_DIR), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" });

    try {
      const attachmentId = await createTaskAttachment(id, {
        originalName,
        storedName,
        storagePath,
        mimeType: upload.mimetype,
        sizeBytes: bytes.length,
      });
      return reply.code(201).send({ ok: true, id: attachmentId });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  },
);

app.get<{ Params: { id: string; attachmentId: string } }>(
  "/api/tasks/:id/attachments/:attachmentId/download",
  async (request, reply) => {
    const taskId = parsePositiveInt(request.params.id);
    const attachmentId = parsePositiveInt(request.params.attachmentId);
    if (taskId == null || attachmentId == null) {
      reply.code(400);
      return { error: "Valid task and attachment ids are required." };
    }
    const attachment = await getTaskAttachment(taskId, attachmentId);
    if (!attachment) {
      reply.code(404);
      return { error: "Attachment not found." };
    }

    const file = await readFile(attachmentPath(attachment.storagePath));
    return reply
      .type(attachment.mimeType || "application/octet-stream")
      .header("Content-Length", String(attachment.sizeBytes))
      .header("Content-Disposition", attachmentDownloadHeader(attachment.originalName))
      .send(file);
  },
);

app.post<{ Params: { id: string; attachmentId: string } }>(
  "/api/tasks/:id/attachments/:attachmentId/delete",
  async (request, reply) => {
    const taskId = parsePositiveInt(request.params.id);
    const attachmentId = parsePositiveInt(request.params.attachmentId);
    if (taskId == null || attachmentId == null) {
      reply.code(400);
      return { error: "Valid task and attachment ids are required." };
    }
    const attachment = await deleteTaskAttachment(taskId, attachmentId);
    if (attachment) {
      await unlink(attachmentPath(attachment.storagePath)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    return { ok: true };
  },
);

app.post<{ Params: { id: string }; Body: { projectId?: string; taskGroupId?: string } }>(
  "/api/tasks/:id/attach",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid task id is required." };
    }
    await attachTaskToProject(id, toNullableId(request.body?.projectId), toNullableId(request.body?.taskGroupId));
    return { ok: true };
  },
);

app.post<{ Params: { id: string }; Body: { label?: string } }>(
  "/api/tasks/:id/checklist",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    const label = String(request.body?.label ?? "").trim();
    if (id == null || !label) {
      reply.code(400);
      return { error: "Task id and checklist label are required." };
    }
    await addChecklistItem(id, label);
    return reply.code(201).send({ ok: true });
  },
);

app.post<{ Params: { id: string; itemId: string }; Body: { label?: string } }>(
  "/api/tasks/:id/checklist/:itemId",
  async (request, reply) => {
    const itemId = parsePositiveInt(request.params.itemId);
    const label = String(request.body?.label ?? "").trim();
    if (itemId == null || !label) {
      reply.code(400);
      return { error: "Valid checklist item id and label are required." };
    }
    await updateChecklistItem(itemId, label);
    return { ok: true };
  },
);

app.post<{ Params: { id: string; itemId: string } }>(
  "/api/tasks/:id/checklist/:itemId/toggle",
  async (request, reply) => {
    const itemId = parsePositiveInt(request.params.itemId);
    if (itemId == null) {
      reply.code(400);
      return { error: "Valid checklist item id is required." };
    }
    await toggleChecklistItem(itemId);
    return { ok: true };
  },
);

app.post<{ Params: { id: string; itemId: string } }>(
  "/api/tasks/:id/checklist/:itemId/delete",
  async (request, reply) => {
    const itemId = parsePositiveInt(request.params.itemId);
    if (itemId == null) {
      reply.code(400);
      return { error: "Valid checklist item id is required." };
    }
    await deleteChecklistItem(itemId);
    return { ok: true };
  },
);

app.post<{ Body: { id?: string; name?: string; description?: string; status?: string; startDate?: string; targetDate?: string; centreKey?: string } }>(
  "/api/projects",
  async (request, reply) => {
    const name = String(request.body?.name ?? "").trim();
    if (!name) {
      reply.code(400);
      return { error: "Project name is required." };
    }
    const input = {
      name,
      description: request.body?.description ?? null,
      status: request.body?.status,
      startDate: request.body?.startDate ?? null,
      targetDate: request.body?.targetDate ?? null,
      centreKey: toNullableId(request.body?.centreKey),
    };
    const existingId = parsePositiveInt(request.body?.id);
    if (existingId != null) {
      await updateProject(existingId, input);
      return { ok: true, id: existingId };
    }
    const id = await createProject(input);
    return reply.code(201).send({ ok: true, id });
  },
);

app.post<{ Params: { id: string }; Body: { name?: string } }>(
  "/api/projects/:id/groups",
  async (request, reply) => {
    const projectId = parsePositiveInt(request.params.id);
    const name = String(request.body?.name ?? "").trim();
    if (projectId == null || !name) {
      reply.code(400);
      return { error: "Project id and group name are required." };
    }
    const id = await createTaskGroup(projectId, name);
    return reply.code(201).send({ ok: true, id });
  },
);

app.post<{ Params: { id: string }; Body: { groupId?: string } }>(
  "/api/projects/:id/groups/delete",
  async (request, reply) => {
    const groupId = parsePositiveInt(request.body?.groupId);
    if (groupId == null) {
      reply.code(400);
      return { error: "Valid group id is required." };
    }
    await deleteTaskGroup(groupId);
    return { ok: true };
  },
);

app.post<{ Params: { id: string }; Body: { memberId?: string | number; projectRole?: string; remove?: boolean } }>(
  "/api/projects/:id/members",
  async (request, reply) => {
    const projectId = parsePositiveInt(request.params.id);
    const memberId = parsePositiveInt(request.body?.memberId);
    if (projectId == null || memberId == null) {
      reply.code(400);
      return { error: "Project id and member id are required." };
    }
    if (request.body?.remove === true) {
      await removeProjectMember(projectId, memberId);
    } else {
      await addProjectMember(projectId, memberId, request.body?.projectRole ?? null);
    }
    return { ok: true };
  },
);

app.post<{ Params: { id: string } }>("/api/projects/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid project id is required." };
  }
  await deleteProject(id);
  return { ok: true };
});

app.post<{ Body: { id?: string; name?: string; email?: string; role?: string; active?: boolean; toggleActive?: boolean } }>(
  "/api/members",
  async (request, reply) => {
    const existingId = parsePositiveInt(request.body?.id);

    // The active toggle reuses this endpoint with { id, active, toggleActive }.
    if (existingId != null && request.body?.toggleActive === true) {
      await setMemberActive(existingId, request.body?.active === true);
      return { ok: true, id: existingId };
    }

    const name = String(request.body?.name ?? "").trim();
    if (!name) {
      reply.code(400);
      return { error: "Member name is required." };
    }
    const input = {
      name,
      email: request.body?.email ?? null,
      role: request.body?.role ?? null,
      ...(request.body?.active === undefined ? {} : { active: request.body.active === true }),
    };
    if (existingId != null) {
      await updateMember(existingId, input);
      return { ok: true, id: existingId };
    }
    const id = await createMember(input);
    return reply.code(201).send({ ok: true, id });
  },
);

app.post<{ Params: { id: string }; Body: { active?: boolean; toggleActive?: boolean } }>(
  "/api/members/:id",
  async (request, reply) => {
    const id = parsePositiveInt(request.params.id);
    if (id == null) {
      reply.code(400);
      return { error: "Valid member id is required." };
    }
    if (request.body?.toggleActive === true) {
      await setMemberActive(id, request.body?.active === true);
      return { ok: true };
    }
    reply.code(400);
    return { error: "Unsupported member update." };
  },
);

app.post<{ Params: { id: string } }>("/api/members/:id/delete", async (request, reply) => {
  const id = parsePositiveInt(request.params.id);
  if (id == null) {
    reply.code(400);
    return { error: "Valid member id is required." };
  }
  await deleteMember(id);
  return { ok: true };
});

app.get<{ Querystring: { page?: string; window?: string; metaAdsFilter?: string; centreKey?: string; category?: string; recipient?: string } }>("/api/comms/postmark/messages", async (request, reply) => {
  try {
    const selectedWindowKey = resolveWindowKey(request.query?.window);
    const windowStartDate = resolveWindowStartDate(new Date(), selectedWindowKey);
    const metaAdsFilter = resolveCommsMetaAdsFilter(request.query?.metaAdsFilter);
    const rawCentreKey = Number(request.query?.centreKey);
    const centreKeyFilter = Number.isSafeInteger(rawCentreKey) && rawCentreKey > 0 ? rawCentreKey : null;
    const officeStaffFilter = request.query?.category === "office-staff";
    const recipientFilter = (request.query?.recipient ?? "").trim().slice(0, 320) || null;
    const metaAdvertCentreKeys = metaAdsFilter === "active-recent"
      ? getCurrentOrRecentMetaAdvertCentreKeys(await readMetaAdsDashboardData({ fromDate: windowStartDate, toDate: new Date() }))
      : null;
    const dashboardData = await readPostmarkDashboardData({
      messagePage: Number(request.query?.page ?? 1),
      fromDate: windowStartDate,
      centreKeys: centreKeyFilter != null ? [centreKeyFilter] : metaAdvertCentreKeys,
      category: officeStaffFilter ? "office-staff" : null,
      recipient: recipientFilter,
    });
    const filterLabel = recipientFilter
      ? recipientFilter
      : officeStaffFilter
        ? "Office staff"
        : centreKeyFilter != null
          ? dashboardData.recentMessages.find((message) => message.centreKey === centreKeyFilter)?.centreName
            ?? dashboardData.centreActivity.find((centre) => centre.centreKey === centreKeyFilter)?.centreName
            ?? "Selected centre"
          : null;

    return reply.send({
      html: renderPostmarkMessageList(dashboardData, filterLabel ? { label: filterLabel } : null),
      page: dashboardData.messagePage,
      total: dashboardData.relevantMessageCount,
    });
  } catch (error) {
    request.log.error({ error }, "Postmark messages read failed");
    return reply.code(503).send({ error: "Webmail message storage is currently unavailable." });
  }
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
  const buildRedirectParams = (extra?: Record<string, string>) => {
    const params = new URLSearchParams();

    if (request.query?.centre) {
      params.set("centre", request.query.centre);
    }

    params.set("window", resolveWindowKey(request.query?.window));
    params.set("panel", "google-analytics");

    const monthSelection = resolveGoogleAnalyticsMonthSelection(request.query);

    if (monthSelection.mode === "months") {
      params.set("gaRange", "months");
      params.set("gaFromMonth", String(monthSelection.fromMonth));
      params.set("gaFromYear", String(monthSelection.fromYear));
      params.set("gaToMonth", String(monthSelection.toMonth));
      params.set("gaToYear", String(monthSelection.toYear));
    }

    if (request.query?.sort) {
      params.set("sort", request.query.sort);
    }

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        params.set(key, value);
      }
    }

    return params;
  };

  let googleAnalyticsConfig;

  try {
    googleAnalyticsConfig = getGoogleAnalyticsConfig(env);
  } catch (error) {
    app.log.error({ error }, "Google Analytics refresh blocked by missing server configuration");
    reply.code(303);

    return reply.redirect(
      `/app?${buildRedirectParams({ integrationError: describeIntegrationError("google-analytics", error) }).toString()}`,
    );
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
    reply.code(303);

    return reply.redirect(
      `/app?${buildRedirectParams({ integrationError: describeIntegrationError("google-analytics", error) }).toString()}`,
    );
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

  return reply.redirect(`/app?${params.toString()}`);
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

app.post<{ Params: { id: string }; Body: { text?: string } }>("/api/meta-recommendation-notes/:id", async (request, reply) => {
  const id = Number.parseInt(request.params.id, 10);
  const text = String(request.body?.text ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    reply.code(400);

    return { error: "Valid note id is required." };
  }

  if (!text) {
    reply.code(400);

    return { error: "text is required." };
  }

  const note = await updateMetaRecommendationNote(id, text);

  return { note };
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

async function buildLocalCommsGrounding(prompt: string) {
  if (!isLocalCommunicationsPrompt(prompt)) {
    return null;
  }

  const centres = await readCentreReferences();
  const centreMatches = findMentionedCentres(prompt, centres);
  const centre = centreMatches.length === 1 ? centreMatches[0] : null;
  const postmark = await readPostmarkDashboardData({
    centreKeys: centre ? [centre.centreKey] : undefined,
  });

  return {
    postmark,
    grounding: buildLocalCommunicationsGrounding({
      prompt,
      postmark,
      centreName: centre?.name ?? null,
    }),
  };
}

app.post<{
  Body: {
    prompt?: string;
    messages?: AiChatHistoryMessageInput[];
  };
}>("/api/comms/ai/chat", async (request, reply) => {
  const prompt = String(request.body?.prompt ?? "").trim();

  if (!prompt) {
    reply.code(400);
    return { error: "Prompt is required." };
  }

  if (prompt.length > 2000) {
    reply.code(400);
    return { error: "Prompt is too long. Keep it under 2,000 characters." };
  }

  const localCommsGrounding = await buildLocalCommsGrounding(prompt);
  const postmarkData = localCommsGrounding?.postmark ?? await readPostmarkDashboardData();
  const context = buildCommsAiDashboardContext({
    postmark: postmarkData,
    mailchimp: await readMailchimpDashboardData({ serverPrefix: mailchimpConfigStatus.serverPrefix ?? undefined }),
    formstack: await readFormstackDashboardData(),
  });

  if (aiConfig.AI_PROVIDER === "builtin") {
    return { answer: buildBuiltinCommsAnswer(context, prompt), model: "built-in communications" };
  }

  try {
    const answer = await runLocalChat(
      aiConfig,
      buildCommsAiChatMessages(context, prompt, request.body?.messages, localCommsGrounding?.grounding),
    );
    return { answer, model: aiConfig.AI_CHAT_MODEL };
  } catch (error) {
    app.log.warn({ error }, "Communications AI model unavailable; using built-in summary fallback");
    return { answer: buildBuiltinCommsAnswer(context, prompt), model: "built-in communications fallback" };
  }
});

app.post<{
  Body: {
    prompt?: string;
    messages?: AiChatHistoryMessageInput[];
  };
}>("/api/comms/ai/chat/stream", async (request, reply) => {
  const prompt = String(request.body?.prompt ?? "").trim();

  if (!prompt || prompt.length > 2000) {
    reply.code(400);
    return { error: !prompt ? "Prompt is required." : "Prompt is too long. Keep it under 2,000 characters." };
  }

  const localCommsGrounding = await buildLocalCommsGrounding(prompt);
  const postmarkData = localCommsGrounding?.postmark ?? await readPostmarkDashboardData();
  const context = buildCommsAiDashboardContext({
    postmark: postmarkData,
    mailchimp: await readMailchimpDashboardData({ serverPrefix: mailchimpConfigStatus.serverPrefix ?? undefined }),
    formstack: await readFormstackDashboardData(),
  });

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const writeEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (aiConfig.AI_PROVIDER === "builtin") {
      writeEvent("chunk", { chunk: buildBuiltinCommsAnswer(context, prompt) });
    } else {
      for await (const chunk of streamLocalChat(
        aiConfig,
        buildCommsAiChatMessages(context, prompt, request.body?.messages, localCommsGrounding?.grounding),
      )) {
        writeEvent("chunk", { chunk });
      }
    }

    writeEvent("done", {});
  } catch (error) {
    app.log.warn({ error }, "Communications AI stream unavailable; using built-in summary fallback");
    writeEvent("chunk", { chunk: buildBuiltinCommsAnswer(context, prompt) });
    writeEvent("done", {});
  } finally {
    reply.raw.end();
  }
});

app.post<{
  Body: {
    prompt?: string;
    messages?: AiChatHistoryMessageInput[];
  };
}>("/api/tasks/ai/chat/stream", async (request, reply) => {
  const prompt = String(request.body?.prompt ?? "").trim();

  if (!prompt || prompt.length > 2000) {
    reply.code(400);
    return { error: !prompt ? "Prompt is required." : "Prompt is too long. Keep it under 2,000 characters." };
  }

  const [tasks, projects, members] = await Promise.all([
    listTasks(),
    listProjects(),
    listMembers(),
  ]);
  const context = buildTasksAiDashboardContext({ tasks, projects, members });

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const writeEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (aiConfig.AI_PROVIDER === "builtin") {
      writeEvent("chunk", { chunk: buildBuiltinTasksAnswer(context, prompt) });
    } else {
      for await (const chunk of streamLocalChat(aiConfig, buildTasksAiChatMessages(context, prompt, request.body?.messages))) {
        writeEvent("chunk", { chunk });
      }
    }

    writeEvent("done", {});
  } catch (error) {
    app.log.warn({ error }, "Tasks AI stream unavailable; using built-in summary fallback");
    writeEvent("chunk", { chunk: buildBuiltinTasksAnswer(context, prompt) });
    writeEvent("done", {});
  } finally {
    reply.raw.end();
  }
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

  const centreReferences = await readCentreReferences();
  const memory = buildHistoryChatMemory(request.body?.messages, centreReferences);
  const memorySelectedCentreKey = selectedCentreKey ?? memory.selectedCentreKey;
  let liveGrounding: string | null = null;

  if (isLiveInfocarePrompt(prompt)) {
    const livePlan = planLiveInfocareRequest(prompt, centreReferences, memorySelectedCentreKey);

    if (!livePlan.intent) {
      reply.code(400);

      return { error: livePlan.error ?? "I could not determine which live Infocare data to read." };
    }

    const liveResult = await runLiveInfocareRequest(livePlan.intent);
    liveGrounding = buildLiveInfocareGrounding(liveResult, prompt);
    const answer = formatLiveInfocareAnswer(liveResult, prompt);

    return {
      answer,
      model: "live Infocare read-only",
      context: {
        selectedCentre: livePlan.intent.kind === "centre_list" ? null : livePlan.intent.centre.name,
        selectedWindowKey,
        snapshotCreatedAt: null,
      },
    };
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
    memorySelectedCentreKey == null
      ? []
      : await readLatestMetaRecommendationNotesForCentre(memorySelectedCentreKey, 10);
  const context = buildAiDashboardContext({
    snapshotSet: latestSnapshotSet,
    selectedCentreKey: memorySelectedCentreKey,
    selectedWindowKey,
    metaAdsDashboardData,
    googleAnalyticsSnapshot,
    selectedCentreNotes,
  });

  const deterministicAnswer = buildDeterministicChatAnswer(context, prompt);

  if (!liveGrounding && deterministicAnswer && aiConfig.AI_PROVIDER === "builtin") {
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
      buildAiChatMessages(
        buildDashboardSystemPrompt(),
        context,
        prompt,
        request.body?.messages,
        memory,
        await withWikiGrounding(prompt, liveGrounding),
      ),
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
    if (!liveGrounding && deterministicAnswer) {
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

  const centreReferences = await readCentreReferences();
  const memory = buildHistoryChatMemory(request.body?.messages, centreReferences);
  const memorySelectedCentreKey = selectedCentreKey ?? memory.selectedCentreKey;
  let liveGrounding: string | null = null;

  if (isLiveInfocarePrompt(prompt)) {
    const livePlan = planLiveInfocareRequest(prompt, centreReferences, memorySelectedCentreKey);

    if (!livePlan.intent) {
      reply.code(400);

      return { error: livePlan.error ?? "I could not determine which live Infocare data to read." };
    }

    const liveResult = await runLiveInfocareRequest(livePlan.intent);
    liveGrounding = buildLiveInfocareGrounding(liveResult, prompt);
    const answer = formatLiveInfocareAnswer(liveResult, prompt);
    const selectedCentreName = livePlan.intent.kind === "centre_list" ? null : livePlan.intent.centre.name;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent("meta", {
      model: "live Infocare read-only",
      context: {
        selectedCentre: selectedCentreName,
        selectedCentreKey: livePlan.intent.kind === "centre_list" ? null : livePlan.intent.centre.centreKey,
        selectedWindowKey,
        snapshotCreatedAt: null,
      },
    });
    for (const chunk of answer.split(/(\s+)/).filter(Boolean)) {
      writeEvent("chunk", { chunk });
    }
    writeEvent("done", {});
    reply.raw.end();
    return;
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
    memorySelectedCentreKey == null
      ? []
      : await readLatestMetaRecommendationNotesForCentre(memorySelectedCentreKey, 10);
  const context = buildAiDashboardContext({
    snapshotSet: latestSnapshotSet,
    selectedCentreKey: memorySelectedCentreKey,
    selectedWindowKey,
    metaAdsDashboardData,
    googleAnalyticsSnapshot,
    selectedCentreNotes,
  });
  const messages = buildAiChatMessages(
    buildDashboardSystemPrompt(),
    context,
    prompt,
    request.body?.messages,
    memory,
    await withWikiGrounding(prompt, liveGrounding),
  );
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
    if (!liveGrounding && deterministicAnswer && aiConfig.AI_PROVIDER === "builtin") {
      writeAnswerChunks(deterministicAnswer);
      writeEvent("done", {});
      return;
    }

    for await (const chunk of streamLocalChat(aiConfig, messages)) {
      writeEvent("chunk", { chunk });
    }

    writeEvent("done", {});
  } catch (error) {
    if (!liveGrounding && deterministicAnswer) {
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
  const buildRedirectParams = (extra?: Record<string, string>) => {
    const params = new URLSearchParams();

    if (request.query?.centre) {
      params.set("centre", request.query.centre);
    }

    params.set("window", resolveWindowKey(request.query?.window));
    params.set("panel", "meta-ads");

    if (request.query?.sort) {
      params.set("sort", request.query.sort);
    }

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        params.set(key, value);
      }
    }

    return params;
  };

  let metaConfig;

  try {
    metaConfig = getMetaConfig(env);
  } catch (error) {
    app.log.error({ error }, "Meta Ads refresh blocked by missing server configuration");
    reply.code(303);

    return reply.redirect(
      `/app?${buildRedirectParams({ integrationError: describeIntegrationError("meta-ads", error) }).toString()}`,
    );
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
    reply.code(303);

    return reply.redirect(
      `/app?${buildRedirectParams({ integrationError: describeIntegrationError("meta-ads", error) }).toString()}`,
    );
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

  return reply.redirect(`/app?${params.toString()}`);
});

app.get<{ Querystring: { window?: string; metaAdsFilter?: string } }>("/actions/check-postmark", async (request, reply) => {
  const selectedWindowKey = resolveWindowKey(request.query?.window);
  const metaAdsFilter = resolveCommsMetaAdsFilter(request.query?.metaAdsFilter);
  const filterParam = metaAdsFilter === "active-recent" ? "&metaAdsFilter=active-recent" : "";

  try {
    const result = await readPostmarkWebhookCheck();
    const logPayload = {
      status: result.status,
      latestReceivedAt: result.latestReceivedAt,
      hoursSinceLatestReceived: result.hoursSinceLatestReceived,
      eventsLast24h: result.eventsLast24h,
      eventsLast48h: result.eventsLast48h,
    };

    if (result.status === "ok") {
      app.log.info(logPayload, "Postmark webhook check completed");
    } else {
      app.log.warn(logPayload, "Postmark webhook check found no recent events");
    }
  } catch (error) {
    app.log.error({ error }, "Postmark webhook check failed");
    reply.code(303);

    return reply.redirect(
      `/comms?panel=comms-postmark&window=${selectedWindowKey}${filterParam}&integrationSource=postmark&integrationError=${encodeURIComponent("Webmail webhook storage is currently unavailable.")}`,
    );
  }

  reply.code(303);

  return reply.redirect(`/comms?panel=comms-postmark&window=${selectedWindowKey}${filterParam}`);
});

app.get("/actions/refresh-mailchimp", async (request, reply) => {
  let mailchimpConfig;

  try {
    mailchimpConfig = getMailchimpConfig(env);
  } catch (error) {
    app.log.error({ error }, "Mailchimp refresh blocked by missing server configuration");
    reply.code(303);

    return reply.redirect(
      `/comms?panel=comms-mailchimp&integrationError=${encodeURIComponent(describeIntegrationError("mailchimp", error))}`,
    );
  }

  try {
    const result = await refreshMailchimpSnapshot(mailchimpConfig);

    app.log.info(result, "Mailchimp refresh completed");
  } catch (error) {
    app.log.error(
      {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Mailchimp refresh failed",
    );
    reply.code(303);

    return reply.redirect(
      `/comms?panel=comms-mailchimp&integrationError=${encodeURIComponent(describeIntegrationError("mailchimp", error))}`,
    );
  }

  reply.code(303);

  return reply.redirect(`/comms?panel=comms-mailchimp`);
});

app.get("/actions/refresh-formstack", async (request, reply) => {
  let formstackConfig;

  try {
    formstackConfig = getFormstackConfig(env);
  } catch (error) {
    app.log.error({ error }, "Formstack refresh blocked by missing server configuration");
    reply.code(303);

    return reply.redirect(
      `/comms?panel=comms-formstack&integrationSource=formstack&integrationError=${encodeURIComponent(describeIntegrationError("formstack", error))}`,
    );
  }

  try {
    const result = await refreshFormstackData(formstackConfig);
    app.log.info(result, "Formstack refresh completed");
  } catch (error) {
    app.log.error(
      { error: error instanceof Error ? { message: error.message, stack: error.stack } : error },
      "Formstack refresh failed",
    );
    reply.code(303);

    return reply.redirect(
      `/comms?panel=comms-formstack&integrationSource=formstack&integrationError=${encodeURIComponent(describeIntegrationError("formstack", error))}`,
    );
  }

  reply.code(303);

  return reply.redirect(`/comms?panel=comms-formstack`);
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
  const redirectTarget = `/app?${params.toString()}`;

  reply.code(303);

  return reply.redirect(redirectTarget);
});

app.get<{ Querystring: { centre?: string; window?: string; sort?: string } }>("/actions/refresh-snapshot", async (request, reply) => {
  const currentStatus = getSnapshotRefreshState().status;
  const centre = request.query?.centre;
  const params = new URLSearchParams();

  if (centre) {
    params.set("centre", centre);
  }

  params.set("window", "3M");
  const redirectTarget = `/app?${params.toString()}`;

  if (currentStatus === "in-progress") {
    reply.code(303);
    return reply.redirect(redirectTarget);
  }

  if (currentStatus === "ready") {
    markSnapshotRefreshAcknowledged();
    reply.code(303);
    return reply.redirect(redirectTarget);
  }

  try {
    const result = await refreshAnalyticsSnapshot({ source: "manual-refresh" });

    try {
      await refreshWaitlistReport();
    } catch (waitlistError) {
      app.log.error({ error: waitlistError }, "Manual waitlist refresh failed");
      recordSnapshotRefreshOutcome({
        centresAttempted: result.centresAttempted,
        centresProcessed: result.centresProcessed,
        centresFailed: result.centresFailed,
        failedCentres: result.failedCentres,
        errorMessage:
          waitlistError instanceof Error
            ? `Waitlist report did not refresh: ${waitlistError.message}`
            : "Waitlist report did not refresh.",
      });
      reply.code(303);
      return reply.redirect(redirectTarget);
    }

    recordSnapshotRefreshOutcome({
      centresAttempted: result.centresAttempted,
      centresProcessed: result.centresProcessed,
      centresFailed: result.centresFailed,
      failedCentres: result.failedCentres,
    });
  } catch (error) {
    app.log.error({ error }, "Manual snapshot refresh failed");
    recordSnapshotRefreshOutcome({
      centresAttempted: 0,
      centresProcessed: 0,
      centresFailed: 0,
      failedCentres: [],
      errorMessage:
        error instanceof Error
          ? error.message
          : "Snapshot refresh failed for an unknown reason.",
    });
  }

  reply.code(303);

  return reply.redirect(redirectTarget);
});

app.get("/actions/dismiss-snapshot-outcome", async (_request, reply) => {
  clearSnapshotRefreshOutcome();
  reply.code(303);
  return reply.redirect("/app");
});

app.get("/actions/snapshot-status", async (_request, reply) => {
  const snapshotState = getSnapshotRefreshState();

  return reply.type("application/json; charset=utf-8").send(snapshotState);
});

// Restarts the whole app: exits the process so the supervisor (the
// "Marketing Helper AI Server" scheduled task, or run-build-persistent) rebuilds
// and respawns a fresh server. The supervisor only restarts on a NON-ZERO exit
// code — a clean exit(0) would stop it — so we exit(1) after replying.
app.post("/actions/restart", async (_request, reply) => {
  reply
    .type("application/json; charset=utf-8")
    .send({ ok: true, restarting: true });

  // Let the response flush before tearing the process down.
  setTimeout(() => {
    app.log.warn("Restart requested from landing page — exiting for supervisor respawn");
    void app
      .close()
      .catch(() => undefined)
      .finally(() => {
        void prisma.$disconnect().catch(() => undefined);
        process.exit(1);
      });
  }, 250);

  return reply;
});

app.post("/actions/update-ai-model", async (_request, reply) => {
  try {
    const result = await updateRecommendedAiModel();

    return reply.type("application/json; charset=utf-8").send({ ok: true, ...result });
  } catch (error) {
    app.log.error({ error }, "AI model update request failed");
    reply.code(500);

    return reply.type("application/json; charset=utf-8").send({
      ok: false,
      error: error instanceof Error ? error.message : "AI model update failed.",
    });
  }
});

app.get("/actions/update-ai-model/status", async (_request, reply) => {
  return reply.type("application/json; charset=utf-8").send({ ok: true, ...aiModelUpdateStatus });
});

app.post("/actions/rollback-ai-model", async (_request, reply) => {
  try {
    const result = await rollbackAiModel();

    return reply.type("application/json; charset=utf-8").send({ ok: true, ...result });
  } catch (error) {
    app.log.error({ error }, "AI model rollback request failed");
    reply.code(400);

    return reply.type("application/json; charset=utf-8").send({
      ok: false,
      error: error instanceof Error ? error.message : "AI model rollback failed.",
    });
  }
});

app.post("/actions/delete-ai-rollback-model", async (_request, reply) => {
  try {
    const result = await deleteSecondaryFallbackModel();

    return reply.type("application/json; charset=utf-8").send({ ok: true, started: true, ...result });
  } catch (error) {
    app.log.error({ error }, "AI secondary fallback deletion request failed");
    reply.code(400);

    return reply.type("application/json; charset=utf-8").send({
      ok: false,
      error: error instanceof Error ? error.message : "AI secondary fallback deletion failed.",
    });
  }
});

app.get("/app.css", async (_request, reply) => {
  const css = await readFile(join(process.cwd(), "src", "ui", "app.css"), "utf8");

  return reply.type("text/css; charset=utf-8").send(css);
});

app.get("/favicon.ico", async (_request, reply) => {
  const icon = await readFile(join(process.cwd(), "assets", "images", "ico.png"));

  return reply.type("image/png").send(icon);
});

app.get("/assets/beepbeep-intro.mp4", async (_request, reply) => {
  const video = await readFile(join(process.cwd(), "assets", "images", "BeepBeep-intro.mp4"));

  return reply.type("video/mp4").send(video);
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

app.get("/vendor/marked.umd.js", async (_request, reply) => {
  const script = await readFile(
    join(process.cwd(), "node_modules", "marked", "lib", "marked.umd.js"),
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

app.post("/webhooks/postmark/events", async (request, reply) => {
  if (!verifyBasicAuth(request, env.POSTMARK_WEBHOOK_BASIC_AUTH)) {
    request.log.warn({ ip: request.ip }, "postmark webhook: auth failed");
    return reply.code(401).send({ ok: false });
  }

  // Cloudflare passes original client IP via cf-connecting-ip; Fastify's request.ip
  // falls back to the socket peer (which will be 127.0.0.1 from cloudflared).
  const sourceIp =
    (request.headers["cf-connecting-ip"] as string | undefined) ??
    (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    request.ip;

  if (!isPostmarkSourceIp(sourceIp)) {
    request.log.warn({ sourceIp }, "postmark webhook: source IP not in allowlist");
    return reply.code(403).send({ ok: false });
  }

  const serverToken = env.POSTMARK_SERVER_TOKEN || "unknown";

  try {
    const result = await ingestPostmarkEvent(request.body, serverToken);
    if (!result.stored) {
      request.log.warn({ reason: result.reason }, "postmark webhook: payload skipped");
    }
  } catch (error) {
    request.log.error({ error }, "postmark webhook: ingestion failed");
    return reply.code(503).send({ ok: false });
  }

  // Acknowledge only after the payload is captured; storage failures must be retried.
  return reply.code(200).send({ ok: true });
});

function logIntegrationConfigWarnings() {
  if (!metaConfigStatus.isConfigured) {
    app.log.warn(
      { missingKeys: metaConfigStatus.missingKeys },
      "Meta Ads is not fully configured — refresh will fail until these env vars are set",
    );
  }

  if (!googleAnalyticsConfigStatus.isConfigured) {
    app.log.warn(
      {
        missingKeys: googleAnalyticsConfigStatus.missingKeys,
        oauthPath: googleAnalyticsConfigStatus.oauthPath,
        oauthFileExists: googleAnalyticsConfigStatus.oauthFileExists,
        tokenPath: googleAnalyticsConfigStatus.tokenPath,
        tokenFileExists: googleAnalyticsConfigStatus.tokenFileExists,
      },
      "Google Analytics is not fully configured — refresh will fail until these env vars / credential files are set",
    );
  }

  if (!mailchimpConfigStatus.isConfigured) {
    app.log.warn(
      { missingKeys: mailchimpConfigStatus.missingKeys },
      "Mailchimp is not fully configured — daily snapshot will be skipped until these env vars are set",
    );
  }
}

const CLOUDFLARE_SYNC_INTERVAL_MS = 60 * 60 * 1000;

// Pulls Postmark webhook events the Cloudflare Worker buffered (including while
// this app was offline) and ingests anything new into the local DB. Runs once
// at startup and then hourly. Errors are logged, not thrown — a failed pull just
// retries next hour, and the persisted cursor means no events are missed.
async function syncCloudflarePostmarkEvents() {
  const config = readCloudflareSyncConfig(process.env, env.POSTMARK_SERVER_TOKEN || "unknown");

  if (!config) {
    return;
  }

  try {
    const result = await syncPostmarkEventsFromCloudflare(config);

    if (result.eventsFetched > 0) {
      app.log.info(
        {
          eventsFetched: result.eventsFetched,
          eventsStored: result.eventsStored,
          lastSeenId: result.lastSeenId.toString(),
        },
        "Cloudflare Postmark sync completed",
      );
    }
  } catch (error) {
    app.log.error({ error }, "Cloudflare Postmark sync failed");
  }
}

function startCloudflarePostmarkSyncLoop() {
  if (!readCloudflareSyncConfig(process.env, env.POSTMARK_SERVER_TOKEN || "unknown")) {
    app.log.warn(
      "Cloudflare Postmark sync is not configured — set CLOUDFLARE_SYNC_URL and CLOUDFLARE_SYNC_TOKEN to pull buffered webhook events",
    );

    return;
  }

  void syncCloudflarePostmarkEvents();
  const timer = setInterval(() => {
    void syncCloudflarePostmarkEvents();
  }, CLOUDFLARE_SYNC_INTERVAL_MS);
  // Don't keep the process alive solely for this timer.
  timer.unref();
}

async function checkPostmarkWebhookOnStartup() {
  try {
    const result = await readPostmarkWebhookCheck();
    const logPayload = {
      status: result.status,
      latestReceivedAt: result.latestReceivedAt,
      hoursSinceLatestReceived: result.hoursSinceLatestReceived,
      eventsLast24h: result.eventsLast24h,
      eventsLast48h: result.eventsLast48h,
    };

    if (result.status === "ok") {
      app.log.info(logPayload, "Postmark webhook startup check completed");
    } else {
      app.log.warn(logPayload, "Postmark webhook startup check found no recent events");
    }
  } catch (error) {
    app.log.error({ error }, "Postmark webhook startup check failed");
  }
}

// Logs the currently-effective KTCA pay-scale window on every server start,
// and warns when the imported agreement is expired or within 90 days of
// expiry (mirrored on the landing page reminders strip).
async function logJdAgreementStatusOnStartup() {
  try {
    const status = await getAgreementStatus();
    if (!status.latest) {
      app.log.warn("No KTCA agreement imported yet — Job Description pay scales are unseeded.");
      return;
    }
    const logPayload = {
      agreement: status.latest.name,
      effectiveFrom: status.latest.effectiveFrom,
      expiresOn: status.latest.expiresOn,
      daysUntilExpiry: status.daysUntilExpiry,
    };
    if (status.expired) {
      app.log.warn(logPayload, "KTCA agreement has expired — import an updated agreement.");
    } else if (status.expiringSoon) {
      app.log.warn(logPayload, "KTCA agreement expires within 90 days.");
    } else {
      app.log.info(logPayload, "KTCA agreement startup check completed");
    }
  } catch (error) {
    app.log.error({ error }, "KTCA agreement startup check failed");
  }
}

async function start() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;

  if (env.AUTO_WEEKLY_SNAPSHOT) {
    await ensureWeeklyAnalyticsSnapshot();
  }
  await ensureWeeklyWaitlistReport();

  await app.listen({
    host: "127.0.0.1",
    port: env.PORT,
  });

  logIntegrationConfigWarnings();
  void checkPostmarkWebhookOnStartup();
  startCloudflarePostmarkSyncLoop();
  void startLandingIntelligenceFeedLoop(aiConfig, app.log);
  void logJdAgreementStatusOnStartup();

  if (mailchimpConfigStatus.isConfigured) {
    void ensureMailchimpSnapshotIfConfigured();
  }
}

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
