export type MetaEnv = {
  META_USER_ID?: string | null;
  META_ACCESS_TOKEN?: string | null;
  META_APP_TOKEN?: string | null;
  META_AD_ACCOUNT_ID?: string | null;
};

export type MetaConfig = {
  userId: string | null;
  accessToken: string;
  adAccountId: string | null;
};

export type MetaConfigStatus = {
  isConfigured: boolean;
  missingKeys: string[];
  hasAdAccountId: boolean;
};

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

export function readMetaConfigStatus(env: MetaEnv): MetaConfigStatus {
  const missingKeys: string[] = [];

  if (!normalizeEnvValue(env.META_USER_ID) && !normalizeEnvValue(env.META_AD_ACCOUNT_ID)) {
    missingKeys.push("META_USER_ID");
  }

  if (!normalizeEnvValue(env.META_ACCESS_TOKEN)) {
    if (!normalizeEnvValue(env.META_APP_TOKEN)) {
      missingKeys.push("META_ACCESS_TOKEN");
    }
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    hasAdAccountId: Boolean(normalizeEnvValue(env.META_AD_ACCOUNT_ID)),
  };
}

export function getMetaConfig(env: MetaEnv): MetaConfig {
  const userId = normalizeEnvValue(env.META_USER_ID);
  const accessToken = normalizeEnvValue(env.META_ACCESS_TOKEN) ?? normalizeEnvValue(env.META_APP_TOKEN);
  const adAccountId = normalizeEnvValue(env.META_AD_ACCOUNT_ID);
  const missingKeys = readMetaConfigStatus(env).missingKeys;

  if (!accessToken || missingKeys.length > 0) {
    throw new Error(`Missing Meta Ads configuration: ${missingKeys.join(", ")}`);
  }

  return {
    userId,
    accessToken,
    adAccountId,
  };
}
