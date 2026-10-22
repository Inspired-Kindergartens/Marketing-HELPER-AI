-- Subscriptions: titled links to the services the team subscribes to, grouped by managed categories.
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_category_title_idx" ON "Subscription"("category", "title");

CREATE TABLE IF NOT EXISTS "SubscriptionCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionCategory_name_key" ON "SubscriptionCategory"("name");
CREATE INDEX IF NOT EXISTS "SubscriptionCategory_sortOrder_name_idx" ON "SubscriptionCategory"("sortOrder", "name");

-- The protected fallback every subscription can land in.
INSERT INTO "SubscriptionCategory" ("name", "sortOrder", "isProtected", "updatedAt")
VALUES ('General', 0, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
