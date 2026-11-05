import { z } from "zod";

// The only place in the app that names a chat model. It is the model recommended
// for "Update AI model", and the default when AI_CHAT_MODEL is unset. Everything
// else reads AI_CHAT_MODEL through AiConfig: see "The AI model design" in README.md.
export const RECOMMENDED_AI_MODEL = "qwen3:8b";
// Shown with the recommendation. Update these whenever the model above changes.
export const RECOMMENDED_AI_MODEL_SIZE = "about 5 GB";
export const RECOMMENDED_AI_MODEL_REASON =
  "It follows instructions and reasons better than older local models of the same size, and fits this computer.";

const aiConfigSchema = z.object({
  AI_PROVIDER: z.enum(["builtin", "ollama"]).default("builtin"),
  AI_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  AI_CHAT_MODEL: z.string().trim().default(RECOMMENDED_AI_MODEL),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export function readAiConfig(env: Record<string, unknown>) {
  return aiConfigSchema.parse(env);
}
