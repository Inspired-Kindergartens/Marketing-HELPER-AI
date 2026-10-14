import type { AiChatMessage } from "./client.js";
import { sanitizeChatHistory, type AiChatHistoryMessageInput } from "./chat.js";
import type { CodeSnippetView } from "../storage/code-snippet-store.js";

// The open snippet's code is sent whole up to this budget, so "fix this" or
// "add X to this" works on what is actually in the editor.
const OPEN_SNIPPET_CODE_BUDGET = 8000;

export type SnippetsAiContextInput = {
  snippets: CodeSnippetView[];
  openSnippet: CodeSnippetView | null;
};

export function buildSnippetsAiContext(input: SnippetsAiContextInput) {
  return {
    // Titles only: enough to avoid duplicating a snippet that already exists
    // and to file a new one under an existing category.
    savedSnippets: input.snippets.map((snippet) => ({
      title: snippet.title,
      category: snippet.category,
      language: snippet.language,
    })),
    categories: Array.from(new Set(input.snippets.map((snippet) => snippet.category))),
    openSnippet: input.openSnippet
      ? {
          title: input.openSnippet.title,
          category: input.openSnippet.category,
          language: input.openSnippet.language,
          description: input.openSnippet.description,
          code: input.openSnippet.code.slice(0, OPEN_SNIPPET_CODE_BUDGET),
        }
      : null,
  };
}

export type SnippetsAiContext = ReturnType<typeof buildSnippetsAiContext>;

export function buildSnippetsSystemPrompt() {
  return [
    "You are Beep Beep, the assistant on the Code Snippets page of a marketing team for a group of New Zealand kindergartens.",
    "Your only job is writing, fixing and explaining reusable code snippets: website HTML/CSS/JavaScript, tracking and analytics tags (Google Analytics, Google Tag Manager, Meta Pixel), embed codes, and HTML for emails.",
    "Always give the complete snippet in a single fenced code block tagged with its language, ready to paste. Never give a partial snippet with 'rest unchanged'.",
    "Never invent account IDs, keys or URLs. Use obvious placeholders such as YOUR_PIXEL_ID and say which ones to replace.",
    "After the code, add at most three short lines: where to paste it and anything to replace. Suggest a title and one of the existing categories when it fits, otherwise a short new category.",
    "When an open snippet is supplied and the user asks to change it, change that code and return the whole updated snippet.",
    "For email HTML, use tables and inline styles because email clients ignore stylesheets.",
    "If a request is not about code snippets, say briefly that this chat is for code snippets and suggest General Chat.",
  ].join("\n");
}

export function buildSnippetsAiChatMessages(
  context: SnippetsAiContext,
  prompt: string,
  history: AiChatHistoryMessageInput[] | undefined,
): AiChatMessage[] {
  return [
    { role: "system", content: buildSnippetsSystemPrompt() },
    {
      role: "user",
      content: `Current Code Snippets page context JSON:\n${JSON.stringify(context)}`,
    },
    ...sanitizeChatHistory(history),
    { role: "user", content: prompt },
  ];
}
