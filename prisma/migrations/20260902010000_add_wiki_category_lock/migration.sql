-- A category the user picked by hand must never be rewritten by the AI tagging
-- pass. This flag is set on any manual category change and never cleared, so
-- the article keeps the filing its owner chose.
ALTER TABLE "WikiArticle" ADD COLUMN "isCategoryLocked" BOOLEAN NOT NULL DEFAULT false;
