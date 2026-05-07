import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

export type CentreContact = {
  kindergarten: string;
  headTeacher: string;
  administrator: string;
  email: string;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buffer: Buffer) {
  const signature = 0x06054b50;

  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) {
      return index;
    }
  }

  throw new Error("Could not find XLSX central directory.");
}

function readZipEntries(buffer: Buffer) {
  const entries: ZipEntry[] = [];
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralDirectoryOffset) !== 0x02014b50) {
      throw new Error("Invalid XLSX central directory entry.");
    }

    const method = buffer.readUInt16LE(centralDirectoryOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralDirectoryOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralDirectoryOffset + 28);
    const extraFieldLength = buffer.readUInt16LE(centralDirectoryOffset + 30);
    const fileCommentLength = buffer.readUInt16LE(centralDirectoryOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralDirectoryOffset + 42);
    const name = buffer.toString("utf8", centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength);

    entries.push({ name, method, compressedSize, localHeaderOffset });
    centralDirectoryOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function readZipEntryText(buffer: Buffer, entries: ZipEntry[], name: string) {
  const entry = entries.find((candidate) => candidate.name === name);

  if (!entry) {
    return "";
  }

  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid XLSX local file header for ${name}.`);
  }

  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.method === 0) {
    return compressed.toString("utf8");
  }

  if (entry.method === 8) {
    return inflateRawSync(compressed).toString("utf8");
  }

  throw new Error(`Unsupported XLSX compression method ${entry.method} for ${name}.`);
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function readAttribute(attributes: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attributes);

  return match?.[1] ?? "";
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((textMatch) => decodeXml(textMatch[1]))
      .join("")
      .trim(),
  );
}

function columnIndex(cellReference: string) {
  const letters = cellReference.match(/^[A-Z]+/)?.[0] ?? "";
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }

  return index - 1;
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const cellBody = cellMatch[2];
      const index = columnIndex(readAttribute(attributes, "r"));
      const type = readAttribute(attributes, "t");
      const rawValue = cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inlineValue = cellBody.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";

      row[index] = type === "s" ? sharedStrings[Number(rawValue)] ?? "" : decodeXml(inlineValue || rawValue).trim();
    }

    return row;
  });
}

export function normalizeCentreContactName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(kindergarten|early\s+childhood\s+centre|centre|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getDistinctiveTokens(value: string) {
  return normalizeCentreContactName(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !["oscar"].includes(token));
}

export function matchCentreContact(serviceName: string, contacts: readonly CentreContact[]) {
  const normalizedServiceName = normalizeCentreContactName(serviceName);
  const serviceTokens = new Set(getDistinctiveTokens(serviceName));

  return (
    contacts.find((contact) => normalizeCentreContactName(contact.kindergarten) === normalizedServiceName) ??
    contacts.find((contact) => {
      const normalizedKindergarten = normalizeCentreContactName(contact.kindergarten);

      return (
        normalizedKindergarten.length > 0 &&
        (normalizedServiceName.includes(normalizedKindergarten) || normalizedKindergarten.includes(normalizedServiceName))
      );
    }) ??
    contacts.find((contact) => {
      const contactTokens = getDistinctiveTokens(contact.kindergarten).filter((token) => serviceTokens.has(token));

      return contactTokens.some(
        (token) =>
          contacts.filter((candidate) => getDistinctiveTokens(candidate.kindergarten).includes(token)).length === 1,
      );
    }) ??
    null
  );
}

export async function readCentreContactList(filePath = join(process.cwd(), "centre-contact-list.xlsx")) {
  try {
    const workbook = await readFile(filePath);
    const entries = readZipEntries(workbook);
    const sharedStrings = parseSharedStrings(readZipEntryText(workbook, entries, "xl/sharedStrings.xml"));
    const rows = parseSheetRows(readZipEntryText(workbook, entries, "xl/worksheets/sheet1.xml"), sharedStrings);
    const headers = rows[0] ?? [];
    const kindergartenIndex = headers.indexOf("Kindergarten");
    const headTeacherIndex = headers.indexOf("Head Teacher");
    const administratorIndex = headers.indexOf("Administrator");
    const emailIndex = headers.indexOf("Email");

    if (kindergartenIndex < 0 || headTeacherIndex < 0 || administratorIndex < 0 || emailIndex < 0) {
      return [];
    }

    return rows
      .slice(1)
      .map((row) => ({
        kindergarten: (row[kindergartenIndex] ?? "").trim(),
        headTeacher: (row[headTeacherIndex] ?? "").trim(),
        administrator: (row[administratorIndex] ?? "").trim(),
        email: (row[emailIndex] ?? "").trim(),
      }))
      .filter((contact) => contact.kindergarten && contact.email);
  } catch {
    return [];
  }
}
