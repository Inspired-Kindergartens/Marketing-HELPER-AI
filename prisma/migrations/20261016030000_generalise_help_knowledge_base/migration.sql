-- The Mailchimp help tables become one knowledge base for every help source
-- (Mailchimp, Google Analytics, Infocare, Meta). Existing rows are Mailchimp.
ALTER TABLE "MailchimpHelpArticle" RENAME TO "HelpArticle";
ALTER TABLE "HelpArticle" RENAME CONSTRAINT "MailchimpHelpArticle_pkey" TO "HelpArticle_pkey";
ALTER INDEX "MailchimpHelpArticle_url_key" RENAME TO "HelpArticle_url_key";
ALTER SEQUENCE "MailchimpHelpArticle_id_seq" RENAME TO "HelpArticle_id_seq";

ALTER TABLE "HelpArticle" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'mailchimp';
ALTER TABLE "HelpArticle" ALTER COLUMN "source" DROP DEFAULT;
CREATE INDEX "HelpArticle_source_idx" ON "HelpArticle"("source");

ALTER TABLE "MailchimpHelpChunk" RENAME TO "HelpChunk";
ALTER TABLE "HelpChunk" RENAME CONSTRAINT "MailchimpHelpChunk_pkey" TO "HelpChunk_pkey";
ALTER TABLE "HelpChunk" RENAME CONSTRAINT "MailchimpHelpChunk_articleId_fkey" TO "HelpChunk_articleId_fkey";
ALTER INDEX "MailchimpHelpChunk_articleId_ordinal_idx" RENAME TO "HelpChunk_articleId_ordinal_idx";
ALTER INDEX "MailchimpHelpChunk_searchVector_idx" RENAME TO "HelpChunk_searchVector_idx";
ALTER SEQUENCE "MailchimpHelpChunk_id_seq" RENAME TO "HelpChunk_id_seq";

-- The completed-sync marker is now per source.
UPDATE "SyncCursor" SET "key" = 'help-kb:mailchimp:completed-at' WHERE "key" = 'mailchimp-help:completed-at';
