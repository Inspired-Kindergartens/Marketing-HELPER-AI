// Credentials in .env are encrypted at rest with Windows DPAPI, LocalMachine
// scope: a sealed value looks like `dpapi:<base64>` and can only be decrypted
// on this computer. A copied .env is useless elsewhere; moving the app goes
// through the passphrase-encrypted backup, and the restore re-seals for the new
// machine. Machine (not user) scope because the app runs under the work
// (Azure AD) sign-in while admin terminals may use a local account - user scope
// locked the server out of its own settings.
//
// Not protected against: someone or something already running on this computer
// that can read the project folder (the app itself must be able to decrypt).
// BitLocker covers the stolen-disk case.
import { execFileSync } from "node:child_process";

export const SEALED_PREFIX = "dpapi:";

// External-service credentials. DATABASE_URL stays readable: Prisma's CLI and
// the pg tools read it directly, and the database only listens on localhost.
export const SECRET_KEYS = [
  "INFOCAREUSER",
  "INFOCAREPASS",
  "META_ACCESS_TOKEN",
  "GOOGLE_ANALYTICS_REFRESH_TOKEN",
  "POSTMARK_SERVER_TOKEN",
  "POSTMARK_WEBHOOK_BASIC_AUTH",
  "CLOUDFLARE_SYNC_TOKEN",
  "MAILCHIMP_API_KEY",
  "FORMSTACK_API_TOKEN",
] as const;

export const canSeal = process.platform === "win32";

const ENTROPY_B64 = Buffer.from("Marketing-HELPER-AI/v1", "utf8").toString("base64");

// One PowerShell call per batch; values travel base64-encoded over stdin and
// stdout, never on the command line.
function dpapi(operation: "Protect" | "Unprotect", base64Values: string[]): string[] {
  if (base64Values.length === 0) return [];

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    `$entropy = [Convert]::FromBase64String('${ENTROPY_B64}')`,
    "$scope = [Security.Cryptography.DataProtectionScope]::LocalMachine",
    "$lines = [Console]::In.ReadToEnd() -split '\\r?\\n' | Where-Object { $_.Trim() }",
    `foreach ($line in $lines) { [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${operation}([Convert]::FromBase64String($line.Trim()), $entropy, $scope)) }`,
  ].join("; ");

  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: base64Values.join("\n"),
    encoding: "utf8",
    windowsHide: true,
  });
  const results = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (results.length !== base64Values.length) {
    throw new Error(`DPAPI ${operation} returned ${results.length} of ${base64Values.length} values.`);
  }

  return results;
}

export function isSealed(value: string | undefined): boolean {
  return Boolean(value?.startsWith(SEALED_PREFIX));
}

// DPAPI blobs record their scope: dwFlags at byte 40 carries
// CRYPTPROTECT_LOCAL_MACHINE (0x4). Values sealed per-user (the first version)
// are re-sealed at machine scope by the process that can still read them.
export function isMachineSealed(value: string | undefined): boolean {
  if (!isSealed(value)) return false;
  const blob = Buffer.from((value as string).slice(SEALED_PREFIX.length), "base64");
  return blob.length > 44 && (blob.readUInt32LE(40) & 0x4) !== 0;
}

export function isSecretKey(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

export function sealValues(values: string[]): string[] {
  return dpapi("Protect", values.map((value) => Buffer.from(value, "utf8").toString("base64"))).map((sealed) => SEALED_PREFIX + sealed);
}

export function unsealValues(values: string[]): string[] {
  try {
    return dpapi("Unprotect", values.map((value) => value.slice(SEALED_PREFIX.length))).map((plain) => Buffer.from(plain, "base64").toString("utf8"));
  } catch {
    throw new Error(
      "Encrypted settings in .env cannot be decrypted on this computer (they were encrypted on another one). " +
        "Restore from a passphrase backup (scripts\\restore-backup.ps1) or re-enter the credentials.",
    );
  }
}

// Replace every sealed value in `env` with its plain text, in place.
export function unsealEnv(env: NodeJS.ProcessEnv = process.env): void {
  const keys = Object.keys(env).filter((key) => isSealed(env[key]));

  if (keys.length === 0) return;

  const plain = unsealValues(keys.map((key) => env[key] as string));
  keys.forEach((key, index) => {
    env[key] = plain[index];
  });
}
