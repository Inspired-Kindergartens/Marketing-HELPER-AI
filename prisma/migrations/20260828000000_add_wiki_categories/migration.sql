-- Wiki categories move from a hardcoded array in src/ai/wiki-context.ts into
-- the database, so they can be renamed and deleted from the UI. "General" is
-- seeded as protected: deleting a category re-files its articles there, so it
-- must always exist.
CREATE TABLE IF NOT EXISTS "WikiCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WikiCategory_name_key" ON "WikiCategory"("name");
CREATE INDEX IF NOT EXISTS "WikiCategory_sortOrder_name_idx" ON "WikiCategory"("sortOrder", "name");

-- Seed the previously hardcoded list, keeping its original order.
INSERT INTO "WikiCategory" ("name", "sortOrder", "isProtected", "updatedAt") VALUES
    ('Advertising', 0, false, CURRENT_TIMESTAMP),
    ('Enrolment', 1, false, CURRENT_TIMESTAMP),
    ('Brand & Voice', 2, false, CURRENT_TIMESTAMP),
    ('Communications', 3, false, CURRENT_TIMESTAMP),
    ('Job Descriptions', 4, false, CURRENT_TIMESTAMP),
    ('Analytics & Reporting', 5, false, CURRENT_TIMESTAMP),
    ('Systems & Process', 6, false, CURRENT_TIMESTAMP),
    ('General', 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Any category already used by an article but missing from the seed list.
INSERT INTO "WikiCategory" ("name", "sortOrder", "isProtected", "updatedAt")
SELECT DISTINCT "category", 100, false, CURRENT_TIMESTAMP
FROM "WikiArticle"
WHERE "category" <> '' AND "category" NOT IN (SELECT "name" FROM "WikiCategory")
ON CONFLICT ("name") DO NOTHING;
