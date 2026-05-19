import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiChatMessages,
  buildCampaignTimingGuardrail,
  buildDeterministicChatAnswer,
  sanitizeChatHistory,
} from "../src/ai/chat.js";
import { runLocalChat } from "../src/ai/client.js";
import { buildAiDashboardContext, type AiDashboardContext } from "../src/ai/context.js";

test("sanitizeChatHistory keeps only recent user and assistant messages", () => {
  const history = sanitizeChatHistory([
    { role: "system", content: "ignore this" },
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "tool", content: "ignore this too" },
    { role: "user", content: "three" },
    { role: "assistant", content: "four" },
    { role: "user", content: "five" },
    { role: "assistant", content: "six" },
    { role: "user", content: "seven" },
    { role: "assistant", content: "eight" },
    { role: "user", content: "nine" },
  ]);

  assert.equal(history.length, 8);
  assert.deepEqual(history[0], { role: "assistant", content: "two" });
  assert.deepEqual(history.at(-1), { role: "user", content: "nine" });
});

test("buildAiChatMessages places fresh dashboard context before chat history", () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: { serviceName: "Harbour View Kindergarten" },
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const messages = buildAiChatMessages("system prompt", context, "What next?", [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
  ]);

  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[1]?.role, "user");
  assert.match(messages[1]?.content ?? "", /Current dashboard context JSON:/);
  assert.match(messages[1]?.content ?? "", /Harbour View Kindergarten/);
  assert.deepEqual(messages.slice(2), [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "What next?" },
  ]);
});

test("selected centre notes are ranked newest first and flagged when recent", () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const older = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const context = buildAiDashboardContext({
    snapshotSet: null,
    selectedCentreNotes: [
      {
        kind: "Note",
        centreKey: 123,
        centreName: "Whakamarama Kindergarten",
        notificationId: "older",
        heading: "Older note",
        message: "Older availability note",
        status: "Active",
        openPlaces: "",
        waitlist: "",
        pressure: "",
        occurredAt: older,
      },
      {
        kind: "Note",
        centreKey: 123,
        centreName: "Whakamarama Kindergarten",
        notificationId: "recent",
        heading: "Recent note",
        message: "Recent centre availability changed",
        status: "Active",
        openPlaces: "",
        waitlist: "",
        pressure: "",
        occurredAt: recent,
      },
    ],
  });

  assert.equal(context.selectedCentreNotes[0]?.message, "Recent centre availability changed");
  assert.equal(context.selectedCentreNotes[0]?.isLastMonth, true);
  assert.equal(context.selectedCentreNotes[1]?.message, "Older availability note");
  assert.equal(context.selectedCentreNotes[1]?.isLastMonth, false);
});

test("buildAiChatMessages includes selected centre notes and note hierarchy instructions", () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: { serviceName: "Whakamarama Kindergarten" },
    selectedCentreNotes: [
      {
        occurredAt: "2026-05-10T00:00:00.000Z",
        heading: "Recent note",
        message: "Centre has asked to pause spend until staffing is confirmed.",
        isLastMonth: true,
      },
    ],
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const messages = buildAiChatMessages("system prompt", context, "What next?", undefined);

  assert.match(messages[1]?.content ?? "", /selectedCentreNotes/);
  assert.match(messages[1]?.content ?? "", /pause spend until staffing is confirmed/);
  assert.match(messages[1]?.content ?? "", /newest to oldest/);
  assert.match(messages[1]?.content ?? "", /isLastMonth important/);
});

test("built-in AI answers from dashboard context without an external runtime", async () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: {
      centreKey: 117,
      serviceName: "Harbour View Kindergarten",
      urgencyBand: "Critical",
      urgencyScore: 10,
      enrolled: 20,
      licensedCapacity: 40,
      bookedAverageDailyCount: 18,
      bookedUtilisationPercent: 45,
      estimatedOpenPlaces: 22,
      under2: { enrolled: 0, capacity: null },
      over2: { enrolled: 20, capacity: 40 },
      waitlist: {
        actionable: 2,
        total: 4,
        under2: 0,
        oldestEntryDays: null,
        averageEntryDays: null,
      },
      selectedWindow: {
        leaving: 3,
        nearFive: 2,
        agedFivePlus: 1,
        replacementPressure: 4,
      },
      metaAds: {
        activeCampaignCount: 0,
        campaignCount: 0,
        adCount: 0,
        spend30d: 0,
        clicks30d: 0,
        lastCampaignAt: null,
      },
    },
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const answer = await runLocalChat(
    {
      AI_PROVIDER: "builtin",
      AI_BASE_URL: "http://127.0.0.1:11434",
      AI_CHAT_MODEL: "llama3.1:8b",
      AI_TIMEOUT_MS: 60000,
    },
    buildAiChatMessages("system", context, "What is the next action?", undefined),
  );

  assert.match(answer, /Harbour View Kindergarten/);
  assert.match(answer, /begin campaign preparation now/);
  assert.doesNotMatch(answer, /Beep Beep/);
});

test("built-in AI routes draft and ads questions to different answers", async () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: {
      centreKey: 117,
      serviceName: "Harbour View Kindergarten",
      urgencyBand: "Critical",
      urgencyScore: 10,
      enrolled: 20,
      licensedCapacity: 40,
      bookedAverageDailyCount: 18,
      bookedUtilisationPercent: 45,
      estimatedOpenPlaces: 22,
      under2: { enrolled: 0, capacity: null },
      over2: { enrolled: 20, capacity: 40 },
      waitlist: {
        actionable: 2,
        total: 4,
        under2: 0,
        oldestEntryDays: null,
        averageEntryDays: null,
      },
      selectedWindow: {
        leaving: 3,
        nearFive: 2,
        agedFivePlus: 1,
        replacementPressure: 4,
      },
      metaAds: {
        activeCampaignCount: 0,
        campaignCount: 0,
        adCount: 0,
        spend30d: 0,
        clicks30d: 0,
        lastCampaignAt: null,
      },
    },
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;
  const config = {
    AI_PROVIDER: "builtin" as const,
    AI_BASE_URL: "http://127.0.0.1:11434",
    AI_CHAT_MODEL: "llama3.1:8b",
    AI_TIMEOUT_MS: 60000,
  };
  const draftAnswer = await runLocalChat(config, buildAiChatMessages("system", context, "Draft ad copy", undefined));
  const adsAnswer = await runLocalChat(config, buildAiChatMessages("system", context, "Do we need ads?", undefined));

  assert.notEqual(draftAnswer, adsAnswer);
  assert.match(draftAnswer, /Draft direction/);
  assert.match(adsAnswer, /no active campaigns/);
});

test("built-in AI starts advert work when open places are not covered by actionable waitlist", async () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: {
      centreKey: 220,
      serviceName: "Waihi Kindergarten",
      urgencyBand: "Stable",
      urgencyScore: 2,
      enrolled: 21,
      licensedCapacity: 30,
      bookedAverageDailyCount: 21,
      bookedUtilisationPercent: 70,
      estimatedOpenPlaces: 9,
      under2: { enrolled: 0, capacity: null },
      over2: { enrolled: 21, capacity: 30 },
      waitlist: {
        actionable: 0,
        total: 1,
        under2: 0,
        oldestEntryDays: 182,
        averageEntryDays: 182,
      },
      selectedWindow: {
        leaving: 2,
        nearFive: 2,
        agedFivePlus: 1,
        replacementPressure: 5,
      },
      metaAds: {
        activeCampaignCount: 0,
        campaignCount: 0,
        adCount: 0,
        spend30d: 0,
        clicks30d: 0,
        lastCampaignAt: null,
      },
      campaignGuidance: {
        timing: "start_now",
        reason:
          "Estimated open places are not covered by actionable waitlist. Begin campaign work now to generate new enquiries.",
        uncoveredOpenPlaces: 9,
        uncoveredReplacementPressure: 5,
        nonActionableWaitlist: 1,
      },
    },
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const answer = await runLocalChat(
    {
      AI_PROVIDER: "builtin",
      AI_BASE_URL: "http://127.0.0.1:11434",
      AI_CHAT_MODEL: "llama3.1:8b",
      AI_TIMEOUT_MS: 60000,
    },
    buildAiChatMessages("system", context, "When should I begin running the advert campaign?", undefined),
  );

  assert.match(answer, /Waihi Kindergarten/);
  assert.match(answer, /start_now|begin campaign/i);
  assert.match(answer, /9 estimated open places/);
  assert.match(answer, /0\/1 actionable waitlist/);
  assert.doesNotMatch(answer, /convert/i);
  assert.doesNotMatch(answer, /wait for more open places/i);
  assert.doesNotMatch(answer, /higher urgency/i);
});

test("deterministic campaign timing answers use selected centre guidance", () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: {
      centreKey: 121,
      serviceName: "Waihi Kindergarten",
      urgencyBand: "Stable",
      urgencyScore: 2,
      enrolled: 34,
      licensedCapacity: 35,
      bookedAverageDailyCount: 26.5,
      bookedUtilisationPercent: 76,
      estimatedOpenPlaces: 9,
      under2: { enrolled: 0, capacity: null },
      over2: { enrolled: 34, capacity: 35 },
      waitlist: {
        actionable: 0,
        total: 1,
        under2: 0,
        oldestEntryDays: 182,
        averageEntryDays: 182,
      },
      selectedWindow: {
        leaving: 2,
        nearFive: 2,
        agedFivePlus: 1,
        replacementPressure: 5,
      },
      metaAds: {
        activeCampaignCount: 0,
        campaignCount: 0,
        adCount: 0,
        spend30d: 0,
        clicks30d: 0,
        lastCampaignAt: null,
      },
      campaignGuidance: {
        timing: "start_now",
        reason:
          "Estimated open places are not covered by actionable waitlist. Begin campaign work now to generate new enquiries.",
        uncoveredOpenPlaces: 9,
        uncoveredReplacementPressure: 5,
        nonActionableWaitlist: 1,
      },
    },
    priorityCentres: [
      {
        serviceName: "Other Kindergarten",
      },
    ],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const answer = buildDeterministicChatAnswer(context, "when should I begin running the advert campaign?");

  assert.match(answer ?? "", /Begin campaign work now/);
  assert.match(answer ?? "", /Waihi Kindergarten/);
  assert.match(answer ?? "", /9 estimated open places/);
  assert.match(answer ?? "", /5 replacement-pressure children/);
  assert.match(answer ?? "", /no active ads/);
  assert.match(answer ?? "", /0\/1 actionable waitlist/);
  assert.match(answer ?? "", /confirm local wording/);
  assert.doesNotMatch(answer ?? "", /Other Kindergarten/);
  assert.doesNotMatch(answer ?? "", /convert/i);
  assert.doesNotMatch(answer ?? "", /captured demand|campaign audience|outside the existing waitlist|Treat/i);
  assert.doesNotMatch(answer ?? "", /selectedCentre|priorityCentres|campaignGuidance|JSON|schema|variable/i);
  assert.doesNotMatch(answer ?? "", /to determine|let'?s look|based on the data/i);
});

test("campaign timing questions add a hidden guardrail to model messages", () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: {
      centreKey: 123,
      serviceName: "Whakamarama Kindergarten",
      urgencyBand: "Moderate",
      urgencyScore: 42,
      enrolled: 31,
      licensedCapacity: 35,
      bookedAverageDailyCount: 27,
      bookedUtilisationPercent: 89,
      estimatedOpenPlaces: 4,
      under2: { enrolled: 0, capacity: null },
      over2: { enrolled: 31, capacity: 35 },
      waitlist: {
        actionable: 2,
        total: 6,
        under2: 1,
        oldestEntryDays: 80,
        averageEntryDays: 35,
      },
      selectedWindow: {
        leaving: 5,
        nearFive: 5,
        agedFivePlus: 0,
        replacementPressure: 11,
      },
      metaAds: {
        activeCampaignCount: 0,
        campaignCount: 1,
        adCount: 1,
        spend30d: 0,
        clicks30d: 0,
        lastCampaignAt: "2026-03-30T23:45:00.000Z",
      },
      campaignGuidance: {
        timing: "prepare_now",
        reason: "Estimated open places are not fully covered by actionable waitlist.",
        uncoveredOpenPlaces: 4,
        uncoveredReplacementPressure: 11,
        nonActionableWaitlist: 4,
      },
    },
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const guardrail = buildCampaignTimingGuardrail(context, "when should I begin running the advert campaign?");
  const messages = buildAiChatMessages(
    "system",
    context,
    "when should I begin running the advert campaign?",
    undefined,
  );

  assert.match(guardrail ?? "", /Campaign timing guardrail/);
  assert.match(guardrail ?? "", /Prepare campaign direction now/);
  assert.match(messages[1]?.content ?? "", /Campaign timing guardrail/);
  assert.match(messages[1]?.content ?? "", /no active ads/);
  assert.match(messages[1]?.content ?? "", /Do not expose internal field names/);
});
