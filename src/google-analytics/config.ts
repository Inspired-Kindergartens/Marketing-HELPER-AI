import { existsSync, readFileSync } from "node:fs";

export type GoogleAnalyticsEnv = {
  GOOGLE_ANALYTICS_PROPERTY_ID?: string | null;
  GOOGLE_ANALYTICS_OAUTH_PATH?: string | null;
  GOOGLE_ANALYTICS_TOKEN_PATH?: string | null;
  GOOGLE_ANALYTICS_REFRESH_TOKEN?: string | null;
};

export type GoogleAnalyticsConfig = {
  propertyId: string;
  oauthPath: string;
  tokenPath: string;
  refreshToken?: string | null;
};

export type GoogleAnalyticsConfigStatus = {
  isConfigured: boolean;
  missingKeys: string[];
  oauthPath: string;
  oauthFileExists: boolean;
  tokenPath: string;
  tokenFileExists: boolean;
};

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

function resolveOauthPath(env: GoogleAnalyticsEnv) {
  return normalizeEnvValue(env.GOOGLE_ANALYTICS_OAUTH_PATH) ?? "OAuth.json";
}

function resolveTokenPath(env: GoogleAnalyticsEnv) {
  return normalizeEnvValue(env.GOOGLE_ANALYTICS_TOKEN_PATH) ?? "google-oauth-token.json";
}

function normalizePropertyId(value: string) {
  return value.trim().replace(/^properties\//, "");
}

function readTokenFileRefreshToken(tokenPath: string) {
  if (!existsSync(tokenPath)) {
    return null;
  }

  try {
    const source = JSON.parse(readFileSync(tokenPath, "utf8")) as Record<string, unknown>;
    const refreshToken = typeof source.refresh_token === "string" ? source.refresh_token.trim() : "";

    return refreshToken.length > 0 ? refreshToken : null;
  } catch {
    return null;
  }
}

function readOauthCredentialShape(oauthPath: string) {
  if (!existsSync(oauthPath)) {
    return { fileExists: false, hasServiceAccount: false, hasRefreshToken: false, hasInstalledClient: false };
  }

  try {
    const source = JSON.parse(readFileSync(oauthPath, "utf8")) as Record<string, unknown>;
    const installed = source.installed && typeof source.installed === "object" ? source.installed as Record<string, unknown> : null;
    const web = source.web && typeof source.web === "object" ? source.web as Record<string, unknown> : null;
    const oauthClient = installed ?? web ?? source;

    return {
      fileExists: true,
      hasServiceAccount: Boolean(source.type === "service_account" && source.client_email && source.private_key),
      hasRefreshToken: Boolean(source.refresh_token),
      hasInstalledClient: Boolean(oauthClient.client_id && oauthClient.client_secret),
    };
  } catch {
    return { fileExists: true, hasServiceAccount: false, hasRefreshToken: false, hasInstalledClient: false };
  }
}

export function readGoogleAnalyticsConfigStatus(env: GoogleAnalyticsEnv): GoogleAnalyticsConfigStatus {
  const propertyId = normalizeEnvValue(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const tokenPath = resolveTokenPath(env);
  const tokenFileRefreshToken = readTokenFileRefreshToken(tokenPath);
  const refreshToken = normalizeEnvValue(env.GOOGLE_ANALYTICS_REFRESH_TOKEN) ?? tokenFileRefreshToken;
  const oauthPath = resolveOauthPath(env);
  const oauthCredentialShape = readOauthCredentialShape(oauthPath);
  const oauthFileExists = oauthCredentialShape.fileExists;
  const tokenFileExists = existsSync(tokenPath);
  const missingKeys: string[] = [];

  if (!propertyId) {
    missingKeys.push("GOOGLE_ANALYTICS_PROPERTY_ID");
  }

  if (!oauthFileExists) {
    missingKeys.push("OAuth.json");
  }

  if (
    oauthFileExists &&
    !oauthCredentialShape.hasServiceAccount &&
    !oauthCredentialShape.hasRefreshToken &&
    !refreshToken
  ) {
    missingKeys.push("GOOGLE_ANALYTICS_REFRESH_TOKEN");
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    oauthPath,
    oauthFileExists,
    tokenPath,
    tokenFileExists,
  };
}

export function getGoogleAnalyticsConfig(env: GoogleAnalyticsEnv): GoogleAnalyticsConfig {
  const propertyId = normalizeEnvValue(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const tokenPath = resolveTokenPath(env);
  const refreshToken = normalizeEnvValue(env.GOOGLE_ANALYTICS_REFRESH_TOKEN) ?? readTokenFileRefreshToken(tokenPath);
  const status = readGoogleAnalyticsConfigStatus(env);

  if (!propertyId || !status.isConfigured) {
    throw new Error(`Missing Google Analytics configuration: ${status.missingKeys.join(", ")}`);
  }

  return {
    propertyId: normalizePropertyId(propertyId),
    oauthPath: status.oauthPath,
    tokenPath: status.tokenPath,
    refreshToken,
  };
}
