-- Enrolment Quality: a centre's first am / pm places figure has no From month;
-- it covers the whole history. Store it with the 2000-01 marker (earlier than
-- any roll history) so a later figure always takes over from its own month.
-- Calculations are unchanged: the earliest figure already covered the months
-- before it.
UPDATE "CentreOperatingCapacity" AS c
SET "effectiveFrom" = '2000-01'
WHERE c."effectiveFrom" = (
  SELECT MIN(o."effectiveFrom") FROM "CentreOperatingCapacity" AS o WHERE o."centreKey" = c."centreKey"
)
AND c."effectiveFrom" > '2000-01';
