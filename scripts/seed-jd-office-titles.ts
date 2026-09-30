// Seeds the non-centre-specific ("Other") job titles used by office and
// org-wide roles, so the /jd Location = "Other" path has titles to pick from.
//
// Idempotent: upsertTitleProfile keys on jobTitle, so re-running this leaves
// existing rows (and any qualifications/role sections edited in Settings)
// with their current content rather than duplicating them.
//
// Run with: npx tsx scripts/seed-jd-office-titles.ts
import { listTitleProfiles, upsertTitleProfile } from "../src/storage/jd-store.js";

// jobCategory mirrors the values already in use ("Administration",
// "Education"); these are org-wide roles so none is centre specific and none
// maps onto a KTCA pay scale.
const OFFICE_TITLES: { jobTitle: string; jobCategory: string }[] = [
  { jobTitle: "Receptionist", jobCategory: "Administration" },
  { jobTitle: "HR Administrator", jobCategory: "Administration" },
  { jobTitle: "Finance Assistant", jobCategory: "Finance" },
  { jobTitle: "Accounts Coordinator", jobCategory: "Finance" },
  { jobTitle: "Payroll Officer", jobCategory: "Finance" },
  { jobTitle: "Communications Coordinator", jobCategory: "Communications" },
  { jobTitle: "Resource Teacher Early Intervention", jobCategory: "Education" },
];

async function main(): Promise<void> {
  const existing = await listTitleProfiles();
  const byTitle = new Map(existing.map((profile) => [profile.jobTitle.toLowerCase(), profile]));
  let sortOrder = existing.reduce((max, profile) => Math.max(max, profile.sortOrder), 0);

  for (const entry of OFFICE_TITLES) {
    const current = byTitle.get(entry.jobTitle.toLowerCase());

    if (current) {
      // Already present: only make sure it is flagged as an "Other" role, and
      // keep every other field the user may have edited in Settings.
      if (current.isCentreSpecific) {
        await upsertTitleProfile({ ...current, isCentreSpecific: false });
        console.log(`updated  ${entry.jobTitle} (now not centre specific)`);
      } else {
        console.log(`skipped  ${entry.jobTitle} (already seeded)`);
      }
      continue;
    }

    sortOrder += 1;
    await upsertTitleProfile({
      jobTitle: entry.jobTitle,
      jobCategory: entry.jobCategory,
      sortOrder,
      // Office roles are not on the Kindergarten Teachers Collective Agreement,
      // and the administrator layout is the one that omits the Senior Teacher
      // and collective-agreement rows.
      layoutVariant: "administrator",
      agreementText: "",
      qualificationsText: "",
      roleSections: [],
      isCentreSpecific: false,
    });
    console.log(`created  ${entry.jobTitle}`);
  }
}

await main();
process.exit(0);
