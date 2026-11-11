import assert from "node:assert/strict";
import test from "node:test";

import {
  advertVerdict,
  assessAdvertRun,
  buildAdvertRuns,
  describeMetaResponse,
  findOutdatedAdvertReviews,
  formatAdvertReviewNote,
  summariseMetaResponse,
  usualApplicationsPerDay,
  type AdvertReview,
  type Applicant,
} from "../src/analytics/meta-advert-review.js";

const day = (iso: string) => new Date(`${iso}T00:00:00`);

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
      { metaAdSetId: "paused", date: day("2026-04-28"), spend: 3, clicks: 10 },
      { metaAdSetId: "paused", date: day("2026-05-12"), spend: 2, clicks: 0 },
      { metaAdSetId: "paused", date: day("2026-05-20"), spend: 1, clicks: 0 },
      { metaAdSetId: "paused", date: day("2026-05-28"), spend: 4, clicks: 12 },
      { metaAdSetId: "live", date: day("2026-10-13"), spend: 5, clicks: 1 },
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

test("an ad set reused for a later period becomes a separate run for each stretch of spending", () => {
  const weekly = (metaAdSetId: string, from: string, weeks: number) =>
    Array.from({ length: weeks }, (_, index) => {
      const date = day(from);
      date.setDate(date.getDate() + index * 7);
      return { metaAdSetId, date, spend: 10, clicks: 2 };
    });
  const runs = buildAdvertRuns({
    adSets: [
      { metaAdSetId: "reused", name: "Karamuramu", campaignName: "Enrolment", centreKey: 5, startTime: day("2026-08-20"), endTime: day("2026-09-19") },
    ],
    delivery: [...weekly("reused", "2026-05-06", 5), ...weekly("reused", "2026-08-20", 5)],
    deliveryCoverageStart: day("2026-04-05"),
    deliveryCoverageEnd: day("2026-10-27"),
    now: day("2026-11-10"),
  });
  assert.equal(runs.length, 2);
  assert.equal(runs[0]!.start.getTime(), day("2026-05-06").getTime());
  assert.equal(runs[0]!.end.getTime(), day("2026-06-03").getTime());
  assert.equal(runs[0]!.spend, 50);
  assert.equal(runs[1]!.start.getTime(), day("2026-08-20").getTime());
  assert.equal(runs[1]!.end.getTime(), day("2026-09-17").getTime());
  assert.notEqual(runs[0]!.reviewId, runs[1]!.reviewId);
});

test("a review whose run has changed is out of date; unchanged or uncovered reviews are kept", () => {
  const run = (centreKey: number, start: string, end: string, ongoing = false) => ({
    reviewId: `meta-advert-review:${centreKey}:${start}`,
    centreKey,
    adSetNames: ["x"],
    start: day(start),
    end: day(end),
    spend: 100,
    clicks: null,
    ongoing,
  });
  const runs = [run(1, "2026-05-06", "2026-06-03"), run(1, "2026-08-20", "2026-09-17"), run(2, "2026-04-01", "2026-04-29")];
  const reviews = [
    { reviewId: "meta-advert-review:1:2026-05-06", centreKey: 1, start: day("2026-05-06"), end: day("2026-09-17"), spend: 200 },
    { reviewId: "meta-advert-review:2:2026-04-01", centreKey: 2, start: day("2026-04-01"), end: day("2026-04-29"), spend: 100 },
    { reviewId: "meta-advert-review:3:2024-02-05", centreKey: 3, start: day("2024-02-05"), end: day("2024-05-30"), spend: null },
    { reviewId: "meta-advert-review:4:2025-08-12", centreKey: 4, start: day("2025-08-12"), end: day("2025-10-30"), spend: null },
  ];
  assert.deepEqual(
    findOutdatedAdvertReviews([{ ...reviews[1]!, spend: null }], runs, null).map((review) => review.reviewId),
    ["meta-advert-review:2:2026-04-01"],
    "a review made before its spend was known is redone once it is",
  );
  assert.deepEqual(
    findOutdatedAdvertReviews(reviews, runs, day("2025-01-01")).map((review) => review.reviewId),
    ["meta-advert-review:1:2026-05-06", "meta-advert-review:4:2025-08-12"],
    "before the delivery data starts a review is kept; after it, a review with no run did not run",
  );
});

// One applicant every `everyDays` days from `from` up to (not including) `to`.
function steadyApplicants(centreKey: number, from: string, to: string, everyDays: number, enrolled = true): Applicant[] {
  const list: Applicant[] = [];
  for (let date = day(from), index = 0; date < day(to); date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + everyDays), index += 1) {
    list.push({ centreKey, childKey: centreKey * 10000 + index, applicationDate: date, enrolled });
  }
  return list;
}

const brookfieldRun = {
  reviewId: "meta-advert-review:109:2026-05-13",
  centreKey: 109,
  adSetNames: ["Brookfield"],
  start: day("2026-05-13"),
  end: day("2026-06-11"),
  spend: 221,
  clicks: 813,
  ongoing: false,
};

test("verdict: a spike is half as many again as usual and at least two more families", () => {
  assert.equal(advertVerdict(6, 2), "well");
  assert.equal(advertVerdict(3, 1), "well");
  assert.equal(advertVerdict(2, 1), "no-spike", "one more family is not a spike");
  assert.equal(advertVerdict(8, 6), "no-spike", "a third more is not a spike");
  assert.equal(advertVerdict(4, 4), "no-spike");
  assert.equal(advertVerdict(5, null), "no-history");
  assert.equal(advertVerdict(3, 1.4), "well", "judged on the usual the note shows (1), so 3 against 1 is a spike");
});

test("a run counts the families who applied while it ran, enrolled or waiting, against the usual rate", () => {
  // Usual: one application every 15 days, so 2 in the advert's 30 days.
  const usual = steadyApplicants(109, "2025-11-01", "2026-05-13", 15);
  const during: Applicant[] = [
    { centreKey: 109, childKey: 1, applicationDate: day("2026-05-13"), enrolled: true },
    { centreKey: 109, childKey: 2, applicationDate: day("2026-05-21"), enrolled: true },
    { centreKey: 109, childKey: 3, applicationDate: day("2026-05-25"), enrolled: false },
    { centreKey: 109, childKey: 4, applicationDate: day("2026-06-01"), enrolled: false },
    { centreKey: 109, childKey: 5, applicationDate: day("2026-06-05"), enrolled: false },
    { centreKey: 109, childKey: 6, applicationDate: day("2026-06-11"), enrolled: false },
    { centreKey: 109, childKey: 7, applicationDate: day("2026-06-12"), enrolled: true },
    { centreKey: 200, childKey: 8, applicationDate: day("2026-05-20"), enrolled: true },
  ];
  const data = { applicants: [...usual, ...during], otherRuns: [brookfieldRun], now: day("2026-06-20") };
  assert.equal(assessAdvertRun(brookfieldRun, data), null, "not due until applications have had time to be entered");

  const review = assessAdvertRun(brookfieldRun, { ...data, now: day("2026-07-01") })!;
  assert.equal(review.enrolments, 2);
  assert.equal(review.waitlisted, 4);
  assert.equal(Math.round(review.usualApplications!), 2);
  assert.equal(review.verdict, "well");
  assert.equal(
    formatAdvertReviewNote(review),
    "Meta advert that ran from 13 May to 11 Jun 2026 did well with 2 enrolments and 4 on the waitlist during that period, against a usual 2. ($221 spent, 813 clicks)",
  );
});

test("the usual rate leaves out days other adverts ran, and needs enough quiet days", () => {
  const usual = steadyApplicants(109, "2025-11-13", "2026-05-13", 15);
  // A busy earlier advert would inflate the usual rate if it were counted.
  const earlierRun = { ...brookfieldRun, reviewId: "meta-advert-review:109:2026-02-01", start: day("2026-02-01"), end: day("2026-02-28") };
  const earlierBurst = steadyApplicants(109, "2026-02-01", "2026-03-01", 2).map((applicant) => ({ ...applicant, childKey: applicant.childKey + 5000 }));
  const perDay = usualApplicationsPerDay(brookfieldRun, [...usual, ...earlierBurst], [earlierRun]);
  assert.ok(perDay != null && Math.abs(perDay * 30 - 2) < 0.5, `usual for 30 days should be about 2, got ${perDay! * 30}`);

  const coveredByAdverts = { ...brookfieldRun, reviewId: "meta-advert-review:109:2025-11-01", start: day("2025-11-01"), end: day("2026-04-30") };
  assert.equal(usualApplicationsPerDay(brookfieldRun, usual, [coveredByAdverts]), null);

  const review = assessAdvertRun(brookfieldRun, { applicants: usual, otherRuns: [brookfieldRun, coveredByAdverts], now: day("2026-07-01") })!;
  assert.equal(review.verdict, "no-history");
  assert.match(formatAdvertReviewNote(review), /had 0 enrolments and 0 on the waitlist during that period; there is not enough history/);
});

test("no spike is said plainly, with the usual number", () => {
  const usual = steadyApplicants(109, "2025-11-01", "2026-05-13", 8);
  const during: Applicant[] = [
    { centreKey: 109, childKey: 1, applicationDate: day("2026-05-13"), enrolled: true },
    { centreKey: 109, childKey: 2, applicationDate: day("2026-05-21"), enrolled: true },
    { centreKey: 109, childKey: 3, applicationDate: day("2026-05-21"), enrolled: true },
    { centreKey: 109, childKey: 4, applicationDate: day("2026-05-21"), enrolled: false },
  ];
  const review = assessAdvertRun(brookfieldRun, { applicants: [...usual, ...during], otherRuns: [], now: day("2026-07-01") })!;
  assert.equal(review.verdict, "no-spike");
  assert.equal(
    formatAdvertReviewNote(review),
    "Meta advert that ran from 13 May to 11 Jun 2026 brought no spike: 3 enrolments and 1 on the waitlist during that period, against a usual 4. ($221 spent, 813 clicks)",
  );
});

test("a centre's pattern needs two reviewed adverts and ignores adverts with no history", () => {
  const base = { centreKey: 1, adSetNames: ["x"], measuredAt: day("2026-01-01"), spend: null, clicks: null, enrolments: 1, waitlisted: 1, usualApplications: 1 };
  const review = (id: string, end: string, verdict: AdvertReview["verdict"]): AdvertReview => ({ ...base, reviewId: id, start: day("2025-01-01"), end: day(end), verdict });

  assert.equal(summariseMetaResponse([review("a", "2025-02-01", "no-history")]), null);
  assert.equal(summariseMetaResponse([review("a", "2025-02-01", "well")])!.level, "early");

  const well = summariseMetaResponse([review("a", "2025-02-01", "well"), review("b", "2025-06-01", "well"), review("c", "2025-09-01", "no-history")])!;
  assert.equal(well.level, "well");
  assert.equal(well.reviewed, 2);
  assert.match(describeMetaResponse(well, (text) => `<b>${text}</b>`), /<b>responds well to Meta adverts<\/b>: 2 of 2 adverts brought a spike/);

  const poor = summariseMetaResponse([review("a", "2025-02-01", "no-spike"), review("b", "2025-06-01", "no-spike"), review("c", "2025-09-01", "well")])!;
  assert.equal(poor.level, "not-well");
  assert.match(describeMetaResponse(poor), /does not respond well to Meta adverts/);
});
