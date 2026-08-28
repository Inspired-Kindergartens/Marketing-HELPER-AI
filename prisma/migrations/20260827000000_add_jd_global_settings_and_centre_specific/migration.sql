-- JD settings that apply across every job description, rather than per centre
-- or per title. Single row, id pinned to 1. Holds the "Last Reviewed by"
-- acronym printed in the PDF footer's "Last Updated By" row, which previously
-- rendered blank because nothing ever populated it.
CREATE TABLE IF NOT EXISTS "JdGlobalSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastReviewedByAcronym" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JdGlobalSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "JdGlobalSetting" ("id", "lastReviewedByAcronym", "updatedAt")
VALUES (1, '', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Job types that are not tied to a kindergarten (e.g. office staff). Existing
-- titles are all centre-specific, so the default backfills them correctly.
ALTER TABLE "JdTitleProfile" ADD COLUMN IF NOT EXISTS "isCentreSpecific" BOOLEAN NOT NULL DEFAULT true;
