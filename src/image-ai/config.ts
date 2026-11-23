// AI images: settings for the OpenAI image and speech-to-text models.
//
// These two are named exceptions to the one-model design (see "The AI model
// design" in README.md): the chat model cannot draw a picture or hear a
// recording. Each has its own variable and does only that one job; neither is
// ever used to chat. This file is the only place an OpenAI model is named.
export const DEFAULT_AI_IMAGE_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_AI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type ImageAiEnv = {
  OPENAI_API_KEY?: string | null;
  AI_IMAGE_MODEL?: string | null;
  AI_TRANSCRIBE_MODEL?: string | null;
};

export type ImageAiConfig = {
  apiKey: string;
  imageModel: string;
  transcribeModel: string;
  baseUrl: string;
};

export type ImageAiConfigStatus = {
  isConfigured: boolean;
  missingKeys: string[];
  imageModel: string;
  transcribeModel: string;
};

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

export function readImageAiConfigStatus(env: ImageAiEnv): ImageAiConfigStatus {
  const missingKeys = normalizeEnvValue(env.OPENAI_API_KEY) ? [] : ["OPENAI_API_KEY"];

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    imageModel: normalizeEnvValue(env.AI_IMAGE_MODEL) ?? DEFAULT_AI_IMAGE_MODEL,
    transcribeModel: normalizeEnvValue(env.AI_TRANSCRIBE_MODEL) ?? DEFAULT_AI_TRANSCRIBE_MODEL,
  };
}

export function getImageAiConfig(env: ImageAiEnv): ImageAiConfig {
  const apiKey = normalizeEnvValue(env.OPENAI_API_KEY);
  const status = readImageAiConfigStatus(env);

  if (!apiKey) {
    throw new Error(`Missing AI image configuration: ${status.missingKeys.join(", ")}`);
  }

  return {
    apiKey,
    imageModel: status.imageModel,
    transcribeModel: status.transcribeModel,
    baseUrl: OPENAI_BASE_URL,
  };
}
