// Full data export so the app can be moved to another machine. One
// passphrase-encrypted file holds everything that is NOT in git: the Postgres
// database (pg_dump custom format), uploaded files, Infocare/Meta working files,
// landing-feed snapshots and the credentials the integrations need. Restore
// with scripts/restore-backup.ps1.
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readEnvFileUnsealed } from "./env-file.js";

export const BACKUP_DIR = "backups";

// Paths relative to the project root. Missing entries are skipped, not errors.
const BACKUP_PATHS = [
  ".env",
  "OAuth.json",
  "google-oauth-token.json",
  "marketing-helper-ai-495603-7bf952d32fa8.json",
  "centre-contact-list.xlsx",
  "uploads",
  "INFOCARE",
  "META",
  "logs",
];

export type BackupResult = { fileName: string; sizeBytes: number; includedPaths: string[] };

export function findPgTool(name: "pg_dump" | "pg_restore"): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;

  if (process.env.PG_BIN) {
    return join(process.env.PG_BIN, exe);
  }

  if (process.platform === "win32") {
    const root = "C:\\Program Files\\PostgreSQL";

    if (existsSync(root)) {
      // Newest installed major version first.
      const versions = readdirSyncSafe(root).sort((a, b) => Number(b) - Number(a));

      for (const version of versions) {
        const candidate = join(root, version, "bin", exe);

        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return exe; // fall back to PATH
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// libpq rejects Prisma's `?schema=public`, so drop the query string.
function libpqUrl(databaseUrl: string): string {
  return databaseUrl.replace(/\?.*$/, "");
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(new Error(`${command}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// --- Passphrase encryption -------------------------------------------------
// File layout: MAGIC | salt(16) | iv(12) | AES-256-GCM ciphertext | tag(16).
// The key is scrypt(passphrase, salt). Nothing in the backup is readable, and
// any tampering fails the GCM tag check, without the passphrase.
const MAGIC = Buffer.from("MHBAK1", "ascii");
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export const MIN_PASSPHRASE_LENGTH = 12;

export function validatePassphrase(passphrase: unknown): string {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`The backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }

  return passphrase;
}

export async function encryptFile(inputPath: string, outputPath: string, passphrase: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(validatePassphrase(passphrase), salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(await readFile(inputPath)), cipher.final()]);

  await writeFile(outputPath, Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]));
}

export async function decryptFile(inputPath: string, outputPath: string, passphrase: string) {
  const data = await readFile(inputPath);

  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a Marketing Helper encrypted backup.");
  }

  const salt = data.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = data.subarray(MAGIC.length + 16, MAGIC.length + 28);
  const tag = data.subarray(data.length - 16);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(data.subarray(MAGIC.length + 28, data.length - 16)), decipher.final()]);
  } catch {
    throw new Error("Wrong passphrase, or the backup file is damaged.");
  }

  await writeFile(outputPath, plain);
}

// The backup is always passphrase-encrypted (.mhbak). Inside it, .env is written
// with credentials decrypted, because the DPAPI seal only works on this computer;
// the restore re-seals them for the new one.
export async function createBackup(rootDir: string, databaseUrl: string, passphrase: string): Promise<BackupResult> {
  validatePassphrase(passphrase);

  const backupDir = join(rootDir, BACKUP_DIR);
  const stamp = timestamp();
  const staging = join(backupDir, `.staging-${stamp}`);
  const fileName = `marketing-helper-backup-${stamp}.mhbak`;
  const zipPath = join(backupDir, `.staging-${stamp}.zip`);
  const outputPath = join(backupDir, fileName);

  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, "files"), { recursive: true });

  try {
    await run(findPgTool("pg_dump"), ["--format=custom", "--no-owner", "--no-privileges", "--file", join(staging, "database.dump"), libpqUrl(databaseUrl)], rootDir);

    const includedPaths: string[] = [];

    for (const path of BACKUP_PATHS) {
      const source = join(rootDir, path);

      if (!existsSync(source)) continue;
      if (path === ".env") await writeFile(join(staging, "files", ".env"), readEnvFileUnsealed(rootDir), "utf8");
      else await cp(source, join(staging, "files", path), { recursive: true });
      includedPaths.push(path);
    }

    await writeFile(
      join(staging, "MANIFEST.json"),
      JSON.stringify({ createdAt: new Date().toISOString(), database: "database.dump (pg_dump custom format)", files: includedPaths }, null, 2),
      "utf8",
    );

    // Windows' bundled bsdtar writes real zips with -a; elsewhere use zip.
    if (process.platform === "win32") {
      await run("C:\\Windows\\System32\\tar.exe", ["-a", "-c", "-f", zipPath, "-C", staging, "."], rootDir);
    } else {
      await run("zip", ["-r", "-q", zipPath, "."], staging);
    }

    await encryptFile(zipPath, outputPath, passphrase);
    const { size } = await stat(outputPath);

    return { fileName, sizeBytes: size, includedPaths };
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(zipPath, { force: true });
  }
}
