-- The Panui Tools page is retired: its links move to the Links page
-- (Subscription) under one "Panui Tools" category, then its tables are dropped.
INSERT INTO "SubscriptionCategory" ("name", "sortOrder", "isProtected", "updatedAt")
SELECT 'Panui Tools', COALESCE(MAX("sortOrder"), 0) + 1, false, CURRENT_TIMESTAMP FROM "SubscriptionCategory"
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Subscription" ("title", "category", "url", "description", "createdAt", "updatedAt")
SELECT "title", 'Panui Tools', "url", "description", "createdAt", "updatedAt" FROM "PanuiTool";

DROP TABLE "PanuiTool";
DROP TABLE "PanuiToolCategory";
