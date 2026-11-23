// Info Sheets: the emails to a kindergarten about its info sheet. They open
// in the mail app (a mailto: link, as on the Marketing page), and what was
// sent is kept as a note on the kindergarten. Pure functions.

export const ONE_PAGER_EMAIL_KINDS = ["approve", "staff-photo", "new"] as const;
export type OnePagerEmailKind = (typeof ONE_PAGER_EMAIL_KINDS)[number];

export const ONE_PAGER_EMAIL_LABEL: Record<OnePagerEmailKind, string> = {
  approve: "Approve changes",
  "staff-photo": "Staff photo",
  new: "New",
};

// How long the kindergarten is given to reply.
const REPLY_BUSINESS_DAYS = 3;

// "Paula and Colleen", "Paula", or "there": first names only, each once.
export function joinGreetingNames(names: ReadonlyArray<string | null | undefined>): string {
  const firstNames = [...new Set(names.map((name) => (name ?? "").trim().split(/\s+/)[0] ?? "").filter(Boolean))];
  if (firstNames.length === 0) return "there";
  if (firstNames.length === 1) return firstNames[0];
  return `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
}

export function addBusinessDays(start: Date, days: number): Date {
  const date = new Date(start);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
  }
  return date;
}

const nzLongDate = (date: Date) => date.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });

export type OnePagerEmail = { subject: string; body: string };

// The two ready-made emails. "new" is typed by the user, so it has none.
export function buildOnePagerEmail(kind: Exclude<OnePagerEmailKind, "new">, input: { centreName: string; greeting: string; now?: Date }): OnePagerEmail {
  const replyBy = nzLongDate(addBusinessDays(input.now ?? new Date(), REPLY_BUSINESS_DAYS));
  const opening = [`Kia ora ${input.greeting},`, "", "I hope your day is going well.", ""];

  if (kind === "approve") {
    return {
      subject: `${input.centreName} info sheet for your approval`,
      body: [
        ...opening,
        `We have updated the info sheet for ${input.centreName}. The PDF is attached.`,
        "",
        "Could you please check that everything on it is correct, especially the hours, the contact details, the costs and the names under the team photo?",
        "",
        `If you are happy with it, please reply "approved". If anything needs changing, please reply with the changes by ${replyBy}.`,
      ].join("\n"),
    };
  }

  return {
    subject: `Updated team photo for ${input.centreName}`,
    body: [
      ...opening,
      `We are updating the info sheet for ${input.centreName} and need a current photo of your teaching team. Could you please send one by ${replyBy}?`,
      "",
      "- Everyone in the team in one photo, wider than it is tall.",
      "- Taken outside or in good light, as large a file as you can send.",
      "- No children in the photo.",
      "- The names of everyone in it, row by row, from left to right.",
    ].join("\n"),
  };
}

export const STAFF_PHOTO_EMAIL_NOTE_TEXT = "Email sent for staff photo update";

// What is kept as the note once the user confirms the email was sent. A
// Staff photo email is kept as one short line (the user asked for this on
// 2026-11-19); the others keep their subject and words.
export function onePagerEmailNote(email: OnePagerEmail, kind?: unknown): string {
  if (kind === "staff-photo") return STAFF_PHOTO_EMAIL_NOTE_TEXT;
  return `Info sheet email sent${email.subject ? `: ${email.subject}` : ""}\n\n${email.body}`.trim();
}

// A note kept for a Staff photo email. Ones sent before the short line was
// used are known by the ready-made subject.
const STAFF_PHOTO_EMAIL_NOTE = /^(Email sent for staff photo update|Info sheet email sent: Updated team photo for )/;

export const TEAM_PHOTO_NEEDED_BADGE = "Staff photo needed";
export const TEAM_PHOTO_EMAIL_SENT_BADGE = "Email sent";

// The badges shown over the team photo in the preview: a new photo is needed
// (the team photo task is open), and the kindergarten has been emailed for
// one since the photo in the slot was put there.
export function teamPhotoBadges(input: { photoDue: boolean; teamPhotoAt: Date | null; notes: ReadonlyArray<{ text: string; at: string }> }): string[] {
  const since = input.teamPhotoAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const emailed = input.notes.some((note) => STAFF_PHOTO_EMAIL_NOTE.test(note.text) && new Date(note.at).getTime() > since);
  return [...(input.photoDue ? [TEAM_PHOTO_NEEDED_BADGE] : []), ...(emailed ? [TEAM_PHOTO_EMAIL_SENT_BADGE] : [])];
}
