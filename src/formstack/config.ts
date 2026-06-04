export type FormstackEnv = {
  FORMSTACK_API_TOKEN?: string | null;
};

export type FormstackConfig = {
  apiToken: string;
  baseUrl: string;
};

export type FormstackConfigStatus = {
  isConfigured: boolean;
  missingKeys: string[];
};

export function readFormstackConfigStatus(env: FormstackEnv): FormstackConfigStatus {
  const apiToken = env.FORMSTACK_API_TOKEN?.trim() ?? "";

  return {
    isConfigured: apiToken.length > 0,
    missingKeys: apiToken.length > 0 ? [] : ["FORMSTACK_API_TOKEN"],
  };
}

export function getFormstackConfig(env: FormstackEnv): FormstackConfig {
  const apiToken = env.FORMSTACK_API_TOKEN?.trim() ?? "";

  if (!apiToken) {
    throw new Error("Missing Formstack configuration: FORMSTACK_API_TOKEN");
  }

  return {
    apiToken,
    baseUrl: "https://www.formstack.com/api/v2025",
  };
}
