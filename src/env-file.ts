// Reading and writing the project's .env file. Credential keys (SECRET_KEYS)
// are always written DPAPI-sealed on Windows; see src/secrets.ts.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { SECRET_KEYS, canSeal, isSealed, isSecretKey, sealValues, unsealValues } from "./secrets.js";

export function envFilePath(rootDir = process.cwd()) {
  return join(rootDir, ".env");
}

function readEnvFile(rootDir: string) {
  try {
    return readFileSync(envFilePath(rootDir), "utf8");
  } catch {
    return "";
  }
}

// Quote with a character the value doesn't contain, then prove dotenv reads it
// back unchanged (passwords can hold #, $, quotes, spaces...).
export function formatDotenvLine(key: string, value: string) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${key} cannot contain line breaks.`);
  }

  const quote = ['"', "'", "`"].find((q) => !value.includes(q));
  const line = quote ? `${key}=${quote}${value}${quote}` : "";

  if (!line || parseDotenv(line)[key] !== value) {
    throw new Error(`${key} contains a combination of characters that cannot be stored.`);
  }

  return line;
}

function applyLines(content: string, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const line = formatDotenvLine(key, value);
    // The first line may carry a UTF-8 BOM; keep it rather than appending a duplicate key.
    const pattern = new RegExp(`^(\\uFEFF?)${key}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, (_match, bom: string) => `${bom}${line}`)
      : `${content.trimEnd()}${content.trim() ? "\n" : ""}${line}\n`;
  }

  return content;
}

// Write keys to .env; credential keys are sealed first (Windows).
export function setDotenvValues(values: Record<string, string>, rootDir = process.cwd()) {
  const toSeal = Object.keys(values).filter((key) => canSeal && isSecretKey(key) && values[key] !== "" && !isSealed(values[key]));
  const sealed = sealValues(toSeal.map((key) => values[key]));
  const stored = { ...values };
  toSeal.forEach((key, index) => {
    stored[key] = sealed[index];
  });

  writeFileSync(envFilePath(rootDir), applyLines(readEnvFile(rootDir), stored), "utf8");
}

export type SealReport = { sealed: string[]; alreadySealed: string[]; migratedGoogleToken: boolean };

// Encrypt any credential still stored as plain text, and move the Google refresh
// token out of google-oauth-token.json into a sealed GOOGLE_ANALYTICS_REFRESH_TOKEN.
// Safe to run repeatedly; runs at server start and from the restore script.
export function sealPlaintextSecrets(rootDir = process.cwd()): SealReport {
  const report: SealReport = { sealed: [], alreadySealed: [], migratedGoogleToken: false };

  if (!canSeal) return report;

  const current = parseDotenv(readEnvFile(rootDir));
  const updates: Record<string, string> = {};

  for (const key of SECRET_KEYS) {
    const value = current[key]?.trim() ?? "";
    if (!value) continue;
    if (isSealed(value)) report.alreadySealed.push(key);
    else updates[key] = value;
  }

  const tokenPath = join(rootDir, current.GOOGLE_ANALYTICS_TOKEN_PATH?.trim() || "google-oauth-token.json");
  let tokenToMigrate = "";

  if (existsSync(tokenPath)) {
    try {
      const token = JSON.parse(readFileSync(tokenPath, "utf8")) as { refresh_token?: unknown };
      tokenToMigrate = typeof token.refresh_token === "string" ? token.refresh_token.trim() : "";
    } catch {
      tokenToMigrate = "";
    }
    if (tokenToMigrate) updates.GOOGLE_ANALYTICS_REFRESH_TOKEN = tokenToMigrate;
  }

  if (Object.keys(updates).length === 0) return report;

  setDotenvValues(updates, rootDir);

  // Only delete the token file once the sealed copy is proven to decrypt.
  if (tokenToMigrate) {
    const stored = parseDotenv(readEnvFile(rootDir)).GOOGLE_ANALYTICS_REFRESH_TOKEN ?? "";
    if (isSealed(stored) && unsealValues([stored])[0] === tokenToMigrate) {
      unlinkSync(tokenPath);
      report.migratedGoogleToken = true;
    }
  }

  report.sealed = Object.keys(updates);
  return report;
}

// .env content with every sealed value decrypted - only for writing into a
// passphrase-encrypted backup, never to disk in the clear.
export function readEnvFileUnsealed(rootDir = process.cwd()): string {
  const content = readEnvFile(rootDir);
  const parsed = parseDotenv(content);
  const keys = Object.keys(parsed).filter((key) => isSealed(parsed[key]));
  const plain = unsealValues(keys.map((key) => parsed[key]));

  return applyLines(content, Object.fromEntries(keys.map((key, index) => [key, plain[index]])));
}
