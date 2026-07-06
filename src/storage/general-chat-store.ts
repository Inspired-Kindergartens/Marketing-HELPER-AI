import { prisma } from "../db.js";
import type { AiChatMessage } from "../ai/client.js";

export const GENERAL_CHAT_MODEL_CONTEXT_TOKENS = 131072;
export const GENERAL_CHAT_SEND_CHAR_BUDGET = 24000;

export type GeneralChatGroupView = {
  id: number;
  name: string;
  conversationCount: number;
};

export type GeneralChatConversationListItem = {
  id: number;
  groupId: number | null;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type GeneralChatMessageView = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type GeneralChatPageData = {
  groups: GeneralChatGroupView[];
  conversations: GeneralChatConversationListItem[];
  selectedConversation: GeneralChatConversationListItem | null;
  selectedGroupId: number | null;
  messages: GeneralChatMessageView[];
  contextLimitTokens: number;
  sendCharBudget: number;
};

function normalizeName(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, 120) : fallback;
}

function normalizeTitle(value: unknown) {
  return normalizeName(value, "New conversation");
}

function normalizeRole(value: string): "user" | "assistant" {
  return value === "user" ? "user" : "assistant";
}

async function ensureDefaultGroup() {
  const existing = await prisma.generalChatGroup.findFirst({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  if (existing) return existing.id;

  const group = await prisma.generalChatGroup.create({
    data: { name: "General", position: 0 },
    select: { id: true },
  });
  return group.id;
}

export async function getGeneralChatPageData(input: {
  selectedConversationId?: number | null;
  selectedGroupId?: number | null;
} = {}): Promise<GeneralChatPageData> {
  await ensureDefaultGroup();
  const selectedGroupId = input.selectedGroupId ?? null;

  const [groups, conversations] = await Promise.all([
    prisma.generalChatGroup.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { conversations: true } } },
    }),
    prisma.generalChatConversation.findMany({
      where: selectedGroupId == null ? undefined : { groupId: selectedGroupId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  const selected =
    conversations.find((conversation) => conversation.id === input.selectedConversationId) ??
    conversations[0] ??
    null;

  const messages = selected
    ? await prisma.generalChatMessage.findMany({
        where: { conversationId: selected.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      conversationCount: group._count.conversations,
    })),
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      groupId: conversation.groupId,
      title: conversation.title,
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: conversation._count.messages,
    })),
    selectedConversation: selected
      ? {
          id: selected.id,
          groupId: selected.groupId,
          title: selected.title,
          updatedAt: selected.updatedAt.toISOString(),
          messageCount: selected._count.messages,
        }
      : null,
    selectedGroupId,
    messages: messages.map((message) => ({
      id: message.id,
      role: normalizeRole(message.role),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    contextLimitTokens: GENERAL_CHAT_MODEL_CONTEXT_TOKENS,
    sendCharBudget: GENERAL_CHAT_SEND_CHAR_BUDGET,
  };
}

export async function createGeneralChatGroup(name: string) {
  const last = await prisma.generalChatGroup.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const group = await prisma.generalChatGroup.create({
    data: {
      name: normalizeName(name, "New group"),
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  });
  return group.id;
}

export async function renameGeneralChatGroup(id: number, name: string) {
  await prisma.generalChatGroup.update({
    where: { id },
    data: { name: normalizeName(name, "New group") },
  });
}

export async function deleteGeneralChatGroup(id: number) {
  await prisma.generalChatGroup.delete({ where: { id } });
}

export async function createGeneralChatConversation(input: { title?: string | null; groupId?: number | null }) {
  const groupId = input.groupId ?? (await ensureDefaultGroup());
  const conversation = await prisma.generalChatConversation.create({
    data: {
      title: normalizeTitle(input.title),
      groupId,
    },
    select: { id: true },
  });
  return conversation.id;
}

export async function updateGeneralChatConversation(
  id: number,
  input: { title?: string | null; groupId?: number | null },
) {
  await prisma.generalChatConversation.update({
    where: { id },
    data: {
      title: input.title == null ? undefined : normalizeTitle(input.title),
      groupId: input.groupId === undefined ? undefined : input.groupId,
    },
  });
}

export async function deleteGeneralChatConversation(id: number) {
  await prisma.generalChatConversation.delete({ where: { id } });
}

export async function addGeneralChatMessage(conversationId: number, role: "user" | "assistant", content: string) {
  const text = content.trim();
  if (!text) {
    throw new Error("Message content is required");
  }

  const message = await prisma.generalChatMessage.create({
    data: {
      conversationId,
      role,
      content: text,
    },
    select: { id: true },
  });

  const update: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
  if (role === "user") {
    const existingCount = await prisma.generalChatMessage.count({ where: { conversationId } });
    if (existingCount === 1) {
      update.title = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    }
  }

  await prisma.generalChatConversation.update({
    where: { id: conversationId },
    data: update,
  });

  const messageCount = await prisma.generalChatMessage.count({ where: { conversationId } });
  return { id: message.id, messageCount };
}

export async function deleteGeneralChatMessage(id: number) {
  const message = await prisma.generalChatMessage.findUnique({
    where: { id },
    select: { conversationId: true },
  });

  if (!message) {
    return null;
  }

  await prisma.generalChatMessage.delete({ where: { id } });
  const messageCount = await prisma.generalChatMessage.count({
    where: { conversationId: message.conversationId },
  });
  await prisma.generalChatConversation.update({
    where: { id: message.conversationId },
    data: { updatedAt: new Date() },
  });

  return { conversationId: message.conversationId, messageCount };
}

export async function buildGeneralChatMessages(conversationId: number): Promise<AiChatMessage[]> {
  const rows = await prisma.generalChatMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const selected: typeof rows = [];
  let used = 0;

  for (const row of rows) {
    const next = row.content.length + 80;
    if (selected.length > 0 && used + next > GENERAL_CHAT_SEND_CHAR_BUDGET) {
      break;
    }
    selected.push(row);
    used += next;
  }

  selected.reverse();

  return [
    {
      role: "system",
      content:
        "You are Beep Beep, a general-purpose local assistant. Help with everyday questions, writing, planning, explanation, troubleshooting, and technical work. Be practical, concise, and clear. The app retains the full conversation, but only the latest working window is sent to the model when a conversation grows long.",
    },
    ...selected.map((row) => ({
      role: normalizeRole(row.role),
      content: row.content,
    })),
  ];
}
