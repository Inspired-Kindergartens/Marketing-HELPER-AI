import type { Prisma, PrismaClient as GeneratedPrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";

const db = prisma as GeneratedPrismaClient;

export type FormstackFormInput = {
  formstackId: string;
  name: string;
  folder?: string | null;
  centreKey?: number | null;
  submissionCount?: number | null;
  viewCount?: number | null;
  lastSubmissionAt?: string | Date | null;
  pulledAt: string | Date;
};

export type FormstackSubmissionInput = {
  formstackId: string;
  formFormstackId: string;
  centreKey?: number | null;
  submittedAt: string | Date;
  payload: unknown;
  syncCursor?: string | null;
  pulledAt: string | Date;
};

export type FormstackFormView = {
  formstackId: string;
  name: string;
  folder: string | null;
  centreKey: number | null;
  centreName: string | null;
  submissionCount: number;
  viewCount: number | null;
  lastSubmissionAt: string | null;
  pulledAt: string;
};

export type FormstackSubmissionView = {
  formstackId: string;
  formName: string;
  centreKey: number | null;
  centreName: string | null;
  submittedAt: string;
  payload: unknown;
};

export type FormstackDashboardData = {
  forms: FormstackFormView[];
  latestSubmissions: FormstackSubmissionView[];
  totalStoredSubmissions: number;
  latestPulledAt: string | null;
};

function optionalDate(value: string | Date | null | undefined) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function upsertFormstackForm(input: FormstackFormInput) {
  const data = {
    name: input.name,
    folder: input.folder ?? null,
    centreKey: input.centreKey ?? null,
    submissionCount: input.submissionCount ?? 0,
    viewCount: input.viewCount ?? null,
    lastSubmissionAt: optionalDate(input.lastSubmissionAt),
    pulledAt: new Date(input.pulledAt),
  };

  return db.formstackForm.upsert({
    where: { formstackId: input.formstackId },
    create: { formstackId: input.formstackId, ...data },
    update: data,
  });
}

export async function upsertFormstackSubmission(input: FormstackSubmissionInput) {
  const data = {
    formFormstackId: input.formFormstackId,
    centreKey: input.centreKey ?? null,
    submittedAt: new Date(input.submittedAt),
    payload: toJson(input.payload),
    syncCursor: input.syncCursor ?? null,
    pulledAt: new Date(input.pulledAt),
  };

  return db.formstackSubmission.upsert({
    where: { formstackId: input.formstackId },
    create: { formstackId: input.formstackId, ...data },
    update: data,
  });
}

export async function readFormstackDashboardData(): Promise<FormstackDashboardData> {
  const [forms, latestSubmissions, totalStoredSubmissions, latestPulledAt] = await Promise.all([
    db.formstackForm.findMany({
      include: { centre: { select: { name: true } } },
      orderBy: [{ lastSubmissionAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    }),
    db.formstackSubmission.findMany({
      include: {
        form: { select: { name: true } },
        centre: { select: { name: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
    }),
    db.formstackSubmission.count(),
    db.formstackForm.findFirst({ orderBy: { pulledAt: "desc" }, select: { pulledAt: true } }),
  ]);

  return {
    forms: forms.map((form) => ({
      formstackId: form.formstackId,
      name: form.name,
      folder: form.folder,
      centreKey: form.centreKey,
      centreName: form.centre?.name ?? null,
      submissionCount: form.submissionCount,
      viewCount: form.viewCount,
      lastSubmissionAt: form.lastSubmissionAt?.toISOString() ?? null,
      pulledAt: form.pulledAt.toISOString(),
    })),
    latestSubmissions: latestSubmissions.map((submission) => ({
      formstackId: submission.formstackId,
      formName: submission.form.name,
      centreKey: submission.centreKey,
      centreName: submission.centre?.name ?? null,
      submittedAt: submission.submittedAt.toISOString(),
      payload: submission.payload,
    })),
    totalStoredSubmissions,
    latestPulledAt: latestPulledAt?.pulledAt.toISOString() ?? null,
  };
}
