import type { CentreExtractionBundle } from "../infocare/extraction.js";
import type { ServiceAnalyticsSnapshot, UrgencyBand, WindowScopedCounts } from "../infocare/models.js";
import { WINDOW_OPTIONS } from "./windows.js";
import type { ManualCentreCapacity } from "../storage/analytics-store.js";

type CentreCapacitySource = {
  licensedCapacity: number;
  maxU2?: number;
  maxO2?: number;
  source: "api" | "manual";
};

export type ComputedCentreAnalytics = {
  snapshot: ServiceAnalyticsSnapshot;
  capacitySource: CentreCapacitySource;
};

export type SkippedCentreAnalytics = {
  centreKey: number;
  serviceName: string;
  reason: "missing_capacity" | "invalid_capacity";
};

export type AnalyticsComputationResult = {
  snapshots: ServiceAnalyticsSnapshot[];
  computed: ComputedCentreAnalytics[];
  skipped: SkippedCentreAnalytics[];
};

const MAX_URGENCY_SCORE = 100;
const FULL_TIME_WEEKLY_MINUTES = 50 * 60;

function clampRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function calculateAverageBookedChildrenPerDay(
  bookingDatesByChildKey: CentreExtractionBundle["bookingDatesByChildKey"],
) {
  const bookedDates = new Set<string>();
  let bookedChildDays = 0;

  for (const dates of Object.values(bookingDatesByChildKey)) {
    for (const date of dates) {
      bookedDates.add(date);
      bookedChildDays += 1;
    }
  }

  if (bookedDates.size === 0) {
    return 0;
  }

  return Number((bookedChildDays / bookedDates.size).toFixed(2));
}

function calculateAgeInYears(birthDate: string, referenceDate: Date) {
  const birth = new Date(birthDate);

  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  const diffMs = referenceDate.getTime() - birth.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  return days / 365.2425;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);

  return next;
}

function calculateAgeInDays(dateValue: string, referenceDate: Date) {
  const value = new Date(dateValue);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const diffMs = referenceDate.getTime() - value.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(days)) {
    return null;
  }

  return Math.max(0, Math.floor(days));
}

function getWaitlistAgeDate(child: CentreExtractionBundle["waitingListChildren"][number]) {
  const source = child as CentreExtractionBundle["waitingListChildren"][number] & {
    application_date?: string | null;
  };

  return source.application_date ?? child.starting_date;
}

function isUnder2AtReferenceDate(birthDate: string, referenceDate: Date) {
  const age = calculateAgeInYears(birthDate, referenceDate);

  return age !== null && age < 2;
}

function willTurnFiveThisCalendarYear(birthDate: string, referenceDate: Date) {
  const birth = new Date(birthDate);

  if (Number.isNaN(birth.getTime())) {
    return false;
  }

  return birth.getUTCFullYear() + 5 === referenceDate.getUTCFullYear();
}

function buildEmptyWindowScopedCounts(): WindowScopedCounts {
  return {
    "1W": 0,
    "2W": 0,
    "3W": 0,
    "1M": 0,
    "2M": 0,
    "3M": 0,
    "6M": 0,
    "12M": 0,
  };
}

function calculateKnownLeavingCountsByWindow(
  children: readonly CentreExtractionBundle["enrolledChildren"][number][],
  referenceDate: Date,
) {
  const counts = buildEmptyWindowScopedCounts();

  for (const child of children) {
    if (!child.leaving_date) {
      continue;
    }

    const leavingDate = new Date(child.leaving_date);

    if (Number.isNaN(leavingDate.getTime()) || leavingDate < referenceDate) {
      continue;
    }

    for (const option of WINDOW_OPTIONS) {
      if (leavingDate <= addDays(referenceDate, option.days)) {
        counts[option.key] += 1;
      }
    }
  }

  return counts;
}

function calculateApproachingFiveCountsByWindow(
  children: readonly CentreExtractionBundle["enrolledChildren"][number][],
  referenceDate: Date,
) {
  const counts = buildEmptyWindowScopedCounts();

  for (const child of children) {
    if (!child.birth_date) {
      continue;
    }

    const birthDate = new Date(child.birth_date);

    if (Number.isNaN(birthDate.getTime())) {
      continue;
    }

    const fifthBirthday = new Date(birthDate);
    fifthBirthday.setUTCFullYear(fifthBirthday.getUTCFullYear() + 5);

    if (fifthBirthday < referenceDate) {
      continue;
    }

    for (const option of WINDOW_OPTIONS) {
      if (fifthBirthday <= addDays(referenceDate, option.days)) {
        counts[option.key] += 1;
      }
    }
  }

  return counts;
}

export function determineUrgencyBand(urgencyScore: number): UrgencyBand {
  if (urgencyScore >= 75) {
    return "Critical";
  }

  if (urgencyScore >= 50) {
    return "High";
  }

  if (urgencyScore >= 25) {
    return "Moderate";
  }

  return "Stable";
}

function calculateScaledUrgencyScore(rankIndex: number, total: number) {
  if (total <= 1) {
    return MAX_URGENCY_SCORE;
  }

  const percentile = (total - 1 - rankIndex) / (total - 1);

  return Math.round(percentile * MAX_URGENCY_SCORE);
}

function resolveLicensedCapacity(
  bundle: CentreExtractionBundle,
  manualCapacityMap: Map<number, ManualCentreCapacity>,
): CentreCapacitySource | null {
  const firstLicense = bundle.licenses[0];

  if (firstLicense?.max_children && firstLicense.max_children > 0) {
    return {
      licensedCapacity: firstLicense.max_children,
      maxU2: firstLicense.max_u2,
      maxO2: firstLicense.max_o2,
      source: "api",
    };
  }

  const manualCapacity = manualCapacityMap.get(bundle.centre.centreKey);

  if (!manualCapacity) {
    return null;
  }

  return {
    licensedCapacity: manualCapacity.licensedCapacity,
    maxU2: manualCapacity.maxU2,
    maxO2: manualCapacity.maxO2,
    source: "manual",
  };
}

export function computeServiceAnalyticsSnapshot(
  bundle: CentreExtractionBundle,
  licensedCapacity: number,
  capacitySource?: CentreCapacitySource | null,
  referenceDate: Date = new Date(),
): ServiceAnalyticsSnapshot {
  const enrolledCount = bundle.enrolledChildren.length;
  const enrolledFteCount = Number(
    (
      bundle.enrolledChildren.reduce(
        (sum, child) => sum + (bundle.bookingMinutesByChildKey[child.child_key] ?? 0),
        0,
      ) / FULL_TIME_WEEKLY_MINUTES
    ).toFixed(2),
  );
  const bookedAverageDailyCount = calculateAverageBookedChildrenPerDay(
    bundle.bookingDatesByChildKey,
  );
  const bookedUtilisationRatio = clampRatio(bookedAverageDailyCount / licensedCapacity);
  let enrolledUnder2Count = 0;
  let enrolledOver2Count = 0;

  for (const child of bundle.enrolledChildren) {
    if (!child.birth_date) {
      continue;
    }

    const age = calculateAgeInYears(child.birth_date, referenceDate);

    if (age === null) {
      continue;
    }

    if (age < 2) {
      enrolledUnder2Count += 1;
      continue;
    }

    if (age >= 2) {
      enrolledOver2Count += 1;
    }
  }
  const waitlistCount = bundle.waitingListChildren.length;
  let waitlistUnder5Count = 0;
  let waitlistTurning5ThisYearCount = 0;
  let waitlistAged5PlusCount = 0;
  let waitlistUnknownAgeCount = 0;

  for (const child of bundle.waitingListChildren) {
    if (!child.birth_date) {
      waitlistUnknownAgeCount += 1;
      continue;
    }

    const age = calculateAgeInYears(child.birth_date, referenceDate);

    if (age === null) {
      waitlistUnknownAgeCount += 1;
      continue;
    }

    if (age >= 5) {
      waitlistAged5PlusCount += 1;
      continue;
    }

    if (willTurnFiveThisCalendarYear(child.birth_date, referenceDate)) {
      waitlistTurning5ThisYearCount += 1;
      continue;
    }

    waitlistUnder5Count += 1;
  }

  const waitlistEntryAges = bundle.waitingListChildren
    .map((child) => {
      const waitlistAgeDate = getWaitlistAgeDate(child);

      if (!waitlistAgeDate) {
        return null;
      }

      return calculateAgeInDays(waitlistAgeDate, referenceDate);
    })
    .filter((days): days is number => days !== null);
  const waitlistOldestEntryDays =
    waitlistEntryAges.length > 0 ? Math.max(...waitlistEntryAges) : null;
  const waitlistAverageEntryDays =
    waitlistEntryAges.length > 0
      ? Number(
          (
            waitlistEntryAges.reduce((sum, days) => sum + days, 0) /
            waitlistEntryAges.length
          ).toFixed(2),
        )
      : null;
  const knownLeavingCountsByWindow = calculateKnownLeavingCountsByWindow(
    bundle.enrolledChildren,
    referenceDate,
  );
  const knownLeavingCount = knownLeavingCountsByWindow["3M"];
  const agedOutCount = bundle.enrolledChildren.filter((child) => {
    if (!child.birth_date) {
      return false;
    }

    const age = calculateAgeInYears(child.birth_date, referenceDate);

    return age !== null && age >= 5;
  }).length;
  const approachingFiveCountsByWindow = calculateApproachingFiveCountsByWindow(
    bundle.enrolledChildren,
    referenceDate,
  );
  const approachingFiveCount = approachingFiveCountsByWindow["3M"];
  const replacementPressure = knownLeavingCount + agedOutCount + approachingFiveCount;
  const enrolmentRatio = clampRatio(enrolledCount / licensedCapacity);
  const availablePlaces = Math.max(licensedCapacity - enrolledCount, 0);
  const waitlistCoverRatio = waitlistCount / Math.max(replacementPressure, 1);
  const dualAgeRangeBonus =
    (capacitySource?.maxU2 ?? 0) > 0 && (capacitySource?.maxO2 ?? 0) > 0 ? 8 : 0;
  const urgencyScore =
    availablePlaces * 5 +
    waitlistCount * 7 +
    replacementPressure * 6 +
    (waitlistCoverRatio < 1 ? 12 : 0) +
    dualAgeRangeBonus;

  return {
    centreKey: bundle.centre.centreKey,
    serviceName: bundle.centre.name,
    date: referenceDate.toISOString().slice(0, 10),
    enrolledCount,
    enrolledFteCount,
    bookedAverageDailyCount,
    bookedUtilisationRatio,
    enrolledUnder2Count,
    enrolledOver2Count,
    licensedCapacity,
    licensedUnder2Capacity: capacitySource?.maxU2 ?? null,
    licensedOver2Capacity: capacitySource?.maxO2 ?? null,
    enrolmentRatio,
    waitlistCount,
    waitlistUnder5Count,
    waitlistTurning5ThisYearCount,
    waitlistAged5PlusCount,
    waitlistUnknownAgeCount,
    waitlistOldestEntryDays,
    waitlistAverageEntryDays,
    knownLeavingCount,
    knownLeavingCountsByWindow,
    agedOutCount,
    approachingFiveCount,
    approachingFiveCountsByWindow,
    replacementPressure,
    waitlistCoverRatio,
    urgencyScore,
    urgencyBand: determineUrgencyBand(urgencyScore),
  };
}

export function computeAnalyticsSnapshots(
  bundles: readonly CentreExtractionBundle[],
  manualCapacities: readonly ManualCentreCapacity[],
  referenceDate: Date = new Date(),
): AnalyticsComputationResult {
  const manualCapacityMap = new Map(
    manualCapacities.map((capacity) => [capacity.centreKey, capacity]),
  );
  const computed: ComputedCentreAnalytics[] = [];
  const skipped: SkippedCentreAnalytics[] = [];

  for (const bundle of bundles) {
    const capacity = resolveLicensedCapacity(bundle, manualCapacityMap);

    if (!capacity) {
      skipped.push({
        centreKey: bundle.centre.centreKey,
        serviceName: bundle.centre.name,
        reason: "missing_capacity",
      });
      continue;
    }

    if (capacity.licensedCapacity <= 0) {
      skipped.push({
        centreKey: bundle.centre.centreKey,
        serviceName: bundle.centre.name,
        reason: "invalid_capacity",
      });
      continue;
    }

    computed.push({
      snapshot: computeServiceAnalyticsSnapshot(
        bundle,
        capacity.licensedCapacity,
        capacity,
        referenceDate,
      ),
      capacitySource: capacity,
    });
  }

  computed.sort(
    (left, right) =>
      right.snapshot.urgencyScore - left.snapshot.urgencyScore ||
      left.snapshot.serviceName.localeCompare(right.snapshot.serviceName),
  );

  const totalSnapshots = computed.length;

  for (const [index, entry] of computed.entries()) {
    const scaledUrgencyScore = calculateScaledUrgencyScore(index, totalSnapshots);

    entry.snapshot.urgencyScore = scaledUrgencyScore;
    entry.snapshot.urgencyBand = determineUrgencyBand(scaledUrgencyScore);
  }

  return {
    snapshots: computed.map((entry) => entry.snapshot),
    computed,
    skipped,
  };
}
