// Info Sheets: noticing that a kindergarten's teaching team has changed, so
// the team photo on its info sheet is out of date, and raising a task to get
// a new one. Two signs of a change:
//   - the Infocare staff list: a teacher started or left
//   - a full-time teacher job was advertised: one month after its closing
//     date, the new teacher is taken to have started
// Infocare is only read (the staff lists already stored); nothing is changed there.

export type StaffRow = { job: string; startingDate: string; leavingDate: string };
export type TeacherAdvert = { jobTitle: string; positionType: string; closingAt: Date | null };

// How long after an advert closes the team is taken to have changed.
export const ADVERT_SETTLE_MONTHS = 1;
// How long the task gives to get the new photo.
export const STAFF_PHOTO_TASK_DAYS = 14;

const NZ = "Pacific/Auckland";
const nzDate = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: NZ });
const longDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// The people in a team photo: teachers and the head teacher. Relievers and
// non-teaching jobs come and go without the photo changing.
export function isTeachingJob(job: string): boolean {
  return /teacher/i.test(job) && !/reliev/i.test(job);
}

export function isFullTimeTeacherAdvert(advert: TeacherAdvert): boolean {
  return isTeachingJob(advert.jobTitle) && !/part/i.test(advert.positionType) && !/part[\s-]?time/i.test(advert.jobTitle);
}

export function advertSettledOn(closingAt: Date): string {
  const settled = new Date(closingAt);
  settled.setMonth(settled.getMonth() + ADVERT_SETTLE_MONTHS);
  return nzDate(settled);
}

// Why the team photo is out of date: each staff change dated after `since`
// and no later than `now`. Empty when nothing has changed. No names are used.
export function findStaffPhotoReasons(input: { since: Date; now: Date; staff: readonly StaffRow[]; adverts: readonly TeacherAdvert[] }): string[] {
  const since = nzDate(input.since);
  const today = nzDate(input.now);
  const within = (isoDate: string) => /^\d{4}-\d{2}-\d{2}$/.test(isoDate) && isoDate > since && isoDate <= today;
  const reasons: Array<{ date: string; text: string }> = [];

  for (const person of input.staff) {
    if (!isTeachingJob(person.job)) continue;
    const job = person.job.trim() || "Teacher";
    if (within(person.startingDate)) reasons.push({ date: person.startingDate, text: `A ${job.toLowerCase()} started on ${longDate(person.startingDate)} (Infocare staff list).` });
    if (within(person.leavingDate)) reasons.push({ date: person.leavingDate, text: `A ${job.toLowerCase()} left on ${longDate(person.leavingDate)} (Infocare staff list).` });
  }

  for (const advert of input.adverts) {
    if (!advert.closingAt || !isFullTimeTeacherAdvert(advert)) continue;
    const settled = advertSettledOn(advert.closingAt);
    if (within(settled)) {
      reasons.push({ date: settled, text: `A full-time ${advert.jobTitle.trim()} job was advertised and closed on ${longDate(nzDate(advert.closingAt))}, a month ago.` });
    }
  }

  return reasons.sort((a, b) => a.date.localeCompare(b.date)).map((reason) => reason.text);
}

// ---- One-off check of a team photo against today's staff ----------------------

export type NamedStaff = { firstName: string; lastName: string; job: string; leavingDate: string };

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// The people a caption names: "Back row: Andi Peat, Amy Garrity\nFront row:
// Caroline Darby and Roxanne Wright" -> those four. Row labels and roles in
// brackets are dropped.
export function captionNames(caption: string): string[] {
  // A caption copied from a PDF can break a name across two lines ("Zyri\nMartin").
  // A line is joined to the next only when it ends on a lone word, half a
  // name. "Tracy Giacon\nCherie Hunter" is two people, with the comma lost.
  const endsMidName = (text: string) => (text.split(/[,.:;&]|\band\b/i).pop() ?? "").trim().split(/\s+/).filter(Boolean).length === 1;
  const joined = caption
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((text, line) => (!text ? line : endsMidName(text) && !/^(front|back|middle|left|l\s*[:-]\s*r)\b/i.test(line) ? `${text} ${line}` : `${text}\n${line}`), "");
  return joined
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(back|front|middle|sitting|standing)?\s*(sitting\s+)?row\b|\bleft to right\b|\bl\s*[:-]\s*r\b|\bkaiako\b|\bhead teacher\b|\bteachers?\b/gi, ",")
    .split(/[,:;&\n.]|\band\b/i)
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => /^[\p{L}][\p{L}'’ -]*$/u.test(name) && name.length > 1);
}

// Who is in the caption but not on today's staff list, and which of today's
// teachers the caption does not name. A caption that gives first names only
// is matched on first names. Rough by nature: a preferred name ("Cath" for
// Catherine) shows as a difference, so the result is something to check, not a fact.
export function compareCaptionWithStaff(caption: string, staff: readonly NamedStaff[], today: string): { notNamed: string[]; notOnStaff: string[] } {
  const names = captionNames(caption);
  const firstOnly = names.length > 0 && names.every((name) => !name.includes(" "));
  const current = staff.filter((person) => !person.leavingDate || person.leavingDate > today);
  const matches = (name: string, person: NamedStaff) => sameName(name, person, firstOnly);

  return {
    // Only teachers are expected in the photo...
    notNamed: current
      .filter((person) => isTeachingJob(person.job) && !names.some((name) => matches(name, person)))
      .map((person) => `${person.firstName} ${person.lastName}`.trim()),
    // ...but anyone still on the staff list (an administrator, say) may be in it.
    notOnStaff: names.filter((name) => !current.some((person) => matches(name, person))),
  };
}

// Infocare writes a preferred or former name in brackets: "Jacquilyn (Jacqui)",
// "Heasley (nee Bambery)". Each is a name the person may go by.
function nameForms(value: string): string[] {
  return plain(value.replace(/[()]/g, " ").replace(/\bnee\b/gi, " ")).split(" ").filter(Boolean);
}

const sharedStart = (a: string, b: string) => {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
};

// "Ange" is Angela and "Dave" is David: the same person when the names start
// the same way. Surnames must agree more closely ("Bamberry" for Bambery).
function sameName(captionName: string, person: NamedStaff, firstOnly: boolean): boolean {
  const words = plain(captionName).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const first = words[0];
  const firstMatches = nameForms(person.firstName).some((form) => form === first || sharedStart(form, first) >= 3);
  if (firstOnly || words.length === 1) return firstMatches;
  const last = words[words.length - 1];
  const lastMatches = nameForms(person.lastName).some((form) => form === last || sharedStart(form, last) >= Math.min(5, form.length, last.length));
  return firstMatches && lastMatches;
}

export function staffPhotoTaskTitle(centreName: string): string {
  return `Update the team photo: ${centreName}`;
}

export function staffPhotoTaskDescription(centreName: string, reasons: readonly string[]): string {
  return [
    `The teaching team at ${centreName} has changed, so the team photo on its info sheet is out of date.`,
    ...reasons.map((reason) => `- ${reason}`),
    "Get a new team photo from the kindergarten, then put it on the info sheet: Info Sheets, the kindergarten, Photos, Team photo, Replace. Update the caption under it.",
  ].join("\n");
}

export type StaffPhotoCentre = {
  centreKey: number;
  name: string;
  onePagerId: number;
  // When the current team photo was put on the sheet (null: no team photo),
  // and when the sheet was started.
  teamPhotoAt: Date | null;
  createdAt: Date;
  staffPhotoCheckedAt: Date | null;
  staffPhotoTaskId: number | null;
};

export type StaffPhotoDeps = {
  listCentres(): Promise<StaffPhotoCentre[]>;
  // The newest stored Infocare staff list for the centre ([] when none).
  staff(centreKey: number): Promise<StaffRow[]>;
  adverts(centreKey: number): Promise<TeacherAdvert[]>;
  // True when the task exists and is not done.
  taskOpen(taskId: number): Promise<boolean>;
  createTask(input: { title: string; description: string; centreKey: number; dueDate: string }): Promise<number>;
  // Records that changes up to `at` have been acted on (and the task, when one was made).
  mark(onePagerId: number, at: Date, taskId?: number): Promise<void>;
};

export type StaffPhotoResult = { created: Array<{ centreKey: number; taskId: number }>; alreadyOpen: number };

// One pass over every kindergarten. A change raises one task; while that task
// is open, further changes add no second task.
export async function checkStaffPhotos(deps: StaffPhotoDeps, now = new Date()): Promise<StaffPhotoResult> {
  const result: StaffPhotoResult = { created: [], alreadyOpen: 0 };
  for (const centre of await deps.listCentres()) {
    // Changes count from the newest of: the team photo going on, the sheet
    // being started, and the last time a change was acted on.
    const since = new Date(Math.max(centre.teamPhotoAt?.getTime() ?? 0, centre.createdAt.getTime(), centre.staffPhotoCheckedAt?.getTime() ?? 0));
    const [staff, adverts] = await Promise.all([deps.staff(centre.centreKey), deps.adverts(centre.centreKey)]);
    const reasons = findStaffPhotoReasons({ since, now, staff, adverts });
    if (reasons.length === 0) continue;

    if (centre.staffPhotoTaskId != null && (await deps.taskOpen(centre.staffPhotoTaskId))) {
      await deps.mark(centre.onePagerId, now);
      result.alreadyOpen += 1;
      continue;
    }
    const due = new Date(now);
    due.setDate(due.getDate() + STAFF_PHOTO_TASK_DAYS);
    const taskId = await deps.createTask({
      title: staffPhotoTaskTitle(centre.name),
      description: staffPhotoTaskDescription(centre.name, reasons),
      centreKey: centre.centreKey,
      dueDate: nzDate(due),
    });
    await deps.mark(centre.onePagerId, now, taskId);
    result.created.push({ centreKey: centre.centreKey, taskId });
  }
  return result;
}
