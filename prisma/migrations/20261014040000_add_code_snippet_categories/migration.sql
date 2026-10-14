-- Managed category list for Code Snippets, mirroring WikiCategory.
CREATE TABLE IF NOT EXISTS "CodeSnippetCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodeSnippetCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CodeSnippetCategory_name_key" ON "CodeSnippetCategory"("name");
CREATE INDEX IF NOT EXISTS "CodeSnippetCategory_sortOrder_name_idx" ON "CodeSnippetCategory"("sortOrder", "name");

-- The protected fallback every snippet can land in.
INSERT INTO "CodeSnippetCategory" ("name", "sortOrder", "isProtected", "updatedAt")
VALUES ('General', 0, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Any category already used by a snippet.
INSERT INTO "CodeSnippetCategory" ("name", "sortOrder", "isProtected", "updatedAt")
SELECT DISTINCT "category", 100, false, CURRENT_TIMESTAMP
FROM "CodeSnippet"
WHERE "category" <> '' AND "category" NOT IN (SELECT "name" FROM "CodeSnippetCategory")
ON CONFLICT ("name") DO NOTHING;
