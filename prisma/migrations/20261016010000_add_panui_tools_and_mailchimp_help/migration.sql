-- Panui Tools: titled links for newsletter work, grouped by managed categories.
CREATE TABLE IF NOT EXISTS "PanuiTool" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PanuiTool_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PanuiTool_category_title_idx" ON "PanuiTool"("category", "title");

CREATE TABLE IF NOT EXISTS "PanuiToolCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PanuiToolCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PanuiToolCategory_name_key" ON "PanuiToolCategory"("name");
CREATE INDEX IF NOT EXISTS "PanuiToolCategory_sortOrder_name_idx" ON "PanuiToolCategory"("sortOrder", "name");

-- The protected fallback every tool can land in.
INSERT INTO "PanuiToolCategory" ("name", "sortOrder", "isProtected", "updatedAt")
VALUES ('General', 0, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Mailchimp help centre, crawled for the Panui chat's retrieval.
CREATE TABLE IF NOT EXISTS "MailchimpHelpArticle" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailchimpHelpArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailchimpHelpArticle_url_key" ON "MailchimpHelpArticle"("url");

CREATE TABLE IF NOT EXISTS "MailchimpHelpChunk" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "embedding" REAL[],
    -- Generated, so Prisma never writes it; heading weighted above body text.
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("heading", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("text", '')), 'B')
    ) STORED,
    CONSTRAINT "MailchimpHelpChunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MailchimpHelpChunk_articleId_fkey" FOREIGN KEY ("articleId")
        REFERENCES "MailchimpHelpArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MailchimpHelpChunk_articleId_ordinal_idx" ON "MailchimpHelpChunk"("articleId", "ordinal");
CREATE INDEX IF NOT EXISTS "MailchimpHelpChunk_searchVector_idx" ON "MailchimpHelpChunk" USING GIN ("searchVector");
