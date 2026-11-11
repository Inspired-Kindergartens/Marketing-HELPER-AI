// Which days of Meta results a refresh asks for. Every refresh re-pulls the
// last 30 days (recent numbers still settle), and also every older day after
// the newest one already stored, so a gap of more than 30 days between
// refreshes no longer loses results. Dates are YYYY-MM-DD in the ad account's
// time zone.

export const META_RECENT_DAYS = 30;
// Older days are asked for a month at a time to keep each response small.
export const META_HISTORY_CHUNK_DAYS = 30;
// Meta keeps daily results for 37 months; stay a few days inside that.
export const META_HISTORY_MONTHS = 37;
const META_HISTORY_MARGIN_DAYS = 3;

export type MetaInsightRange = { since: string; until: string };

export function localIsoDate(at: Date, timeZone?: string | null): string {
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timeZone ?? undefined }).format(at);
  } catch {
    // Unknown time zone name: fall back to this computer's.
    return new Intl.DateTimeFormat("en-CA", options).format(at);
  }
}

export function addIsoDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function earliestMetaHistoryDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - META_HISTORY_MONTHS);
  return addIsoDays(date.toISOString().slice(0, 10), META_HISTORY_MARGIN_DAYS);
}

// lastStoredDay: the newest day already stored for the account (null when
// nothing is). historyFrom: pull everything from this day instead, to fill
// gaps further back; it is limited to what Meta still keeps.
export function planMetaInsightRanges(input: {
  today: string;
  lastStoredDay: string | null;
  historyFrom?: string | null;
}): { recent: MetaInsightRange; history: MetaInsightRange[] } {
  const recent = { since: addIsoDays(input.today, -META_RECENT_DAYS), until: addIsoDays(input.today, -1) };
  const earliest = earliestMetaHistoryDate(input.today);
  let from = input.historyFrom ?? (input.lastStoredDay ? addIsoDays(input.lastStoredDay, 1) : earliest);
  if (from < earliest) from = earliest;

  const lastHistoryDay = addIsoDays(recent.since, -1);
  const history: MetaInsightRange[] = [];
  while (from <= lastHistoryDay) {
    const chunkEnd = addIsoDays(from, META_HISTORY_CHUNK_DAYS - 1);
    const until = chunkEnd < lastHistoryDay ? chunkEnd : lastHistoryDay;
    history.push({ since: from, until });
    from = addIsoDays(until, 1);
  }
  return { recent, history };
}
