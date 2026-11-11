// Enrolment Quality: each centre's "% full roll", month by month.
//
// Placements: the average, over open days, of the children booked in the
// day's busier session (morning or afternoon). Children
// on part weeks share a place (Kimmy Tue/Wed/Fri + Joe Mon/Thu = one
// placement); this is the same "booked children per day" figure that the
// Infocare Analytics ENROL/MAX percentage uses.
// % full roll: placements / operating capacity, where operating capacity is
// the user's am / pm places (the busier session), or the licence when none is set.
import { parseTimeToMinutes } from "../infocare/extraction.js";
import type {
  InfocareAttendance,
  InfocareLicense,
  InfocareRoster,
  InfocareStaff,
} from "../infocare/models.js";

export const ROLL_WINDOW_OPTIONS = [
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "12M", label: "12M", months: 12 },
  { key: "2Y", label: "2Y", months: 24 },
  { key: "3Y", label: "3Y", months: 36 },
  { key: "5Y", label: "5Y", months: 60 },
] as const;

export type RollWindowKey = (typeof ROLL_WINDOW_OPTIONS)[number]["key"];
export const DEFAULT_ROLL_WINDOW: RollWindowKey = "12M";
export const ROLL_HISTORY_MONTHS = 60;

export function resolveRollWindowKey(input?: string | null): RollWindowKey {
  return ROLL_WINDOW_OPTIONS.find((option) => option.key === input)?.key ?? DEFAULT_ROLL_WINDOW;
}

export function rollWindowMonths(windowKey: RollWindowKey): number {
  return ROLL_WINDOW_OPTIONS.find((option) => option.key === windowKey)?.months ?? 12;
}

// interest = Change, biggest fall first (default); latest = Latest, lowest first.
export type RollSort = "interest" | "latest" | "asc" | "desc";

export function resolveRollSort(input?: string | null): RollSort {
  return input === "asc" || input === "desc" || input === "latest" ? input : "interest";
}

// A booking starting before noon is a morning child; one ending after 1pm is
// an afternoon child (a full-day child is both). Matches the "Avg enrolments
// for month (am/pm)" columns of the old Roll Returns sheet.
export const AM_BEFORE_MINUTES = 12 * 60;
export const PM_AFTER_MINUTES = 13 * 60;
// Staff on child-contact duty at this time of day are counted for the
// staffing suggestion (mid-morning: after arrivals, before lunch breaks).
export const STAFF_CHECK_MINUTES = 10 * 60;
// Over-2 teacher:child ratios: 1:10 when any child attends more than 4 hours,
// 1:15 when all attend 4 hours or less (sessional).
export const ALL_DAY_RATIO = 10;
export const SESSIONAL_RATIO = 15;
// Under-2s: one teacher for every 5 children.
export const UNDER_TWO_RATIO = 5;
// % full roll bands: at or above GOOD_PERCENT is good (green), from
// WATCH_PERCENT up to it is watch (grey), below WATCH_PERCENT is low (red).
// Judged on the whole number shown.
export const GOOD_PERCENT = 90;
export const WATCH_PERCENT = 80;

export type RollBand = "good" | "watch" | "low";

export function rollBand(percent: number | null): RollBand | null {
  if (percent == null) return null;
  const shown = Math.round(percent);
  if (shown >= GOOD_PERCENT) return "good";
  if (shown >= WATCH_PERCENT) return "watch";
  return "low";
}

// A change within this many points either way over the period is "steady".
export const STEADY_POINTS = 3;

export type TrendDirection = "rise" | "fall" | "steady";

export function trendDirection(change: number | null): TrendDirection | null {
  if (change == null) return null;
  // Judged on the whole number shown in the Change column, so the same
  // figure always gets the same colour.
  const shown = Math.round(change);
  if (shown >= STEADY_POINTS) return "rise";
  if (shown <= -STEADY_POINTS) return "fall";
  return "steady";
}

export type RollMonthSummary = {
  month: string; // YYYY-MM
  openDays: number;
  avgPlacements: number;
  avgAm: number;
  avgPm: number;
  avgLicence: number;
  // Average licensed under-2 places (max_u2) on open days. Under-2 places sit
  // inside the total licence (OPEYS: 60, of which up to 18 under-2); 0 for
  // centres without under-2 places.
  avgLicenceU2: number;
  contactStaff: number | null;
  sessional: boolean;
};

export type RollMonthInput = {
  month: string;
  licenceDays: readonly InfocareLicense[];
  attendance: readonly InfocareAttendance[];
  roster?: readonly InfocareRoster[];
  staff?: readonly InfocareStaff[];
};

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

// Most common value; a tie goes to the higher count.
function mode(values: readonly number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
}

function isSessional(day: InfocareLicense) {
  return (day as { sessional?: unknown }).sessional === true;
}

function countContactStaffByDate(roster: readonly InfocareRoster[], staff: readonly InfocareStaff[]) {
  // Non-teaching staff (job "Other": admin, cleaning) never count towards ratios.
  // Staff missing from the centre's list (relievers from elsewhere) do.
  const nonTeaching = new Set(staff.filter((member) => member.job?.trim().toLowerCase() === "other").map((member) => member.staff_key));
  const byDate = new Map<string, Set<number>>();

  for (const entry of roster) {
    if (nonTeaching.has(entry.staff_key)) continue;
    const onContact = (entry.work_list ?? []).some((work) => {
      const start = parseTimeToMinutes(work.start);
      const end = parseTimeToMinutes(work.end);
      return work.type === "Contact" && start != null && end != null && start <= STAFF_CHECK_MINUTES && end > STAFF_CHECK_MINUTES;
    });
    if (!onContact) continue;
    const set = byDate.get(entry.date) ?? new Set<number>();
    set.add(entry.staff_key);
    byDate.set(entry.date, set);
  }

  return byDate;
}

export function summariseRollMonth(input: RollMonthInput): RollMonthSummary {
  const licenceByDate = new Map<string, InfocareLicense>();
  for (const day of input.licenceDays) {
    if (day.date?.startsWith(input.month) && day.max_children > 0) licenceByDate.set(day.date, day);
  }

  const childrenByDate = new Map<string, { all: Set<number>; am: Set<number>; pm: Set<number> }>();
  for (const row of input.attendance) {
    if (!licenceByDate.has(row.date)) continue;
    const from = parseTimeToMinutes(row.booked_from);
    const to = parseTimeToMinutes(row.booked_to);
    if (from == null || to == null || to <= from) continue;
    const day = childrenByDate.get(row.date) ?? { all: new Set(), am: new Set(), pm: new Set() };
    day.all.add(row.child_key);
    if (from < AM_BEFORE_MINUTES) day.am.add(row.child_key);
    if (to > PM_AFTER_MINUTES) day.pm.add(row.child_key);
    childrenByDate.set(row.date, day);
  }

  // An open day is a licensed day with at least one child booked.
  const openDates = [...childrenByDate.keys()].sort();
  const staffByDate = countContactStaffByDate(input.roster ?? [], input.staff ?? []);
  const staffCounts = openDates.map((date) => staffByDate.get(date)?.size ?? 0);

  // A day's placements are its busier session: a morning-only child and an
  // afternoon-only child are never there together, so they share a place
  // (the same way part-week children share one across the week). A day with
  // only midday bookings (neither am nor pm) counts its children.
  const placementsOn = (date: string) => {
    const day = childrenByDate.get(date)!;
    return Math.max(day.am.size, day.pm.size) || day.all.size;
  };

  return {
    month: input.month,
    openDays: openDates.length,
    avgPlacements: average(openDates.map(placementsOn)),
    avgAm: average(openDates.map((date) => childrenByDate.get(date)!.am.size)),
    avgPm: average(openDates.map((date) => childrenByDate.get(date)!.pm.size)),
    avgLicence: average(openDates.map((date) => licenceByDate.get(date)!.max_children)),
    avgLicenceU2: average(openDates.map((date) => licenceByDate.get(date)!.max_u2 ?? 0)),
    // No roster at all (not kept that far back, or not used) means no suggestion.
    contactStaff: staffCounts.some((count) => count > 0) ? mode(staffCounts) : null,
    sessional: openDates.some((date) => isSessional(licenceByDate.get(date)!)),
  };
}

// The places a team can cover: the centre's under-2 places at 1:5, and the
// rest of the team at the over-2 ratio; capped at the licence.
export function suggestCapacityFromStaffing(
  summary: Pick<RollMonthSummary, "contactStaff" | "sessional" | "avgLicence">,
  under2Places = 0,
): number | null {
  if (summary.contactStaff == null || summary.contactStaff <= 0) return null;
  const ratio = summary.sessional ? SESSIONAL_RATIO : ALL_DAY_RATIO;
  const under2 = Math.min(Math.max(0, under2Places), summary.contactStaff * UNDER_TWO_RATIO);
  const staffed = Math.floor(under2 + (summary.contactStaff - under2 / UNDER_TWO_RATIO) * ratio);
  return summary.avgLicence > 0 ? Math.min(Math.round(summary.avgLicence), staffed) : staffed;
}

// --- Operating capacity ----------------------------------------------------

// A user-entered figure; nothing else ever writes one. Each save is kept as
// a history entry (when it was changed, and why). It applies from its month
// onwards, until a later month's figure takes over.
export type OperatingCapacity = {
  id?: number;
  centreKey: number;
  effectiveFrom: string; // YYYY-MM
  // When the user saved it (ISO).
  changedAt: string;
  // The busier of the morning and afternoon places (what % full roll divides
  // by, matching placements = the busier session).
  capacity: number;
  // Places run in the morning / afternoon. Null on entries saved before am/pm
  // existed: those use capacity for both.
  amCapacity?: number | null;
  pmCapacity?: number | null;
  // Of the total, the under-2 places the centre runs (OPEYS: 10, though its
  // licence allows 18). Null when not set or the centre has no under-2 places.
  under2Capacity: number | null;
  note: string | null;
};

// `capacity` is the combined total that % full roll divides by; `under2` is
// the part of it for under-2s (operating if set, else the licence's), or null.
// `am` / `pm` are the operating places per session (null for the licence).
export type ResolvedCapacity = {
  capacity: number;
  under2: number | null;
  source: "operating" | "licence";
  am?: number | null;
  pm?: number | null;
};

// Capacity from morning and afternoon places: the busier session.
export function capacityFromAmPm(am: number, pm: number): number {
  return Math.max(am, pm);
}

// A centre's first figure has no From month: it covers the whole history.
// It is stored with this month, earlier than any roll history, so any later
// figure (whatever its From month) takes over from its own month.
export const FIRST_FIGURE_MONTH = "2000-01";

// The entries covering the start of the history (the earliest From month):
// shown as "from the start" rather than a month.
export function isFirstFigure(entry: OperatingCapacity, centreCapacities: readonly OperatingCapacity[]) {
  return centreCapacities.every((other) => other.effectiveFrom >= entry.effectiveFrom);
}

// Latest From month first; for the same month, the latest save first.
function byNewest(a: OperatingCapacity, b: OperatingCapacity) {
  return b.effectiveFrom.localeCompare(a.effectiveFrom) || b.changedAt.localeCompare(a.changedAt) || (b.id ?? 0) - (a.id ?? 0);
}

// The figure for a month: the latest one whose From month is on or before it
// (a rise from November leaves October on the old figure). Months before the
// centre's first figure use that first figure, so a figure with nothing
// earlier covers the whole history. With no figures at all, the licence.
export function capacityEntryForMonth(month: string, centreCapacities: readonly OperatingCapacity[]): OperatingCapacity | null {
  const sorted = [...centreCapacities].sort(byNewest);
  const onOrBefore = sorted.find((entry) => entry.effectiveFrom <= month);
  if (onOrBefore) return onOrBefore;
  const earliestMonth = sorted[sorted.length - 1]?.effectiveFrom;
  return earliestMonth ? sorted.find((entry) => entry.effectiveFrom === earliestMonth) ?? null : null;
}

export function resolveCapacityForMonth(
  month: string,
  avgLicence: number,
  centreCapacities: readonly OperatingCapacity[],
  avgLicenceU2 = 0,
): ResolvedCapacity | null {
  const licenceU2 = avgLicenceU2 > 0 ? Math.round(avgLicenceU2) : null;
  const applicable = capacityEntryForMonth(month, centreCapacities);
  if (applicable && applicable.capacity > 0) {
    return {
      capacity: applicable.capacity,
      under2: applicable.under2Capacity ?? licenceU2,
      source: "operating",
      am: applicable.amCapacity ?? applicable.capacity,
      pm: applicable.pmCapacity ?? applicable.capacity,
    };
  }
  return avgLicence > 0 ? { capacity: avgLicence, under2: licenceU2, source: "licence" } : null;
}

// --- Months ----------------------------------------------------------------

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return monthKey(date);
}

// The window's months, oldest first, ending with the current month.
export function windowMonths(currentMonth: string, windowKey: RollWindowKey): string[] {
  const count = rollWindowMonths(windowKey);
  return Array.from({ length: count }, (_, index) => addMonths(currentMonth, index - count + 1));
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const last = new Date(year, monthNumber, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(last).padStart(2, "0")}` };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[monthNumber - 1]}-${String(year).slice(2)}`;
}

// --- Rows for the panel and the AI ----------------------------------------

export type StoredRollMonth = RollMonthSummary & { centreKey: number };

export type RollPoint = {
  month: string;
  percent: number | null;
  avgPlacements: number;
  avgAm: number;
  avgPm: number;
  openDays: number;
  capacity: number | null;
  capacitySource: ResolvedCapacity["source"] | null;
  // The user's am / pm places in force that month (null when none are set).
  placesAm: number | null;
  placesPm: number | null;
  // The licensed places that month (average over open days), shown in {}.
  licence: number | null;
  monthToDate: boolean;
};

export type EnrolmentQualityRow = {
  centreKey: number;
  name: string;
  points: RollPoint[];
  startPercent: number | null;
  latestPercent: number | null;
  change: number | null;
  direction: TrendDirection | null;
  latest: RollPoint | null;
  capacities: OperatingCapacity[];
  currentCapacity: ResolvedCapacity | null;
  licence: number | null;
  licenceU2: number | null;
  suggestedCapacity: number | null;
};

export function buildEnrolmentQualityRows(input: {
  centres: ReadonlyArray<{ centreKey: number; name: string }>;
  months: readonly StoredRollMonth[];
  capacities: readonly OperatingCapacity[];
  windowKey: RollWindowKey;
  currentMonth: string;
}): EnrolmentQualityRow[] {
  const months = windowMonths(input.currentMonth, input.windowKey);

  return input.centres.map((centre) => {
    const centreMonths = input.months.filter((row) => row.centreKey === centre.centreKey);
    const byMonth = new Map(centreMonths.map((row) => [row.month, row]));
    const capacities = input.capacities.filter((entry) => entry.centreKey === centre.centreKey);
    const points: RollPoint[] = months.map((month) => {
      const stored = byMonth.get(month);
      const capacity = stored && stored.openDays > 0 ? resolveCapacityForMonth(month, stored.avgLicence, capacities, stored.avgLicenceU2) : null;
      return {
        month,
        percent: stored && capacity ? (stored.avgPlacements / capacity.capacity) * 100 : null,
        avgPlacements: stored?.avgPlacements ?? 0,
        avgAm: stored?.avgAm ?? 0,
        avgPm: stored?.avgPm ?? 0,
        openDays: stored?.openDays ?? 0,
        capacity: capacity?.capacity ?? null,
        capacitySource: capacity?.source ?? null,
        placesAm: capacity?.source === "operating" ? capacity.am ?? null : null,
        placesPm: capacity?.source === "operating" ? capacity.pm ?? null : null,
        licence: stored && stored.openDays > 0 && stored.avgLicence > 0 ? stored.avgLicence : null,
        monthToDate: month === input.currentMonth,
      };
    });
    const known = points.filter((point) => point.percent != null);
    const latest = known[known.length - 1] ?? null;
    const startPercent = known[0]?.percent ?? null;
    const latestPercent = latest?.percent ?? null;
    const change = startPercent != null && latestPercent != null && known.length > 1 ? latestPercent - startPercent : null;
    const sortedStored = [...centreMonths].filter((row) => row.openDays > 0).sort((a, b) => a.month.localeCompare(b.month));
    const newest = sortedStored[sortedStored.length - 1] ?? null;
    // The staffing suggestion uses the newest complete month with a roster.
    const staffed = [...sortedStored].reverse().find((row) => row.contactStaff != null && row.month < input.currentMonth)
      ?? [...sortedStored].reverse().find((row) => row.contactStaff != null);
    const currentCapacity = newest ? resolveCapacityForMonth(input.currentMonth, newest.avgLicence, capacities, newest.avgLicenceU2) : null;

    return {
      centreKey: centre.centreKey,
      name: centre.name,
      points,
      startPercent,
      latestPercent,
      change,
      direction: trendDirection(change),
      latest,
      // History, oldest first (the panel lists it newest first).
      capacities: [...capacities].sort((a, b) => byNewest(b, a)),
      currentCapacity,
      licence: newest ? Math.round(newest.avgLicence) : null,
      licenceU2: newest && newest.avgLicenceU2 > 0 ? Math.round(newest.avgLicenceU2) : null,
      suggestedCapacity: staffed ? suggestCapacityFromStaffing(staffed, currentCapacity?.under2 ?? 0) : null,
    };
  });
}

// The whole organisation as one row, pinned above the centres. Each month adds
// up the placements, am/pm and capacity of the centres with data that month,
// so % full roll = all placements / all capacity (a centre that has not
// opened yet adds nothing to either side).
export const ORGANISATION_ROW_KEY = 0;
export const ORGANISATION_ROW_NAME = "All kindergartens";

export function buildOrganisationRollRow(rows: readonly EnrolmentQualityRow[]): EnrolmentQualityRow | null {
  const first = rows[0];
  if (!first) return null;

  const points: RollPoint[] = first.points.map((template, index) => {
    const reporting = rows
      .map((row) => row.points[index])
      .filter((point): point is RollPoint => point != null && point.percent != null && point.capacity != null);
    const placements = reporting.reduce((sum, point) => sum + point.avgPlacements, 0);
    const capacity = reporting.reduce((sum, point) => sum + point.capacity!, 0);
    return {
      month: template.month,
      percent: capacity > 0 ? (placements / capacity) * 100 : null,
      avgPlacements: placements,
      avgAm: reporting.reduce((sum, point) => sum + point.avgAm, 0),
      avgPm: reporting.reduce((sum, point) => sum + point.avgPm, 0),
      openDays: reporting.length ? Math.max(...reporting.map((point) => point.openDays)) : 0,
      capacity: capacity > 0 ? capacity : null,
      capacitySource: reporting.length ? (reporting.some((point) => point.capacitySource === "operating") ? "operating" : "licence") : null,
      placesAm: null,
      placesPm: null,
      licence: reporting.some((point) => point.licence != null) ? reporting.reduce((sum, point) => sum + (point.licence ?? 0), 0) : null,
      monthToDate: template.monthToDate,
    };
  });

  const known = points.filter((point) => point.percent != null);
  const latest = known[known.length - 1] ?? null;
  const startPercent = known[0]?.percent ?? null;
  const latestPercent = latest?.percent ?? null;
  const change = startPercent != null && latestPercent != null && known.length > 1 ? latestPercent - startPercent : null;
  const withCapacity = rows.filter((row) => row.currentCapacity);
  const licensed = rows.filter((row) => row.licence != null);

  return {
    centreKey: ORGANISATION_ROW_KEY,
    name: ORGANISATION_ROW_NAME,
    points,
    startPercent,
    latestPercent,
    change,
    direction: trendDirection(change),
    latest,
    capacities: [],
    currentCapacity: withCapacity.length
      ? {
          capacity: withCapacity.reduce((sum, row) => sum + Math.round(row.currentCapacity!.capacity), 0),
          under2: null,
          source: withCapacity.some((row) => row.currentCapacity!.source === "operating") ? "operating" : "licence",
        }
      : null,
    licence: licensed.length ? licensed.reduce((sum, row) => sum + row.licence!, 0) : null,
    licenceU2: null,
    suggestedCapacity: null,
  };
}

// The priority score's roll inputs: the newest complete month with a %
// (the month to date is too early to judge), and the same month a year
// before. Rows need at least 13 months of points (build them with "2Y").
export type RollSignal = { rollMonth: string; rollPercent: number; rollYearAgoPercent: number | null };

export function rollSignalForRow(row: EnrolmentQualityRow): RollSignal | null {
  const complete = row.points.filter((point) => point.percent != null && !point.monthToDate);
  const latest = complete[complete.length - 1];
  if (!latest) return null;
  const yearAgoMonth = addMonths(latest.month, -12);
  const yearAgo = row.points.find((point) => point.month === yearAgoMonth)?.percent ?? null;
  return { rollMonth: latest.month, rollPercent: latest.percent!, rollYearAgoPercent: yearAgo };
}

export function sortEnrolmentQualityRows(rows: readonly EnrolmentQualityRow[], sort: RollSort): EnrolmentQualityRow[] {
  const byName = (a: EnrolmentQualityRow, b: EnrolmentQualityRow) => a.name.localeCompare(b.name);
  if (sort === "asc") return [...rows].sort(byName);
  if (sort === "desc") return [...rows].sort((a, b) => byName(b, a));
  if (sort === "latest") {
    return [...rows].sort(
      (a, b) =>
        (a.latestPercent ?? Infinity) - (b.latestPercent ?? Infinity) ||
        (a.change ?? Infinity) - (b.change ?? Infinity) ||
        byName(a, b),
    );
  }
  // Default: by Change, the biggest fall first; then the lowest latest %;
  // centres without a change (one month or no data) go last.
  return [...rows].sort(
    (a, b) =>
      (a.change ?? Infinity) - (b.change ?? Infinity) ||
      (a.latestPercent ?? Infinity) - (b.latestPercent ?? Infinity) ||
      byName(a, b),
  );
}

// Compact text for the AI chat: one line per centre, biggest fall first. The
// chat model has a 4,096-token window already mostly used by the dashboard
// context, so only the most concerning centres (plus any asked about) and
// their recent months are sent: about 60 tokens a line.
export function buildEnrolmentQualityGrounding(
  rows: readonly EnrolmentQualityRow[],
  windowKey: RollWindowKey,
  options: { maxCentres?: number; maxPoints?: number; includeCentreKeys?: readonly number[] } = {},
): string | null {
  const maxCentres = options.maxCentres ?? 10;
  const maxPoints = options.maxPoints ?? 6;
  const include = new Set(options.includeCentreKeys ?? []);
  const ranked = sortEnrolmentQualityRows(rows, "interest").filter((row) => row.latestPercent != null);
  const withData = ranked.filter((row, index) => index < maxCentres || include.has(row.centreKey));
  if (!withData.length) return null;
  const pct = (value: number) => `${Math.round(value)}%`;
  const organisation = buildOrganisationRollRow(rows);
  const lines = [...(organisation?.latestPercent != null ? [organisation] : []), ...withData].map((row) => {
    const trend = row.points
      .filter((point) => point.percent != null)
      .slice(-maxPoints)
      .map((point) => `${formatMonthLabel(point.month)} ${pct(point.percent!)}`)
      .join(", ");
    const capacity = row.currentCapacity
      ? `${Math.round(row.currentCapacity.capacity)} (${row.currentCapacity.source === "operating" ? `operating capacity, busier of am ${row.currentCapacity.am ?? "-"} / pm ${row.currentCapacity.pm ?? "-"}; licence ${row.licence ?? "-"}` : "licence"}${row.currentCapacity.under2 != null ? `, of which ${row.currentCapacity.under2} under-2` : ""})`
      : "unknown";
    const change = row.change != null ? `, change ${row.change >= 0 ? "+" : ""}${Math.round(row.change)}% (${row.direction})` : "";
    return `- ${row.name}: latest ${pct(row.latestPercent!)}${change}, capacity ${capacity}. Monthly: ${trend}`;
  });
  return [
    `Enrolment Quality (% full roll by month over the last ${windowKey}; placements = children booked in the busier session (am or pm) averaged over open days, divided by operating capacity (the busier of the am and pm places the centre runs); the current month is month to date; change = latest month minus the first month of the period, steady within ${STEADY_POINTS}%). Biggest fall first${ranked.length > withData.length ? `, ${withData.length} of ${ranked.length} shown` : ""}.`,
    ...lines,
  ].join("\n");
}
