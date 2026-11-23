// Starts the One Pagers off from what already exists:
//   - the shared text (if it has not been saved yet)
//   - the 25 matched originals: their words and four photos from docs/One Pager
//   - OPEYS: contact details only; its supplied PDF actually describes Matua
// Safe to run again: it only fills fields and photo slots that are empty, so
// nothing typed or uploaded since is touched.
//   npx tsx scripts/one-pager-seed.ts
import "../src/load-env.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "../src/db.js";
import { contactFromKnown, fillEmptyFields } from "../src/one-pager/prefill.js";
import { ONE_PAGER_IMAGE_DIR } from "../src/one-pager/routes.js";
import { ONE_PAGER_SLOTS, defaultOnePagerServiceModel, type OnePagerFields } from "../src/one-pager/template.js";
import { onePagerStore, type OnePagerRecord } from "../src/storage/one-pager-store.js";
import { referencePhotos } from "./one-pager-reference-photos.js";
import { ONE_PAGER_REFERENCES } from "./one-pager-reference.js";

function fieldsOf(onePager: OnePagerRecord): OnePagerFields {
  const { aboutUs, address, phone, email, hours, costOverride, teachersOverride, enrolOverride, teamCaption } = onePager;
  return { aboutUs, address, phone, email, hours, costOverride, teachersOverride, enrolOverride, teamCaption };
}

try {
  await onePagerStore.getTemplate();
  const centres = await onePagerStore.listCentres();
  const report: Array<Record<string, unknown>> = [];

  for (const centre of centres) {
    const reference = ONE_PAGER_REFERENCES.find((entry) => centre.name.toLowerCase().startsWith(entry.centreName.toLowerCase()));
    const raw = await onePagerStore.knownContact(centre.licenseNumber);
    const contact = contactFromKnown(raw);
    const onePager = await onePagerStore.ensure(centre.centreKey, { serviceModel: defaultOnePagerServiceModel(centre.name) });

    // The reference's own words win over the directory's contact details.
    const known: Partial<OnePagerFields> = { ...contact, ...(reference?.fields ?? {}) };
    // Only a one pager with no About us yet takes the reference's optional
    // fields, so an override cleared on purpose is not put back.
    const fresh = !onePager.aboutUs.trim();
    const allowed = fresh ? known : { address: known.address, phone: known.phone, email: known.email };
    const changes = fillEmptyFields(fieldsOf(onePager), allowed);
    // A contact line still exactly as the directory gave it was filled in by
    // the app, not typed: the kindergarten's own sheet's wording replaces it.
    if (reference && raw) {
      const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
      for (const key of ["address", "phone", "email"] as const) {
        const stored = onePager[key];
        const fromDirectory = stored === contact[key] || stored === tidy(raw[key]);
        if (stored && fromDirectory && reference.fields[key] && reference.fields[key] !== stored) changes[key] = reference.fields[key];
      }
    }
    // An address or phone still exactly as the directory writes it (bare
    // street, "07-5766311") was put there by an earlier run, not typed: it
    // takes the tidied form.
    if (!reference && raw) {
      if (contact.address && onePager.address === raw.address.replace(/\s+/g, " ").trim()) changes.address = contact.address;
      if (contact.phone && onePager.phone === raw.phone.replace(/\s+/g, " ").trim()) changes.phone = contact.phone;
      if (changes.address === onePager.address) delete changes.address;
      if (changes.phone === onePager.phone) delete changes.phone;
    }
    if (Object.keys(changes).length) await onePagerStore.update(centre.centreKey, changes);
    const sources = await onePagerStore.aboutSources(centre.centreKey);

    let photos = 0;
    if (reference) {
      const taken = new Set(onePager.images.map((image) => image.slot));
      const extracted = taken.size < ONE_PAGER_SLOTS.length ? await referencePhotos(reference) : {};
      await mkdir(join(process.cwd(), ONE_PAGER_IMAGE_DIR), { recursive: true });
      for (const slot of ONE_PAGER_SLOTS) {
        const jpeg = extracted[slot]?.bytes;
        if (taken.has(slot) || !jpeg) continue;
        const storedName = `${randomUUID()}.jpg`;
        const storagePath = join(ONE_PAGER_IMAGE_DIR, storedName);
        await writeFile(join(process.cwd(), storagePath), jpeg, { flag: "wx" });
        await onePagerStore.setImage(onePager.id, slot, { storedName, storagePath, mimeType: "image/jpeg", sizeBytes: jpeg.length });
        photos += 1;
      }
    }

    report.push({
      kindergarten: centre.name,
      from: reference ? reference.pdf : contact.address || contact.phone || contact.email ? "Sector Insight (no matching original)" : "nothing held",
      filled: Object.keys(changes).join(", "),
      photos,
      // What an About us draft could be written from.
      aboutSources: [sources.currentWebsiteHtml ? "website" : "", sources.oldWebsiteHtml ? "old website" : "", sources.introParagraph ? "JD intro" : ""].filter(Boolean).join(", "),
      address: changes.address ?? "",
    });
  }

  console.table(report);
} finally {
  await prisma.$disconnect();
}
process.exit(0);
