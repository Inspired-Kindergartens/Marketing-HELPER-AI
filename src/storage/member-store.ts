import { prisma } from "../db.js";
import { readCentreContactList, type CentreContact } from "./centre-contact-store.js";

// The members directory: a user-maintained list of people who can be assigned to
// tasks and added to projects. Not a login/auth concept — the app has no user
// accounts; these are just assignable names.

export type MemberView = {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean;
  projectCount: number;
  assignedTaskCount: number;
};

export type MemberDirectoryData = {
  members: MemberView[];
  activeCount: number;
};

export type MemberInput = {
  name: string;
  email?: string | null;
  role?: string | null;
  active?: boolean;
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function listMembers(): Promise<MemberDirectoryData> {
  const rows = await prisma.member.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { projectMembers: true, assignedTasks: true } },
    },
  });

  const members: MemberView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    projectCount: row._count.projectMembers,
    assignedTaskCount: row._count.assignedTasks,
  }));

  return {
    members,
    activeCount: members.filter((member) => member.active).length,
  };
}

// Active members only — the candidate list for assigning tasks / adding to a
// project. Deactivated members stay in the directory (and on past tasks) but
// drop out of pickers.
export async function listAssignableMembers(): Promise<
  { id: number; name: string; role: string | null }[]
> {
  const rows = await prisma.member.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return rows;
}

export async function createMember(input: MemberInput): Promise<number> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Member name is required");
  }
  const member = await prisma.member.create({
    data: {
      name,
      email: emptyToNull(input.email),
      role: emptyToNull(input.role),
      active: input.active ?? true,
    },
    select: { id: true },
  });
  return member.id;
}

export async function updateMember(id: number, input: MemberInput): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Member name is required");
  }
  await prisma.member.update({
    where: { id },
    data: {
      name,
      email: emptyToNull(input.email),
      role: emptyToNull(input.role),
      ...(input.active === undefined ? {} : { active: input.active }),
    },
  });
}

export async function setMemberActive(id: number, active: boolean): Promise<void> {
  await prisma.member.update({ where: { id }, data: { active } });
}

export async function deleteMember(id: number): Promise<void> {
  // ProjectMember rows cascade; Task.assigneeId is SetNull, so assigned tasks
  // are left unassigned rather than deleted.
  await prisma.member.delete({ where: { id } });
}

// A searchable contact suggestion for the task email "To" field: the union of
// the Member directory (people with emails) and the read-only centre-contact
// list. Used purely to seed the autocomplete when typing a *new* address — the
// per-task remembered recipients are stored separately (TaskEmailRecipient).
export type EmailContactSuggestion = {
  email: string;
  name: string | null;
  source: "member" | "centre";
};

export async function listEmailContactSuggestions(
  centreContacts?: readonly CentreContact[],
): Promise<EmailContactSuggestion[]> {
  const [memberRows, contacts] = await Promise.all([
    prisma.member.findMany({
      where: { active: true, email: { not: null } },
      orderBy: { name: "asc" },
      select: { name: true, email: true },
    }),
    centreContacts ? Promise.resolve(centreContacts) : readCentreContactList(),
  ]);

  const byEmail = new Map<string, EmailContactSuggestion>();

  for (const row of memberRows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { email, name: row.name, source: "member" });
  }

  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    // Prefer the kindergarten/centre name as the label for centre contacts.
    byEmail.set(email, { email, name: contact.kindergarten || null, source: "centre" });
  }

  return [...byEmail.values()].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}
