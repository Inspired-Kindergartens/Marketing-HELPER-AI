import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const OAUTH_PATH = process.env.GOOGLE_ANALYTICS_OAUTH_PATH?.trim() || "OAuth.json";
const TOKEN_PATH = process.env.GOOGLE_ANALYTICS_TOKEN_PATH?.trim() || "google-oauth-token.json";
const LOGIN_HINT = "marketing@ikindergartens.nz";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

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

async function exchangeCodeForToken(input: {
  tokenUri: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch(input.tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");

    throw new Error(`Google token exchange failed with ${response.status}: ${responseBody}`);
  }

  const payload = await response.json() as Record<string, unknown>;

  if (typeof payload.refresh_token !== "string" || payload.refresh_token.trim() === "") {
    throw new Error(
      "Google did not return a refresh_token. Revoke the existing app grant for this account, then rerun npm.cmd run google:oauth.",
    );
  }

  return payload;
}

async function main() {
  const source = JSON.parse(await readFile(OAUTH_PATH, "utf8")) as OAuthFile;
  const client = getOAuthClient(source);
  const clientId = client.client_id;
  const clientSecret = client.client_secret;
  const authUri = "https://accounts.google.com/o/oauth2/v2/auth";
  const tokenUri = client.token_uri ?? "https://oauth2.googleapis.com/token";
  const redirectUri = client.redirect_uris?.[0] ?? "http://localhost";

  if (!clientId || !clientSecret) {
    throw new Error(`${OAUTH_PATH} must contain installed or web OAuth client_id and client_secret values.`);
  }

  const authUrl = new URL(authUri);

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("login_hint", LOGIN_HINT);

  console.log(`Google sign-in for ${LOGIN_HINT}.`);
  console.log(`Google will redirect to ${redirectUri}. The page may not load; that is expected.`);
  console.log(`Copy this URL into Chrome or Edge:\n${authUrl.toString()}\n`);

  const code = await promptForAuthorizationCode();

  if (!code) {
    throw new Error("No authorization code was provided.");
  }

  const token = await exchangeCodeForToken({
    tokenUri,
    clientId,
    clientSecret,
    code,
    redirectUri,
  });
  const tokenOutput = {
    refresh_token: token.refresh_token,
    scope: token.scope,
    token_type: token.token_type,
    expires_in: token.expires_in,
    created_at: new Date().toISOString(),
    login_hint: LOGIN_HINT,
  };

  await writeFile(TOKEN_PATH, `${JSON.stringify(tokenOutput, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`Wrote Google OAuth token file to ${TOKEN_PATH}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
