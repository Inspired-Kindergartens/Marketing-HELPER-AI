ALTER TABLE "ServiceAnalyticsSnapshot"
ADD COLUMN "replacementPressureCountsByWindow" JSONB NOT NULL DEFAULT '{"1W":0,"2W":0,"3W":0,"1M":0,"2M":0,"3M":0,"6M":0,"12M":0}';

UPDATE "ServiceAnalyticsSnapshot"
SET "replacementPressureCountsByWindow" = jsonb_build_object(
  '1W', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '1W')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '1W')::int, 0),
  '2W', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '2W')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '2W')::int, 0),
  '3W', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '3W')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '3W')::int, 0),
  '1M', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '1M')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '1M')::int, 0),
  '2M', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '2M')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '2M')::int, 0),
  '3M', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '3M')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '3M')::int, 0),
  '6M', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '6M')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '6M')::int, 0),
  '12M', "agedOutCount" + COALESCE(("knownLeavingCountsByWindow" ->> '12M')::int, 0) + COALESCE(("approachingFiveCountsByWindow" ->> '12M')::int, 0)
);
