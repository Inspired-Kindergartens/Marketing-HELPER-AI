const DATED_WAITLIST_ENTRY_COUNT = 549;
const SHORT_PLUS_TYPICAL_ENTRY_COUNT = 212;

export const SHORT_WAIT_MAX_DAYS = 30;
export const TYPICAL_WAIT_MAX_DAYS = 162;
export const SHORT_PLUS_TYPICAL_SHARE =
  SHORT_PLUS_TYPICAL_ENTRY_COUNT / DATED_WAITLIST_ENTRY_COUNT;

type WaitlistEligibilityInput = {
  waitlistCount: number;
  waitlistUnder2Count?: number;
  licensedUnder2Capacity?: number | null;
};

export function estimateShortPlusTypicalWaitlistCount(waitlistCount: number) {
  if (waitlistCount <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(waitlistCount, Math.round(waitlistCount * SHORT_PLUS_TYPICAL_SHARE)),
  );
}

export function getActionableWaitlistEligibleCount(input: WaitlistEligibilityInput) {
  const waitlistCount = Math.max(0, input.waitlistCount);

  if ((input.licensedUnder2Capacity ?? 0) > 0) {
    return waitlistCount;
  }

  return Math.max(0, waitlistCount - Math.max(0, input.waitlistUnder2Count ?? 0));
}

export function estimateActionableWaitlistCount(input: WaitlistEligibilityInput) {
  return estimateShortPlusTypicalWaitlistCount(getActionableWaitlistEligibleCount(input));
}
