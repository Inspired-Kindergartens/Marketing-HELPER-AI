import { z } from "zod";

const aiConfigSchema = z.object({
  AI_PROVIDER: z.enum(["builtin", "ollama"]).default("builtin"),
  AI_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  AI_CHAT_MODEL: z.string().trim().default("llama3.1:8b"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export function readAiConfig(env: Record<string, unknown>) {
  return aiConfigSchema.parse(env);
}
