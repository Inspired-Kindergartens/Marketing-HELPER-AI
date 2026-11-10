-- Things To Know articles are now found by the help knowledge base search like
-- any other document, so no article is pinned into every chat any more.
ALTER TABLE "WikiArticle" DROP COLUMN IF EXISTS "isPinned";
