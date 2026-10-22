import { prisma } from "../db.js";
import { normalizeLinkUrl } from "./link-url.js";

// A titled link kept on the Subscriptions page: the services and accounts the
// team subscribes to, plus the Panui Tools links. Same shape and behaviour as
// Code Snippets.
export type SubscriptionView = {
  id: number;
  title: string;
  category: string;
  url: string;
  description: string;
  lastUsedAt: string | null;
  updatedAt: string;
};

export const SUBSCRIPTION_DEFAULT_CATEGORY = "General";

function normalizeText(value: unknown, max: number, fallback = "") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, max) : fallback;
}

type SubscriptionRow = {
  id: number;
  title: string;
  category: string;
  url: string;
  description: string;
  lastUsedAt: Date | null;
  updatedAt: Date;
};

function toView(row: SubscriptionRow): SubscriptionView {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    url: row.url,
    description: row.description,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSubscriptions(): Promise<SubscriptionView[]> {
  const rows = await prisma.subscription.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return rows.map(toView);
}

// --- Categories -----------------------------------------------------------
// A managed list, mirroring Code Snippets: created, renamed and deleted from
// the Categories modal, picked from a select everywhere else.

export type SubscriptionCategoryView = {
  id: number;
  name: string;
  isProtected: boolean;
  subscriptionCount: number;
};

const CATEGORY_ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listSubscriptionCategories(): Promise<string[]> {
  const rows = await prisma.subscriptionCategory.findMany({ orderBy: CATEGORY_ORDER, select: { name: true } });
  const names = rows.map((row) => row.name);
  // The fallback must always be offered, even if the table is somehow empty.
  return names.includes(SUBSCRIPTION_DEFAULT_CATEGORY) ? names : [...names, SUBSCRIPTION_DEFAULT_CATEGORY];
}

// Categories with how many subscriptions each holds, for the management modal.
export async function listSubscriptionCategoriesWithCounts(): Promise<SubscriptionCategoryView[]> {
  const [rows, grouped] = await Promise.all([
    prisma.subscriptionCategory.findMany({ orderBy: CATEGORY_ORDER }),
    prisma.subscription.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((row) => [row.category, row._count._all]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isProtected: row.isProtected,
    subscriptionCount: counts.get(row.name) ?? 0,
  }));
}

function normalizeCategoryName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function createSubscriptionCategory(name: unknown): Promise<{ id: number } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const existing = await prisma.subscriptionCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: `"${clean}" already exists.` };

  const last = await prisma.subscriptionCategory.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const row = await prisma.subscriptionCategory.create({
    data: { name: clean, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  return { id: row.id };
}

// Renames a category and re-files its subscriptions in one transaction, since subscriptions
// store the category name rather than a foreign key.
export async function renameSubscriptionCategory(id: number, name: unknown): Promise<{ ok: true } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const current = await prisma.subscriptionCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.name === clean) return { ok: true };

  const clash = await prisma.subscriptionCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" }, NOT: { id } },
    select: { id: true },
  });
  if (clash) return { error: `"${clean}" already exists.` };

  await prisma.$transaction([
    prisma.subscriptionCategory.update({ where: { id }, data: { name: clean } }),
    prisma.subscription.updateMany({ where: { category: current.name }, data: { category: clean } }),
  ]);
  return { ok: true };
}

// Deletes a category and moves its subscriptions to the protected fallback, so
// deleting a category never deletes a link.
export async function deleteSubscriptionCategory(id: number): Promise<{ ok: true; moved: number } | { error: string }> {
  const current = await prisma.subscriptionCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.isProtected) return { error: `"${current.name}" is the default category and cannot be deleted.` };

  const moved = await prisma.subscription.count({ where: { category: current.name } });
  await prisma.$transaction([
    prisma.subscription.updateMany({ where: { category: current.name }, data: { category: SUBSCRIPTION_DEFAULT_CATEGORY } }),
    prisma.subscriptionCategory.delete({ where: { id } }),
  ]);
  return { ok: true, moved };
}

export async function getSubscription(id: number): Promise<SubscriptionView | null> {
  const row = await prisma.subscription.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

export async function createSubscription(input: Record<string, unknown>): Promise<number> {
  const row = await prisma.subscription.create({
    data: {
      title: normalizeText(input.title, 200, "Untitled subscription"),
      category: normalizeText(input.category, 80, SUBSCRIPTION_DEFAULT_CATEGORY),
      url: normalizeLinkUrl(input.url),
      description: normalizeText(input.description, 400),
      lastUsedAt: new Date(),
    },
  });
  return row.id;
}

export async function updateSubscription(id: number, input: Record<string, unknown>): Promise<boolean> {
  const existing = await prisma.subscription.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  const data: Record<string, string | Date> = { lastUsedAt: new Date() };
  if ("title" in input) data.title = normalizeText(input.title, 200, "Untitled subscription");
  if ("category" in input) data.category = normalizeText(input.category, 80, SUBSCRIPTION_DEFAULT_CATEGORY);
  if ("url" in input) data.url = normalizeLinkUrl(input.url);
  if ("description" in input) data.description = normalizeText(input.description, 400);
  await prisma.subscription.update({ where: { id }, data });
  return true;
}

export async function duplicateSubscription(id: number): Promise<number | null> {
  const source = await prisma.subscription.findUnique({ where: { id } });
  if (!source) return null;
  const row = await prisma.subscription.create({
    data: {
      title: `${source.title} (copy)`.slice(0, 200),
      category: source.category,
      url: source.url,
      description: source.description,
      lastUsedAt: new Date(),
    },
  });
  return row.id;
}

// Opening or copying a link from the list counts as using it, so its category
// is the one expanded next time.
export async function markSubscriptionUsed(id: number): Promise<void> {
  await prisma.subscription.updateMany({ where: { id }, data: { lastUsedAt: new Date() } });
}

export async function deleteSubscription(id: number): Promise<void> {
  await prisma.subscription.deleteMany({ where: { id } });
}
