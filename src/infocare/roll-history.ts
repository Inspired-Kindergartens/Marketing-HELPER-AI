// Enrolment Quality history: fetches each centre's month from Infocare
// (one get_attendance_list + one get_roster_list per centre-month, licence days
// per year, staff list once per centre), summarises it and stores the result.
// Months already stored as complete are skipped, so a restart resumes where it
// left off. The automatic monthly check fetches finished months only (so it
// calls Infocare once a month, when a month ends); "Update from Infocare"
// also refetches the current month to date.
// Read-only Infocare modes only; replies are captured like every other call.
import { createInfocareClient } from "./client.js";
import {
  type InfocareLicense,
  type InfocareStaff,
  parseInfocareAttendanceListResponse,
  parseInfocareLicenseListResponse,
  parseInfocareRosterListResponse,
  parseInfocareStaffListResponse,
} from "./models.js";
import {
  addMonths,
  monthBounds,
  monthKey,
  ROLL_HISTORY_MONTHS,
  summariseRollMonth,
} from "../analytics/enrolment-quality.js";
import { readOpenCentreReferences } from "../storage/analytics-store.js";
import { readCompleteRollMonths, upsertCentreMonthlyRoll } from "../storage/enrolment-quality-store.js";

type Logger = {
  info: (payload: object, message?: string) => void;
  warn: (payload: object, message?: string) => void;
};

type InfocareClientLike = ReturnType<typeof createInfocareClient>;

// Same spacing as the snapshot extraction, so Infocare sees the usual pace.
const REQUEST_DELAY_MS = 650;

export type RollHistoryProgress = {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  failed: number;
  finishedAt: string | null;
};

let progress: RollHistoryProgress = { running: false, phase: "", done: 0, total: 0, failed: 0, finishedAt: null };

export function getRollHistoryProgress(): RollHistoryProgress {
  return { ...progress };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(client: InfocareClientLike, mode: string, parameters: Record<string, unknown>) {
  const response = await client.request(mode, parameters);
  await sleep(REQUEST_DELAY_MS);
  return response;
}

// Months to fetch for one centre, newest first so the panel fills from today
// backwards. Without the current month, only finished months not yet stored.
export function monthsToFetch(
  currentMonth: string,
  complete: ReadonlySet<string>,
  historyMonths = ROLL_HISTORY_MONTHS,
  includeCurrentMonth = true,
): string[] {
  const months: string[] = [];
  for (let offset = includeCurrentMonth ? 0 : 1; offset < historyMonths; offset += 1) {
    const month = addMonths(currentMonth, -offset);
    if (!complete.has(month)) months.push(month);
  }
  return months;
}

export async function runRollHistorySync(
  log: Logger,
  options: { client?: InfocareClientLike; now?: Date; includeCurrentMonth?: boolean } = {},
): Promise<void> {
  if (progress.running) return;
  const includeCurrentMonth = options.includeCurrentMonth ?? true;
  const currentMonth = monthKey(options.now ?? new Date());

  // The monthly check: nothing to do (no Infocare calls, no progress shown)
  // unless a finished month is missing, i.e. a month has just ended.
  if (!includeCurrentMonth) {
    const [centres, complete] = await Promise.all([readOpenCentreReferences(), readCompleteRollMonths()]);
    const missing = centres.some(
      (centre) => monthsToFetch(currentMonth, complete.get(centre.centreKey) ?? new Set(), ROLL_HISTORY_MONTHS, false).length > 0,
    );
    if (!missing) return;
  }

  progress = { running: true, phase: "Preparing", done: 0, total: 0, failed: 0, finishedAt: null };

  try {
    const client = options.client ?? createInfocareClient();
    const centres = await readOpenCentreReferences();
    const complete = await readCompleteRollMonths();
    const plan = centres.map((centre) => ({
      centre,
      months: monthsToFetch(currentMonth, complete.get(centre.centreKey) ?? new Set(), ROLL_HISTORY_MONTHS, includeCurrentMonth),
    }));
    progress = { ...progress, total: plan.reduce((sum, item) => sum + item.months.length, 0) };
    log.info({ months: progress.total, centres: centres.length }, "Enrolment Quality: history fetch started");

    for (const { centre, months } of plan) {
      if (months.length === 0) continue;
      progress = { ...progress, phase: centre.name };
      const oldest = months[months.length - 1]!;
      const centreKey = centre.centreKey;

      let staff: InfocareStaff[] = [];
      try {
        staff = parseInfocareStaffListResponse(
          await request(client, "get_staff_list", {
            centre_key: centreKey,
            start_date: monthBounds(oldest).startDate,
            end_date: monthBounds(currentMonth).endDate,
          }),
        );
      } catch (error) {
        // Only used to leave non-teaching staff out of the staffing suggestion.
        log.warn({ centreKey, error: String(error) }, "Enrolment Quality: staff list unavailable");
      }

      const licenceByYear = new Map<string, InfocareLicense[]>();
      for (const month of months) {
        try {
          const year = month.slice(0, 4);
          if (!licenceByYear.has(year)) {
            licenceByYear.set(
              year,
              parseInfocareLicenseListResponse(
                await request(client, "get_license_list", { centre_key: centreKey, start_date: `${year}-01-01`, end_date: `${year}-12-31` }),
              ).license_list,
            );
          }
          const range = monthBounds(month);
          const attendance = parseInfocareAttendanceListResponse(
            await request(client, "get_attendance_list", { centre_key: centreKey, start_date: range.startDate, end_date: range.endDate }),
          );
          let roster: ReturnType<typeof parseInfocareRosterListResponse> = [];
          try {
            roster = parseInfocareRosterListResponse(
              await request(client, "get_roster_list", { centre_key: centreKey, start_date: range.startDate, end_date: range.endDate }),
            );
          } catch (error) {
            log.warn({ centreKey, month, error: String(error) }, "Enrolment Quality: roster unavailable");
          }
          const summary = summariseRollMonth({ month, licenceDays: licenceByYear.get(year) ?? [], attendance, roster, staff });
          await upsertCentreMonthlyRoll(centreKey, summary, month < currentMonth);
        } catch (error) {
          // Not stored, so the next run tries this month again.
          progress = { ...progress, failed: progress.failed + 1 };
          log.warn({ centreKey, month, error: String(error) }, "Enrolment Quality: month fetch failed");
        }
        progress = { ...progress, done: progress.done + 1 };
      }
    }

    log.info({ done: progress.done, failed: progress.failed }, "Enrolment Quality: history fetch finished");
  } catch (error) {
    log.warn({ error: String(error) }, "Enrolment Quality: history fetch failed");
  } finally {
    progress = { ...progress, running: false, phase: "", finishedAt: new Date().toISOString() };
  }
}
