import type { AiChatMessage } from "./client.js";
import type { AiDashboardContext } from "./context.js";

export type AiChatHistoryMessageInput = {
  role?: unknown;
  content?: unknown;
};

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_CHARS = 2000;
const MAX_PRIORITY_CENTRES = 8;

function compactCentre(centre: AiDashboardContext["selectedCentre"]) {
  if (!centre) {
    return null;
  }

  return {
    centreKey: centre.centreKey,
    serviceName: centre.serviceName,
    urgencyBand: centre.urgencyBand,
    urgencyScore: centre.urgencyScore,
    enrolled: centre.enrolled,
    licensedCapacity: centre.licensedCapacity,
    bookedUtilisationPercent: centre.bookedUtilisationPercent,
    estimatedOpenPlaces: centre.estimatedOpenPlaces,
    waitlist: centre.waitlist
      ? {
          actionable: centre.waitlist.actionable,
          total: centre.waitlist.total,
          under2: centre.waitlist.under2,
          oldestEntryDays: centre.waitlist.oldestEntryDays,
          averageEntryDays: centre.waitlist.averageEntryDays,
        }
      : undefined,
    selectedWindow: centre.selectedWindow,
    metaAds: centre.metaAds,
    campaignGuidance: centre.campaignGuidance,
  };
}

function buildGroundingContext(context: AiDashboardContext) {
  return {
    generatedAt: context.generatedAt,
    selectedWindowKey: context.selectedWindowKey,
    snapshot: context.snapshot,
    selectedCentre: compactCentre(context.selectedCentre),
    selectedCentreNotes: context.selectedCentreNotes,
    priorityCentres: context.priorityCentres.slice(0, MAX_PRIORITY_CENTRES).map(compactCentre),
    metaAds: context.metaAds
      ? {
          latestPullAt: context.metaAds.latestPullAt,
          campaignCount: context.metaAds.campaignCount,
          activeCampaignCount: context.metaAds.activeCampaignCount,
          activeAdCount: context.metaAds.activeAdCount,
          totalSpend30d: context.metaAds.totalSpend30d,
          currentAds: context.metaAds.currentAds.slice(0, 8),
        }
      : null,
    googleAnalytics: context.googleAnalytics
      ? {
          rangeStartDate: context.googleAnalytics.rangeStartDate,
          rangeEndDate: context.googleAnalytics.rangeEndDate,
          activeUsers: context.googleAnalytics.activeUsers,
          sessions: context.googleAnalytics.sessions,
          screenPageViews: context.googleAnalytics.screenPageViews,
          topPages: context.googleAnalytics.topPages.slice(0, 8),
        }
      : null,
  };
}

function normalizeContent(content: unknown) {
  return String(content ?? "").trim().slice(0, MAX_HISTORY_MESSAGE_CHARS);
}

export function sanitizeChatHistory(history: AiChatHistoryMessageInput[] | undefined) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: normalizeContent(message.content),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

export function buildAiChatMessages(
  systemPrompt: string,
  context: AiDashboardContext,
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
): AiChatMessage[] {
  const sanitizedHistory = sanitizeChatHistory(history);
  const groundingContext = buildGroundingContext(context);
  const campaignTimingGuardrail = buildCampaignTimingGuardrail(context, prompt);

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        "Current dashboard context JSON:",
        JSON.stringify(groundingContext),
        "",
        "Use this compact JSON as the source of truth for centre metrics. It contains the selected centre and the ranked priority centres.",
        "For selected-centre questions or vague follow-up questions, use selectedCentre and always name selectedCentre.serviceName.",
        "Only use priorityCentres[0] when the user explicitly asks for the highest-priority centre, priority ranking, or all-centres view. Always name the centre from serviceName.",
        "For advert timing questions, use selectedCentre.campaignGuidance.timing and selectedCentre.campaignGuidance.reason before giving advice.",
        "If selectedCentre.campaignGuidance.timing is start_now, say to begin campaign work now and explain that estimated open places are not covered by actionable waitlist.",
        "Treat completed or ended campaigns as historical context only. They do not count as active coverage for timing decisions.",
        "Waitlist entries are existing leads; ads generate new enquiries.",
        "Use selectedCentreNotes as user-entered centre context. Consider notes marked isLastMonth important, and weigh notes from newest to oldest by occurredAt.",
        "When a last-month note changes the operational advice, surface that note in plain language before older or lower-priority evidence.",
        campaignTimingGuardrail ? ["", campaignTimingGuardrail].join("\n") : "",
        "Previous chat turns may clarify the user's intent, but they do not override the current JSON.",
        "Answer only from named fields in this JSON. If a specific detail is absent, say it is not available in the dashboard context.",
      ].filter(Boolean).join("\n"),
    },
    ...sanitizedHistory,
    {
      role: "user",
      content: prompt,
    },
  ];
}

function isCampaignTimingPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();

  return (
    /\b(when|start|begin|launch|run|timing)\b/.test(normalized) &&
    /\b(ad|ads|advert|advertising|campaign|meta)\b/.test(normalized)
  );
}

function formatActiveAds(count: number) {
  return count === 0 ? "no active ads" : `${count} active ad${count === 1 ? "" : "s"}`;
}

function formatShortCentreName(serviceName: string) {
  return serviceName.replace(/\s+Kindergarten$/i, "").trim() || serviceName;
}

function formatWaitlistTimingSentence(centre: NonNullable<AiDashboardContext["selectedCentre"]>) {
  const nonActionable = Math.max(centre.waitlist.total - centre.waitlist.actionable, 0);

  if (centre.waitlist.total === 0) {
    return "There is no waitlist cover changing the campaign timing.";
  }

  if (centre.waitlist.total === 1 && (centre.waitlist.oldestEntryDays ?? 0) >= 163) {
    return "The single long-running waitlist entry does not change the campaign timing.";
  }

  if (nonActionable > 0) {
    return `The ${nonActionable} non-actionable waitlist entr${nonActionable === 1 ? "y" : "ies"} do not change the campaign timing.`;
  }

  return "The actionable waitlist is already reflected in the campaign timing.";
}

function formatCampaignNextStep(centre: NonNullable<AiDashboardContext["selectedCentre"]>) {
  if (centre.metaAds.activeCampaignCount > 0) {
    return "Check current ad delivery, creative fit, and centre availability before adding spend or launching another campaign.";
  }

  return "Use ads to generate new enquiries, then confirm local wording and age/session availability with the centre before publishing.";
}

export function buildCampaignTimingGuardrail(context: AiDashboardContext, prompt: string) {
  const centre = context.selectedCentre;

  if (!centre || !isCampaignTimingPrompt(prompt)) {
    return null;
  }

  const deterministicAnswer = buildDeterministicChatAnswer(context, prompt);

  if (!deterministicAnswer) {
    return null;
  }

  return [
    "Campaign timing guardrail:",
    `- The final answer must preserve this recommendation: ${deterministicAnswer}`,
    "- Do not expose internal field names, variable names, JSON, schema labels, or code settings.",
    "- Do not use rhetorical setup such as 'to determine', 'let's look', or 'based on the data'.",
    "- Do not say 'captured demand', 'campaign audience', 'outside the existing waitlist', or start a sentence with 'Treat'.",
    "- Write the answer directly and succinctly. Do not add facts that are absent from the dashboard context.",
  ].join("\n");
}

export function buildDeterministicChatAnswer(context: AiDashboardContext, prompt: string) {
  const centre = context.selectedCentre;

  if (!centre || !isCampaignTimingPrompt(prompt)) {
    return null;
  }

  const guidance = centre.campaignGuidance;
  const action =
    guidance.timing === "start_now"
      ? "Begin campaign work now"
      : guidance.timing === "prepare_now"
        ? "Prepare campaign direction now and confirm availability before launch"
        : guidance.timing === "review_active_campaign"
          ? "Review current Meta delivery before adding spend or launching another campaign"
          : guidance.timing === "review_or_reduce"
            ? "Review whether the current campaign should continue"
            : "Do not start a campaign yet";
  const shortName = formatShortCentreName(centre.serviceName);

  return [
    `${action} for ${centre.serviceName}.`,
    `${shortName} has ${centre.estimatedOpenPlaces} estimated open places, ${centre.selectedWindow.replacementPressure} replacement-pressure children, ${formatActiveAds(centre.metaAds.activeCampaignCount)}, and ${centre.waitlist.actionable}/${centre.waitlist.total} actionable waitlist cover.`,
    `${formatWaitlistTimingSentence(centre)} ${formatCampaignNextStep(centre)}`,
  ].join(" ");
}
