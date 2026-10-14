-- Snippets are grouped by a user-chosen category on the Code Snippets page.
ALTER TABLE "CodeSnippet" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'General';

DROP INDEX IF EXISTS "CodeSnippet_title_idx";
CREATE INDEX IF NOT EXISTS "CodeSnippet_category_title_idx" ON "CodeSnippet"("category", "title");
