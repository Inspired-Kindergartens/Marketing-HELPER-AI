-- Code Snippets: reusable code kept for one-click copying to the clipboard.
CREATE TABLE IF NOT EXISTS "CodeSnippet" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodeSnippet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CodeSnippet_title_idx" ON "CodeSnippet"("title");
