-- Meta advert reviews now count the families who applied while each advert
-- ran (enrolled or on the waitlist) against the centre's usual number,
-- instead of % full roll and waitlist totals. The old reviews and the notes
-- they wrote are removed so every advert is reviewed again; notes typed by
-- hand stay, and so does the notification that carries them.
DELETE FROM "MetaRecommendationNote"
WHERE "notificationId" LIKE 'meta-advert-review:%'
  AND "text" LIKE 'Meta advert %'
  AND "text" LIKE '%Verdict:%';

DELETE FROM "MetaRecommendationNotification" AS notification
WHERE notification."notificationId" LIKE 'meta-advert-review:%'
  AND NOT EXISTS (
    SELECT 1 FROM "MetaRecommendationNote" AS note
    WHERE note."notificationId" = notification."notificationId"
  );

DELETE FROM "MetaAdvertReview";

ALTER TABLE "MetaAdvertReview"
  DROP COLUMN "rollBeforeMonth",
  DROP COLUMN "rollBefore",
  DROP COLUMN "rollAfterMonth",
  DROP COLUMN "rollAfter",
  DROP COLUMN "networkChange",
  DROP COLUMN "waitlistBeforeAt",
  DROP COLUMN "waitlistBefore",
  DROP COLUMN "waitlistAfterAt",
  DROP COLUMN "waitlistAfter",
  ADD COLUMN "enrolments" INTEGER NOT NULL,
  ADD COLUMN "waitlisted" INTEGER NOT NULL,
  ADD COLUMN "usualApplications" DOUBLE PRECISION;
