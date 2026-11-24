// The daily staff list fetch: one read-only get_staff_list per kindergarten,
// once a day, so a new head teacher or administrator in Infocare shows here
// the next day. The reply is stored like every other Infocare call
// (ExternalApiCapture), which is where the rest of the app reads it from.
// A kindergarten already fetched today is skipped, so a restart, or a check
// later in the day, calls Infocare for nothing.
import { addMonths, monthBounds, monthKey } from "../analytics/enrolment-quality.js";
import { createInfocareClient } from "./client.js";
import { nzDate } from "./staff-roles.js";

type Logger = {
  info: (payload: object, message?: string) => void;
  warn: (payload: object, message?: string) => void;
};

type InfocareClientLike = Pick<ReturnType<typeof createInfocareClient>, "request">;

export type StaffListSyncDeps = {
  centres: () => Promise<Array<{ centreKey: number; name: string }>>;
  // When each centre's newest stored staff list was received.
  newestReceivedAt: () => Promise<Map<number, Date>>;
};

// Same spacing as the other Infocare fetches, so Infocare sees the usual pace.
const REQUEST_DELAY_MS = 650;
// Staff who left within the last year stay in the reply, with their leaving
// date, for the Info Sheets team photo check.
const STAFF_LIST_MONTHS_BACK = 12;

let running = false;

// The centres with no staff list received today (New Zealand time).
export function centresDueForStaffList<T extends { centreKey: number }>(centres: readonly T[], newest: ReadonlyMap<number, Date>, now: Date): T[] {
  const today = nzDate(now);
  return centres.filter((centre) => {
    const receivedAt = newest.get(centre.centreKey);
    return !receivedAt || nzDate(receivedAt) < today;
  });
}

export async function runStaffListSync(
  log: Logger,
  deps: StaffListSyncDeps,
  options: { client?: InfocareClientLike; now?: Date; delayMs?: number } = {},
): Promise<{ fetched: number; failed: number }> {
  const result = { fetched: 0, failed: 0 };
  if (running) return result;
  running = true;

  try {
    const now = options.now ?? new Date();
    const due = centresDueForStaffList(await deps.centres(), await deps.newestReceivedAt(), now);
    if (due.length === 0) return result;

    const client = options.client ?? createInfocareClient();
    const currentMonth = monthKey(now);
    const range = {
      start_date: monthBounds(addMonths(currentMonth, -STAFF_LIST_MONTHS_BACK)).startDate,
      end_date: monthBounds(currentMonth).endDate,
    };
    for (const centre of due) {
      try {
        await client.request("get_staff_list", { centre_key: centre.centreKey, ...range });
        result.fetched += 1;
      } catch (error) {
        // Left for the next check; the stored list stays in use meanwhile.
        result.failed += 1;
        log.warn({ centreKey: centre.centreKey, error: String(error) }, "Staff list: fetch failed");
      }
      await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? REQUEST_DELAY_MS));
    }
    log.info(result, "Staff list: daily fetch finished");
    return result;
  } finally {
    running = false;
  }
}
