import { prisma } from "../db.js";
import type { MatchableCentre } from "../meta/centre-match.js";
import { upsertFormstackForm, upsertFormstackSubmission } from "../storage/formstack-store.js";
import { matchFormstackFormToCentre } from "./centre-match.js";
import { FormstackClient, type FormstackFormApiRecord, type FormstackSubmissionApiRecord } from "./client.js";
import type { FormstackConfig } from "./config.js";

export type FormstackRefreshResult = {
  pulledAt: string;
  forms: number;
  submissions: number;
};

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function folderName(form: FormstackFormApiRecord) {
  return typeof form.folder === "object"
    ? form.folder?.name ?? null
    : form.folder == null
      ? null
      : String(form.folder);
}

function submittedAt(record: FormstackSubmissionApiRecord, fallback: Date) {
  const raw = record.submittedAt ?? record.submitted_at ?? record.timestamp ?? record.date ?? record.created_at ?? record.created;
  const date = raw ? new Date(raw) : fallback;

  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function loadMatchableCentres(): Promise<MatchableCentre[]> {
  return prisma.centreReference.findMany({
    where: { ignored: false, openStatus: "Open" },
    select: { centreKey: true, name: true },
  });
}

export async function refreshFormstackData(config: FormstackConfig): Promise<FormstackRefreshResult> {
  const client = new FormstackClient(config);
  const pulledAt = new Date();
  const centres = await loadMatchableCentres();
  const forms = await client.listForms();
  const result = { pulledAt: pulledAt.toISOString(), forms: 0, submissions: 0 };

  for (const form of forms) {
    const formstackId = String(form.id);
    const folder = folderName(form);
    const centreKey = matchFormstackFormToCentre({ name: form.name, folder }, centres)?.centreKey ?? null;
    const submissions = await client.listSubmissions(formstackId);
    const newestSubmission = submissions
      .map((submission) => submittedAt(submission, pulledAt))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    await upsertFormstackForm({
      formstackId,
      name: form.name ?? `Form ${formstackId}`,
      folder,
      centreKey,
      submissionCount: numeric(form.submissionsCount ?? form.submission_count ?? form.submissions) ?? submissions.length,
      viewCount: numeric(form.view_count ?? form.views),
      lastSubmissionAt: form.last_submission_at ?? form.last_submission_time ?? newestSubmission,
      pulledAt,
    });
    result.forms += 1;

    for (const submission of submissions) {
      await upsertFormstackSubmission({
        formstackId: String(submission.id),
        formFormstackId: formstackId,
        centreKey,
        submittedAt: submittedAt(submission, pulledAt),
        payload: submission,
        syncCursor: String(submission.id),
        pulledAt,
      });
      result.submissions += 1;
    }
  }

  return result;
}
