DROP INDEX IF EXISTS "MailchimpCampaign_centreKey_sendTime_idx";

ALTER TABLE "MailchimpCampaign"
DROP CONSTRAINT IF EXISTS "MailchimpCampaign_centreKey_fkey",
DROP COLUMN IF EXISTS "centreKey";
