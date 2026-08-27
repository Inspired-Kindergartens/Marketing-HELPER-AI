import { extname } from "node:path";

export const CHAT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_CHARS = 18000;

const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".rtf",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/rtf",
  "application/xml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/xml",
]);

export type ChatDocumentExtraction = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  text: string;
  truncated: boolean;
};

type PdfTextItem = {
  str?: unknown;
};

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function trimToBudget(text: string) {
  const cleaned = cleanText(text);

  if (cleaned.length <= CHAT_DOCUMENT_MAX_CHARS) {
    return { text: cleaned, truncated: false };
  }

  return {
    text: `${cleaned.slice(0, CHAT_DOCUMENT_MAX_CHARS).trimEnd()}\n\n[Document text truncated at ${CHAT_DOCUMENT_MAX_CHARS.toLocaleString("en-NZ")} characters.]`,
    truncated: true,
  };
}

function isPdf(filename: string, mimeType: string) {
  return mimeType.toLowerCase() === "application/pdf" || extname(filename).toLowerCase() === ".pdf";
}

function isTextLike(filename: string, mimeType: string) {
  return TEXT_MIME_TYPES.has(mimeType.toLowerCase()) || TEXT_EXTENSIONS.has(extname(filename).toLowerCase());
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => String((item as PdfTextItem).str ?? ""))
        .filter(Boolean)
        .join(" ");

      pages.push(`Page ${pageNumber}\n${pageText}`);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    pageCount: document.numPages,
    text: pages.join("\n\n"),
  };
}

export async function extractChatDocument(input: {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<ChatDocumentExtraction> {
  const filename = input.filename.trim() || "document";
  const mimeType = (input.mimeType ?? "").trim().toLowerCase();
  const sizeBytes = input.buffer.byteLength;

  if (sizeBytes === 0) {
    throw new Error("The attached document is empty.");
  }

  if (sizeBytes > CHAT_DOCUMENT_MAX_BYTES) {
    throw new Error(`The attached document is too large. Keep uploads under ${Math.floor(CHAT_DOCUMENT_MAX_BYTES / 1024 / 1024)} MB.`);
  }

  if (isPdf(filename, mimeType)) {
    const extracted = await extractPdfText(input.buffer);
    const trimmed = trimToBudget(extracted.text);

    if (!trimmed.text) {
      throw new Error("No readable text was found in the PDF. Scanned image-only PDFs are not supported yet.");
    }

    return {
      filename,
      mimeType: mimeType || "application/pdf",
      sizeBytes,
      pageCount: extracted.pageCount,
      text: trimmed.text,
      truncated: trimmed.truncated,
    };
  }

  if (!isTextLike(filename, mimeType)) {
    throw new Error("Unsupported document type. Attach a PDF, TXT, Markdown, CSV, JSON, XML, YAML, LOG, or RTF file.");
  }

  const trimmed = trimToBudget(input.buffer.toString("utf8"));

  if (!trimmed.text) {
    throw new Error("No readable text was found in the attached document.");
  }

  return {
    filename,
    mimeType: mimeType || "text/plain",
    sizeBytes,
    pageCount: null,
    text: trimmed.text,
    truncated: trimmed.truncated,
  };
}

export function buildChatDocumentPrompt(prompt: string, document: ChatDocumentExtraction) {
  const pageSummary = document.pageCount == null ? "" : `, ${document.pageCount} page${document.pageCount === 1 ? "" : "s"}`;
  const truncation = document.truncated ? " The extracted text was truncated to fit the chat working window." : "";

  return [
    prompt,
    "",
    "Attached document context:",
    `Filename: ${document.filename}`,
    `Type: ${document.mimeType || "unknown"}, ${document.sizeBytes.toLocaleString("en-NZ")} bytes${pageSummary}.${truncation}`,
    "",
    "Use the extracted document text below as source material for this turn. If the answer is not present in the document text, say so.",
    "",
    "Extracted document text:",
    document.text,
  ].join("\n");
}
