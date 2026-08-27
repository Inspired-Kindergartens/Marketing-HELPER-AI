-- Urgency is a derived value: it is a pure function of the facts already on
-- this row (capacity, enrolments, leavers per window, waitlist) plus the time
-- window selected in the UI. Storing it froze the score at write time, so the
-- window filter could not re-rank, formula changes needed a full Infocare
-- refresh to take effect, and a centre with no snapshot row vanished entirely.
-- It is now computed at read time instead.
DROP INDEX IF EXISTS "ServiceAnalyticsSnapshot_runId_urgencyScore_idx";
ALTER TABLE "ServiceAnalyticsSnapshot" DROP COLUMN IF EXISTS "urgencyScore";
ALTER TABLE "ServiceAnalyticsSnapshot" DROP COLUMN IF EXISTS "urgencyBand";
