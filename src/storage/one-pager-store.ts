// Info Sheets storage: the shared template text (one row), each kindergarten's
// own fields and its four photos. Photos are files under uploads/one-pager
// (storagePath), the same layout as task attachments.
import { prisma } from "../db.js";
import type { KnownCentreContact } from "../one-pager/prefill.js";
import { DEFAULT_ONE_PAGER_TEMPLATE, type OnePagerFields, type OnePagerServiceModel, type OnePagerSlot, type OnePagerTemplateText } from "../one-pager/template.js";

export type OnePagerCentre = { centreKey: number; name: string; licenseNumber: number | null };

export type OnePagerImageRecord = {
  id: number;
  onePagerId: number;
  slot: string;
  storedName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  // True only for a picture the app got from the AI image model itself.
  aiGenerated: boolean;
  aiPrompt: string;
  createdAt: Date;
};

// What can be saved on an info sheet: its text, and which service model it is.
export type OnePagerChanges = Partial<OnePagerFields> & { serviceModel?: OnePagerServiceModel };

export type OnePagerRecord = OnePagerFields & {
  id: number;
  centreKey: number;
  // "kindergarten" or "all-day"; read with resolveOnePagerServiceModel.
  serviceModel: string;
  // The "In use" tick in the list. Not in use: no team photo is asked for.
  inUse: boolean;
  updatedAt: Date;
  images: OnePagerImageRecord[];
  // The photo each slot held before its last replacement (at most one a slot).
  previousImages: OnePagerImageRecord[];
};

// aiGenerated is left out (false) for every upload and import. It is set
// where a picture from the AI image model is stored, and by the user with
// the tick box (setImageAiGenerated).
export type OnePagerFileInput = { storedName: string; storagePath: string; mimeType: string; sizeBytes: number; aiGenerated?: boolean; aiPrompt?: string };
// What the app holds about a kindergarten that an About us draft may use.
export type OnePagerAboutSources = {
  isEnviroschool: boolean;
  introParagraph: string;
  currentWebsiteHtml: string | null;
  oldWebsiteHtml: string | null;
};

export type OnePagerStore = {
  // Every open kindergarten that is not ignored, by name.
  listCentres(): Promise<OnePagerCentre[]>;
  getTemplate(): Promise<OnePagerTemplateText>;
  updateTemplate(changes: Partial<OnePagerTemplateText>): Promise<OnePagerTemplateText>;
  list(): Promise<OnePagerRecord[]>;
  get(centreKey: number): Promise<OnePagerRecord | null>;
  // The kindergarten's info sheet, created with `initial` if it has none yet.
  ensure(centreKey: number, initial: OnePagerChanges): Promise<OnePagerRecord>;
  update(centreKey: number, changes: OnePagerChanges): Promise<OnePagerRecord | null>;
  // The "In use" tick. Not an edit of the sheet: its "last edited" stays put.
  setInUse(centreKey: number, inUse: boolean): Promise<void>;
  // Puts a photo in a slot. The photo it replaces is kept as the slot's
  // previous photo; returns the older previous photo that is no longer kept
  // (its file can go), if any.
  setImage(onePagerId: number, slot: OnePagerSlot, file: OnePagerFileInput): Promise<OnePagerImageRecord | null>;
  // Swaps the slot's photo with its previous photo, each keeping its own AI
  // generated flag and date. False when the slot has no previous photo.
  revertImage(onePagerId: number, slot: OnePagerSlot): Promise<boolean>;
  // Empties the slot; returns every photo no longer kept (the photo and the
  // slot's previous photo).
  removeImage(onePagerId: number, slot: OnePagerSlot): Promise<OnePagerImageRecord[]>;
  // The user's AI generated tick on the photo in the slot. False when the slot is empty.
  setImageAiGenerated(onePagerId: number, slot: OnePagerSlot, aiGenerated: boolean): Promise<boolean>;
  getImage(id: number): Promise<OnePagerImageRecord | null>;
  knownContact(licenseNumber: number | null): Promise<KnownCentreContact | null>;
  aboutSources(centreKey: number): Promise<OnePagerAboutSources>;
};

const WITH_FILES = {
  images: true,
  previousImages: true,
};

// A photo row as it moves between the slot and the slot's previous photo:
// everything but its id, so it keeps the flag and date it was stored with.
function movedImage(image: OnePagerImageRecord) {
  const { onePagerId, slot, storedName, storagePath, mimeType, sizeBytes, aiGenerated, aiPrompt, createdAt } = image;
  return { onePagerId, slot, storedName, storagePath, mimeType, sizeBytes, aiGenerated, aiPrompt, createdAt };
}

function templateText(row: OnePagerTemplateText): OnePagerTemplateText {
  return {
    tagline: row.tagline,
    website: row.website,
    costText: row.costText,
    teachersText: row.teachersText,
    enrolText: row.enrolText,
    allDayCostText: row.allDayCostText,
    allDayEnrolText: row.allDayEnrolText,
  };
}

export const onePagerStore: OnePagerStore = {
  async listCentres() {
    const centres = await prisma.centreReference.findMany({
      where: { ignored: false, openStatus: "Open" },
      orderBy: [{ name: "asc" }],
      select: { centreKey: true, name: true, licenseNumber: true },
    });
    // Infocare names can carry a double space ("Arataki  Kindergarten"); the
    // page, the PDF and its file name all use the tidy name.
    return centres.map((centre) => ({ ...centre, name: centre.name.replace(/\s+/g, " ").trim() }));
  },

  async getTemplate() {
    const row = await prisma.onePagerTemplate.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...DEFAULT_ONE_PAGER_TEMPLATE } });
    return templateText(row);
  },

  async updateTemplate(changes) {
    const row = await prisma.onePagerTemplate.upsert({
      where: { id: 1 },
      update: changes,
      create: { id: 1, ...DEFAULT_ONE_PAGER_TEMPLATE, ...changes },
    });
    return templateText(row);
  },

  list: () => prisma.onePager.findMany({ include: WITH_FILES }),

  get: (centreKey) => prisma.onePager.findUnique({ where: { centreKey }, include: WITH_FILES }),

  ensure: (centreKey, initial) =>
    prisma.onePager.upsert({ where: { centreKey }, update: {}, create: { centreKey, ...initial }, include: WITH_FILES }),

  async update(centreKey, changes) {
    const existing = await prisma.onePager.findUnique({ where: { centreKey }, select: { id: true } });
    if (!existing) return null;
    return prisma.onePager.update({ where: { centreKey }, data: changes, include: WITH_FILES });
  },

  async setInUse(centreKey, inUse) {
    const current = await prisma.onePager.findUniqueOrThrow({ where: { centreKey }, select: { updatedAt: true } });
    await prisma.onePager.update({ where: { centreKey }, data: { inUse, updatedAt: current.updatedAt } });
  },

  async setImage(onePagerId, slot, file) {
    return prisma.$transaction(async (tx) => {
      const where = { onePagerId_slot: { onePagerId, slot } };
      const replaced = await tx.onePagerImage.findUnique({ where });
      let dropped: OnePagerImageRecord | null = null;
      if (replaced) {
        // The replaced photo becomes the one Revert brings back; the one kept before it goes.
        dropped = await tx.onePagerPreviousImage.findUnique({ where });
        if (dropped) await tx.onePagerPreviousImage.delete({ where: { id: dropped.id } });
        await tx.onePagerImage.delete({ where: { id: replaced.id } });
        await tx.onePagerPreviousImage.create({ data: movedImage(replaced) });
      }
      await tx.onePagerImage.create({ data: { onePagerId, slot, ...file } });
      // The photo is part of the info sheet: its "last edited" moves too.
      await tx.onePager.update({ where: { id: onePagerId }, data: { updatedAt: new Date() } });
      return dropped;
    });
  },

  async revertImage(onePagerId, slot) {
    return prisma.$transaction(async (tx) => {
      const where = { onePagerId_slot: { onePagerId, slot } };
      const kept = await tx.onePagerPreviousImage.findUnique({ where });
      if (!kept) return false;
      const current = await tx.onePagerImage.findUnique({ where });
      await tx.onePagerPreviousImage.delete({ where: { id: kept.id } });
      if (current) {
        await tx.onePagerImage.delete({ where: { id: current.id } });
        await tx.onePagerPreviousImage.create({ data: movedImage(current) });
      }
      await tx.onePagerImage.create({ data: movedImage(kept) });
      await tx.onePager.update({ where: { id: onePagerId }, data: { updatedAt: new Date() } });
      return true;
    });
  },

  async removeImage(onePagerId, slot) {
    return prisma.$transaction(async (tx) => {
      const where = { onePagerId_slot: { onePagerId, slot } };
      const image = await tx.onePagerImage.findUnique({ where });
      const kept = await tx.onePagerPreviousImage.findUnique({ where });
      if (image) await tx.onePagerImage.delete({ where: { id: image.id } });
      if (kept) await tx.onePagerPreviousImage.delete({ where: { id: kept.id } });
      if (image || kept) await tx.onePager.update({ where: { id: onePagerId }, data: { updatedAt: new Date() } });
      return [image, kept].filter((entry): entry is OnePagerImageRecord => entry != null);
    });
  },

  async setImageAiGenerated(onePagerId, slot, aiGenerated) {
    const changed = await prisma.onePagerImage.updateMany({ where: { onePagerId, slot }, data: { aiGenerated } });
    return changed.count > 0;
  },

  getImage: (id) => prisma.onePagerImage.findUnique({ where: { id } }),

  async knownContact(licenseNumber) {
    if (licenseNumber == null) return null;
    return prisma.sectorCentre.findUnique({
      where: { eceId: licenseNumber },
      select: { address: true, suburb: true, city: true, phone: true, email: true },
    });
  },

  async aboutSources(centreKey) {
    const [profile, docs] = await Promise.all([
      prisma.jdCentreProfile.findUnique({ where: { centreKey }, select: { isEnviroschool: true, introParagraph: true } }),
      prisma.jdKnowledgeDoc.findMany({ where: { kind: "service", centreKey }, select: { label: true, contentHtml: true } }),
    ]);
    return {
      isEnviroschool: profile?.isEnviroschool ?? false,
      introParagraph: profile?.introParagraph ?? "",
      currentWebsiteHtml: docs.find((doc) => doc.label === "current")?.contentHtml ?? null,
      oldWebsiteHtml: docs.find((doc) => doc.label === "old")?.contentHtml ?? null,
    };
  },
};
