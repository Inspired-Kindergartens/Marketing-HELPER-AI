import type { FormstackDashboardData } from "../../storage/formstack-store.js";
import type { MailchimpDashboardData } from "../../storage/mailchimp-store.js";
import { DEMO_RUN_DATE } from "./centres.js";

export const DEMO_MAILCHIMP_DASHBOARD: MailchimpDashboardData = {
  latestPulledAt: `${DEMO_RUN_DATE}T08:20:00.000Z`,
  campaigns: [
    {
      mailchimpId: "demo-mail-1",
      serverPrefix: "demo",
      listId: "staff",
      subject: "Staff Panui - autumn update",
      previewText: "",
      status: "sent",
      type: "regular",
      archiveUrl: null,
      sendTime: `${DEMO_RUN_DATE}T01:00:00.000Z`,
      emailsSent: 320,
      pulledAt: `${DEMO_RUN_DATE}T08:20:00.000Z`,
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
        sendTime: `${DEMO_RUN_DATE}T01:00:00.000Z`,
        fetchedAt: `${DEMO_RUN_DATE}T08:20:00.000Z`,
      },
    },
  ],
  listGrowth: [],
};

export const DEMO_FORMSTACK_DASHBOARD: FormstackDashboardData = {
  latestPulledAt: `${DEMO_RUN_DATE}T08:25:00.000Z`,
  totalStoredSubmissions: 18,
  forms: [
    {
      formstackId: "demo-form-1",
      name: "Brookfield Tour Request",
      folder: "Enquiries",
      centreKey: 9001,
      centreName: "Brookfield Kindergarten",
      submissionCount: 18,
      viewCount: 150,
      lastSubmissionAt: `${DEMO_RUN_DATE}T07:30:00.000Z`,
      pulledAt: `${DEMO_RUN_DATE}T08:25:00.000Z`,
    },
  ],
  latestSubmissions: [
    {
      formstackId: "demo-submission-1",
      formName: "Brookfield Tour Request",
      centreKey: 9001,
      centreName: "Brookfield Kindergarten",
      submittedAt: `${DEMO_RUN_DATE}T07:30:00.000Z`,
      payload: { status: "received" },
    },
  ],
};
