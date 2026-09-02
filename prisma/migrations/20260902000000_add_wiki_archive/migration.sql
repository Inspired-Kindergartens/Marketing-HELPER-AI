-- Archiving hides an article from the wiki list and from AI grounding without
-- destroying it, so retiring an article is reversible where deleting is not.
ALTER TABLE "WikiArticle" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WikiArticle_isArchived_idx" ON "WikiArticle"("isArchived");
