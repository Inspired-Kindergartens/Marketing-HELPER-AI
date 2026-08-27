import type { AiChatMessage } from "./client.js";
import type { AiChatHistoryMessageInput } from "./chat.js";

export type ChatMemoryCentreReference = {
  centreKey: number;
  name: string;
  openStatus?: string | null;
  ignored?: boolean | null;
};

export type ChatMemoryMessageInput = {
  role?: unknown;
  content?: unknown;
};

export type ChatMemory = {
  selectedCentreKey: number | null;
  selectedCentreName: string | null;
  categoryName: string | null;
  conversationTitle: string | null;
  text: string | null;
};

export type ChatMemoryMetadata = {
  categoryName?: string | null;
  conversationTitle?: string | null;
};

const MAX_MEMORY_MESSAGES = 14;
const MAX_MEMORY_LINE_CHARS = 260;
const MAX_MEMORY_LINES = 8;

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bkindergarten\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeContent(content: unknown) {
  return String(content ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value: string, maxChars = MAX_MEMORY_LINE_CHARS) {
  const text = normalizeContent(value);

  return text.length > maxChars ? `${text.slice(0, maxChars - 3).trim()}...` : text;
}

function getOpenCentres(centres: readonly ChatMemoryCentreReference[]) {
  return centres.filter((centre) => !centre.ignored && (centre.openStatus == null || centre.openStatus === "Open"));
}

export function findMentionedCentres(
  text: string,
  centres: readonly ChatMemoryCentreReference[],
): ChatMemoryCentreReference[] {
  const normalizedText = normalizeSearchText(text);

  if (!normalizedText) {
    return [];
  }

  return getOpenCentres(centres).filter((centre) => {
    const normalizedName = normalizeSearchText(centre.name);

    return normalizedName.length > 0 && normalizedText.includes(normalizedName);
  });
}

export function inferSelectedCentreFromMessages(
  messages: readonly ChatMemoryMessageInput[] | undefined,
  centres: readonly ChatMemoryCentreReference[],
) {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    const content = normalizeContent(message.content);
    const matches = findMentionedCentres(content, centres);

    if (matches.length === 1) {
      return matches[0];
    }
  }

  return null;
}

export function buildChatMemory(
  messages: readonly ChatMemoryMessageInput[] | undefined,
  centres: readonly ChatMemoryCentreReference[] = [],
  metadata: ChatMemoryMetadata = {},
): ChatMemory {
  const input = Array.isArray(messages) ? messages : [];
  const usableMessages = input
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: normalizeContent(message.content),
    }))
    .filter((message) => message.content.length > 0);
  const selectedCentre = inferSelectedCentreFromMessages(usableMessages, centres);
  const mentionedCentres = new Map<number, string>();

  for (const message of usableMessages) {
    for (const centre of findMentionedCentres(message.content, centres)) {
      mentionedCentres.set(centre.centreKey, centre.name);
    }
  }

  const memoryLines: string[] = [];
  const categoryName = normalizeContent(metadata.categoryName);
  const conversationTitle = normalizeContent(metadata.conversationTitle);

  if (categoryName) {
    memoryLines.push(`Conversation category: ${shorten(categoryName, 120)}.`);
  }

  if (conversationTitle && conversationTitle !== categoryName) {
    memoryLines.push(`Conversation title: ${shorten(conversationTitle, 120)}.`);
  }

  if (selectedCentre) {
    memoryLines.push(`Last referenced centre: ${selectedCentre.name} (centreKey ${selectedCentre.centreKey}).`);
  }

  if (mentionedCentres.size > 0) {
    memoryLines.push(`Centres mentioned in this thread: ${[...mentionedCentres.values()].join(", ")}.`);
  }

  const recentContext = usableMessages
    .slice(-MAX_MEMORY_MESSAGES)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${shorten(message.content)}`)
    .slice(-MAX_MEMORY_LINES);

  if (recentContext.length > 0) {
    memoryLines.push("Compact recent turn context:");
    memoryLines.push(...recentContext);
  }

  return {
    selectedCentreKey: selectedCentre?.centreKey ?? null,
    selectedCentreName: selectedCentre?.name ?? null,
    categoryName: categoryName || null,
    conversationTitle: conversationTitle || null,
    text: memoryLines.length > 0 ? memoryLines.join("\n") : null,
  };
}

export function buildChatMemoryMessage(memory: ChatMemory): AiChatMessage | null {
  if (!memory.text) {
    return null;
  }

  return {
    role: "user",
    content: [
      "Hidden compact conversation memory:",
      memory.text,
      "",
      "Use this only to resolve ambiguous follow-up wording, especially centre references and broad topic/category intent. The latest explicit user prompt and current dashboard data still take priority.",
    ].join("\n"),
  };
}

export function buildHistoryChatMemory(
  history: readonly AiChatHistoryMessageInput[] | undefined,
  centres: readonly ChatMemoryCentreReference[],
) {
  return buildChatMemory(history, centres);
}
