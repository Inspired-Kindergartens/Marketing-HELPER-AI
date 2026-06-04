import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { GoogleAnalyticsConfig } from "./config.js";
import { appendExternalApiCapture } from "../storage/external-api-capture-store.js";

const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANALYTICS_DATA_API_BASE_URL = "https://analyticsdata.googleapis.com/v1beta";

type GoogleServiceAccountCredentials = {
  type?: "service_account";
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type GoogleAuthorizedUserCredentials = {
  type?: "authorized_user" | "installed" | "web";
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  token_uri?: string;
  access_token?: string;
};

type GoogleCredentials = GoogleServiceAccountCredentials & GoogleAuthorizedUserCredentials & {
  installed?: GoogleAuthorizedUserCredentials;
  web?: GoogleAuthorizedUserCredentials;
};

export type GoogleAnalyticsRunReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
  rows?: {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
  }[];
  rowCount?: number;
};

function base64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createJwtAssertion(credentials: GoogleServiceAccountCredentials) {
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("OAuth.json service account credentials must include client_email and private_key.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_ANALYTICS_SCOPE,
      aud: credentials.token_uri ?? GOOGLE_OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(credentials.private_key);

  return `${unsignedToken}.${signature
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")}`;
}

async function postTokenRequest(tokenUrl: string, body: URLSearchParams) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`Google OAuth token request failed with ${response.status}: ${responseBody}`);
  }

  const payload = (await response.json()) as { access_token?: string };

  if (!payload.access_token) {
    throw new Error("Google OAuth token response did not include an access_token.");
  }

  return payload.access_token;
}

function resolveAuthorizedUserCredentials(credentials: GoogleCredentials, refreshToken?: string | null) {
  const source = (credentials.installed ?? credentials.web ?? credentials) as GoogleAuthorizedUserCredentials;

  return {
    ...source,
    refresh_token: credentials.refresh_token ?? refreshToken ?? source.refresh_token,
  };
}

async function getAccessToken(credentials: GoogleCredentials, refreshToken?: string | null) {
  if (credentials.type === "service_account") {
    return postTokenRequest(credentials.token_uri ?? GOOGLE_OAUTH_TOKEN_URL, new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createJwtAssertion(credentials),
    }));
  }

  const authorizedUserCredentials = resolveAuthorizedUserCredentials(credentials, refreshToken);

  if (
    authorizedUserCredentials.refresh_token &&
    authorizedUserCredentials.client_id &&
    authorizedUserCredentials.client_secret
  ) {
    return postTokenRequest(authorizedUserCredentials.token_uri ?? GOOGLE_OAUTH_TOKEN_URL, new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: authorizedUserCredentials.refresh_token,
      client_id: authorizedUserCredentials.client_id,
      client_secret: authorizedUserCredentials.client_secret,
    }));
  }

  if (authorizedUserCredentials.access_token) {
    return authorizedUserCredentials.access_token;
  }

  throw new Error(
    "OAuth.json must contain service account credentials, or installed/web client credentials plus GOOGLE_ANALYTICS_REFRESH_TOKEN.",
  );
}

export class GoogleAnalyticsClient {
  constructor(private readonly config: GoogleAnalyticsConfig) {}

  private async getAccessToken() {
    const credentials = JSON.parse(await readFile(this.config.oauthPath, "utf8")) as GoogleCredentials;

    return getAccessToken(credentials, this.config.refreshToken);
  }

  async runReport(body: Record<string, unknown>) {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `${GOOGLE_ANALYTICS_DATA_API_BASE_URL}/properties/${encodeURIComponent(this.config.propertyId)}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      await appendExternalApiCapture({
        source: "google-analytics",
        operation: "runReport",
        httpStatus: response.status,
        outcome: "error",
        requestContext: { propertyId: this.config.propertyId, body },
        payload: responseBody,
      });
      throw new Error(`Google Analytics runReport failed with ${response.status}: ${responseBody}`);
    }

    const payload = (await response.json()) as GoogleAnalyticsRunReportResponse;

    await appendExternalApiCapture({
      source: "google-analytics",
      operation: "runReport",
      httpStatus: response.status,
      outcome: "success",
      requestContext: { propertyId: this.config.propertyId, body },
      payload,
    });

    return payload;
  }
}
