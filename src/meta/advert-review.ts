import {
  assessAdvertRun,
  buildAdvertRuns,
  buildMetaResponseGrounding,
  summariseMetaResponseByCentre,
  type AdvertReview,
  type MetaResponseSummary,
} from "../analytics/meta-advert-review.js";
import { readCentreReferences } from "../storage/analytics-store.js";
import { readOperatingCapacities } from "../storage/enrolment-quality-store.js";
import {
  readAdvertAdSets,
  readAdvertDelivery,
  readAdvertRollMonths,
  readAdvertWaitlistPoints,
  readMetaAdvertReviewIds,
  readMetaAdvertReviews,
  saveMetaAdvertReview,
} from "../storage/meta-advert-review-store.js";
import { matchMetaNameToCentre } from "./centre-match.js";

type Logger = { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };

// Reviews every centre advert run that has ended and settled and has not been
// reviewed yet. Safe to call often: reviewed runs are skipped.
export async function reviewEndedMetaAdverts(now = new Date()): Promise<AdvertReview[]> {
  const [centres, adSets, delivery, reviewed] = await Promise.all([
    readCentreReferences(),
    readAdvertAdSets(),
    readAdvertDelivery(),
    readMetaAdvertReviewIds(),
  ]);
  const centreNames = new Map(centres.map((centre) => [centre.centreKey, centre.name]));
  // An ad set whose own name points at a different centre was matched by its
  // campaign's name only; its centre is uncertain, so leave it out.
  const trustedAdSets = adSets.filter((adSet) => {
    const named = matchMetaNameToCentre(adSet.name, centres);
    return centreNames.has(adSet.centreKey) && (!named || named.centreKey === adSet.centreKey);
  });
  const runs = buildAdvertRuns({
    adSets: trustedAdSets,
    delivery: delivery.days,
    deliveryCoverageStart: delivery.coverageStart,
    deliveryCoverageEnd: delivery.coverageEnd,
    now,
  }).filter((run) => !run.ongoing && !reviewed.has(run.reviewId));
  if (runs.length === 0) return [];

  const [rolls, capacities, waitlist] = await Promise.all([
    readAdvertRollMonths(),
    readOperatingCapacities(),
    readAdvertWaitlistPoints([...new Set(runs.map((run) => run.centreKey))]),
  ]);

  const saved: AdvertReview[] = [];
  for (const run of runs) {
    const review = assessAdvertRun(run, { rolls, capacities, waitlist, now });
    if (!review) continue;
    await saveMetaAdvertReview(review, centreNames.get(run.centreKey) ?? `Centre ${run.centreKey}`, now);
    saved.push(review);
  }
  return saved;
}

// Runs the review at most every few hours, in the background.
const REVIEW_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastReviewStartedAt = 0;
let reviewInFlight: Promise<AdvertReview[]> | null = null;

export function tickMetaAdvertReviews(logger: Logger, options: { force?: boolean } = {}) {
  if (reviewInFlight) return reviewInFlight;
  if (!options.force && Date.now() - lastReviewStartedAt < REVIEW_INTERVAL_MS) return Promise.resolve([]);
  lastReviewStartedAt = Date.now();
  reviewInFlight = reviewEndedMetaAdverts()
    .then((saved) => {
      if (saved.length) logger.info({ reviews: saved.map((review) => review.reviewId) }, "Meta advert reviews added");
      return saved;
    })
    .catch((error: unknown) => {
      logger.warn({ error }, "Meta advert review failed");
      return [];
    })
    .finally(() => {
      reviewInFlight = null;
    });
  return reviewInFlight;
}

export async function readMetaResponseSummaries(): Promise<{
  reviews: AdvertReview[];
  summaries: Map<number, MetaResponseSummary>;
}> {
  const reviews = await readMetaAdvertReviews();
  return { reviews, summaries: summariseMetaResponseByCentre(reviews) };
}

const META_PROMPT_PATTERN = /\b(meta|facebook|instagram|fb|adverts?|ads?|campaigns?|ad ?sets?|advertis\w*|promot\w*|spend)\b/i;

// Beep Beep grounding: the selected centre's reviews whenever it has any, and
// every centre's verdict when the question is about Meta adverts.
export async function findMetaResponseGrounding(prompt: string, selectedCentreKey: number | null): Promise<string | null> {
  const { reviews, summaries } = await readMetaResponseSummaries();
  if (summaries.size === 0) return null;
  const centreNames = new Map((await readCentreReferences()).map((centre) => [centre.centreKey, centre.name]));
  const parts = [
    selectedCentreKey != null && summaries.has(selectedCentreKey)
      ? buildMetaResponseGrounding(summaries, centreNames, reviews, { centreKeys: [selectedCentreKey] })
      : null,
    META_PROMPT_PATTERN.test(prompt) ? buildMetaResponseGrounding(summaries, centreNames, reviews) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("\n\n") : null;
}
