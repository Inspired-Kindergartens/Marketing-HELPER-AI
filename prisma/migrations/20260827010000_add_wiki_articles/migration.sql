-- "Things To Know": the marketing wiki. One row per article. `tags` is a
-- comma-separated, lower-cased list used alongside title/summary/body for the
-- keyword retrieval that feeds the AI chats; `isPinned` marks articles that
-- are always sent as grounding regardless of the prompt.
CREATE TABLE IF NOT EXISTS "WikiArticle" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "tags" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiArticle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WikiArticle_category_title_idx" ON "WikiArticle"("category", "title");
CREATE INDEX IF NOT EXISTS "WikiArticle_updatedAt_idx" ON "WikiArticle"("updatedAt" DESC);
