// Meta advert reviews: after a kindergarten's Meta advert run ends, compare
// its % full roll (against the other kindergartens over the same months) and
// its waitlist before and after the run, and record a verdict. A centre's
// reviews over time decide whether it responds well to Meta adverts.
//
// The unit is an "advert run": the centre's ad sets merged where they overlap
// or nearly touch, because the Enrolment campaign runs one ad set per centre
// and a centre's overlapping ad sets cannot be measured apart.

import {
  addMonths,
  formatMonthLabel,
  GOOD_PERCENT,
  monthKey,
  resolveCapacityForMonth,
  STEADY_POINTS,
  type OperatingCapacity,
} from "./enrolment-quality.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Ad sets for staff recruitment, surveys or home-based care are not
// kindergarten enrolment adverts, so they are not reviewed.
export const NON_ENROLMENT_ADVERT_PATTERN = /recruit|teacher|educator|\bjobs?\b|survey|home\s*-?\s*based|homebased/i;
// Ad sets this close together count as one run.
export const RUN_MERGE_GAP_DAYS = 14;
// Shorter runs are one-off event posts; longer ones span too many other
// changes to credit the advert.
export const MIN_RUN_DAYS = 7;
export const MAX_RUN_DAYS = 183;
// Enquiries take weeks to reach the waitlist or the roll.
export const SETTLE_DAYS = 28;
// The "before" waitlist must be close to the start; the "after" one is taken
// between 2 and 6 weeks after the run.
export const WAITLIST_BEFORE_MAX_DAYS = 21;
export const WAITLIST_AFTER_MIN_DAYS = 14;
export const WAITLIST_AFTER_MAX_DAYS = 42;
// A waitlist change of this many children counts as a response.
export const WAITLIST_RESPONSE_CHILDREN = 2;

export type AdvertAdSet = {
  metaAdSetId: string;
  name: string;
  campaignName: string | null;
  centreKey: number;
  startTime: Date | null;
  endTime: Date | null;
};

// Daily campaign delivery for one ad set, newest Meta pull per day.
export type AdvertDeliveryDay = {
  metaAdSetId: string;
  date: Date;
  spend: number;
  clicks: number;
};

export type AdvertRun = {
  reviewId: string;
  centreKey: number;
  adSetNames: string[];
  start: Date;
  end: Date;
  spend: number | null;
  clicks: number | null;
  // Still running (or its delivery data stops only because Meta has not been
  // pulled since), so it cannot be reviewed yet.
  ongoing: boolean;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function advertReviewId(centreKey: number, start: Date) {
  return `meta-advert-review:${centreKey}:${isoDate(start)}`;
}

// Turns ad sets into reviewable runs. Where Meta delivery data covers an ad
// set's dates, the run is the days it actually spent (an ad set that never
// spent is dropped); before that data starts, the ad set's own dates are used.
export function buildAdvertRuns(input: {
  adSets: readonly AdvertAdSet[];
  delivery: readonly AdvertDeliveryDay[];
  deliveryCoverageStart: Date | null;
  deliveryCoverageEnd: Date | null;
  now: Date;
}): AdvertRun[] {
  const deliveryByAdSet = new Map<string, AdvertDeliveryDay[]>();
  for (const day of input.delivery) {
    const list = deliveryByAdSet.get(day.metaAdSetId) ?? [];
    list.push(day);
    deliveryByAdSet.set(day.metaAdSetId, list);
  }

  type Span = { centreKey: number; name: string; start: Date; end: Date; spend: number | null; clicks: number | null; ongoing: boolean };
  const spans: Span[] = [];

  for (const adSet of input.adSets) {
    if (NON_ENROLMENT_ADVERT_PATTERN.test(adSet.name) || NON_ENROLMENT_ADVERT_PATTERN.test(adSet.campaignName ?? "")) continue;
    if (!adSet.startTime) continue;

    const spent = (deliveryByAdSet.get(adSet.metaAdSetId) ?? []).filter((day) => day.spend > 0);
    const plannedEnd = adSet.endTime ?? null;
    const coveredByDelivery =
      input.deliveryCoverageStart != null && (plannedEnd == null || plannedEnd >= input.deliveryCoverageStart);

    if (spent.length > 0) {
      const firstSpend = Math.min(...spent.map((day) => day.date.getTime()));
      const lastSpend = Math.max(...spent.map((day) => day.date.getTime()));
      // Spend before the delivery data starts is unknown, so an ad set that
      // was already spending then keeps its own start date.
      const startedBeforeData =
        input.deliveryCoverageStart != null &&
        adSet.startTime < input.deliveryCoverageStart &&
        firstSpend <= input.deliveryCoverageStart.getTime() + 3 * DAY_MS;
      const plannedToRunOn = plannedEnd == null || plannedEnd > input.now;
      const spendingAtLastPull =
        input.deliveryCoverageEnd != null && lastSpend >= input.deliveryCoverageEnd.getTime() - 3 * DAY_MS;
      spans.push({
        centreKey: adSet.centreKey,
        name: adSet.name,
        start: startOfDay(startedBeforeData ? adSet.startTime : new Date(firstSpend)),
        end: startOfDay(new Date(lastSpend)),
        spend: spent.reduce((sum, day) => sum + day.spend, 0),
        clicks: spent.reduce((sum, day) => sum + day.clicks, 0),
        ongoing: plannedToRunOn && spendingAtLastPull,
      });
      continue;
    }

    // Delivery data covers it and it never spent: it did not run.
    if (coveredByDelivery) continue;
    if (!plannedEnd) continue;
    spans.push({
      centreKey: adSet.centreKey,
      name: adSet.name,
      start: startOfDay(adSet.startTime),
      end: startOfDay(new Date(Math.min(plannedEnd.getTime(), input.now.getTime()))),
      spend: null,
      clicks: null,
      ongoing: plannedEnd > input.now,
    });
  }

  const runs: AdvertRun[] = [];
  const byCentre = new Map<number, Span[]>();
  for (const span of spans) {
    const list = byCentre.get(span.centreKey) ?? [];
    list.push(span);
    byCentre.set(span.centreKey, list);
  }

  for (const [centreKey, centreSpans] of byCentre) {
    centreSpans.sort((a, b) => a.start.getTime() - b.start.getTime());
    let current: Span & { names: string[] } | null = null;
    const flush = () => {
      if (!current) return;
      const days = (current.end.getTime() - current.start.getTime()) / DAY_MS + 1;
      // A run still going is kept whatever its length so far.
      if ((current.ongoing || days >= MIN_RUN_DAYS) && days <= MAX_RUN_DAYS) {
        runs.push({
          reviewId: advertReviewId(centreKey, current.start),
          centreKey,
          adSetNames: [...new Set(current.names)],
          start: current.start,
          end: current.end,
          spend: current.spend,
          clicks: current.clicks,
          ongoing: current.ongoing,
        });
      }
    };

    for (const span of centreSpans) {
      if (current && span.start.getTime() <= current.end.getTime() + RUN_MERGE_GAP_DAYS * DAY_MS) {
        current.end = new Date(Math.max(current.end.getTime(), span.end.getTime()));
        current.names.push(span.name);
        current.spend = current.spend == null && span.spend == null ? null : (current.spend ?? 0) + (span.spend ?? 0);
        current.clicks = current.clicks == null && span.clicks == null ? null : (current.clicks ?? 0) + (span.clicks ?? 0);
        current.ongoing = current.ongoing || span.ongoing;
      } else {
        flush();
        current = { ...span, names: [span.name] };
      }
    }
    flush();
  }

  return runs.sort((a, b) => a.start.getTime() - b.start.getTime() || a.centreKey - b.centreKey);
}

export type RollMonthRecord = {
  centreKey: number;
  month: string;
  openDays: number;
  avgPlacements: number;
  avgLicence: number;
  avgLicenceU2: number;
  complete: boolean;
};

export type WaitlistPoint = { centreKey: number; date: Date; waitlistCount: number };

export type AdvertVerdict = "well" | "not-well" | "mixed" | "held-full";

export type AdvertReview = {
  reviewId: string;
  centreKey: number;
  adSetNames: string[];
  start: Date;
  end: Date;
  measuredAt: Date;
  spend: number | null;
  clicks: number | null;
  rollBeforeMonth: string | null;
  rollBefore: number | null;
  rollAfterMonth: string | null;
  rollAfter: number | null;
  networkChange: number | null;
  waitlistBeforeAt: Date | null;
  waitlistBefore: number | null;
  waitlistAfterAt: Date | null;
  waitlistAfter: number | null;
  verdict: AdvertVerdict;
};

// The month before the run started against the month after it ended.
export function advertRollMonths(run: Pick<AdvertRun, "start" | "end">) {
  return { before: addMonths(monthKey(run.start), -1), after: addMonths(monthKey(run.end), 1) };
}

// When a run can be judged: the settle period has passed, the "after" month
// is over (plus a week for the roll to be fetched) and the latest waitlist
// window has closed.
export function advertReviewDueAt(run: Pick<AdvertRun, "start" | "end">) {
  const { after } = advertRollMonths(run);
  const [year, month] = after.split("-").map(Number) as [number, number];
  const afterMonthOver = new Date(year, month, 1 + 7);
  const waitlistWindowClosed = new Date(run.end.getTime() + WAITLIST_AFTER_MAX_DAYS * DAY_MS);
  const settled = new Date(run.end.getTime() + SETTLE_DAYS * DAY_MS);
  return new Date(Math.max(afterMonthOver.getTime(), waitlistWindowClosed.getTime(), settled.getTime()));
}

function percentFull(record: RollMonthRecord | undefined, capacities: readonly OperatingCapacity[]) {
  if (!record || record.openDays <= 0) return null;
  const capacity = resolveCapacityForMonth(record.month, record.avgLicence, capacities, record.avgLicenceU2);
  return capacity ? { percent: (record.avgPlacements / capacity.capacity) * 100, placements: record.avgPlacements, capacity: capacity.capacity } : null;
}

// Judges one run. Returns null when it is not due yet, or when neither the
// roll nor the waitlist can be compared (the data may still arrive).
export function assessAdvertRun(
  run: AdvertRun,
  data: {
    rolls: readonly RollMonthRecord[];
    capacities: readonly OperatingCapacity[];
    waitlist: readonly WaitlistPoint[];
    now: Date;
  },
): AdvertReview | null {
  if (run.ongoing) return null;
  const dueAt = advertReviewDueAt(run);
  if (data.now < dueAt) return null;

  const { before, after } = advertRollMonths(run);
  const rollsAt = (centreKey: number, month: string) =>
    data.rolls.find((row) => row.centreKey === centreKey && row.month === month && row.complete);
  const capacitiesFor = (centreKey: number) => data.capacities.filter((entry) => entry.centreKey === centreKey);

  const rollBefore = percentFull(rollsAt(run.centreKey, before), capacitiesFor(run.centreKey));
  const rollAfter = percentFull(rollsAt(run.centreKey, after), capacitiesFor(run.centreKey));

  // The other kindergartens with both months, added up like the
  // "All kindergartens" row.
  const otherKeys = [...new Set(data.rolls.map((row) => row.centreKey))].filter((key) => key !== run.centreKey);
  let placementsBefore = 0;
  let capacityBefore = 0;
  let placementsAfter = 0;
  let capacityAfter = 0;
  for (const key of otherKeys) {
    const b = percentFull(rollsAt(key, before), capacitiesFor(key));
    const a = percentFull(rollsAt(key, after), capacitiesFor(key));
    if (!b || !a) continue;
    placementsBefore += b.placements;
    capacityBefore += b.capacity;
    placementsAfter += a.placements;
    capacityAfter += a.capacity;
  }
  const networkChange =
    capacityBefore > 0 && capacityAfter > 0
      ? (placementsAfter / capacityAfter) * 100 - (placementsBefore / capacityBefore) * 100
      : null;

  const centreWaitlist = data.waitlist
    .filter((point) => point.centreKey === run.centreKey)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const waitlistBefore = [...centreWaitlist]
    .reverse()
    .find((point) => point.date <= run.start && point.date.getTime() >= run.start.getTime() - WAITLIST_BEFORE_MAX_DAYS * DAY_MS) ?? null;
  const target = run.end.getTime() + SETTLE_DAYS * DAY_MS;
  const waitlistAfter =
    centreWaitlist
      .filter(
        (point) =>
          point.date.getTime() >= run.end.getTime() + WAITLIST_AFTER_MIN_DAYS * DAY_MS &&
          point.date.getTime() <= run.end.getTime() + WAITLIST_AFTER_MAX_DAYS * DAY_MS,
      )
      .sort((a, b) => Math.abs(a.date.getTime() - target) - Math.abs(b.date.getTime() - target))[0] ?? null;

  const rollLift =
    rollBefore && rollAfter ? rollAfter.percent - rollBefore.percent - (networkChange ?? 0) : null;
  const waitlistChange =
    waitlistBefore && waitlistAfter ? waitlistAfter.waitlistCount - waitlistBefore.waitlistCount : null;

  if (rollLift == null && waitlistChange == null) return null;

  return {
    reviewId: run.reviewId,
    centreKey: run.centreKey,
    adSetNames: run.adSetNames,
    start: run.start,
    end: run.end,
    measuredAt: dueAt,
    spend: run.spend,
    clicks: run.clicks,
    rollBeforeMonth: rollBefore ? before : null,
    rollBefore: rollBefore?.percent ?? null,
    rollAfterMonth: rollAfter ? after : null,
    rollAfter: rollAfter?.percent ?? null,
    networkChange: rollBefore && rollAfter ? networkChange : null,
    waitlistBeforeAt: waitlistBefore?.date ?? null,
    waitlistBefore: waitlistBefore?.waitlistCount ?? null,
    waitlistAfterAt: waitlistAfter?.date ?? null,
    waitlistAfter: waitlistAfter?.waitlistCount ?? null,
    verdict: advertVerdict(rollLift, waitlistChange, {
      rollBefore: rollBefore?.percent ?? null,
      rollAfter: rollAfter?.percent ?? null,
    }),
  };
}

// The roll rising more than the other kindergartens' (by the same 3 points
// Enrolment Quality calls a real change) counts most. A growing waitlist
// counts when the roll held; a falling waitlist alone is not held against the
// advert, because enrolling children leave the waitlist. A centre that was
// already full and stayed full had no room to show a response, so that run
// is "held full" and does not count either way.
export function advertVerdict(
  rollLift: number | null,
  waitlistChange: number | null,
  roll: { rollBefore: number | null; rollAfter: number | null } = { rollBefore: null, rollAfter: null },
): AdvertVerdict {
  const rollScore = rollLift == null ? 0 : rollLift >= STEADY_POINTS ? 1 : rollLift <= -STEADY_POINTS ? -1 : 0;
  const waitlistScore =
    waitlistChange == null ? 0 : waitlistChange >= WAITLIST_RESPONSE_CHILDREN ? 1 : waitlistChange <= -WAITLIST_RESPONSE_CHILDREN ? -1 : 0;
  if (rollScore > 0) return "well";
  if (waitlistScore > 0) return rollScore < 0 ? "mixed" : "well";
  if (
    rollScore === 0 &&
    roll.rollBefore != null &&
    roll.rollAfter != null &&
    roll.rollBefore >= GOOD_PERCENT &&
    roll.rollAfter >= GOOD_PERCENT
  ) {
    return "held-full";
  }
  return "not-well";
}

// Verdicts that say something about how the centre responds to adverts.
export function countsTowardsResponse(verdict: AdvertVerdict) {
  return verdict !== "held-full";
}

export const ADVERT_VERDICT_WORDS: Record<AdvertVerdict, string> = {
  well: "responded well",
  "not-well": "did not respond well",
  mixed: "mixed response",
  "held-full": "already full, no room to respond",
};

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function formatPoints(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : "±"}${Math.abs(rounded)} ${Math.abs(rounded) === 1 ? "pt" : "pts"}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

// The note stored against the centre (plain text, shown in Notes and read by
// Beep Beep).
export function formatAdvertReviewNote(review: AdvertReview): string {
  const parts: string[] = [];
  const delivery = [
    review.spend != null ? `${formatMoney(review.spend)} spend` : null,
    review.clicks != null ? `${review.clicks.toLocaleString("en-NZ")} link clicks` : null,
  ].filter(Boolean);
  parts.push(
    `Meta advert ${formatShortDate(review.start)} – ${formatShortDate(review.end)} (${review.adSetNames.join(", ")}${delivery.length ? `; ${delivery.join(", ")}` : ""}).`,
  );

  if (review.rollBefore != null && review.rollAfter != null && review.rollBeforeMonth && review.rollAfterMonth) {
    // Shown from the rounded figures so the sentence adds up.
    const change = Math.round(review.rollAfter) - Math.round(review.rollBefore);
    const network =
      review.networkChange == null
        ? ""
        : `; other kindergartens ${formatPoints(review.networkChange)}, so ${formatPoints(change - Math.round(review.networkChange))} against them`;
    parts.push(
      `% full roll ${Math.round(review.rollBefore)}% (${formatMonthLabel(review.rollBeforeMonth)}) → ${Math.round(review.rollAfter)}% (${formatMonthLabel(review.rollAfterMonth)}), ${formatPoints(change)}${network}.`,
    );
  } else {
    parts.push("% full roll not available for the months either side.");
  }

  if (review.waitlistBefore != null && review.waitlistAfter != null && review.waitlistBeforeAt && review.waitlistAfterAt) {
    const change = review.waitlistAfter - review.waitlistBefore;
    parts.push(
      `Waitlist ${review.waitlistBefore} → ${review.waitlistAfter} (${change > 0 ? "+" : ""}${change}) from ${formatShortDate(review.waitlistBeforeAt)} to ${formatShortDate(review.waitlistAfterAt)}.`,
    );
  } else {
    parts.push("No waitlist snapshot either side of the advert.");
  }

  parts.push(`Verdict: ${ADVERT_VERDICT_WORDS[review.verdict]}.`);
  return parts.join(" ");
}

// --- A centre's response over time -------------------------------------------

export type MetaResponseLevel = "well" | "not-well" | "mixed" | "early";

export type MetaResponseSummary = {
  centreKey: number;
  level: MetaResponseLevel;
  reviewed: number;
  respondedWell: number;
  averageRollLift: number | null;
  latest: AdvertReview;
};

// Needs this many reviewed runs before declaring a pattern.
export const MIN_REVIEWS_FOR_PATTERN = 2;

export function summariseMetaResponse(reviews: readonly AdvertReview[]): MetaResponseSummary | null {
  const sorted = reviews
    .filter((review) => countsTowardsResponse(review.verdict))
    .sort((a, b) => a.end.getTime() - b.end.getTime());
  if (sorted.length === 0) return null;
  const respondedWell = sorted.filter((review) => review.verdict === "well").length;
  const lifts = sorted
    .filter((review) => review.rollBefore != null && review.rollAfter != null)
    .map((review) => review.rollAfter! - review.rollBefore! - (review.networkChange ?? 0));
  const share = respondedWell / sorted.length;
  const level: MetaResponseLevel =
    sorted.length < MIN_REVIEWS_FOR_PATTERN ? "early" : share >= 2 / 3 ? "well" : share <= 1 / 3 ? "not-well" : "mixed";

  return {
    centreKey: sorted[0]!.centreKey,
    level,
    reviewed: sorted.length,
    respondedWell,
    averageRollLift: lifts.length ? lifts.reduce((sum, value) => sum + value, 0) / lifts.length : null,
    latest: sorted[sorted.length - 1]!,
  };
}

export function summariseMetaResponseByCentre(reviews: readonly AdvertReview[]): Map<number, MetaResponseSummary> {
  const byCentre = new Map<number, AdvertReview[]>();
  for (const review of reviews) {
    const list = byCentre.get(review.centreKey) ?? [];
    list.push(review);
    byCentre.set(review.centreKey, list);
  }
  const summaries = new Map<number, MetaResponseSummary>();
  for (const [centreKey, list] of byCentre) {
    const summary = summariseMetaResponse(list);
    if (summary) summaries.set(centreKey, summary);
  }
  return summaries;
}

// One plain sentence for the centre intro and the AI. `strong` wraps the
// verdict for the HTML intro; the AI gets it without markup.
export function describeMetaResponse(summary: MetaResponseSummary, strong: (text: string) => string = (text) => text): string {
  const lift =
    summary.averageRollLift == null ? "" : `, average roll ${formatPoints(summary.averageRollLift)} against the other kindergartens`;
  const latest = `latest advert (${formatShortDate(summary.latest.start)} – ${formatShortDate(summary.latest.end)}) ${ADVERT_VERDICT_WORDS[summary.latest.verdict]}`;

  if (summary.level === "early") {
    return `Meta adverts: one run reviewed so far, which ${ADVERT_VERDICT_WORDS[summary.latest.verdict]}${lift}; not enough runs yet to call a pattern.`;
  }

  const verdict =
    summary.level === "well"
      ? "responds well to Meta adverts"
      : summary.level === "not-well"
        ? "does not respond well to Meta adverts"
        : "has a mixed response to Meta adverts";
  return `This kindergarten ${strong(verdict)}: ${summary.respondedWell} of ${summary.reviewed} reviewed runs lifted the roll or waitlist${lift}; ${latest}.`;
}

export function buildMetaResponseGrounding(
  summaries: ReadonlyMap<number, MetaResponseSummary>,
  centreNames: ReadonlyMap<number, string>,
  reviews: readonly AdvertReview[],
  options: { centreKeys?: readonly number[] } = {},
): string | null {
  const keys = options.centreKeys?.length ? options.centreKeys.filter((key) => summaries.has(key)) : [...summaries.keys()];
  if (keys.length === 0) return null;

  const lines = [
    "Meta advert reviews (each run's % full roll against the other kindergartens and waitlist change, measured after the advert ended). Use these to say whether a kindergarten responds well to Meta adverts before recommending more spend:",
  ];
  for (const key of keys) {
    const summary = summaries.get(key)!;
    lines.push(`- ${centreNames.get(key) ?? `Centre ${key}`}: ${describeMetaResponse(summary)}`);
    if (options.centreKeys?.length) {
      for (const review of reviews.filter((entry) => entry.centreKey === key).slice(-5)) {
        lines.push(`  - ${formatAdvertReviewNote(review)}`);
      }
    }
  }
  return lines.join("\n");
}
