import assert from "node:assert/strict";
import test from "node:test";

import { renderCommsAppShell } from "../src/ui/comms-app-shell.js";

test("comms shell renders without throwing for empty options", () => {
  const html = renderCommsAppShell();

  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.match(html, /<title>Marketing Helper - Online Communications<\/title>/);
});

test("comms shell renders the four data panels and a chat panel", () => {
  const html = renderCommsAppShell();

  assert.match(html, /id="panel-comms-postmark"/);
  assert.match(html, /id="panel-comms-mailchimp"/);
  assert.match(html, /id="panel-comms-formstack"/);
  assert.match(html, /id="panel-comms-funnel"/);
  assert.match(html, /id="panel-chat"/);
  assert.match(html, />Webmail<\/h2>/);
  assert.match(html, />Panui<\/h2>/);
  assert.match(html, />Online Forms<\/h2>/);
  assert.match(html, />Centre Activity<\/h2>/);
});

test("comms shell renders dashboard panels as an accordion stack", () => {
  const html = renderCommsAppShell();

  assert.match(html, /data-panel-accordion/);
  assert.match(html, /panel--comms-postmark panel--accordion panel--accordion-active/);
  assert.match(html, /panel--comms-mailchimp panel--accordion/);
  assert.match(html, /panel--comms-formstack panel--accordion/);
  assert.match(html, /panel--comms-funnel panel--accordion/);
  assert.match(html, /activatePanel\(accordion, panel\)/);
});

test("comms shell exposes an AI chat panel with the comms endpoint attribute", () => {
  const html = renderCommsAppShell();

  assert.match(html, /data-ai-chat-endpoint="\/api\/comms\/ai\/chat\/stream"/);
  assert.match(html, /data-ai-chat-send/);
  assert.doesNotMatch(html, /data-ai-chat-send disabled/);
});

test("comms shell renders imported Mailchimp campaign and audience data", () => {
  const html = renderCommsAppShell({
    focusPanelId: "comms-mailchimp",
    mailchimpDashboardData: {
      latestPulledAt: "2026-05-26T00:00:00.000Z",
      campaigns: [{
        mailchimpId: "campaign-1",
        serverPrefix: "us14",
        listId: "audience-1",
        subject: "Staff Panui - May update",
        previewText: "",
        status: "sent",
        type: "regular",
        archiveUrl: "https://example.test/campaign-1",
        sendTime: "2026-05-20T00:00:00.000Z",
        emailsSent: 100,
        pulledAt: "2026-05-26T00:00:00.000Z",
        report: {
          opens: 50,
          uniqueOpens: 40,
          openRate: 0.4,
          clicks: 20,
          uniqueClicks: 10,
          clickRate: 0.1,
          unsubscribes: 2,
          bounces: 0,
          abuseReports: 0,
          forwardCount: 0,
          sendTime: "2026-05-20T00:00:00.000Z",
          fetchedAt: "2026-05-26T00:00:00.000Z",
        },
      }],
      listGrowth: [{
        serverPrefix: "us14",
        listId: "audience-1",
        listName: "Family audience",
        snapshotDate: "2026-05-26T00:00:00.000Z",
        memberCount: 420,
        subscribed: 5,
        unsubscribed: 2,
        cleaned: 1,
        pending: 0,
        pulledAt: "2026-05-26T00:00:00.000Z",
      }],
    },
  });

  assert.match(html, /Staff Panui - May update/);
  assert.match(html, /href="https:\/\/example\.test\/campaign-1" target="_blank" rel="noopener noreferrer">Staff Panui - May update<\/a>/);
  assert.doesNotMatch(html, /Unmatched/);
  assert.doesNotMatch(html, /Campaign \/ Centre/);
  assert.match(html, />40\.0%<\/strong>/);
  assert.match(html, />Family audience<\/td>/);
  assert.doesNotMatch(html, />audience-1<\/td>/);
  assert.match(html, />420<\/td>/);
  assert.match(html, /href="\/actions\/refresh-mailchimp"/);
  assert.match(html, /Source: Mailchimp \| Last pulled:/);
});

test("comms shell shows sent Mailchimp campaigns latest first and puts unsent rows after them", () => {
  const campaign = (mailchimpId: string, subject: string, sendTime: string | null) => ({
    mailchimpId,
    serverPrefix: "us14",
    listId: "audience-1",
    subject,
    previewText: "",
    status: sendTime ? "sent" : "draft",
    type: "regular",
    archiveUrl: null,
    sendTime,
    emailsSent: 0,
    pulledAt: "2026-05-26T00:00:00.000Z",
    report: null,
  });
  const html = renderCommsAppShell({
    mailchimpDashboardData: {
      latestPulledAt: "2026-05-26T00:00:00.000Z",
      campaigns: [
        campaign("draft", "Draft campaign", null),
        campaign("older", "Older sent campaign", "2026-04-24T00:00:00.000Z"),
        campaign("latest", "Latest sent campaign", "2026-05-14T00:00:00.000Z"),
      ],
      listGrowth: [],
    },
  });

  assert.ok(html.indexOf("Latest sent campaign") < html.indexOf("Older sent campaign"));
  assert.ok(html.indexOf("Older sent campaign") < html.indexOf("Draft campaign"));
  assert.match(html, /Latest to oldest - 3 imported/);
});

test("comms shell hides audiences not present in the latest Mailchimp pull", () => {
  const growth = (listId: string, listName: string, pulledAt: string) => ({
    serverPrefix: "us14",
    listId,
    listName,
    snapshotDate: "2026-05-26T00:00:00.000Z",
    memberCount: 12,
    subscribed: 0,
    unsubscribed: 0,
    cleaned: 0,
    pending: 0,
    pulledAt,
  });
  const html = renderCommsAppShell({
    focusPanelId: "comms-mailchimp",
    mailchimpDashboardData: {
      latestPulledAt: "2026-05-26T23:03:54.519Z",
      campaigns: [],
      listGrowth: [
        growth("current", "iK Panui List", "2026-05-26T23:03:54.519Z"),
        growth("deleted", "Vacancies", "2026-05-26T02:56:49.521Z"),
      ],
    },
  });

  assert.match(html, /iK Panui List/);
  assert.doesNotMatch(html, /Vacancies/);
  assert.match(html, /1 lists/);
});

test("comms shell shows Mailchimp refresh and configuration outcomes", () => {
  const html = renderCommsAppShell({
    focusPanelId: "comms-mailchimp",
    integrationError: "Missing Mailchimp credentials",
    mailchimpConfigStatus: {
      isConfigured: false,
      missingKeys: ["MAILCHIMP_API_KEY"],
      serverPrefix: null,
    },
  });

  assert.match(html, /Panui refresh couldn't complete/);
  assert.match(html, /Missing Mailchimp credentials/);
  assert.match(html, /Panui source is not configured/);
  assert.match(html, /MAILCHIMP_API_KEY/);
});

test("comms shell renders Formstack data and aligned centre activity", () => {
  const html = renderCommsAppShell({
    formstackDashboardData: {
      latestPulledAt: "2026-05-26T00:00:00.000Z",
      totalStoredSubmissions: 3,
      forms: [{
        formstackId: "form-1",
        name: "Papamoa Coast Tour Request",
        folder: "Enquiries",
        centreKey: 4,
        centreName: "Papamoa Coast Kindergarten",
        submissionCount: 3,
        viewCount: 10,
        lastSubmissionAt: "2026-05-25T00:00:00.000Z",
        pulledAt: "2026-05-26T00:00:00.000Z",
      }, {
        formstackId: "form-2",
        name: "General Enquiry",
        folder: "Enquiries",
        centreKey: null,
        centreName: null,
        submissionCount: 0,
        viewCount: 2,
        lastSubmissionAt: null,
        pulledAt: "2026-05-26T00:00:00.000Z",
      }],
      latestSubmissions: [{
        formstackId: "submission-1",
        formName: "Papamoa Coast Tour Request",
        centreKey: 4,
        centreName: "Papamoa Coast Kindergarten",
        submittedAt: "2026-05-25T00:00:00.000Z",
        payload: { status: "received" },
      }, {
        formstackId: "submission-2",
        formName: "General Enquiry",
        centreKey: null,
        centreName: null,
        submittedAt: "2026-05-24T00:00:00.000Z",
        payload: { status: "received" },
      }],
    },
  });

  assert.match(html, /Papamoa Coast Tour Request/);
  assert.match(html, /Papamoa Coast Kindergarten/);
  assert.match(html, /General Enquiry/);
  assert.doesNotMatch(html, /Unmatched/i);
  assert.match(html, /Payload preview/);
  assert.match(html, /href="\/actions\/refresh-formstack"/);
  assert.match(html, /Centre activity alignment/);
  assert.match(html, /Source: Formstack \| Last pulled:/);
});

test("comms shell renders Webmail events received from Postmark webhook", () => {
  const html = renderCommsAppShell({
    focusPanelId: "comms-postmark",
    postmarkDashboardData: {
      delivered: 1,
      opened: 1,
      clicked: 0,
      bounced: 0,
      latestReceivedAt: "2026-05-26T04:23:37.000Z",
      webhookCheck: {
        checkedAt: "2026-05-26T05:00:00.000Z",
        status: "ok",
        message: "Postmark webhooks are current. 2 events received in the last 24 hours.",
        latestOccurredAt: "2026-05-26T04:23:37.000Z",
        latestReceivedAt: "2026-05-26T04:23:40.000Z",
        hoursSinceLatestReceived: 0.6,
        eventsLast24h: 2,
        eventsLast48h: 2,
      },
      recentMessages: [{
        messageId: "message-1",
        recipient: "family@example.test",
        tag: "welcome-email",
        centreKey: null,
        centreName: null,
        category: "office-staff",
        latestOccurredAt: "2026-05-26T04:23:37.000Z",
        delivered: true,
        opened: true,
        clicked: true,
        bounced: false,
      }],
      relevantMessageCount: 12,
      centreMessageCount: 9,
      officeStaffMessageCount: 3,
      messagePage: 1,
      messagePageSize: 10,
      messagePageCount: 2,
      centreActivity: [],
    },
  });

  assert.match(html, /Recent messages/);
  assert.match(html, /Email Count by Service/);
  assert.match(html, /Showing 1-10 of 12 relevant messages/);
  assert.match(html, /href="\/comms\?window=3M&panel=comms-postmark"[^>]*>3M<\/a>/);
  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=3M&panel=comms-postmark">3M<\/a>/);
  assert.match(html, /href="\/comms\?window=6M&panel=comms-postmark"[^>]*>6M<\/a>/);
  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=3M&panel=comms-postmark">All emails<\/a>/);
  assert.match(html, /href="\/comms\?window=3M&panel=comms-postmark&metaAdsFilter=active-recent">Meta active\/recent<\/a>/);
  assert.match(html, /Office staff/);
  assert.match(html, /<th>Centre<\/th>/);
  assert.doesNotMatch(html, /No Postmark tag/);
  assert.match(html, /data-postmark-page="2"/);
  assert.match(html, /\/api\/comms\/postmark\/messages\?page=/);
  assert.match(html, /Date &amp; Time/);
  assert.match(html, /Delivered/);
  assert.match(html, /Opened/);
  assert.match(html, /Clicked/);
  assert.match(html, /welcome-email/);
  assert.match(html, /Source: Postmark webhook \+ stored export \| Latest activity:/);
  assert.match(html, /href="\/actions\/check-postmark\?window=3M"/);
  assert.match(html, /Webhook check/);
  assert.match(html, /Webhook current/);
  assert.match(html, /Last 24h/);
});

test("comms shell preserves the selected Webmail email window", () => {
  const html = renderCommsAppShell({
    focusPanelId: "comms-postmark",
    selectedWindowKey: "6M",
  });

  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=6M&panel=comms-postmark">6M<\/a>/);
  assert.match(html, /href="\/actions\/check-postmark\?window=6M"/);
  assert.doesNotMatch(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=3M&panel=comms-postmark">3M<\/a>/);
});

test("comms shell preserves the Webmail Meta advert filter beside the email window", () => {
  const html = renderCommsAppShell({
    focusPanelId: "comms-postmark",
    selectedWindowKey: "6M",
    metaAdsFilter: "active-recent",
    metaAdvertCentreCount: 4,
  });

  assert.match(html, /href="\/comms\?window=1W&panel=comms-postmark&metaAdsFilter=active-recent">1W<\/a>/);
  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=6M&panel=comms-postmark&metaAdsFilter=active-recent">6M<\/a>/);
  assert.match(html, /href="\/comms\?window=6M&panel=comms-postmark">All emails<\/a>/);
  assert.match(html, /analytics-toolbar__window analytics-toolbar__window--active" href="\/comms\?window=6M&panel=comms-postmark&metaAdsFilter=active-recent">Meta active\/recent \(4\)<\/a>/);
  assert.match(html, /href="\/actions\/check-postmark\?window=6M&metaAdsFilter=active-recent"/);
});

test("comms shell nav rail links back to landing and across to Online Marketing", () => {
  const html = renderCommsAppShell();

  assert.match(html, /href="\/"[^>]*aria-label="Back to landing"/);
  assert.match(html, /href="\/app"[^>]*aria-label="Online Marketing dashboard"/);
  assert.match(html, /href="\/comms"[^>]*aria-current="page"/);
});

test("comms shell preserves the demo flag in nav links", () => {
  const html = renderCommsAppShell({ demo: true });

  assert.match(html, /<body class="app-shell-body" data-demo="1">/);
  assert.match(html, /href="\/app\?demo=1"[^>]*aria-label="Online Marketing dashboard"/);
  assert.match(html, /href="\/comms\?demo=1"[^>]*aria-current="page"/);
  assert.match(html, /href="\/comms"[^>]*aria-label="Exit demo mode"/);
});

test("comms shell falls back to the full layout for an unknown focus panel id", () => {
  const html = renderCommsAppShell({ focusPanelId: "not-a-panel" });

  assert.match(html, /id="panel-comms-postmark"/);
  assert.match(html, /id="panel-comms-mailchimp"/);
  assert.match(html, /id="panel-comms-formstack"/);
  assert.match(html, /id="panel-comms-funnel"/);
});

test("comms shell focus mode renders only the focused panel", () => {
  const html = renderCommsAppShell({ focusPanelId: "comms-postmark" });

  assert.match(html, /id="panel-comms-postmark"/);
  assert.doesNotMatch(html, /id="panel-comms-mailchimp"/);
  assert.doesNotMatch(html, /id="panel-comms-formstack"/);
  assert.doesNotMatch(html, /id="panel-comms-funnel"/);
  assert.doesNotMatch(html, /id="panel-chat"/);
});
