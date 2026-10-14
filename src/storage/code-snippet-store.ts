import { prisma } from "../db.js";

// A reusable piece of code (tracking tag, embed, email HTML) kept for one-click
// copying. The code is stored verbatim and only ever escaped on render.
export type CodeSnippetView = {
  id: number;
  title: string;
  category: string;
  language: string;
  description: string;
  code: string;
  updatedAt: string;
};

export const CODE_SNIPPET_DEFAULT_CATEGORY = "General";

// Generous: a snippet can be a whole email template.
const CODE_MAX_LENGTH = 200_000;

function normalizeText(value: unknown, max: number, fallback = "") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, max) : fallback;
}

type CodeSnippetRow = {
  id: number;
  title: string;
  category: string;
  language: string;
  description: string;
  code: string;
  updatedAt: Date;
};

function toView(row: CodeSnippetRow): CodeSnippetView {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    language: row.language,
    description: row.description,
    code: row.code,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCodeSnippets(): Promise<CodeSnippetView[]> {
  const rows = await prisma.codeSnippet.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return rows.map(toView);
}

// --- Categories -----------------------------------------------------------
// A managed list, mirroring the wiki's categories: created, renamed and
// deleted from the Categories modal, picked from a select everywhere else.

export type CodeSnippetCategoryView = {
  id: number;
  name: string;
  isProtected: boolean;
  snippetCount: number;
};

const CATEGORY_ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listCodeSnippetCategories(): Promise<string[]> {
  const rows = await prisma.codeSnippetCategory.findMany({ orderBy: CATEGORY_ORDER, select: { name: true } });
  const names = rows.map((row) => row.name);
  // The fallback must always be offered, even if the table is somehow empty.
  return names.includes(CODE_SNIPPET_DEFAULT_CATEGORY) ? names : [...names, CODE_SNIPPET_DEFAULT_CATEGORY];
}

// Categories with how many snippets each holds, for the management modal.
export async function listCodeSnippetCategoriesWithCounts(): Promise<CodeSnippetCategoryView[]> {
  const [rows, grouped] = await Promise.all([
    prisma.codeSnippetCategory.findMany({ orderBy: CATEGORY_ORDER }),
    prisma.codeSnippet.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((row) => [row.category, row._count._all]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isProtected: row.isProtected,
    snippetCount: counts.get(row.name) ?? 0,
  }));
}

function normalizeCategoryName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function createCodeSnippetCategory(name: unknown): Promise<{ id: number } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const existing = await prisma.codeSnippetCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: `"${clean}" already exists.` };

  const last = await prisma.codeSnippetCategory.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const row = await prisma.codeSnippetCategory.create({
    data: { name: clean, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  return { id: row.id };
}

// Renames a category and re-files its snippets in one transaction, since
// snippets store the category name rather than a foreign key.
export async function renameCodeSnippetCategory(id: number, name: unknown): Promise<{ ok: true } | { error: string }> {
  const clean = normalizeCategoryName(name);
  if (!clean) return { error: "A category name is required." };

  const current = await prisma.codeSnippetCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.name === clean) return { ok: true };

  const clash = await prisma.codeSnippetCategory.findFirst({
    where: { name: { equals: clean, mode: "insensitive" }, NOT: { id } },
    select: { id: true },
  });
  if (clash) return { error: `"${clean}" already exists.` };

  await prisma.$transaction([
    prisma.codeSnippetCategory.update({ where: { id }, data: { name: clean } }),
    prisma.codeSnippet.updateMany({ where: { category: current.name }, data: { category: clean } }),
  ]);
  return { ok: true };
}

// Deletes a category and moves its snippets to the protected fallback, so
// deleting a category never deletes code.
export async function deleteCodeSnippetCategory(id: number): Promise<{ ok: true; moved: number } | { error: string }> {
  const current = await prisma.codeSnippetCategory.findUnique({ where: { id } });
  if (!current) return { error: "That category no longer exists." };
  if (current.isProtected) return { error: `"${current.name}" is the default category and cannot be deleted.` };

  const moved = await prisma.codeSnippet.count({ where: { category: current.name } });
  await prisma.$transaction([
    prisma.codeSnippet.updateMany({ where: { category: current.name }, data: { category: CODE_SNIPPET_DEFAULT_CATEGORY } }),
    prisma.codeSnippetCategory.delete({ where: { id } }),
  ]);
  return { ok: true, moved };
}

export async function getCodeSnippet(id: number): Promise<CodeSnippetView | null> {
  const row = await prisma.codeSnippet.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

export async function createCodeSnippet(input: Record<string, unknown>): Promise<number> {
  const row = await prisma.codeSnippet.create({
    data: {
      title: normalizeText(input.title, 200, "Untitled snippet"),
      category: normalizeText(input.category, 80, CODE_SNIPPET_DEFAULT_CATEGORY),
      language: normalizeText(input.language, 40),
      description: normalizeText(input.description, 400),
      // Code is not trimmed: leading indentation can be meaningful.
      code: String(input.code ?? "").slice(0, CODE_MAX_LENGTH),
    },
  });
  return row.id;
}

export async function updateCodeSnippet(id: number, input: Record<string, unknown>): Promise<boolean> {
  const existing = await prisma.codeSnippet.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  const data: Record<string, string> = {};
  if ("title" in input) data.title = normalizeText(input.title, 200, "Untitled snippet");
  if ("category" in input) data.category = normalizeText(input.category, 80, CODE_SNIPPET_DEFAULT_CATEGORY);
  if ("language" in input) data.language = normalizeText(input.language, 40);
  if ("description" in input) data.description = normalizeText(input.description, 400);
  if ("code" in input) data.code = String(input.code ?? "").slice(0, CODE_MAX_LENGTH);
  await prisma.codeSnippet.update({ where: { id }, data });
  return true;
}

export async function duplicateCodeSnippet(id: number): Promise<number | null> {
  const source = await prisma.codeSnippet.findUnique({ where: { id } });
  if (!source) return null;
  const row = await prisma.codeSnippet.create({
    data: {
      title: `${source.title} (copy)`.slice(0, 200),
      category: source.category,
      language: source.language,
      description: source.description,
      code: source.code,
    },
  });
  return row.id;
}

export async function deleteCodeSnippet(id: number): Promise<void> {
  await prisma.codeSnippet.deleteMany({ where: { id } });
}
