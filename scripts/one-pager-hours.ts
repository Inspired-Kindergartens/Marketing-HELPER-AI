// Works out each kindergarten's operating hours and sessions from Infocare
// bookings, for the Hours section of its info sheet.
//
//   npx tsx scripts/one-pager-hours.ts            show what Infocare says beside what is stored
//   npx tsx scripts/one-pager-hours.ts --apply    also save the inferred hours
//
// Read-only on Infocare: it uses the replies to get_attendance_list already
// stored in the database (ExternalApiCapture), and calls Infocare for nothing.
import "../src/load-env.js";
import { prisma } from "../src/db.js";
import { inferOperatingHours, mergeHours, type BookingRow } from "../src/one-pager/hours.js";
import { onePagerStore } from "../src/storage/one-pager-store.js";

const apply = process.argv.includes("--apply");
const raw = process.argv.includes("--raw");

type Capture = { requestContext: unknown; payload: unknown; receivedAt: Date };

// The newest stored month of bookings for a centre that is a whole month.
async function latestMonth(centreKey: number): Promise<{ month: string; rows: BookingRow[] } | null> {
  const captures: Capture[] = await prisma.$queryRaw`
    SELECT "requestContext", "payload", "receivedAt" FROM "ExternalApiCapture"
    WHERE "source" = 'infocare' AND "operation" = 'get_attendance_list' AND "outcome" = 'success'
      AND ("requestContext"->'parameters'->>'centre_key')::int = ${centreKey}
    ORDER BY "requestContext"->'parameters'->>'start_date' DESC, "receivedAt" DESC
    LIMIT 6`;
  const today = new Date().toISOString().slice(0, 10);
  for (const capture of captures) {
    const parameters = (capture.requestContext as { parameters?: { start_date?: string; end_date?: string } })?.parameters;
    // A month still under way has future bookings but is fine for hours; a
    // month must at least have started.
    if (!parameters?.start_date || parameters.start_date > today) continue;
    const list = (capture.payload as { attendance_list?: Array<Record<string, unknown>> })?.attendance_list ?? [];
    const rows = list
      .map((row) => ({ date: String(row.date ?? ""), from: String(row.booked_from ?? ""), to: String(row.booked_to ?? "") }))
      .filter((row) => row.date && row.from && row.to);
    if (rows.length > 50) return { month: parameters.start_date.slice(0, 7), rows };
  }
  return null;
}

try {
  const centres = await onePagerStore.listCentres();
  const report: Array<Record<string, unknown>> = [];
  for (const centre of centres) {
    const data = await latestMonth(centre.centreKey);
    const onePager = await onePagerStore.get(centre.centreKey);
    if (!data) {
      report.push({ kindergarten: centre.name, month: "no bookings stored" });
      continue;
    }
    const inferred = inferOperatingHours(data.rows);
    if (raw) console.log(centre.name, data.month, JSON.stringify(inferred.days, null, 1));
    const stored = onePager?.hours ?? "";
    // Only a sessional service's bookings are its hours. Where families book
    // their own hours (All Day), bookings can be shorter than opening hours,
    // so the stored hours stay and the booked span is only reported.
    const next = inferred.sessional ? mergeHours(inferred.text, stored) : stored;
    const changed = Boolean(inferred.text) && next !== stored;
    if (apply && changed && onePager) await onePagerStore.update(centre.centreKey, { hours: next });
    report.push({
      kindergarten: centre.name,
      month: data.month,
      bookings: data.rows.length,
      sessional: inferred.sessional,
      infocare: inferred.text.replaceAll("\n", " | "),
      stored: stored.replaceAll("\n", " | "),
      [apply ? "saved" : "would save"]: changed ? next.replaceAll("\n", " | ") : "",
    });
  }
  for (const row of report) console.log(JSON.stringify(row));
} finally {
  await prisma.$disconnect();
}
process.exit(0);
