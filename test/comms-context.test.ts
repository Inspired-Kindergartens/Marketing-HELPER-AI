import assert from "node:assert/strict";
import test from "node:test";

import { buildBuiltinCommsAnswer, buildCommsAiDashboardContext, buildCommsAiChatMessages } from "../src/ai/comms-context.js";
import type { FormstackDashboardData } from "../src/storage/formstack-store.js";
import type { MailchimpDashboardData } from "../src/storage/mailchimp-store.js";

const SAMPLE_RUN_DATE = "2026-05-15";

const SAMPLE_MAILCHIMP_DASHBOARD: MailchimpDashboardData = {
  latestPulledAt: `${SAMPLE_RUN_DATE}T08:20:00.000Z`,
  campaigns: [
    {
      mailchimpId: "sample-mail-1",
      serverPrefix: "sample",
      listId: "staff",
      subject: "Staff Panui - autumn update",
      previewText: "",
      status: "sent",
      type: "regular",
      archiveUrl: null,
      sendTime: `${SAMPLE_RUN_DATE}T01:00:00.000Z`,
      emailsSent: 320,
      pulledAt: `${SAMPLE_RUN_DATE}T08:20:00.000Z`,
      report: {
        opens: 155,
        uniqueOpens: 123,
        openRate: 0.384,
        clicks: 42,
        uniqueClicks: 31,
        clickRate: 0.097,
        unsubscribes: 1,
        bounces: 2,
        abuseReports: 0,
        forwardCount: 0,
        sendTime: `${SAMPLE_RUN_DATE}T01:00:00.000Z`,
        fetchedAt: `${SAMPLE_RUN_DATE}T08:20:00.000Z`,
      },
    },
  ],
  listGrowth: [],
};

const SAMPLE_FORMSTACK_DASHBOARD: FormstackDashboardData = {
  latestPulledAt: `${SAMPLE_RUN_DATE}T08:25:00.000Z`,
  totalStoredSubmissions: 18,
  forms: [
    {
      formstackId: "sample-form-1",
      name: "Brookfield Tour Request",
      formUrl: "https://www.formstack.com/forms/sample-brookfield-tour-request",
      folder: "Enquiries",
      centreKey: 9001,
      centreName: "Brookfield Kindergarten",
      submissionCount: 18,
      viewCount: 150,
      lastSubmissionAt: `${SAMPLE_RUN_DATE}T07:30:00.000Z`,
      pulledAt: `${SAMPLE_RUN_DATE}T08:25:00.000Z`,
    },
  ],
  latestSubmissions: [
    {
      formstackId: "sample-submission-1",
      formName: "Brookfield Tour Request",
      centreKey: 9001,
      centreName: "Brookfield Kindergarten",
      submittedAt: `${SAMPLE_RUN_DATE}T07:30:00.000Z`,
      payload: { status: "received" },
    },
  ],
};

test("communications AI context includes Mailchimp and Formstack metrics", () => {
  const context = buildCommsAiDashboardContext({
    mailchimp: SAMPLE_MAILCHIMP_DASHBOARD,
    formstack: SAMPLE_FORMSTACK_DASHBOARD,
  });

  assert.equal(context.mailchimp.campaignCount, 1);
  assert.equal(context.mailchimp.sent, 320);
  assert.equal(context.formstack.storedSubmissionCount, 18);
  assert.equal(context.formstack.forms[0]?.centreName, "Brookfield Kindergarten");
  assert.match(buildCommsAiChatMessages(context, "What is showing?", [])[1]?.content ?? "", /Mailchimp/i);
});

test("communications built-in answer summarizes received Postmark webhook events", () => {
  const context = buildCommsAiDashboardContext({
    mailchimp: SAMPLE_MAILCHIMP_DASHBOARD,
    formstack: SAMPLE_FORMSTACK_DASHBOARD,
    postmark: {
      delivered: 2,
      opened: 1,
      clicked: 1,
      bounced: 0,
      latestReceivedAt: "2026-05-26T04:23:37.000Z",
      recentMessages: [],
      relevantMessageCount: 0,
      centreMessageCount: 0,
      officeStaffMessageCount: 0,
      messagePage: 1,
      messagePageSize: 10,
      messagePageCount: 1,
      centreActivity: [],
    },
  });

  assert.match(buildBuiltinCommsAnswer(context, "What about Postmark?"), /2 Postmark delivery events, 1 open events and 1 click events/);
});

test("communications built-in answer summarizes Formstack imports", () => {
  const context = buildCommsAiDashboardContext({
    mailchimp: SAMPLE_MAILCHIMP_DASHBOARD,
    formstack: SAMPLE_FORMSTACK_DASHBOARD,
  });

  assert.match(buildBuiltinCommsAnswer(context, "How many form submissions?"), /18 stored submissions/);
});
