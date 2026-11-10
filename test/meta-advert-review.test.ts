import assert from "node:assert/strict";
import test from "node:test";

import {
  advertVerdict,
  assessAdvertRun,
  buildAdvertRuns,
  describeMetaResponse,
  formatAdvertReviewNote,
  summariseMetaResponse,
  type AdvertReview,
  type RollMonthRecord,
} from "../src/analytics/meta-advert-review.js";

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const roll = (centreKey: number, month: string, placements: number, licence = 40): RollMonthRecord => ({
  centreKey,
  month,
  openDays: 20,
  avgPlacements: placements,
  avgLicence: licence,
  avgLicenceU2: 0,
  complete: true,
});

test("overlapping ad sets for one centre merge into one run; non-enrolment ad sets are skipped", () => {
  const runs = buildAdvertRuns({
    adSets: [
      { metaAdSetId: "a", name: "Katikati", campaignName: "Enrolment", centreKey: 1, startTime: day("2025-03-01"), endTime: day("2025-04-01") },
      { metaAdSetId: "b", name: "Katikati 2", campaignName: "Enrolment", centreKey: 1, startTime: day("2025-04-10"), endTime: day("2025-05-01") },
      { metaAdSetId: "c", name: "Katikati | Recruitment | Teacher", campaignName: null, centreKey: 1, startTime: day("2025-03-01"), endTime: day("2025-04-01") },
    ],
    delivery: [],
    deliveryCoverageStart: null,
    deliveryCoverageEnd: null,
    now: day("2026-01-01"),
  });
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0]!.adSetNames, ["Katikati", "Katikati 2"]);
  assert.equal(runs[0]!.end.getTime(), day("2025-05-01").getTime());
  assert.equal(runs[0]!.ongoing, false);
});

test("delivery data sets the run to the days it spent; still spending at the last pull is ongoing", () => {
  const runs = buildAdvertRuns({
    adSets: [
      { metaAdSetId: "paused", name: "Welcome Bay", campaignName: "Enrolment", centreKey: 2, startTime: day("2026-04-28"), endTime: day("2026-09-20") },
      { metaAdSetId: "live", name: "Brookfield", campaignName: "Enrolment", centreKey: 3, startTime: day("2026-05-13"), endTime: day("2026-11-30") },
      { metaAdSetId: "never", name: "Maunganui", campaignName: "Enrolment", centreKey: 4, startTime: day("2026-05-01"), endTime: day("2026-06-01") },
    ],
    delivery: [
      { metaAdSetId: "paused", date: day("2026-04-28"), spend: 5, clicks: 10 },
      { metaAdSetId: "paused", date: day("2026-05-28"), spend: 5, clicks: 12 },
      { metaAdSetId: "live", date: day("2026-05-13"), spend: 5, clicks: 1 },
      { metaAdSetId: "live", date: day("2026-10-27"), spend: 5, clicks: 1 },
    ],
    deliveryCoverageStart: day("2026-04-05"),
    deliveryCoverageEnd: day("2026-10-27"),
    now: day("2026-11-10"),
  });
  const welcomeBay = runs.find((run) => run.centreKey === 2)!;
  assert.equal(welcomeBay.end.getTime(), day("2026-05-28").getTime());
  assert.equal(welcomeBay.spend, 10);
  assert.equal(welcomeBay.clicks, 22);
  assert.equal(welcomeBay.ongoing, false);
  assert.equal(runs.find((run) => run.centreKey === 3)!.ongoing, true);
  assert.equal(runs.some((run) => run.centreKey === 4), false, "an ad set that never spent did not run");
});

test("verdict: roll lift wins, waitlist growth counts when the roll held, full centres are held-full", () => {
  assert.equal(advertVerdict(5, null), "well");
  assert.equal(advertVerdict(0, 3), "well");
  assert.equal(advertVerdict(-5, 3), "mixed");
  assert.equal(advertVerdict(0, -4), "not-well");
  assert.equal(advertVerdict(-1, null, { rollBefore: 100, rollAfter: 99 }), "held-full");
  assert.equal(advertVerdict(-1, null, { rollBefore: 70, rollAfter: 69 }), "not-well");
});

test("a run is judged against the other kindergartens and the waitlist either side", () => {
  const run = {
    reviewId: "meta-advert-review:1:2026-04-21",
    centreKey: 1,
    adSetNames: ["Katikati"],
    start: day("2026-04-21"),
    end: day("2026-05-21"),
    spend: 210,
    clicks: 458,
    ongoing: false,
  };
  const data = {
    rolls: [roll(1, "2026-03", 28), roll(1, "2026-06", 34), roll(2, "2026-03", 36), roll(2, "2026-06", 36)],
    capacities: [],
    waitlist: [
      { centreKey: 1, date: day("2026-04-15"), waitlistCount: 4 },
      { centreKey: 1, date: day("2026-06-18"), waitlistCount: 7 },
    ],
  };
  assert.equal(assessAdvertRun(run, { ...data, now: day("2026-06-20") }), null, "not due before the after month is over");

  const review = assessAdvertRun(run, { ...data, now: day("2026-07-10") })!;
  assert.equal(review.verdict, "well");
  assert.equal(Math.round(review.rollBefore!), 70);
  assert.equal(Math.round(review.rollAfter!), 85);
  assert.equal(review.networkChange, 0);
  assert.equal(review.waitlistBefore, 4);
  assert.equal(review.waitlistAfter, 7);
  const note = formatAdvertReviewNote(review);
  assert.match(note, /70% \(Mar-26\) → 85% \(Jun-26\), \+15 pts/);
  assert.match(note, /Waitlist 4 → 7 \(\+3\)/);
  assert.match(note, /Verdict: responded well\./);
});

test("a centre's pattern needs two reviewed runs and ignores held-full runs", () => {
  const base = { centreKey: 1, adSetNames: ["x"], measuredAt: day("2026-01-01"), spend: null, clicks: null, rollBeforeMonth: null, rollBefore: null, rollAfterMonth: null, rollAfter: null, networkChange: null, waitlistBeforeAt: null, waitlistBefore: null, waitlistAfterAt: null, waitlistAfter: null };
  const review = (id: string, end: string, verdict: AdvertReview["verdict"]): AdvertReview => ({ ...base, reviewId: id, start: day("2025-01-01"), end: day(end), verdict });

  assert.equal(summariseMetaResponse([review("a", "2025-02-01", "held-full")]), null);
  assert.equal(summariseMetaResponse([review("a", "2025-02-01", "well")])!.level, "early");

  const well = summariseMetaResponse([review("a", "2025-02-01", "well"), review("b", "2025-06-01", "well"), review("c", "2025-09-01", "held-full")])!;
  assert.equal(well.level, "well");
  assert.equal(well.reviewed, 2);
  assert.match(describeMetaResponse(well, (text) => `<b>${text}</b>`), /<b>responds well to Meta adverts<\/b>/);

  const poor = summariseMetaResponse([review("a", "2025-02-01", "not-well"), review("b", "2025-06-01", "not-well"), review("c", "2025-09-01", "well")])!;
  assert.equal(poor.level, "not-well");
  assert.match(describeMetaResponse(poor), /does not respond well to Meta adverts/);
});
