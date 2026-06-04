import type { AiChatMessage } from "./client.js";
import { sanitizeChatHistory, type AiChatHistoryMessageInput } from "./chat.js";
import type { FormstackDashboardData } from "../storage/formstack-store.js";
import type { MailchimpDashboardData } from "../storage/mailchimp-store.js";
import type { PostmarkDashboardData } from "../storage/postmark-store.js";

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
): AiChatMessage[] {
  return [
    { role: "system", content: buildCommsSystemPrompt() },
    {
      role: "user",
      content: `Current Communications dashboard context JSON:\n${JSON.stringify(context)}\nUse only this context as evidence.`,
    },
    ...sanitizeChatHistory(history),
    { role: "user", content: prompt },
  ];
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
