import type { AiChatMessage } from "./client.js";
import type { AiDashboardContext } from "./context.js";

type BuiltinCentre = NonNullable<AiDashboardContext["selectedCentre"]>;

function extractDashboardContext(messages: AiChatMessage[]) {
  const contextMessage = messages.find((message) => message.content.includes("Current dashboard context JSON:"));

  if (!contextMessage) {
    return null;
  }

  const jsonStart = contextMessage.content.indexOf("{");
  const jsonEnd = contextMessage.content.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    return JSON.parse(contextMessage.content.slice(jsonStart, jsonEnd + 1)) as AiDashboardContext;
  } catch {
    return null;
  }
}

function getLatestPrompt(messages: AiChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
}

function formatMoney(value: number | null | undefined) {
  return `$${Math.round(value ?? 0).toLocaleString("en-NZ")}`;
}

function formatCentreLine(centre: BuiltinCentre) {
  const gap = Math.max(centre.selectedWindow.replacementPressure - centre.waitlist.actionable, 0);

  return `${centre.serviceName}: ${centre.estimatedOpenPlaces} estimated open places, ${centre.waitlist.actionable}/${centre.waitlist.total} actionable waitlist, ${centre.selectedWindow.replacementPressure} replacement pressure, ${gap} uncovered pressure, ${centre.metaAds.activeCampaignCount} active campaigns.`;
}

function getFallbackCampaignGuidance(centre: BuiltinCentre) {
  return (
    centre.campaignGuidance ?? {
      timing:
        centre.estimatedOpenPlaces > centre.waitlist.actionable && centre.metaAds.activeCampaignCount === 0
          ? "start_now"
          : "monitor",
      reason:
        centre.estimatedOpenPlaces > centre.waitlist.actionable
          ? "Estimated open places are not covered by actionable waitlist. Begin campaign work now to generate new enquiries."
          : "Actionable waitlist appears to cover the current open-place signal.",
      uncoveredOpenPlaces: Math.max(centre.estimatedOpenPlaces - centre.waitlist.actionable, 0),
      uncoveredReplacementPressure: Math.max(centre.selectedWindow.replacementPressure - centre.waitlist.actionable, 0),
      nonActionableWaitlist: Math.max(centre.waitlist.total - centre.waitlist.actionable, 0),
    }
  );
}

function buildPriorityAnswer(context: AiDashboardContext) {
  const rows = context.priorityCentres.slice(0, 5);

  if (rows.length === 0) {
    return "I do not have enough centre snapshot data to rank marketing attention yet.";
  }

  return [
    "I would prioritise these centres first:",
    ...rows.map((centre, index) => `${index + 1}. ${formatCentreLine(centre)}`),
    "",
    "I am weighting uncovered replacement pressure, estimated open places, and current ad coverage. Treat open places as a planning signal, not confirmed availability.",
  ].join("\n");
}

function buildSelectedCentreAnswer(context: AiDashboardContext) {
  const centre = context.selectedCentre;

  if (!centre) {
    return "I need a selected centre before I can explain centre-specific demand.";
  }

  const gap = Math.max(centre.selectedWindow.replacementPressure - centre.waitlist.actionable, 0);

  return [
    `${centre.serviceName} is currently ${centre.urgencyBand.toLowerCase()} with an urgency score of ${centre.urgencyScore}.`,
    `Key signals: ${centre.estimatedOpenPlaces} estimated open places, ${centre.bookedUtilisationPercent}% booked utilisation, ${centre.waitlist.actionable}/${centre.waitlist.total} actionable waitlist, and ${centre.selectedWindow.replacementPressure} replacement-pressure children in the selected window.`,
    `The practical gap is ${gap}: replacement pressure minus actionable waitlist. Meta shows ${centre.metaAds.activeCampaignCount} active campaigns and ${formatMoney(centre.metaAds.spend30d)} spend over the comparison period.`,
  ].join("\n");
}

function buildAdsAnswer(context: AiDashboardContext) {
  const centre = context.selectedCentre;

  if (!centre) {
    return buildPriorityAnswer(context);
  }

  const hasDemandSignal = centre.estimatedOpenPlaces > 0 || centre.selectedWindow.replacementPressure > centre.waitlist.actionable;
  const hasAds = centre.metaAds.activeCampaignCount > 0;
  const guidance = getFallbackCampaignGuidance(centre);

  if (hasDemandSignal && !hasAds) {
    return `${centre.serviceName} has demand signals but no active campaigns. Campaign timing: ${guidance.timing}. ${guidance.reason} Key signals are ${centre.estimatedOpenPlaces} estimated open places, ${centre.waitlist.actionable}/${centre.waitlist.total} actionable waitlist, and ${centre.selectedWindow.replacementPressure} replacement pressure.`;
  }

  if (!hasDemandSignal && hasAds) {
    return `${centre.serviceName} has active campaigns, but the current centre data does not show strong open-place or uncovered-pressure need. I would review whether spend should continue before adding more creative.`;
  }

  if (hasDemandSignal && hasAds) {
    return `${centre.serviceName} has both demand signals and active Meta coverage. I would review creative, landing-page match, and recent notes rather than simply adding another campaign.`;
  }

  return `${centre.serviceName} does not show a strong advertising trigger from the current dashboard context. I would monitor it and focus attention on higher-priority centres.`;
}

function buildNextActionAnswer(context: AiDashboardContext) {
  const centre = context.selectedCentre;

  if (!centre) {
    return buildPriorityAnswer(context);
  }

  const needsAds = centre.estimatedOpenPlaces > 0 && centre.metaAds.activeCampaignCount === 0;
  const needsWaitlistCheck = centre.waitlist.total > 1 && centre.waitlist.actionable === 0;
  const guidance = getFallbackCampaignGuidance(centre);

  if (needsAds) {
    return `Next action for ${centre.serviceName}: ${guidance.timing === "start_now" ? "begin campaign preparation now" : "prepare a short Meta advert direction"}, then email the centre for confirmation before launch. Mention the ${centre.estimatedOpenPlaces} estimated open places and ${centre.waitlist.actionable}/${centre.waitlist.total} actionable waitlist; ads should generate new enquiries.`;
  }

  if (needsWaitlistCheck) {
    return `Next action for ${centre.serviceName}: check waitlist quality before increasing advertising. The raw waitlist is ${centre.waitlist.total}, but actionable waitlist is currently ${centre.waitlist.actionable}.`;
  }

  return `Next action for ${centre.serviceName}: review the current Meta coverage and latest centre notes against the ${context.selectedWindowKey} demand window before changing spend.`;
}

function buildDraftAnswer(context: AiDashboardContext) {
  const centre = context.selectedCentre;

  if (!centre) {
    return "I need a selected centre before drafting centre-specific advert or email direction.";
  }

  return [
    `Draft direction for ${centre.serviceName}:`,
    `Focus on welcoming new tamariki and inviting families to enquire, with the internal rationale that the centre has ${centre.estimatedOpenPlaces} estimated open places and ${centre.selectedWindow.replacementPressure} replacement-pressure children in the selected window.`,
    "Suggested short copy: Families looking for a warm local kindergarten are welcome to get in touch. Ask about enrolment options and upcoming availability.",
    "Internal note: do not promise a place; ask the centre to confirm wording before publishing.",
  ].join("\n");
}

export function runBuiltinChat(messages: AiChatMessage[]) {
  const context = extractDashboardContext(messages);

  if (!context) {
    return "I could not read the dashboard context for this question.";
  }

  const prompt = getLatestPrompt(messages);

  if (/draft|copy|email|message|direction/.test(prompt)) {
    return buildDraftAnswer(context);
  }

  if (/ad|ads|advert|campaign|spend|meta/.test(prompt)) {
    return buildAdsAnswer(context);
  }

  if (/next|follow|action|todo|to do/.test(prompt)) {
    return buildNextActionAnswer(context);
  }

  if (/\b(which|what).*\b(centre|centres)|attention|prioriti[sz]e|priority/.test(prompt)) {
    return buildPriorityAnswer(context);
  }

  if (/why|rank|explain|summary|summari[sz]e/.test(prompt)) {
    return buildSelectedCentreAnswer(context);
  }

  if (/help|can you|what do you do|how do you work/.test(prompt)) {
    return [
      "I can answer questions from the current dashboard data: centre demand, waitlist quality, selected-window leaving pressure, open-place signals, Meta Ads coverage, Google Analytics traffic, and practical next actions.",
      "I cannot yet send email, edit files, or update Microsoft 365. I can draft suggested wording or recommend an action for you to approve separately.",
    ].join("\n");
  }

  return [
    buildSelectedCentreAnswer(context),
    "",
    "Ask about priority centres, ad coverage, waitlist quality, next actions, or draft wording if you want a more targeted answer.",
  ].join("\n");
}
