// Meta advert reviews: after a kindergarten's Meta advert run ends, count the
// families who applied while it ran (from Infocare's application_date), split
// into children now enrolled and children still on the waitlist, and compare
// that with how many applications the kindergarten usually gets in the same
// number of days. Clearly more than usual is a spike: the advert did well.
// A centre's reviews over time decide whether it responds well to Meta adverts.
//
// The unit is an "advert run": the centre's ad sets merged where they overlap
// or nearly touch, because the Enrolment campaign runs one ad set per centre
// and a centre's overlapping ad sets cannot be measured apart.

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
// Applications can be entered in Infocare a while after the family applied.
export const SETTLE_DAYS = 14;
// The usual rate comes from the half year before the run, without the days
// other adverts for the centre ran, and needs at least 8 such weeks.
export const USUAL_LOOKBACK_DAYS = 182;
export const USUAL_MIN_QUIET_DAYS = 56;
// A spike: at least half as many applications again as usual, and at least
// two more families.
export const SPIKE_RATIO = 1.5;
export const SPIKE_MIN_EXTRA = 2;

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
      // An ad set reused for a later advert period stops spending in
      // between; each stretch of spending is its own run.
      spent.sort((a, b) => a.date.getTime() - b.date.getTime());
      const stretches: AdvertDeliveryDay[][] = [];
      for (const day of spent) {
        const stretch = stretches.at(-1);
        const lastDay = stretch?.at(-1);
        if (stretch && lastDay && day.date.getTime() <= lastDay.date.getTime() + RUN_MERGE_GAP_DAYS * DAY_MS) {
          stretch.push(day);
        } else {
          stretches.push([day]);
        }
      }
      const plannedToRunOn = plannedEnd == null || plannedEnd > input.now;

      stretches.forEach((stretch, index) => {
        const firstSpend = stretch[0]!.date.getTime();
        const lastSpend = stretch.at(-1)!.date.getTime();
        // Spend before the delivery data starts is unknown, so an ad set that
        // was already spending then keeps its own start date.
        const startedBeforeData =
          index === 0 &&
          input.deliveryCoverageStart != null &&
          adSet.startTime! < input.deliveryCoverageStart &&
          firstSpend <= input.deliveryCoverageStart.getTime() + 3 * DAY_MS;
        const spendingAtLastPull =
          input.deliveryCoverageEnd != null && lastSpend >= input.deliveryCoverageEnd.getTime() - 3 * DAY_MS;
        spans.push({
          centreKey: adSet.centreKey,
          name: adSet.name,
          start: startOfDay(startedBeforeData ? adSet.startTime! : new Date(firstSpend)),
          end: startOfDay(new Date(lastSpend)),
          spend: stretch.reduce((sum, day) => sum + day.spend, 0),
          clicks: stretch.reduce((sum, day) => sum + day.clicks, 0),
          ongoing: index === stretches.length - 1 && plannedToRunOn && spendingAtLastPull,
        });
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

// A stored review is out of date when the runs now covering its days differ
// from it: a reused ad set split into separate runs, or older delivery data
// filled in, which can also give spend to a review made without it. With no
// run on its days, it is out of date only when delivery
// data covers those days (so the advert did not run as reviewed); before the
// data starts it is kept as it is.
export function findOutdatedAdvertReviews<T extends Pick<AdvertReview, "reviewId" | "centreKey" | "start" | "end" | "spend">>(
  reviews: readonly T[],
  runs: readonly AdvertRun[],
  deliveryCoverageStart: Date | null,
): T[] {
  return reviews.filter((review) => {
    const overlapping = runs.filter(
      (run) => run.centreKey === review.centreKey && run.start <= review.end && run.end >= startOfDay(review.start),
    );
    if (overlapping.length === 0) return deliveryCoverageStart != null && review.start >= deliveryCoverageStart;
    return !overlapping.some(
      (run) =>
        run.reviewId === review.reviewId &&
        !run.ongoing &&
        isoDate(run.end) === isoDate(review.end) &&
        (review.spend != null || run.spend == null),
    );
  });
}

// --- Judging a run -------------------------------------------------------------

// A family who applied to the centre, from Infocare's application_date, and
// whether the child has enrolled (now or since left) or is still waiting.
export type Applicant = {
  centreKey: number;
  childKey: number;
  applicationDate: Date;
  enrolled: boolean;
};

export type AdvertVerdict = "well" | "no-spike" | "no-history";

export type AdvertReview = {
  reviewId: string;
  centreKey: number;
  adSetNames: string[];
  start: Date;
  end: Date;
  measuredAt: Date;
  spend: number | null;
  clicks: number | null;
  // Families who applied while the advert ran, by where the child is now.
  enrolments: number;
  waitlisted: number;
  // How many applications the centre usually gets in the same number of days.
  usualApplications: number | null;
  verdict: AdvertVerdict;
};

function daysInclusive(start: Date, end: Date) {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
}

// Applications entered late in Infocare still carry the day the family
// applied, so the run is judged once they have had time to be entered.
export function advertReviewDueAt(run: Pick<AdvertRun, "end">) {
  return new Date(startOfDay(run.end).getTime() + SETTLE_DAYS * DAY_MS);
}

// The centre's usual applications per day over the half year before the run,
// leaving out days its other adverts ran. Null with too few days to tell.
export function usualApplicationsPerDay(
  run: Pick<AdvertRun, "centreKey" | "start">,
  applicants: readonly Applicant[],
  otherRuns: readonly Pick<AdvertRun, "centreKey" | "start" | "end">[],
): number | null {
  const runStart = startOfDay(run.start).getTime();
  const from = runStart - USUAL_LOOKBACK_DAYS * DAY_MS;
  const advertDays = otherRuns.filter((other) => other.centreKey === run.centreKey);
  const isAdvertDay = (time: number) =>
    advertDays.some((other) => time >= startOfDay(other.start).getTime() && time <= startOfDay(other.end).getTime());

  let quietDays = 0;
  for (let time = from; time < runStart; time += DAY_MS) {
    if (!isAdvertDay(startOfDay(new Date(time)).getTime())) quietDays += 1;
  }
  if (quietDays < USUAL_MIN_QUIET_DAYS) return null;

  const applications = applicants.filter((applicant) => {
    if (applicant.centreKey !== run.centreKey) return false;
    const time = startOfDay(applicant.applicationDate).getTime();
    return time >= from && time < runStart && !isAdvertDay(time);
  }).length;
  return applications / quietDays;
}

// A spike is clearly more applications than usual: at least half as many
// again, and at least two more families. Judged on the whole number the note
// shows, so the sentence always adds up.
export function advertVerdict(applications: number, usual: number | null): AdvertVerdict {
  if (usual == null) return "no-history";
  const shown = Math.round(usual);
  return applications >= shown * SPIKE_RATIO && applications - shown >= SPIKE_MIN_EXTRA ? "well" : "no-spike";
}

// Judges one run. Returns null while it is still running or not due yet.
export function assessAdvertRun(
  run: AdvertRun,
  data: { applicants: readonly Applicant[]; otherRuns: readonly AdvertRun[]; now: Date },
): AdvertReview | null {
  if (run.ongoing) return null;
  const dueAt = advertReviewDueAt(run);
  if (data.now < dueAt) return null;

  const start = startOfDay(run.start).getTime();
  const end = startOfDay(run.end).getTime();
  const during = data.applicants.filter((applicant) => {
    if (applicant.centreKey !== run.centreKey) return false;
    const time = startOfDay(applicant.applicationDate).getTime();
    return time >= start && time <= end;
  });
  const enrolments = during.filter((applicant) => applicant.enrolled).length;
  const waitlisted = during.length - enrolments;

  const perDay = usualApplicationsPerDay(
    run,
    data.applicants,
    data.otherRuns.filter((other) => other.reviewId !== run.reviewId),
  );
  const usualApplications = perDay == null ? null : perDay * daysInclusive(run.start, run.end);

  return {
    reviewId: run.reviewId,
    centreKey: run.centreKey,
    adSetNames: run.adSetNames,
    start: run.start,
    end: run.end,
    measuredAt: dueAt,
    spend: run.spend,
    clicks: run.clicks,
    enrolments,
    waitlisted,
    usualApplications,
    verdict: advertVerdict(during.length, usualApplications),
  };
}

// Runs with no history before them say nothing about how the centre responds.
export function countsTowardsResponse(verdict: AdvertVerdict) {
  return verdict !== "no-history";
}

export const ADVERT_VERDICT_WORDS: Record<AdvertVerdict, string> = {
  well: "did well",
  "no-spike": "brought no spike",
  "no-history": "has no history to compare",
};

function formatShortDate(date: Date, withYear = true) {
  return date.toLocaleDateString("en-NZ", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}

function formatRunDates(start: Date, end: Date) {
  return `${formatShortDate(start, start.getFullYear() !== end.getFullYear())} to ${formatShortDate(end)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// The note stored against the centre (plain text, shown in Notes and read by
// Beep Beep), for example: "Meta advert that ran from 13 May to 11 Jun 2026
// did well with 2 enrolments and 4 on the waitlist during that period,
// against a usual 2. ($221 spent, 813 clicks)"
export function formatAdvertReviewNote(review: AdvertReview): string {
  const counts = `${plural(review.enrolments, "enrolment", "enrolments")} and ${review.waitlisted} on the waitlist during that period`;
  const usual = review.usualApplications == null ? null : Math.round(review.usualApplications);
  const ran = `Meta advert that ran from ${formatRunDates(review.start, review.end)}`;
  const sentence =
    review.verdict === "well"
      ? `${ran} did well with ${counts}, against a usual ${usual}.`
      : review.verdict === "no-spike"
        ? `${ran} brought no spike: ${counts}, against a usual ${usual}.`
        : `${ran} had ${counts}; there is not enough history before it to say whether that is a spike.`;
  const delivery = [
    review.spend != null ? `${formatMoney(review.spend)} spent` : null,
    review.clicks != null ? `${review.clicks.toLocaleString("en-NZ")} clicks` : null,
  ].filter(Boolean);
  return delivery.length ? `${sentence} (${delivery.join(", ")})` : sentence;
}

// --- A centre's response over time -------------------------------------------

export type MetaResponseLevel = "well" | "not-well" | "mixed" | "early";

export type MetaResponseSummary = {
  centreKey: number;
  level: MetaResponseLevel;
  reviewed: number;
  respondedWell: number;
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
  const share = respondedWell / sorted.length;
  const level: MetaResponseLevel =
    sorted.length < MIN_REVIEWS_FOR_PATTERN ? "early" : share >= 2 / 3 ? "well" : share <= 1 / 3 ? "not-well" : "mixed";

  return {
    centreKey: sorted[0]!.centreKey,
    level,
    reviewed: sorted.length,
    respondedWell,
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
  const latest = `the latest (${formatRunDates(summary.latest.start, summary.latest.end)}) ${ADVERT_VERDICT_WORDS[summary.latest.verdict]}`;

  if (summary.level === "early") {
    return `Meta adverts: one advert reviewed so far, which ${ADVERT_VERDICT_WORDS[summary.latest.verdict]}; not enough adverts yet to call a pattern.`;
  }

  const verdict =
    summary.level === "well"
      ? "responds well to Meta adverts"
      : summary.level === "not-well"
        ? "does not respond well to Meta adverts"
        : "has a mixed response to Meta adverts";
  return `This kindergarten ${strong(verdict)}: ${summary.respondedWell} of ${summary.reviewed} adverts brought a spike in enrolments or waitlist; ${latest}.`;
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
    "Meta advert reviews (for each advert, the families who applied while it ran, now enrolled or on the waitlist, against the kindergarten's usual number of applications for that length of time). Use these to say whether a kindergarten responds well to Meta adverts before recommending more spend:",
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
