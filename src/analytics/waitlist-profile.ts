const DATED_WAITLIST_ENTRY_COUNT = 549;
const SHORT_PLUS_TYPICAL_ENTRY_COUNT = 212;

export const SHORT_WAIT_MAX_DAYS = 30;
export const TYPICAL_WAIT_MAX_DAYS = 162;
export const SHORT_PLUS_TYPICAL_SHARE =
  SHORT_PLUS_TYPICAL_ENTRY_COUNT / DATED_WAITLIST_ENTRY_COUNT;

export function estimateShortPlusTypicalWaitlistCount(waitlistCount: number) {
  if (waitlistCount <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(waitlistCount, Math.round(waitlistCount * SHORT_PLUS_TYPICAL_SHARE)),
  );
}
