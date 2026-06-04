import assert from "node:assert/strict";
import test from "node:test";

import { buildBuiltinCommsAnswer, buildCommsAiDashboardContext, buildCommsAiChatMessages } from "../src/ai/comms-context.js";
import { DEMO_FORMSTACK_DASHBOARD, DEMO_MAILCHIMP_DASHBOARD } from "../src/demo/fixtures/comms.js";

test("communications AI context includes Mailchimp and Formstack metrics", () => {
  const context = buildCommsAiDashboardContext({
    mailchimp: DEMO_MAILCHIMP_DASHBOARD,
    formstack: DEMO_FORMSTACK_DASHBOARD,
  });

  assert.equal(context.mailchimp.campaignCount, 1);
  assert.equal(context.mailchimp.sent, 320);
  assert.equal(context.formstack.storedSubmissionCount, 18);
  assert.equal(context.formstack.forms[0]?.centreName, "Brookfield Kindergarten");
  assert.match(buildCommsAiChatMessages(context, "What is showing?", [])[1]?.content ?? "", /Mailchimp/i);
});

test("communications built-in answer summarizes received Postmark webhook events", () => {
  const context = buildCommsAiDashboardContext({
    mailchimp: DEMO_MAILCHIMP_DASHBOARD,
    formstack: DEMO_FORMSTACK_DASHBOARD,
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
    mailchimp: DEMO_MAILCHIMP_DASHBOARD,
    formstack: DEMO_FORMSTACK_DASHBOARD,
  });

  assert.match(buildBuiltinCommsAnswer(context, "How many form submissions?"), /18 stored submissions/);
});
