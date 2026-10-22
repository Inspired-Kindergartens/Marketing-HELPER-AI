-- The section id a chunk came from, so chat sources link to the right part of the page.
ALTER TABLE "MailchimpHelpChunk" ADD COLUMN IF NOT EXISTS "anchor" TEXT NOT NULL DEFAULT '';
