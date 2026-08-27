import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiChatMessages,
  buildCampaignTimingGuardrail,
  buildDeterministicChatAnswer,
  sanitizeChatHistory,
} from "../src/ai/chat.js";
import { buildChatMemory, inferSelectedCentreFromMessages } from "../src/ai/chat-memory.js";
import { runLocalChat } from "../src/ai/client.js";
import { buildAiDashboardContext, type AiDashboardContext } from "../src/ai/context.js";
import { buildChatDocumentPrompt, extractChatDocument } from "../src/ai/document-reader.js";
import { renderGeneralChatPage } from "../src/ui/general-chat-page.js";
import {
  buildLiveInfocareGrounding,
  formatLiveInfocareAnswer,
  isLiveInfocarePrompt,
  planLiveInfocareRequest,
  resolveWaitAgeThresholdDays,
  runLiveInfocareRequest,
} from "../src/ai/infocare-live.js";

test("chat document extraction reads text-like files and appends source context", async () => {
  const document = await extractChatDocument({
    filename: "campaign-notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Campaign notes\n\nFocus on Bethlehem Kindergarten.", "utf8"),
  });
  const prompt = buildChatDocumentPrompt("Summarise this", document);

  assert.equal(document.filename, "campaign-notes.md");
  assert.equal(document.pageCount, null);
  assert.equal(document.truncated, false);
  assert.match(document.text, /Bethlehem Kindergarten/);
  assert.match(prompt, /Attached document context/);
  assert.match(prompt, /Filename: campaign-notes\.md/);
  assert.match(prompt, /If the answer is not present in the document text, say so/);
});

test("chat document extraction rejects unsupported file types", async () => {
  await assert.rejects(
    () =>
      extractChatDocument({
        filename: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("not a document"),
      }),
    /Unsupported document type/,
  );
});

test("general chat composer exposes an optional document upload control", () => {
  const html = renderGeneralChatPage({
    groups: [],
    conversations: [],
    selectedConversation: {
      id: 1,
      groupId: null,
      title: "Document chat",
      updatedAt: "2026-08-04T00:00:00.000Z",
      messageCount: 0,
    },
    selectedGroupId: null,
    messages: [],
    contextLimitTokens: 131072,
    sendCharBudget: 24000,
  });

  assert.match(html, /name="document"/);
  assert.match(html, /accept="\.pdf/);
  assert.match(html, /bi bi-paperclip/);
  assert.match(html, /new FormData/);
});

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

test("chat memory compacts prior centre references for ambiguous follow-ups", () => {
  const centres = [
    {
      centreKey: 117,
      name: "Arataki Kindergarten",
      openStatus: "Open",
      ignored: false,
    },
    {
      centreKey: 118,
      name: "Bethlehem Kindergarten",
      openStatus: "Open",
      ignored: false,
    },
  ];
  const history = [
    { role: "user", content: "Can you check Arataki Kindergarten?" },
    { role: "assistant", content: "Arataki Kindergarten has 3 current waitlist entries." },
    { role: "user", content: "Now get the waitlist as Outlook emails." },
  ];
  const memory = buildChatMemory(history, centres, {
    categoryName: "Infocare waitlists",
    conversationTitle: "Arataki follow-up",
  });
  const selected = inferSelectedCentreFromMessages(history, centres);

  assert.equal(memory.selectedCentreKey, 117);
  assert.equal(memory.categoryName, "Infocare waitlists");
  assert.equal(memory.conversationTitle, "Arataki follow-up");
  assert.match(memory.text ?? "", /Conversation category: Infocare waitlists/);
  assert.match(memory.text ?? "", /Conversation title: Arataki follow-up/);
  assert.equal(selected?.name, "Arataki Kindergarten");
  assert.match(memory.text ?? "", /Last referenced centre: Arataki Kindergarten/);
  assert.match(memory.text ?? "", /Compact recent turn context/);
});

test("buildAiChatMessages includes hidden compact memory before bounded history", () => {
  const context = {
    generatedAt: "2026-05-15T00:00:00.000Z",
    selectedWindowKey: "3M",
    snapshot: null,
    selectedCentre: { serviceName: "Arataki Kindergarten" },
    selectedCentreNotes: [],
    priorityCentres: [],
    metaAds: null,
    googleAnalytics: null,
  } as unknown as AiDashboardContext;

  const messages = buildAiChatMessages("system prompt", context, "What next?", [], {
    selectedCentreKey: 117,
    selectedCentreName: "Arataki Kindergarten",
    categoryName: "Infocare waitlists",
    conversationTitle: "Arataki follow-up",
    text: "Last referenced centre: Arataki Kindergarten (centreKey 117).",
  });

  assert.equal(messages[2]?.role, "user");
  assert.match(messages[2]?.content ?? "", /Hidden compact conversation memory/);
  assert.match(messages[2]?.content ?? "", /Arataki Kindergarten/);
  assert.equal(messages.at(-1)?.content, "What next?");
});

test("live Infocare prompts resolve a named centre and format Outlook waitlist recipients", async () => {
  const centre = {
    centreKey: 117,
    name: "Arataki Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const centres = [
    centre,
    {
      centreKey: 118,
      name: "Bethlehem Kindergarten",
      openStatus: "Open",
      ignored: false,
      lastSyncedAt: "2026-08-04T00:00:00.000Z",
    },
  ];
  const prompt = "get the waitlist for Arataki kindergarten as an email list for inserting into outlook to field";

  assert.equal(isLiveInfocarePrompt(prompt), true);
  const plan = planLiveInfocareRequest(prompt, centres);

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.centre.centreKey : null, 117);
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Waiting list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.emailOnly : null, true);

  const requestedModes: string[] = [];
  const result = await runLiveInfocareRequest(
    plan.intent!,
    {
      client: {
        async request(mode: string, parameters: Record<string, unknown>) {
          requestedModes.push(mode);

          if (mode === "get_contact_list") {
            const childKey = Number(parameters.child_key);

            return {
              msg_status: "OK",
              contact_list: childKey === 1
                ? [
                    {
                      contact_key: 11,
                      first_name: "Parent",
                      last_name: "One",
                      relationship: "Mother",
                      email: "parent.one@example.com",
                    },
                  ]
                : [
                    {
                      contact_key: 22,
                      first_name: "Parent",
                      last_name: "Two",
                      relationship: "Father",
                      mobile: "0271234567",
                    },
                  ],
            };
          }

          if (mode === "get_child") {
            const childKey = Number(parameters.child_key);

            return {
              msg_status: "OK",
                  child: childKey === 1
                ? {
                    child_key: 1,
                    first_name: "Ari",
                    last_name: "Smith",
                    mother_email: "parent.one@example.com",
                  }
                : {
                    child_key: 2,
                    first_name: "Moana",
                    last_name: "Jones",
                    contacts: [{ mobile: "0271234567" }],
                  },
            };
          }

          assert.deepEqual(parameters, {
            centre_key: 117,
            category: "Waiting list",
            start_date: "2026-08-04",
            end_date: "2026-08-04",
          });

          return {
            msg_status: "OK",
            child_list: [
              {
                child_key: 1,
                first_name: "Ari",
                last_name: "Smith",
              },
              {
                child_key: 2,
                first_name: "Moana",
                last_name: "Jones",
              },
            ],
          };
        },
      } as never,
      now: new Date("2026-08-04T12:00:00.000Z"),
    },
  );
  const answer = formatLiveInfocareAnswer(result, prompt);

  assert.deepEqual(requestedModes, ["get_child_list", "get_contact_list", "get_contact_list"]);
  assert.match(answer, /parent\.one@example\.com/);
  assert.match(answer, /Ari Smith: parent\.one@example\.com \(Parent One, Mother\)/);
  assert.match(answer, /Missing email - phone instead:\n- Moana Jones: 0271234567/);
  assert.match(answer, /Checked 2 contact lists/);
  assert.match(answer, /No Infocare records were changed/);
});

test("waitlist wait-age threshold parsing handles months, weeks, days, and years", () => {
  assert.deepEqual(resolveWaitAgeThresholdDays("over 3 months in waiting"), {
    days: 90,
    label: "3 months",
  });
  assert.deepEqual(resolveWaitAgeThresholdDays("waiting more than 6 weeks"), {
    days: 42,
    label: "6 weeks",
  });
  assert.deepEqual(resolveWaitAgeThresholdDays("longer than 45 days"), {
    days: 45,
    label: "45 days",
  });
  assert.deepEqual(resolveWaitAgeThresholdDays("at least 1 year"), {
    days: 365,
    label: "1 year",
  });
  assert.equal(resolveWaitAgeThresholdDays("give me the waitlist"), null);
});

test("live Infocare waitlist counts entries over a wait-age threshold across the full list", async () => {
  const centre = {
    centreKey: 117,
    name: "Arataki Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const prompt = "How many children who are on the waitlist for Arataki Kindergarten are over 3 months in waiting";

  assert.equal(isLiveInfocarePrompt(prompt), true);
  const plan = planLiveInfocareRequest(prompt, [centre], 117);

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Waiting list");

  // 100 records: 60 waiting 200 days, 37 waiting 10 days, 3 with no usable date.
  const childList = [
    ...Array.from({ length: 60 }, (_, index) => ({
      child_key: index + 1,
      first_name: "Long",
      last_name: `Waiter${index + 1}`,
      application_date: "2026-01-16",
    })),
    ...Array.from({ length: 37 }, (_, index) => ({
      child_key: index + 100,
      first_name: "Recent",
      last_name: `Waiter${index + 1}`,
      application_date: "2026-07-25",
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      child_key: index + 200,
      first_name: "Undated",
      last_name: `Waiter${index + 1}`,
    })),
  ];

  const result = await runLiveInfocareRequest(plan.intent!, {
    client: {
      async request() {
        return { msg_status: "OK", child_list: childList };
      },
    } as never,
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const answer = formatLiveInfocareAnswer(result, prompt);

  assert.match(
    answer,
    /^60 of 100 waiting list records for Arataki Kindergarten have been waiting over 3 months \(90\+ days\)\./,
  );
  assert.match(answer, /3 records had no usable application or start date/);
  assert.match(answer, /covers the 97 dated records/);
  assert.match(answer, /No Infocare records were changed/);

  // The count must survive past the 80-row display cap.
  assert.equal(/Showing first 80 of/.test(answer), false);

  const grounding = buildLiveInfocareGrounding(result, prompt);

  assert.match(grounding, /"countOverThreshold":60/);
  assert.match(grounding, /"undatedRecordCount":3/);
  assert.match(grounding, /"waitAgeThresholdDays":90/);
  assert.match(grounding, /do not recount from the record list/);
});

test("live Infocare waitlist listing is not truncated at 80 rows", async () => {
  const centre = {
    centreKey: 117,
    name: "Arataki Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const prompt = "show me the waitlist for Arataki Kindergarten";
  const plan = planLiveInfocareRequest(prompt, [centre], 117);

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Waiting list");
  const childList = Array.from({ length: 95 }, (_, index) => ({
    child_key: index + 1,
    first_name: "Child",
    last_name: `Number${index + 1}`,
    application_date: "2026-06-01",
  }));

  const result = await runLiveInfocareRequest(plan.intent!, {
    client: {
      async request() {
        return { msg_status: "OK", child_list: childList };
      },
    } as never,
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const answer = formatLiveInfocareAnswer(result, prompt);

  assert.match(answer, /95 records/);
  assert.equal(/Showing first 80 of/.test(answer), false);
  assert.match(answer, /Child Number95/);
});

test("live Infocare primary caregiver contact prompts default to current enrolments", async () => {
  const centre = {
    centreKey: 117,
    name: "Gwen Rogers Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const prompt = "can you give me a list of primary caregivers emails - if no email then give me their mobile number";

  assert.equal(isLiveInfocarePrompt(prompt), true);
  const plan = planLiveInfocareRequest(prompt, [centre], 117);

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Current enrolments");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.emailOnly : null, true);

  const requests: { mode: string; parameters: Record<string, unknown> }[] = [];
  const result = await runLiveInfocareRequest(plan.intent!, {
    client: {
      async request(mode: string, parameters: Record<string, unknown>) {
        requests.push({ mode, parameters });

        if (mode === "get_contact_list") {
          const childKey = Number(parameters.child_key);

          return {
            msg_status: "OK",
            contact_list: childKey === 1
              ? [
                  {
                    contact_key: 11,
                    first_name: "Primary",
                    last_name: "Email",
                    relationship: "Mother",
                    primary_caregiver: true,
                    email: "primary.email@example.com",
                    mobile: "021111111",
                  },
                  {
                    contact_key: 12,
                    first_name: "Other",
                    last_name: "Contact",
                    relationship: "Father",
                    primary_caregiver: false,
                    email: "other.contact@example.com",
                  },
                ]
              : [
                  {
                    contact_key: 22,
                    first_name: "Primary",
                    last_name: "Mobile",
                    relationship: "Father",
                    primary_caregiver: true,
                    mobile: "027222222",
                  },
                ],
          };
        }

        assert.deepEqual(parameters, {
          centre_key: 117,
          category: "Current enrolments",
          start_date: "2026-08-04",
          end_date: "2026-08-04",
        });

        return {
          msg_status: "OK",
          child_list: [
            {
              child_key: 1,
              first_name: "Ari",
              last_name: "Smith",
            },
            {
              child_key: 2,
              first_name: "Moana",
              last_name: "Jones",
            },
          ],
        };
      },
    } as never,
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const answer = formatLiveInfocareAnswer(result, prompt);

  assert.equal(result.kind, "child_list");
  assert.deepEqual(requests.map((request) => request.mode), ["get_child_list", "get_contact_list", "get_contact_list"]);
  assert.match(answer, /Infocare current enrolments primary caregiver emails for Gwen Rogers Kindergarten/);
  assert.match(answer, /primary\.email@example\.com/);
  assert.doesNotMatch(answer, /other\.contact@example\.com/);
  assert.match(answer, /Missing email - phone instead:\n- Moana Jones: 027222222/);
  assert.match(answer, /Primary Email, Mother/);
  assert.match(answer, /No Infocare records were changed/);
});

test("live Infocare overview and capacity prompts use only read modes", async () => {
  const centre = {
    centreKey: 117,
    name: "Arataki Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const requestedModes: string[] = [];
  const client = {
    async request(mode: string) {
      requestedModes.push(mode);

      if (mode === "get_license_list") {
        // The live API returns per-day rows under `day_list`, with closed days at 0.
        return {
          msg_status: "OK",
          day_list: [
            { date: "2026-08-08", max_children: 0, max_u2: 0, max_o2: 0 },
            { date: "2026-08-10", max_children: 40, max_u2: 10, max_o2: 30 },
          ],
        };
      }

      return {
        msg_status: "OK",
        child_list: [{ child_key: requestedModes.length, first_name: "Test", last_name: "Child" }],
      };
    },
  };
  const overviewPlan = planLiveInfocareRequest("connect to Infocare and show Arataki Kindergarten", [centre]);
  const overview = await runLiveInfocareRequest(overviewPlan.intent!, { client: client as never });
  const capacityPlan = planLiveInfocareRequest("get Arataki Kindergarten capacity from Infocare", [centre]);
  const capacity = await runLiveInfocareRequest(capacityPlan.intent!, { client: client as never });

  assert.equal(overview.kind, "centre_overview");
  assert.match(formatLiveInfocareAnswer(overview), /Current enrolments: 1/);
  assert.match(formatLiveInfocareAnswer(overview), /Waiting list: 1/);
  assert.match(formatLiveInfocareAnswer(capacity), /max 40, U2 10, O2 30/);
  assert.deepEqual(requestedModes, [
    "get_child_list",
    "get_child_list",
    "get_child_list",
    "get_license_list",
    "get_license_list",
  ]);
  assert.equal(requestedModes.some((mode) => /^(create|update|delete|set)_/.test(mode)), false);
});

test("live Infocare name-status prompts read left records instead of current enrolments", () => {
  const centre = {
    centreKey: 117,
    name: "Arataki Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const prompt = "is Ari Smith recently unenrolled from Arataki Kindergarten?";
  const plan = planLiveInfocareRequest(prompt, [centre]);

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Left");
});

test("live Infocare left checks request a recent left window, not current enrolments", async () => {
  const centre = {
    centreKey: 117,
    name: "Gwen Rogers Kindergarten",
    openStatus: "Open",
    ignored: false,
    lastSyncedAt: "2026-08-04T00:00:00.000Z",
  };
  const prompt = 'can you check with Gwen Rogers kindergarten if there is a primary caregiver email with OliviaMHarris@gmail.com or LyndonSheehan@gmail.com or with a child\'s first name of "Porter" in Infocare that has left recently.';
  const plan = planLiveInfocareRequest(prompt, [centre]);
  const requests: { mode: string; parameters: Record<string, unknown> }[] = [];

  assert.equal(plan.intent?.kind, "child_list");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.category : null, "Left");
  assert.equal(plan.intent?.kind === "child_list" ? plan.intent.emailOnly : null, true);

  const result = await runLiveInfocareRequest(plan.intent!, {
    now: new Date("2026-08-04T12:00:00.000Z"),
    client: {
      async request(mode: string, parameters: Record<string, unknown>) {
        requests.push({ mode, parameters });

        if (mode === "get_contact_list") {
          return {
            msg_status: "OK",
            contact_list: [],
          };
        }

        assert.equal(mode, "get_child_list");
        assert.deepEqual(parameters, {
          centre_key: 117,
          category: "Left",
          start_date: "2026-05-06",
          end_date: "2026-08-04",
        });

        return {
          msg_status: "OK",
          child_list: [{ child_key: 1, first_name: "Porter", last_name: "Harris", leaving_date: "2026-08-01" }],
        };
      },
    } as never,
  });

  assert.equal(result.kind, "child_list");
  assert.equal(result.kind === "child_list" ? result.category : null, "Left");
  assert.equal(requests[0]?.mode, "get_child_list");
  assert.equal(requests[0]?.parameters.category, "Left");
  assert.notEqual(requests[0]?.parameters.category, "Current enrolments");
});

test("live Infocare prompts also recognise Inforcare and caregiver child queries", () => {
  assert.equal(isLiveInfocarePrompt("check Inforcare for Gwen Rogers kindergarten"), true);
  assert.equal(
    isLiveInfocarePrompt(
      'can you check with Gwen Rogers kindergarten if there is a primary caregiver email with OliviaMHarris@gmail.com or a child first name of "Porter" that has left recently',
    ),
    true,
  );
});

test("live Infocare grounding instructs AI to answer exact name-search intent", () => {
  const grounding = buildLiveInfocareGrounding(
    {
      kind: "child_list",
      centre: {
        centreKey: 117,
        name: "Arataki Kindergarten",
        openStatus: "Open",
        ignored: false,
        lastSyncedAt: "2026-08-04T00:00:00.000Z",
      },
      category: "Left",
      children: [
        {
          child_key: 1,
          first_name: "Ari",
          last_name: "Smith",
          starting_date: "2025-01-20",
          leaving_date: "2026-08-01",
        },
      ],
      contactsByChildKey: {},
      emailOnly: false,
      contactLookups: 0,
      contactFailures: 0,
      detailLookups: 0,
      detailFailures: 0,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    "is Ari Smith recently unenrolled?",
  );

  assert.match(grounding, /answer through AI chat/i);
  assert.match(grounding, /Do not dump a list/);
  assert.match(grounding, /recently unenrolled/);
  assert.match(grounding, /"category":"Left"/);
  assert.match(grounding, /"fullName":"Ari Smith"/);
});

test("live Infocare grounding includes caregiver contact email evidence", () => {
  const grounding = buildLiveInfocareGrounding(
    {
      kind: "child_list",
      centre: {
        centreKey: 117,
        name: "Gwen Rogers Kindergarten",
        openStatus: "Open",
        ignored: false,
        lastSyncedAt: "2026-08-04T00:00:00.000Z",
      },
      category: "Left",
      children: [
        {
          child_key: 1,
          first_name: "Porter",
          last_name: "Harris",
          leaving_date: "2026-08-01",
        },
      ],
      contactsByChildKey: {
        1: [
          {
            contact_key: 22,
            first_name: "Olivia",
            last_name: "Harris",
            relationship: "Mother",
            primary_caregiver: true,
            email: "OliviaMHarris@gmail.com",
          },
        ],
      },
      emailOnly: true,
      contactLookups: 1,
      contactFailures: 0,
      detailLookups: 0,
      detailFailures: 0,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    'check if OliviaMHarris@gmail.com or child first name "Porter" has left recently',
  );

  assert.match(grounding, /already performed the relevant read-only Infocare API lookup/);
  assert.match(grounding, /Do not say you cannot access Infocare/);
  assert.match(grounding, /"fullName":"Porter Harris"/);
  assert.match(grounding, /"primaryCaregiver":true/);
  assert.match(grounding, /oliviamharris@gmail\.com/i);
});

test("live Infocare answer directly checks requested caregiver emails and left child first name", () => {
  const answer = formatLiveInfocareAnswer(
    {
      kind: "child_list",
      centre: {
        centreKey: 117,
        name: "Gwen Rogers Kindergarten",
        openStatus: "Open",
        ignored: false,
        lastSyncedAt: "2026-08-04T00:00:00.000Z",
      },
      category: "Left",
      children: [
        {
          child_key: 1,
          first_name: "Porter",
          last_name: "Harris",
          leaving_date: "2026-08-01",
        },
        {
          child_key: 2,
          first_name: "Other",
          last_name: "Child",
          leaving_date: "2026-08-02",
        },
      ],
      contactsByChildKey: {
        1: [
          {
            contact_key: 22,
            first_name: "Olivia",
            last_name: "Harris",
            relationship: "Mother",
            primary_caregiver: true,
            email: "OliviaMHarris@gmail.com",
          },
        ],
        2: [
          {
            contact_key: 33,
            first_name: "Lyndon",
            last_name: "Sheehan",
            relationship: "Father",
            primary_caregiver: false,
            email: "other@example.com",
          },
        ],
      },
      emailOnly: true,
      contactLookups: 2,
      contactFailures: 0,
      detailLookups: 0,
      detailFailures: 0,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    'can you check with Gwen Rogers kindergarten if there is a primary caregiver email with OliviaMHarris@gmail.com or LyndonSheehan@gmail.com or with a child\'s first name of "Porter" in Infocare that has left recently.',
  );

  assert.match(answer, /I checked Infocare left records for Gwen Rogers Kindergarten/);
  assert.match(answer, /Found 1 matching left record/);
  assert.match(answer, /Porter Harris/);
  assert.match(answer, /leaving 2026-08-01/);
  assert.match(answer, /child first name "porter"/);
  assert.match(answer, /oliviamharris@gmail\.com \(Olivia Harris, Mother, primary caregiver\)/i);
  assert.match(answer, /No match found for: lyndonsheehan@gmail\.com/i);
  assert.doesNotMatch(answer, /cannot access|external databases|school records/i);
  assert.match(answer, /No Infocare records were changed/);
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
