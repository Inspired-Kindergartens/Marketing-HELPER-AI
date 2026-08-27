import type { AiChatMessage } from "./client.js";
import { sanitizeChatHistory, type AiChatHistoryMessageInput } from "./chat.js";
import type { FormstackDashboardData } from "../storage/formstack-store.js";
import type { MailchimpDashboardData } from "../storage/mailchimp-store.js";
import type { PostmarkDashboardData, PostmarkMessageView } from "../storage/postmark-store.js";

export type CommsAiContextInput = {
  mailchimp: MailchimpDashboardData | null;
  formstack: FormstackDashboardData | null;
  postmark?: PostmarkDashboardData | null;
};

export function buildCommsAiDashboardContext(input: CommsAiContextInput) {
  const campaigns = input.mailchimp?.campaigns ?? [];
  const forms = input.formstack?.forms ?? [];
  const submissions = input.formstack?.latestSubmissions ?? [];
  const sent = campaigns.reduce((total, campaign) => total + campaign.emailsSent, 0);
  const uniqueOpens = campaigns.reduce((total, campaign) => total + (campaign.report?.uniqueOpens ?? 0), 0);
  const uniqueClicks = campaigns.reduce((total, campaign) => total + (campaign.report?.uniqueClicks ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    postmark: {
      latestReceivedAt: input.postmark?.latestReceivedAt ?? null,
      delivered: input.postmark?.delivered ?? 0,
      opened: input.postmark?.opened ?? 0,
      clicked: input.postmark?.clicked ?? 0,
      bounced: input.postmark?.bounced ?? 0,
      recentMessages: (input.postmark?.recentMessages ?? []).slice(0, 20),
    },
    mailchimp: {
      latestPulledAt: input.mailchimp?.latestPulledAt ?? null,
      campaignCount: campaigns.length,
      sent,
      uniqueOpens,
      uniqueClicks,
      openRate: sent > 0 ? uniqueOpens / sent : 0,
      clickRate: sent > 0 ? uniqueClicks / sent : 0,
      recentCampaigns: campaigns.slice(0, 20).map((campaign) => ({
        subject: campaign.subject,
        sendTime: campaign.sendTime,
        emailsSent: campaign.emailsSent,
        openRate: campaign.report?.openRate ?? null,
        clickRate: campaign.report?.clickRate ?? null,
      })),
    },
    formstack: {
      latestPulledAt: input.formstack?.latestPulledAt ?? null,
      formCount: forms.length,
      storedSubmissionCount: input.formstack?.totalStoredSubmissions ?? 0,
      matchedFormCount: forms.filter((form) => form.centreKey != null).length,
      forms: forms.slice(0, 30).map((form) => ({
        name: form.name,
        centreName: form.centreName,
        submissionCount: form.submissionCount,
        lastSubmissionAt: form.lastSubmissionAt,
      })),
      latestSubmissions: submissions.slice(0, 20).map((submission) => ({
        formName: submission.formName,
        centreName: submission.centreName,
        submittedAt: submission.submittedAt,
      })),
    },
  };
}

export type CommsAiDashboardContext = ReturnType<typeof buildCommsAiDashboardContext>;

export function buildCommsSystemPrompt() {
  return [
    "You are Beep Beep, the assistant inside the Online Communications dashboard.",
    "Answer only from the supplied Postmark, Mailchimp and Formstack dashboard context.",
    "If local communications grounding says the app has already queried stored webhook/database records, treat that grounding as available evidence and do not respond with a generic email-system access refusal.",
    "Do not imply individual conversion attribution between email activity and form submissions.",
    "Postmark values are webhook events received by this application, not a full historical mailbox export.",
    "Panui Mailchimp campaigns are organisation-wide staff newsletters and are not attributable to individual centres.",
    "If a requested metric is missing, say it is unavailable in the imported data.",
    "Keep answers concise and name the campaign, form, or centre metrics supporting the answer.",
  ].join("\n");
}

export function buildCommsAiChatMessages(
  context: CommsAiDashboardContext,
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
  extraGrounding?: string | null,
): AiChatMessage[] {
  const messages: AiChatMessage[] = [
    { role: "system", content: buildCommsSystemPrompt() },
    {
      role: "user",
      content: `Current Communications dashboard context JSON:\n${JSON.stringify(context)}\nUse only this context as evidence.`,
    },
  ];

  if (extraGrounding?.trim()) {
    messages.push({
      role: "user",
      content: extraGrounding.trim(),
    });
  }

  messages.push(...sanitizeChatHistory(history), { role: "user", content: prompt });

  return messages;
}

export function isLocalCommunicationsPrompt(prompt: string) {
  return /\b(email|emails|e-mail|webmail|postmark|webhook|message|messages|sent|delivered|opened|bounced|traffic|communication|communications)\b/i.test(prompt);
}

function compactPostmarkMessage(message: PostmarkMessageView) {
  return {
    messageId: message.messageId,
    recipient: message.recipient,
    tag: message.tag,
    centreKey: message.centreKey,
    centreName: message.centreName,
    category: message.category,
    latestOccurredAt: message.latestOccurredAt,
    delivered: message.delivered,
    opened: message.opened,
    clicked: message.clicked,
    bounced: message.bounced,
  };
}

export function buildLocalCommunicationsGrounding(input: {
  prompt: string;
  postmark: PostmarkDashboardData;
  centreName?: string | null;
}) {
  return [
    "Local communications database grounding:",
    "The app has already queried stored Postmark webhook/export records from the local database for this question. Do not say you cannot access email systems.",
    "Use this evidence to answer the user's exact request. If the user asks whether there are recent emails to a centre, answer directly with the count and newest matching activity.",
    "Postmark webhook data is event traffic captured by this app, not a full mailbox search.",
    `Requested centre: ${input.centreName ?? "not specifically resolved"}`,
    `User prompt: ${input.prompt}`,
    JSON.stringify({
      latestReceivedAt: input.postmark.latestReceivedAt,
      delivered: input.postmark.delivered,
      opened: input.postmark.opened,
      clicked: input.postmark.clicked,
      bounced: input.postmark.bounced,
      relevantMessageCount: input.postmark.relevantMessageCount,
      centreMessageCount: input.postmark.centreMessageCount,
      officeStaffMessageCount: input.postmark.officeStaffMessageCount,
      recentMessages: input.postmark.recentMessages.map(compactPostmarkMessage),
      centreActivity: input.postmark.centreActivity,
      webhookCheck: input.postmark.webhookCheck
        ? {
            status: input.postmark.webhookCheck.status,
            message: input.postmark.webhookCheck.message,
            latestOccurredAt: input.postmark.webhookCheck.latestOccurredAt,
            latestReceivedAt: input.postmark.webhookCheck.latestReceivedAt,
            eventsLast24h: input.postmark.webhookCheck.eventsLast24h,
            eventsLast48h: input.postmark.webhookCheck.eventsLast48h,
          }
        : null,
    }),
  ].join("\n");
}

export function buildBuiltinCommsAnswer(context: CommsAiDashboardContext, prompt: string) {
  if (/postmark/i.test(prompt)) {
    return `Webmail has received ${context.postmark.delivered} Postmark delivery events, ${context.postmark.opened} open events and ${context.postmark.clicked} click events.`;
  }

  if (/form|submission|enquir/i.test(prompt)) {
    return `Formstack currently contains ${context.formstack.formCount} imported forms and ${context.formstack.storedSubmissionCount} stored submissions; ${context.formstack.matchedFormCount} forms are matched to centres.`;
  }

  return `Mailchimp currently contains ${context.mailchimp.campaignCount} imported campaigns and ${context.mailchimp.sent} sent emails, with ${context.mailchimp.uniqueOpens} unique opens. Formstack contains ${context.formstack.storedSubmissionCount} stored submissions.`;
}
