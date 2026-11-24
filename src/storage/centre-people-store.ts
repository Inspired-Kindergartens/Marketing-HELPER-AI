// Who to contact at each kindergarten, from what the app already holds:
//   - head teacher and administrator: the newest stored Infocare staff list
//     (ExternalApiCapture, get_staff_list). Infocare itself is not called here.
//   - email: the kindergarten's Info Sheet.
//   - senior teacher: the uploaded workbook, the one thing Infocare lacks.
// Nothing here needs the workbook: without it the senior teacher is empty.
import { prisma } from "../db.js";
import { ADMINISTRATOR_JOB, currentHolders, currentStaff, HEAD_TEACHER_JOB, nzDate, staffPersonFromInfocare, type StaffListPerson } from "../infocare/staff-roles.js";
import { matchCentreContact, readSeniorTeacherList, type CentreContact } from "./centre-contact-store.js";

export type CentrePeople = CentreContact & { centreKey: number };

type NewestStaffList = { centreKey: number; receivedAt: Date; staff: StaffListPerson[] };

// The newest stored Infocare staff list of every centre that has one.
export async function readNewestStaffLists(): Promise<Map<number, NewestStaffList>> {
  // The newest capture is picked without its payload, so only one payload per
  // centre is read however many staff lists are stored.
  const rows: Array<{ centre_key: number | null; receivedAt: Date; payload: unknown }> = await prisma.$queryRaw`
    SELECT newest.centre_key, capture."receivedAt", capture."payload"
    FROM (
      SELECT DISTINCT ON (centre_key) "id", centre_key
      FROM (
        SELECT "id", "receivedAt", ("requestContext"->'parameters'->>'centre_key')::int AS centre_key
        FROM "ExternalApiCapture"
        WHERE "source" = 'infocare' AND "operation" = 'get_staff_list' AND "outcome" = 'success'
          AND ("payload"->'staff_list') IS NOT NULL
      ) AS staff_lists
      ORDER BY centre_key, "receivedAt" DESC
    ) AS newest
    JOIN "ExternalApiCapture" AS capture ON capture."id" = newest."id"`;
  const lists = new Map<number, NewestStaffList>();
  for (const row of rows) {
    if (row.centre_key == null) continue;
    const list = (row.payload as { staff_list?: Array<Record<string, unknown>> } | undefined)?.staff_list ?? [];
    lists.set(row.centre_key, { centreKey: row.centre_key, receivedAt: row.receivedAt, staff: list.map(staffPersonFromInfocare) });
  }
  return lists;
}

export type CentreStaffSection = {
  kindergarten: string;
  email: string;
  seniorTeacher: string;
  people: Array<{ name: string; job: string }>;
};

// Every open kindergarten with everyone working there today, for the Centre
// Staff PDF, and when the newest of those staff lists came from Infocare.
export async function readCentreStaff(now = new Date()): Promise<{ sections: CentreStaffSection[]; listsReceivedAt: Date | null }> {
  const [contacts, staffLists] = await Promise.all([readCentreContacts(now), readNewestStaffLists().catch(() => new Map<number, NewestStaffList>())]);
  const today = nzDate(now);
  const received = contacts.flatMap((contact) => staffLists.get(contact.centreKey)?.receivedAt ?? []);
  return {
    sections: contacts.map((contact) => ({
      kindergarten: contact.kindergarten,
      email: contact.email,
      seniorTeacher: contact.keySeniorTeacher,
      people: currentStaff(staffLists.get(contact.centreKey)?.staff ?? [], today),
    })),
    listsReceivedAt: received.length ? new Date(Math.max(...received.map((date) => date.getTime()))) : null,
  };
}

// Every open kindergarten with its people. It fails soft, as the workbook
// reader always has: [] when the database can't be read.
export async function readCentreContacts(now = new Date()): Promise<CentrePeople[]> {
  try {
    const [centres, staffLists, seniorTeachers, onePagers] = await Promise.all([
      prisma.centreReference.findMany({ where: { ignored: false, openStatus: "Open" }, select: { centreKey: true, name: true }, orderBy: { name: "asc" } }),
      readNewestStaffLists(),
      readSeniorTeacherList(),
      prisma.onePager.findMany({ select: { centreKey: true, email: true } }),
    ]);
    const emails = new Map(onePagers.map((onePager) => [onePager.centreKey, onePager.email.trim()]));
    const today = nzDate(now);
    return centres.map((centre) => {
      const name = centre.name.replace(/\s+/g, " ").trim();
      const staff = staffLists.get(centre.centreKey)?.staff ?? [];
      return {
        centreKey: centre.centreKey,
        kindergarten: name,
        headTeacher: currentHolders(staff, HEAD_TEACHER_JOB, today),
        administrator: currentHolders(staff, ADMINISTRATOR_JOB, today),
        keySeniorTeacher: matchCentreContact(name, seniorTeachers)?.keySeniorTeacher ?? "",
        email: emails.get(centre.centreKey) ?? "",
      };
    });
  } catch {
    return [];
  }
}
