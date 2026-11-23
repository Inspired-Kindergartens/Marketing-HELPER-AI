// Info Sheets: a service's operating hours and sessions, worked out from its
// Infocare bookings (one row per child per day, booked_from to booked_to).
// Pure functions. Infocare is only read; nothing here changes its data.

export type BookingRow = { date: string; from: string; to: string };

export type DayHours = {
  // 1 = Monday ... 5 = Friday.
  weekday: number;
  open: string; // "08:30"
  close: string;
  // True when a few set sessions hold nearly every booking.
  sessional: boolean;
  // The booked sessions that day, commonest first: [from, to, share of that day's bookings].
  sessions: Array<{ from: string; to: string; share: number }>;
};

// sessional: every open day runs set sessions, so the bookings are the hours.
// When false, bookings only show when children are booked, which can be
// shorter than the hours the service is open.
export type InferredHours = { days: DayHours[]; text: string; sessional: boolean };

const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// A session must be this share of a day's bookings to count as one the
// service offers (a single child's odd hours is not a session)...
const SESSION_SHARE = 0.08;
const MAX_SESSIONS = 3;
const SESSIONAL_COVER = 0.85;
// ...and a weekday needs this share of the busiest weekday's bookings to count as open.
const OPEN_DAY_SHARE = 0.25;

// "8:30", "08:30:00", "0830" -> "08:30"; anything else -> "".
export function normaliseTime(value: string): string {
  const match = /^(\d{1,2}):?(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

// "08:30" -> "8:30am", "14:30" -> "2:30pm", "12:00" -> "12pm", "15:00" -> "3pm".
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${hours < 12 ? "am" : "pm"}`;
}

const range = (from: string, to: string) => `${formatClock(from)} - ${formatClock(to)}`;

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// "Monday to Friday", "Monday to Thursday", "Monday, Tuesday, Thursday and Friday", "Wednesday".
export function describeWeekdays(weekdays: number[]): string {
  const days = [...weekdays].sort((a, b) => a - b);
  if (days.length === 0) return "";
  if (days.length === 1) return WEEKDAY_NAMES[days[0]];
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  if (consecutive && days.length > 2) return `${WEEKDAY_NAMES[days[0]]} to ${WEEKDAY_NAMES[days[days.length - 1]]}`;
  const names = days.map((day) => WEEKDAY_NAMES[day]);
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function inferDayHours(rows: readonly BookingRow[]): DayHours[] {
  const byDay = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const weekday = weekdayOf(row.date);
    const from = normaliseTime(row.from);
    const to = normaliseTime(row.to);
    if (weekday < 1 || weekday > 5 || !from || !to || from >= to) continue;
    const sessions = byDay.get(weekday) ?? new Map<string, number>();
    sessions.set(`${from}-${to}`, (sessions.get(`${from}-${to}`) ?? 0) + 1);
    byDay.set(weekday, sessions);
  }

  const totals = new Map([...byDay].map(([weekday, sessions]) => [weekday, [...sessions.values()].reduce((sum, count) => sum + count, 0)]));
  const busiest = Math.max(0, ...totals.values());
  const days: DayHours[] = [];
  for (const [weekday, sessions] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const total = totals.get(weekday) ?? 0;
    if (total < busiest * OPEN_DAY_SHARE) continue;
    const all = [...sessions].map(([key, count]) => ({ from: key.slice(0, 5), to: key.slice(6), count, share: count / total }));
    const offered = all.filter((session) => session.share >= SESSION_SHARE).sort((a, b) => b.share - a.share).slice(0, MAX_SESSIONS);
    // Sessional: a few set sessions hold nearly every booking. Otherwise each
    // family books its own hours (an All Day service) and only the span counts.
    const sessional = offered.reduce((sum, session) => sum + session.share, 0) >= SESSIONAL_COVER;
    // The span ignores a lone odd booking: a time needs a few bookings behind it.
    const support = Math.max(2, total * 0.02);
    const starts = new Map<string, number>();
    const ends = new Map<string, number>();
    for (const session of all) {
      starts.set(session.from, (starts.get(session.from) ?? 0) + session.count);
      ends.set(session.to, (ends.get(session.to) ?? 0) + session.count);
    }
    const open = [...starts].filter(([, count]) => count >= support).map(([time]) => time).sort()[0];
    const close = [...ends].filter(([, count]) => count >= support).map(([time]) => time).sort().reverse()[0];
    if (!open || !close) continue;
    days.push({ weekday, open, close, sessional, sessions: offered.map(({ from, to, share }) => ({ from, to, share })) });
  }
  return days;
}

// A day's line as the info sheets write it:
//   one session            "8:30am - 2:30pm"
//   a short and a full day "8:30am - 12:30pm or 8:30am - 2:30pm"
//   three sessions         "8:30am - 12:30pm, 8:30am - 2:30pm or 8:15am - 3:30pm"
//   not sessional          the open and close times only, "7:30am - 5:30pm"
function describeDay(day: DayHours): string {
  if (!day.sessional) return range(day.open, day.close);
  const sessions = [...day.sessions]
    .sort((a, b) => (a.to === b.to ? b.from.localeCompare(a.from) : a.to.localeCompare(b.to)))
    .map((session) => range(session.from, session.to));
  return sessions.length === 1 ? sessions[0] : `${sessions.slice(0, -1).join(", ")} or ${sessions[sessions.length - 1]}`;
}

const CLOCK_TIME = /\d\s?(am|pm)\b/i;

// What a stored Hours text says that bookings cannot: holiday programmes,
// closures, playgroup and OSCAR lines. The regular session times are dropped;
// they are what Infocare replaces.
export function keepHoursNotes(stored: string): string {
  return stored
    .replace(/\s*\n\s*/g, " ")
    // A new sentence also starts where one runs on from a time with no full
    // stop ("2:30pm Open school term breaks").
    .replace(/(\d(?:am|pm))\s+(?=[A-Z][a-z]+ [a-z])/g, "$1\n")
    .split(/\n|(?<=\.)\s+|\s+(?=holiday programmes?\b)|\s+(?=OSCAR\b)|\s+(?=Our Playgroup\b)/i)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && (!CLOCK_TIME.test(sentence) || /playgroup|oscar/i.test(sentence)))
    // A bare day range left behind by a split ("Monday - Friday") is not a note.
    .filter((sentence) => !/^(monday|tuesday|wednesday|thursday|friday)[\s\w,&-]*\.?$/i.test(sentence) || /holiday|closed|open/i.test(sentence))
    .map((sentence) => (/[.!]$/.test(sentence) ? sentence : `${sentence}.`))
    .join(" ");
}

// The Hours text to save: the times Infocare shows, then the stored notes.
export function mergeHours(inferredText: string, stored: string): string {
  return [inferredText, keepHoursNotes(stored)].filter(Boolean).join("\n");
}

// The Hours text: weekdays that run the same hours share a line.
export function describeOperatingHours(days: readonly DayHours[]): string {
  const groups = new Map<string, number[]>();
  for (const day of days) {
    const line = describeDay(day);
    groups.set(line, [...(groups.get(line) ?? []), day.weekday]);
  }
  return [...groups]
    .sort((a, b) => b[1].length - a[1].length || a[1][0] - b[1][0])
    .map(([line, weekdays]) => `${line}, ${describeWeekdays(weekdays)}.`)
    .join("\n");
}

export function inferOperatingHours(rows: readonly BookingRow[]): InferredHours {
  const days = inferDayHours(rows);
  const sessional = days.length > 0 && days.every((day) => day.sessional);
  if (sessional) return { days, text: describeOperatingHours(days), sessional };
  // Not sessional: one span for the week, the earliest open and latest close.
  const open = days.map((day) => day.open).sort()[0];
  const close = days.map((day) => day.close).sort().reverse()[0];
  const text = open && close ? `${range(open, close)}, ${describeWeekdays(days.map((day) => day.weekday))}.` : "";
  return { days, text, sessional };
}
