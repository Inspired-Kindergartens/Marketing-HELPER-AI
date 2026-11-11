import {
  advertReviewDueAt,
  assessAdvertRun,
  buildAdvertRuns,
  buildMetaResponseGrounding,
  findOutdatedAdvertReviews,
  summariseMetaResponseByCentre,
  USUAL_LOOKBACK_DAYS,
  type AdvertReview,
  type Applicant,
  type MetaResponseSummary,
} from "../analytics/meta-advert-review.js";
import { fetchCentreApplicants } from "../infocare/applicants.js";
import { createInfocareClient } from "../infocare/client.js";
import { readCentreReferences } from "../storage/analytics-store.js";
import {
  readAdvertAdSets,
  readAdvertDelivery,
  deleteMetaAdvertReview,
  readMetaAdvertReviews,
  saveMetaAdvertReview,
} from "../storage/meta-advert-review-store.js";
import { matchMetaNameToCentre } from "./centre-match.js";

type Logger = { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };

const DAY_MS = 24 * 60 * 60 * 1000;

// Reviews every centre advert run that has ended and settled and has not been
// reviewed yet. Safe to call often: reviewed runs are skipped.
export async function reviewEndedMetaAdverts(now = new Date(), reviewLogger?: Logger): Promise<AdvertReview[]> {
  const [centres, adSets, delivery, storedReviews] = await Promise.all([
    readCentreReferences(),
    readAdvertAdSets(),
    readAdvertDelivery(),
    readMetaAdvertReviews(),
  ]);
  const centreNames = new Map(centres.map((centre) => [centre.centreKey, centre.name]));
  // An ad set whose own name points at a different centre was matched by its
  // campaign's name only; its centre is uncertain, so leave it out.
  const trustedAdSets = adSets.filter((adSet) => {
    const named = matchMetaNameToCentre(adSet.name, centres);
    return centreNames.has(adSet.centreKey) && (!named || named.centreKey === adSet.centreKey);
  });
  const allRuns = buildAdvertRuns({
    adSets: trustedAdSets,
    delivery: delivery.days,
    deliveryCoverageStart: delivery.coverageStart,
    deliveryCoverageEnd: delivery.coverageEnd,
    now,
  });
  const outdated = findOutdatedAdvertReviews(storedReviews, allRuns, delivery.coverageStart);
  for (const review of outdated) await deleteMetaAdvertReview(review);
  const outdatedIds = new Set(outdated.map((review) => review.reviewId));
  const reviewed = new Set(storedReviews.map((review) => review.reviewId).filter((id) => !outdatedIds.has(id)));
  const runs = allRuns.filter((run) => !run.ongoing && !reviewed.has(run.reviewId));
  if (runs.length === 0) return [];

  const due = runs.filter((run) => advertReviewDueAt(run) <= now);
  if (due.length === 0) return [];

  // Infocare is asked once per centre, back to the earliest usual-rate window
  // any of its runs needs. A centre Infocare fails for is tried next time.
  const client = createInfocareClient();
  const saved: AdvertReview[] = [];
  for (const centreKey of new Set(due.map((run) => run.centreKey))) {
    const centreRuns = due.filter((run) => run.centreKey === centreKey);
    const earliest = Math.min(...centreRuns.map((run) => run.start.getTime())) - USUAL_LOOKBACK_DAYS * DAY_MS;
    let applicants: Applicant[];
    try {
      applicants = await fetchCentreApplicants(centreKey, new Date(earliest), now, client);
    } catch (error) {
      reviewLogger?.warn({ error, centreKey }, "Meta advert review: Infocare applicants unavailable");
      continue;
    }
    for (const run of centreRuns) {
      const review = assessAdvertRun(run, { applicants, otherRuns: allRuns, now });
      if (!review) continue;
      await saveMetaAdvertReview(review, centreNames.get(run.centreKey) ?? `Centre ${run.centreKey}`, now);
      saved.push(review);
    }
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
  reviewInFlight = reviewEndedMetaAdverts(new Date(), logger)
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
