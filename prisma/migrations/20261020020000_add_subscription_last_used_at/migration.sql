-- When a link was last opened, copied, added or edited: the Links page opens
-- that link's category and collapses the rest.
ALTER TABLE "Subscription" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
