import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("snapshot stores append new records instead of overwriting historical pulls", () => {
  const analytics = source("../src/storage/analytics-store.ts");
  const googleAnalytics = source("../src/storage/google-analytics-store.ts");
  const mailchimp = source("../src/storage/mailchimp-store.ts");

  assert.doesNotMatch(analytics, /analyticsSnapshotRun\.upsert/);
  assert.doesNotMatch(analytics, /serviceAnalyticsSnapshot\.deleteMany/);
  assert.match(analytics, /analyticsSnapshotRun\.create/);

  assert.doesNotMatch(googleAnalytics, /googleAnalyticsDailySnapshot\.upsert/);
  assert.doesNotMatch(googleAnalytics, /googleAnalyticsPageSnapshot\.deleteMany/);
  assert.match(googleAnalytics, /googleAnalyticsDailySnapshot\.create/);

  assert.doesNotMatch(mailchimp, /mailchimpCampaignReport\.upsert/);
  assert.doesNotMatch(mailchimp, /mailchimpListGrowthSnapshot\.upsert/);
  assert.match(mailchimp, /mailchimpCampaignReport\.create/);
  assert.match(mailchimp, /mailchimpListGrowthSnapshot\.create/);
});

test("external provider clients append raw response payload captures", () => {
  for (const file of [
    "../src/infocare/client.ts",
    "../src/meta/client.ts",
    "../src/google-analytics/client.ts",
    "../src/mailchimp/client.ts",
    "../src/formstack/client.ts",
    "../src/postmark/webhook.ts",
  ]) {
    assert.match(source(file), /appendExternalApiCapture/);
  }

  const schema = source("../prisma/schema.prisma");
  assert.match(schema, /model ExternalApiCapture/);
});

test("capture failures are not acknowledged or suppressed", () => {
  const server = source("../src/server.ts");
  const mailchimpRefresh = source("../src/mailchimp/refresh.ts");

  assert.match(server, /postmark webhook: ingestion failed[\s\S]*?reply\.code\(503\)/);
  assert.match(mailchimpRefresh, /error instanceof MailchimpApiError/);
  assert.match(mailchimpRefresh, /error\.status !== 404/);
});

test("Postmark Webmail display reads stored webhook events without altering them", () => {
  const postmarkStore = source("../src/storage/postmark-store.ts");
  const postmarkPanel = source("../src/ui/comms/postmark-panel.ts");

  assert.match(postmarkStore, /postmarkMessageEvent\.findMany/);
  assert.doesNotMatch(postmarkStore, /\.(update|delete|upsert|create)\(/);
  assert.match(postmarkPanel, /Recent messages/);
  assert.match(postmarkPanel, /External test activity is excluded from this list/);
});

test("Postmark CSV export imports historical events into retained message storage", () => {
  const importer = source("../src/postmark/csv-import.ts");

  assert.match(importer, /activity-csv-import/);
  assert.match(importer, /postmarkMessageEvent\.createMany/);
  assert.match(importer, /skipDuplicates:\s*true/);
});
