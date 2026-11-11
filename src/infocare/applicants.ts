// The families who applied to a centre, for the Meta advert reviews: each
// child's application_date and whether the child enrolled. Infocare's "Left"
// list over a date range returns every child enrolled at any time in it
// (current children included), so it covers children who enrolled after an
// old advert and have since left. "Not started" repeats the current list, so
// it is not asked for. A waitlist entry that was withdrawn is gone from
// Infocare and cannot be counted.
import type { Applicant } from "../analytics/meta-advert-review.js";
import { createInfocareClient } from "./client.js";
import { fetchCentreChildList } from "./extraction.js";
import type { InfocareChild } from "./models.js";

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function applicationDate(child: InfocareChild): Date | null {
  const value = (child as InfocareChild & { application_date?: unknown }).application_date;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchCentreApplicants(
  centreKey: number,
  since: Date,
  now = new Date(),
  client = createInfocareClient(),
): Promise<Applicant[]> {
  const today = isoDay(now);
  const enrolledEver = await fetchCentreChildList(
    { centreKey, category: "Left", dateRange: { startDate: isoDay(since), endDate: today } },
    client,
  );
  const current = await fetchCentreChildList(
    { centreKey, category: "Current enrolments", dateRange: { startDate: today, endDate: today } },
    client,
  );
  const waiting = await fetchCentreChildList(
    { centreKey, category: "Waiting list", dateRange: { startDate: today, endDate: today } },
    client,
  );

  const byChild = new Map<number, Applicant>();
  const add = (children: InfocareChild[], enrolled: boolean) => {
    for (const child of children) {
      const date = applicationDate(child);
      if (!date || byChild.has(child.child_key)) continue;
      byChild.set(child.child_key, { centreKey, childKey: child.child_key, applicationDate: date, enrolled });
    }
  };
  // Enrolled first, so a child on both lists counts as enrolled.
  add(enrolledEver, true);
  add(current, true);
  add(waiting, false);
  return [...byChild.values()];
}
