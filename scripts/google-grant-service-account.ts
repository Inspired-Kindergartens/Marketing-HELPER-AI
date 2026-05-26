import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const OAUTH_PATH = process.env.GOOGLE_ANALYTICS_OAUTH_PATH?.trim() || "OAuth.json";
const SERVICE_ACCOUNT_PATH = process.env.GA_SERVICE_ACCOUNT_PATH?.trim()
  || "marketing-helper-ai-495603-7bf952d32fa8.json";
const PROPERTY_ID = process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() || "358664757";
const LOGIN_HINT = "marketing@ikindergartens.nz";
const SCOPE = "https://www.googleapis.com/auth/analytics.manage.users";
const ROLE = "predefinedRoles/viewer";

type OAuthClientCredentials = {
  client_id?: string;
  client_secret?: string;
  auth_uri?: string;
  token_uri?: string;
  redirect_uris?: string[];
};

type OAuthFile = OAuthClientCredentials & {
  installed?: OAuthClientCredentials;
  web?: OAuthClientCredentials;
};

function getOAuthClient(source: OAuthFile) {
  return source.installed ?? source.web ?? source;
}

function readCodeFromInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    return url.searchParams.get("code");
  } catch {
    return trimmed;
  }
}

async function promptForAuthorizationCode() {
  const reader = createInterface({ input, output });

  try {
    const answer = await reader.question(
      "After Google redirects to localhost, paste the full browser URL here, or paste only the code value:\n",
    );

    return readCodeFromInput(answer);
  } finally {
    reader.close();
  }
}

async function exchangeCodeForAccessToken(input: {
  tokenUri: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch(input.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google token exchange failed with ${response.status}: ${body}`);
  }

  const payload = await response.json() as { access_token?: string };

  if (!payload.access_token) {
    throw new Error("Google did not return an access_token.");
  }

  return payload.access_token;
}

async function main() {
  const oauthSource = JSON.parse(await readFile(OAUTH_PATH, "utf8")) as OAuthFile;
  const client = getOAuthClient(oauthSource);
  const clientId = client.client_id;
  const clientSecret = client.client_secret;
  const authUri = "https://accounts.google.com/o/oauth2/v2/auth";
  const tokenUri = client.token_uri ?? "https://oauth2.googleapis.com/token";
  const redirectUri = client.redirect_uris?.[0] ?? "http://localhost";

  if (!clientId || !clientSecret) {
    throw new Error(`${OAUTH_PATH} must contain installed or web OAuth client_id and client_secret values.`);
  }

  const serviceAccount = JSON.parse(await readFile(SERVICE_ACCOUNT_PATH, "utf8")) as {
    client_email?: string;
  };

  if (!serviceAccount.client_email) {
    throw new Error(`${SERVICE_ACCOUNT_PATH} must contain a client_email.`);
  }

  const authUrl = new URL(authUri);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("login_hint", LOGIN_HINT);

  console.log(`This will grant '${serviceAccount.client_email}' Viewer on GA4 property ${PROPERTY_ID}.`);
  console.log(`Sign in as ${LOGIN_HINT} (the GA property administrator).`);
  console.log(`Google will redirect to ${redirectUri}. The page may not load; that is expected.`);
  console.log(`Open this URL in Chrome or Edge:\n\n${authUrl.toString()}\n`);

  const code = await promptForAuthorizationCode();

  if (!code) {
    throw new Error("No authorization code was provided.");
  }

  const accessToken = await exchangeCodeForAccessToken({
    tokenUri,
    clientId,
    clientSecret,
    code,
    redirectUri,
  });

  const apiUrl = `https://analyticsadmin.googleapis.com/v1alpha/properties/${encodeURIComponent(PROPERTY_ID)}/accessBindings`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: serviceAccount.client_email,
      roles: [ROLE],
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`GA Admin API rejected the grant with ${response.status}:\n${body}`);
  }

  console.log("Granted successfully:");
  console.log(body);
  console.log("\nThe service account can now read GA data. Hit refresh in the dashboard to confirm.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
