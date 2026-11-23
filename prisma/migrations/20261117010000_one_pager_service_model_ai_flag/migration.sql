-- Info Sheets: the two service models, and the AI generated flag on photos.

-- Kindergartens ask for donations; the All Day services charge fees and take
-- younger children, so they share their own cost and enrolment text.
ALTER TABLE "OnePager" ADD COLUMN "serviceModel" TEXT NOT NULL DEFAULT 'kindergarten';

UPDATE "OnePager" SET "serviceModel" = 'all-day'
FROM "CentreReference" c
WHERE c."centreKey" = "OnePager"."centreKey" AND c."name" ILIKE '%All Day%';

ALTER TABLE "OnePagerTemplate" ADD COLUMN "allDayCostText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OnePagerTemplate" ADD COLUMN "allDayEnrolText" TEXT NOT NULL DEFAULT '';

UPDATE "OnePagerTemplate" SET
  "allDayCostText" = E'• Our fees are $6.50 per hour\n• 3-5 year olds receive 20 hours free\n• Optional extra charge of $1 per hour\n• One off admin fee of $50 on enrolment\n• Daily and weekly rates available on application\n• WINZ subsidies available',
  "allDayEnrolText" = 'We care for children from 1 year to school age. You are welcome to come and visit, and fill in an enrolment form. Please bring a copy of your child''s birth certificate and immunisation record.';

-- True only for a picture the app got from the AI image model. Every photo
-- already stored was uploaded or imported, so every one starts false.
ALTER TABLE "OnePagerImage" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OnePagerImage" ADD COLUMN "aiPrompt" TEXT NOT NULL DEFAULT '';
