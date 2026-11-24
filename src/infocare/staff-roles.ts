// Who holds a job at a kindergarten today, from an Infocare staff list
// (get_staff_list). Infocare is only read: a kindergarten with nobody in the
// job gets no name, never a guess from another job.
export type StaffListPerson = {
  firstName: string;
  lastName: string;
  job: string;
  startingDate: string;
  leavingDate: string;
};

export const HEAD_TEACHER_JOB = "Head Teacher";
export const ADMINISTRATOR_JOB = "Administrator";

// Today in New Zealand as YYYY-MM-DD, the form Infocare's dates take.
export function nzDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function staffPersonFromInfocare(row: Record<string, unknown>): StaffListPerson {
  const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  return {
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    job: text(row.job),
    startingDate: text(row.starting_date),
    leavingDate: text(row.leaving_date),
  };
}

function isCurrent(person: StaffListPerson, today: string): boolean {
  return (!person.startingDate || person.startingDate <= today) && (!person.leavingDate || person.leavingDate >= today);
}

// Rows Infocare keeps in a staff list that are not a person: the kindergarten
// itself ("Papamoa Kindergarten", job Other) and "Discretionary Staff".
function isPlaceholder(person: StaffListPerson): boolean {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return !name || /\bkindergarten\b/i.test(name) || /^discretionary staff$/i.test(name);
}

const JOB_ORDER = [HEAD_TEACHER_JOB, ADMINISTRATOR_JOB, "Teacher"].map((job) => job.toLowerCase());

// Everyone working at the kindergarten on the day, as Infocare names them:
// head teacher first, then administrator, teachers, and the other jobs A to Z.
export function currentStaff(staff: readonly StaffListPerson[], today: string): Array<{ name: string; job: string }> {
  const rank = (job: string) => {
    const index = JOB_ORDER.indexOf(job.toLowerCase());
    return index < 0 ? JOB_ORDER.length : index;
  };
  return staff
    .filter((person) => isCurrent(person, today) && !isPlaceholder(person))
    .map((person) => ({ name: `${person.firstName} ${person.lastName}`.trim(), job: person.job }))
    .sort((a, b) => rank(a.job) - rank(b.job) || a.job.localeCompare(b.job) || a.name.localeCompare(b.name));
}

// The names of the people in the job on the day: started, and not yet left.
// More than one (a shared role) is joined with ", ".
export function currentHolders(staff: readonly StaffListPerson[], job: string, today: string): string {
  const wanted = job.toLowerCase();
  const names = staff
    .filter((person) => person.job.toLowerCase() === wanted && isCurrent(person, today))
    .map((person) => `${person.firstName} ${person.lastName}`.trim())
    .filter(Boolean);
  return [...new Set(names)].join(", ");
}
