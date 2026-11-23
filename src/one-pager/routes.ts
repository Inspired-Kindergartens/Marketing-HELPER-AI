// Info Sheets: the page and its API.
//
//   GET  /one-pager[?centre=<centreKey>&panel=<id>]    the page
//   POST /api/one-pager/template                       save the shared text
//   POST /api/one-pager/:centreKey                     save the kindergarten's text
//   POST /api/one-pager/:centreKey/email-note          { subject, body }: keep an email sent to the
//                                                      kindergarten as a note on it
//   POST /api/one-pager/:centreKey/notes               { text }: keep a note on the kindergarten
//   POST /api/one-pager/:centreKey/prefill            contact details we know (not saved)
//   POST /api/one-pager/:centreKey/draft-about         an About us draft from the AI, written from
//                                                      { notes } and what is held (not saved)
//   POST /api/one-pager/:centreKey/images/:slot        put a photo in a slot (multipart); answers
//                                                      upscale: true when it has too few pixels to
//                                                      print sharply there and the AI can upscale it
//   POST /api/one-pager/:centreKey/images/:slot/upscale  { containsRealChildren }: the same picture
//                                                      at full size; refused unless it has no real children
//   POST /api/one-pager/:centreKey/images/:slot/generate  { prompt }: put an AI generated
//                                                      picture in a slot, flagged aiGenerated
//   POST /api/one-pager/:centreKey/images/:slot/regenerate  { containsRealChildren, request, option }:
//                                                      a new picture made from the one in the slot;
//                                                      refused unless it has no real children
//   POST /api/one-pager/:centreKey/images/:slot/ai-generated  { aiGenerated }: the user's AI generated tick
//   POST /api/one-pager/:centreKey/images/:slot/revert put back the photo it replaced
//   POST /api/one-pager/:centreKey/images/:slot/delete remove it
//   GET  /api/one-pager/images/:id/file                the photo
//   GET  /api/one-pager/:centreKey/pdf[?inline=1]      the PDF as it stands now; with &badges=1 (the
//                                                      preview) "Staff photo needed" and "Email sent"
//                                                      are drawn over the team photo when they apply
//
// A change answers with the panel bodies it touched (fragments), which the
// page swaps in place.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {} from "@fastify/multipart";

import type { AiChatMessage } from "../ai/client.js";
import { buildOnePagerAboutMessages, cleanOnePagerAboutDraft, hasOnePagerAboutSource } from "../ai/one-pager-context.js";
import { AI_IMAGES_NOT_SET_UP, assertNoRealChildren, type SlotImageRegenerator } from "../image-ai/photo-slot.js";
import type { OnePagerCentre, OnePagerRecord, OnePagerStore } from "../storage/one-pager-store.js";
import {
  ONE_PAGER_NOTE_MAX,
  renderOnePagerAppShell,
  renderOnePagerFragments,
  type OnePagerFragmentKey,
  type OnePagerNote,
  type OnePagerPageData,
  type OnePagerPeople,
} from "../ui/one-pager-app-shell.js";
import { describeOnePagerFit, onePagerPhotoIsTooSmall, renderOnePagerPdf, type OnePagerImages, type OnePagerPdf } from "../ui/one-pager-pdf.js";
import { joinGreetingNames, onePagerEmailNote, teamPhotoBadges } from "./email.js";
import { contactFromKnown } from "./prefill.js";
import {
  cleanOnePagerFields,
  cleanOnePagerTemplate,
  cleanOnePagerText,
  defaultOnePagerServiceModel,
  isOnePagerSlot,
  onePagerFilename,
  resolveOnePagerContent,
  resolveOnePagerServiceModel,
  type OnePagerFields,
  type OnePagerSlot,
} from "./template.js";

export const ONE_PAGER_IMAGE_DIR = join("uploads", "one-pager");
export const ONE_PAGER_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
// Notes sent with a draft request can be longer than a saved About us.
const ONE_PAGER_NOTES_MAX = 6000;
const ONE_PAGER_IMAGE_PROMPT_MAX = 4000;

export type OnePagerRouteOptions = {
  store: OnePagerStore;
  // The folder storagePath is relative to (the project folder).
  rootDir?: string;
  // Runs the app's one chat model on a prompt and returns its reply. Left out
  // when the local AI is not available, and Draft with AI then says so.
  runChat?: (messages: AiChatMessage[]) => Promise<string>;
  // Called when the page opens, to wake the local AI before a draft is asked for.
  warmAi?: () => void;
  // Makes a picture from a description with the AI image model (made in
  // src/image-ai, which is the only code that talks to OpenAI). Left out when
  // AI images are not set up. Only the description is sent; no photo ever is.
  generateImage?: (prompt: string) => Promise<{ bytes: Buffer; mimeType: string }>;
  // Makes a new picture from the one in a slot (also made in src/image-ai).
  // This one uploads the picture, and refuses unless it is AI generated or
  // the user answered that it contains no real children.
  regenerateImage?: SlotImageRegenerator;
  // Team photo upkeep: `check` raises a task for any kindergarten whose
  // teaching team has changed (run when the page opens); `openTasks` gives the
  // open task of each kindergarten that has one, by centreKey.
  staffPhoto?: { check(): Promise<unknown>; openTasks(): Promise<Map<number, number>> };
  // Emailing the kindergarten: `contactNames` gives who to greet (the head
  // teacher and administrator from the contact list).
  contactNames?: (centre: OnePagerCentre) => Promise<string[]>;
  // The kindergarten's notes (the ones the Marketing page keeps on it):
  // `list` reads them newest first for the Notes panel, `add` keeps a new one
  // (typed in the panel, or an email that was sent).
  notes?: { list(centre: OnePagerCentre): Promise<OnePagerNote[]>; add(centre: OnePagerCentre, text: string): Promise<void> };
  // Who looks after each kindergarten (its senior leader, head teacher and
  // administrator, from the contact list), by centreKey, for the list.
  people?: (centres: OnePagerCentre[]) => Promise<Record<number, OnePagerPeople>>;
  now?: () => Date;
};

function parseId(value: unknown): number | null {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// JPEG or PNG by its first bytes, whatever the upload called itself: these
// are the two kinds the PDF can hold.
export function sniffOnePagerImage(bytes: Buffer): "image/jpeg" | "image/png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

function downloadHeader(filename: string, inline: boolean): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function fieldsOf(onePager: OnePagerRecord): OnePagerFields {
  const { aboutUs, address, phone, email, hours, costOverride, teachersOverride, enrolOverride, teamCaption } = onePager;
  return { aboutUs, address, phone, email, hours, costOverride, teachersOverride, enrolOverride, teamCaption };
}

export function registerOnePagerRoutes(app: FastifyInstance, options: OnePagerRouteOptions): void {
  const { store } = options;
  const rootDir = options.rootDir ?? process.cwd();
  const now = options.now ?? (() => new Date());

  async function findCentre(value: unknown): Promise<OnePagerCentre | null> {
    const centreKey = parseId(value);
    if (centreKey == null) return null;
    return (await store.listCentres()).find((centre) => centre.centreKey === centreKey) ?? null;
  }

  // The kindergarten's info sheet; its first opening starts it with the
  // contact details the app already holds.
  async function open(centre: OnePagerCentre): Promise<OnePagerRecord> {
    const existing = await store.get(centre.centreKey);
    if (existing) return existing;
    const known = await store.knownContact(centre.licenseNumber).catch(() => null);
    return store.ensure(centre.centreKey, { ...contactFromKnown(known), serviceModel: defaultOnePagerServiceModel(centre.name) });
  }

  async function pageData(centre: OnePagerCentre | null): Promise<OnePagerPageData> {
    // Opened first so a newly started info sheet is in the list too.
    const onePager = centre ? await open(centre) : null;
    const [centres, onePagers, template] = await Promise.all([store.listCentres(), store.list(), store.getTemplate()]);
    // Fails soft: the page works without the team photo markers.
    const photoTasks = await (options.staffPhoto?.openTasks() ?? Promise.resolve(new Map<number, number>())).catch((error) => {
      app.log.warn({ error }, "Info sheet team photo tasks unavailable");
      return new Map<number, number>();
    });
    // Who the Email kindergarten button writes to. Without the contact list the greeting is "there".
    const names = centre && options.contactNames ? await options.contactNames(centre).catch(() => []) : [];
    const emailContact = onePager ? { to: onePager.email, greeting: joinGreetingNames(names) } : undefined;
    // Fails soft: without the contact list the list's people columns are empty.
    const people = options.people ? await options.people(centres).catch(() => ({})) : {};
    // Fails soft: without the notes the Notes panel is empty.
    const notes = centre && options.notes
      ? await options.notes.list(centre).catch((error) => {
          app.log.warn({ error }, "Info sheet notes unavailable");
          return [];
        })
      : [];
    return { centres, onePagers, template, selected: centre && onePager ? { centre, onePager } : null, photoTasks: Object.fromEntries(photoTasks), emailContact, people, notes };
  }

  async function fragmentsReply(centre: OnePagerCentre | null, keys: OnePagerFragmentKey[]) {
    return { ok: true, fragments: renderOnePagerFragments(await pageData(centre), keys) };
  }

  async function readImages(onePager: OnePagerRecord): Promise<OnePagerImages> {
    const images: OnePagerImages = {};
    for (const image of onePager.images) {
      if (!isOnePagerSlot(image.slot)) continue;
      // A photo whose file has gone leaves its slot empty rather than failing the page.
      const bytes = await readFile(join(rootDir, image.storagePath)).catch(() => null);
      if (bytes) images[image.slot] = { bytes, mimeType: image.mimeType };
    }
    return images;
  }

  async function buildPdf(centre: OnePagerCentre, onePager: OnePagerRecord, teamBadges: string[] = []): Promise<OnePagerPdf> {
    const template = await store.getTemplate();
    const content = resolveOnePagerContent(centre.name, fieldsOf(onePager), template, resolveOnePagerServiceModel(onePager.serviceModel));
    return renderOnePagerPdf(content, await readImages(onePager), { teamBadges });
  }

  // The preview's badges over the team photo: a new photo is needed, and the
  // kindergarten has been emailed for one. Fails soft: no badges.
  async function previewBadges(centre: OnePagerCentre, onePager: OnePagerRecord): Promise<string[]> {
    const [tasks, notes] = await Promise.all([
      (options.staffPhoto?.openTasks() ?? Promise.resolve(new Map<number, number>())).catch(() => new Map<number, number>()),
      (options.notes?.list(centre) ?? Promise.resolve([])).catch(() => []),
    ]);
    return teamPhotoBadges({
      photoDue: tasks.has(centre.centreKey),
      teamPhotoAt: onePager.images.find((image) => image.slot === "team")?.createdAt ?? null,
      notes,
    });
  }

  const notFound = { ok: false, error: "That kindergarten was not found." };
  const NOTES_UNAVAILABLE = "Notes are not available.";
  const AI_PICTURE_UNUSABLE = "The AI image came back in a form the info sheet cannot use.";

  // Puts a picture that came from the AI image model in a slot. This is the
  // only place a photo is stored flagged AI generated (the user can also tick
  // or untick a photo afterwards). False when the bytes are not a JPEG or PNG.
  async function storeAiPicture(centre: OnePagerCentre, slot: OnePagerSlot, bytes: Buffer, prompt: string): Promise<boolean> {
    const mimeType = sniffOnePagerImage(bytes);
    if (!mimeType) return false;
    const onePager = await open(centre);
    const storedName = `${randomUUID()}.${mimeType === "image/png" ? "png" : "jpg"}`;
    const storagePath = join(ONE_PAGER_IMAGE_DIR, storedName);
    await mkdir(join(rootDir, ONE_PAGER_IMAGE_DIR), { recursive: true });
    await writeFile(join(rootDir, storagePath), bytes, { flag: "wx" });
    try {
      // The photo it replaces is kept for Revert; the one kept before that goes.
      const dropped = await store.setImage(onePager.id, slot, { storedName, storagePath, mimeType, sizeBytes: bytes.length, aiGenerated: true, aiPrompt: prompt });
      if (dropped) await unlink(join(rootDir, dropped.storagePath)).catch(() => undefined);
    } catch (error) {
      await unlink(join(rootDir, storagePath)).catch(() => undefined);
      throw error;
    }
    return true;
  }

  app.get<{ Querystring: { centre?: string; panel?: string } }>("/one-pager", async (request, reply) => {
    options.warmAi?.();
    // Staff changes since the last look raise their team photo task now, so
    // the list shows them. Reads stored data only; a failure never stops the page.
    await options.staffPhoto?.check().catch((error) => app.log.warn({ error }, "Info sheet team photo check failed"));
    const centre = await findCentre(request.query?.centre);
    reply.type("text/html; charset=utf-8");
    return renderOnePagerAppShell(await pageData(centre), request.query?.panel ?? null);
  });

  // Registered before /api/one-pager/:centreKey so "template" is never taken as a key.
  app.post<{ Body: Record<string, unknown> }>("/api/one-pager/template", async (request, reply) => {
    const changes = cleanOnePagerTemplate(request.body ?? {});
    const blank = Object.entries(changes).find(([, value]) => !value);
    if (blank) {
      reply.code(400);
      return { ok: false, error: "Shared text cannot be left empty: every kindergarten without its own text uses it." };
    }
    const template = await store.updateTemplate(changes);
    return { ok: true, template, fragments: renderOnePagerFragments(await pageData(null), ["shared"]) };
  });

  app.post<{ Params: { centreKey: string }; Body: Record<string, unknown> }>("/api/one-pager/:centreKey", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) {
      reply.code(404);
      return notFound;
    }
    await open(centre);
    const body = request.body ?? {};
    await store.update(centre.centreKey, {
      ...cleanOnePagerFields(body),
      ...(body.serviceModel !== undefined ? { serviceModel: resolveOnePagerServiceModel(body.serviceModel) } : {}),
    });
    return fragmentsReply(centre, ["text", "list"]);
  });

  // Keeps an email that was sent to the kindergarten (the user said yes to
  // "Did you send the email?") as a note on it.
  app.post<{ Params: { centreKey: string }; Body: { kind?: unknown; subject?: unknown; body?: unknown } }>("/api/one-pager/:centreKey/email-note", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) {
      reply.code(404);
      return notFound;
    }
    const email = { subject: cleanOnePagerText(request.body?.subject, 300), body: cleanOnePagerText(request.body?.body, ONE_PAGER_NOTES_MAX) };
    if (!email.subject && !email.body) {
      reply.code(400);
      return { ok: false, error: "There is no email to note." };
    }
    if (!options.notes) {
      reply.code(503);
      return { ok: false, error: NOTES_UNAVAILABLE };
    }
    await options.notes.add(centre, onePagerEmailNote(email, request.body?.kind));
    return reply.code(201).send(await fragmentsReply(centre, ["notes"]));
  });

  // A note typed in the Notes panel, kept with the kindergarten's other notes.
  app.post<{ Params: { centreKey: string }; Body: { text?: unknown } }>("/api/one-pager/:centreKey/notes", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) {
      reply.code(404);
      return notFound;
    }
    const text = cleanOnePagerText(request.body?.text, ONE_PAGER_NOTE_MAX);
    if (!text) {
      reply.code(400);
      return { ok: false, error: "Type the note first." };
    }
    if (!options.notes) {
      reply.code(503);
      return { ok: false, error: NOTES_UNAVAILABLE };
    }
    await options.notes.add(centre, text);
    return reply.code(201).send(await fragmentsReply(centre, ["notes"]));
  });

  app.post<{ Params: { centreKey: string } }>("/api/one-pager/:centreKey/prefill", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) {
      reply.code(404);
      return notFound;
    }
    const contact = contactFromKnown(await store.knownContact(centre.licenseNumber));
    if (!contact.address && !contact.phone && !contact.email) {
      reply.code(404);
      return { ok: false, error: `No contact details are held for ${centre.name}. Update Sector Insight, or type them in.` };
    }
    return { ok: true, contact };
  });

  app.post<{ Params: { centreKey: string }; Body: { notes?: unknown } }>("/api/one-pager/:centreKey/draft-about", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) {
      reply.code(404);
      return notFound;
    }
    if (!options.runChat) {
      reply.code(503);
      return { ok: false, error: "The local AI isn't available right now. Try again in a minute." };
    }

    const input = {
      centreName: centre.name,
      ...(await store.aboutSources(centre.centreKey)),
      notes: cleanOnePagerText(request.body?.notes, ONE_PAGER_NOTES_MAX),
    };
    if (!hasOnePagerAboutSource(input)) {
      reply.code(422);
      return { ok: false, error: `Nothing is held about ${centre.name} to write from. Paste its website text or your notes into About us, then press Draft with AI.` };
    }

    try {
      const text = cleanOnePagerAboutDraft(await options.runChat(buildOnePagerAboutMessages(input)));
      if (!text) throw new Error("empty draft");
      return { ok: true, text };
    } catch (error) {
      app.log.warn({ error }, "Info sheet About us draft failed");
      reply.code(502);
      return { ok: false, error: "The local AI could not write a draft. Try again in a minute." };
    }
  });

  app.post<{ Params: { centreKey: string; slot: string } }>("/api/one-pager/:centreKey/images/:slot", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    const slot = request.params.slot;
    if (!centre || !isOnePagerSlot(slot)) {
      reply.code(404);
      return notFound;
    }
    if (!request.isMultipart()) {
      reply.code(400);
      return { ok: false, error: "Send the photo as a file." };
    }
    const part = await request.file();
    const bytes = part ? await part.toBuffer() : null;
    const mimeType = bytes ? sniffOnePagerImage(bytes) : null;
    if (!bytes || !mimeType) {
      reply.code(400);
      return { ok: false, error: "That file is not a JPG or PNG photo." };
    }
    if (bytes.length > ONE_PAGER_IMAGE_MAX_BYTES) {
      reply.code(413);
      return { ok: false, error: "That photo is too large. Keep it under 12 MB." };
    }

    const onePager = await open(centre);
    const storedName = `${randomUUID()}.${mimeType === "image/png" ? "png" : "jpg"}`;
    const storagePath = join(ONE_PAGER_IMAGE_DIR, storedName);
    await mkdir(join(rootDir, ONE_PAGER_IMAGE_DIR), { recursive: true });
    await writeFile(join(rootDir, storagePath), bytes, { flag: "wx" });

    try {
      // An upload starts unflagged, whatever it replaces; the user ticks AI generated if it is.
      const dropped = await store.setImage(onePager.id, slot, { storedName, storagePath, mimeType, sizeBytes: bytes.length, aiGenerated: false });
      if (dropped) await unlink(join(rootDir, dropped.storagePath)).catch(() => undefined);
    } catch (error) {
      await unlink(join(rootDir, storagePath)).catch(() => undefined);
      throw error;
    }
    // A photo with too few pixels for its place on the page (a tight crop)
    // can be upscaled by the AI: the page then asks the real children
    // question. Never the team photo, which is of real staff.
    const upscale = Boolean(options.regenerateImage) && slot !== "team" && (await onePagerPhotoIsTooSmall(slot, bytes));
    return { ...(await fragmentsReply(centre, ["photos", "list"])), upscale };
  });

  // An AI generated picture for a slot. Only the typed description goes to
  // OpenAI. The picture that comes back is stored with aiGenerated set; an
  // upload into the same slot later replaces it with an unflagged photo.
  app.post<{ Params: { centreKey: string; slot: string }; Body: { prompt?: unknown } }>("/api/one-pager/:centreKey/images/:slot/generate", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    const slot = request.params.slot;
    if (!centre || !isOnePagerSlot(slot)) {
      reply.code(404);
      return notFound;
    }
    if (!options.generateImage) {
      reply.code(503);
      return { ok: false, error: AI_IMAGES_NOT_SET_UP };
    }
    const prompt = cleanOnePagerText(request.body?.prompt, ONE_PAGER_IMAGE_PROMPT_MAX);
    if (!prompt) {
      reply.code(400);
      return { ok: false, error: "Describe the picture you want." };
    }

    let generated: { bytes: Buffer; mimeType: string };
    try {
      generated = await options.generateImage(prompt);
    } catch (error) {
      // The image feature's own errors carry the status and wording to show.
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (error instanceof Error && typeof statusCode === "number") {
        reply.code(statusCode);
        return { ok: false, error: error.message };
      }
      throw error;
    }
    if (!(await storeAiPicture(centre, slot, generated.bytes, prompt))) {
      reply.code(502);
      return { ok: false, error: AI_PICTURE_UNUSABLE };
    }
    return fragmentsReply(centre, ["photos", "list"]);
  });

  // A new picture made from the one in the slot, for example a photo of the
  // empty playground with children added. The picture is uploaded to OpenAI,
  // so the user must first have answered "no" to "Does this image contain
  // real children?" ({ containsRealChildren: "no" }); "yes" stops it. A
  // picture already flagged AI generated skips the question. `request` is what
  // the user wants to see; when empty, `option` picks a predefined request.
  type RedrawBody = { containsRealChildren?: unknown; request?: unknown; option?: unknown };
  async function redraw(params: { centreKey: string; slot: string }, body: RedrawBody | undefined, reply: FastifyReply, upscale: boolean) {
    const centre = await findCentre(params.centreKey);
    const slot = params.slot;
    // The team photo is of real staff and is never redrawn.
    if (!centre || !isOnePagerSlot(slot) || slot === "team") {
      reply.code(404);
      return notFound;
    }
    if (!options.regenerateImage) {
      reply.code(503);
      return { ok: false, error: AI_IMAGES_NOT_SET_UP };
    }
    const onePager = await open(centre);
    const image = onePager.images.find((entry) => entry.slot === slot);
    const bytes = image ? await readFile(join(rootDir, image.storagePath)).catch(() => null) : null;
    if (!image || !bytes) {
      reply.code(404);
      return { ok: false, error: `There is no photo in that slot to ${upscale ? "upscale" : "regenerate"}. Upload one first.` };
    }
    // Upscaling is only for a photo with too few pixels for its place on the page.
    if (upscale && !(await onePagerPhotoIsTooSmall(slot, bytes))) {
      reply.code(409);
      return { ok: false, error: "That photo is already large enough to print sharply." };
    }

    const answer = body?.containsRealChildren;
    let redrawn: { bytes: Buffer; mimeType: string; prompt: string };
    try {
      // Checked here before the file is handed over, and again by the
      // regenerator itself, the only code that can send it.
      assertNoRealChildren(image, answer);
      redrawn = await options.regenerateImage({
        image: { bytes, mimeType: image.mimeType, aiGenerated: image.aiGenerated },
        containsRealChildren: answer,
        request: upscale ? "" : cleanOnePagerText(body?.request, ONE_PAGER_IMAGE_PROMPT_MAX),
        option: upscale ? "" : String(body?.option ?? ""),
        upscale,
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (error instanceof Error && typeof statusCode === "number") {
        reply.code(statusCode);
        return { ok: false, error: error.message };
      }
      throw error;
    }
    app.log.info({ centreKey: centre.centreKey, slot, aiGenerated: image.aiGenerated, containsRealChildren: answer }, upscale ? "Info sheet photo sent for upscaling" : "Info sheet photo sent for regeneration");

    if (!(await storeAiPicture(centre, slot, redrawn.bytes, redrawn.prompt))) {
      reply.code(502);
      return { ok: false, error: AI_PICTURE_UNUSABLE };
    }
    return fragmentsReply(centre, ["photos", "list"]);
  }

  app.post<{ Params: { centreKey: string; slot: string }; Body: RedrawBody }>("/api/one-pager/:centreKey/images/:slot/regenerate", (request, reply) =>
    redraw(request.params, request.body, reply, false),
  );

  // The same picture at full size, for a photo that was cropped (or arrived)
  // with too few pixels to print sharply in its slot. The picture is uploaded
  // to OpenAI, so it is behind the same question as a regeneration:
  // { containsRealChildren: "no" } sends it, "yes" stops it, and a picture
  // flagged AI generated skips the question. The cropped photo it replaces is
  // kept for Revert.
  app.post<{ Params: { centreKey: string; slot: string }; Body: RedrawBody }>("/api/one-pager/:centreKey/images/:slot/upscale", (request, reply) =>
    redraw(request.params, request.body, reply, true),
  );

  app.post<{ Params: { centreKey: string; slot: string } }>("/api/one-pager/:centreKey/images/:slot/delete", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    const slot = request.params.slot;
    if (!centre || !isOnePagerSlot(slot)) {
      reply.code(404);
      return notFound;
    }
    const onePager = await open(centre);
    // Removing empties the slot for good: the photo kept for Revert goes too.
    for (const removed of await store.removeImage(onePager.id, slot)) await unlink(join(rootDir, removed.storagePath)).catch(() => undefined);
    return fragmentsReply(centre, ["photos", "list"]);
  });

  // The AI generated tick box: the user says whether the photo in the slot is
  // AI generated ({ aiGenerated }, a boolean). A ticked photo skips the
  // real children question when it is regenerated, as one the app generated does.
  app.post<{ Params: { centreKey: string; slot: string }; Body: { aiGenerated?: unknown } }>("/api/one-pager/:centreKey/images/:slot/ai-generated", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    const slot = request.params.slot;
    if (!centre || !isOnePagerSlot(slot)) {
      reply.code(404);
      return notFound;
    }
    const ticked = request.body?.aiGenerated;
    if (typeof ticked !== "boolean") {
      reply.code(400);
      return { ok: false, error: "Say whether the photo is AI generated." };
    }
    const onePager = await open(centre);
    if (!(await store.setImageAiGenerated(onePager.id, slot, ticked))) {
      reply.code(404);
      return { ok: false, error: "There is no photo in that slot." };
    }
    app.log.info({ centreKey: centre.centreKey, slot, aiGenerated: ticked }, "Info sheet photo AI generated tick set by the user");
    return fragmentsReply(centre, ["photos"]);
  });

  // Puts back the photo the slot held before its last replacement. The two
  // swap, so a second Revert undoes the first. Nothing is sent anywhere, and
  // each photo keeps the AI generated flag it was stored with.
  app.post<{ Params: { centreKey: string; slot: string } }>("/api/one-pager/:centreKey/images/:slot/revert", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    const slot = request.params.slot;
    if (!centre || !isOnePagerSlot(slot)) {
      reply.code(404);
      return notFound;
    }
    const onePager = await open(centre);
    if (!(await store.revertImage(onePager.id, slot))) {
      reply.code(404);
      return { ok: false, error: "There is no earlier photo in that slot to go back to." };
    }
    return fragmentsReply(centre, ["photos", "list"]);
  });

  app.get<{ Params: { id: string } }>("/api/one-pager/images/:id/file", async (request, reply) => {
    const id = parseId(request.params.id);
    const image = id == null ? null : await store.getImage(id);
    const file = image ? await readFile(join(rootDir, image.storagePath)).catch(() => null) : null;
    if (!image || !file) return reply.code(404).send({ ok: false, error: "Photo not found." });
    // A replaced photo gets a new id, so a photo's address never changes content.
    return reply.type(image.mimeType).header("Cache-Control", "private, max-age=86400").send(file);
  });

  app.get<{ Params: { centreKey: string }; Querystring: { inline?: string; badges?: string } }>("/api/one-pager/:centreKey/pdf", async (request, reply) => {
    const centre = await findCentre(request.params.centreKey);
    if (!centre) return reply.code(404).send(notFound);
    const onePager = await open(centre);
    // Only the page's preview asks for the badges; a download never has them.
    const pdf = await buildPdf(centre, onePager, request.query?.badges ? await previewBadges(centre, onePager) : []);
    return reply
      .type("application/pdf")
      .header("Cache-Control", "no-store")
      .header("X-One-Pager-Fit", encodeURIComponent(describeOnePagerFit(pdf.fit)))
      .header("Content-Disposition", downloadHeader(onePagerFilename(centre.name, now()), Boolean(request.query?.inline)))
      .send(pdf.buffer);
  });
}
