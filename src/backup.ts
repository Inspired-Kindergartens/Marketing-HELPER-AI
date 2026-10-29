// Full data export so the app can be moved to another machine. One zip holds
// everything that is NOT in git: the Postgres database (pg_dump custom format),
// uploaded files, Infocare/Meta working files, landing-feed snapshots and the
// credential files the integrations need. Restore with scripts/restore-backup.ps1.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

export async function createBackup(rootDir: string, databaseUrl: string): Promise<BackupResult> {
  const backupDir = join(rootDir, BACKUP_DIR);
  const stamp = timestamp();
  const staging = join(backupDir, `.staging-${stamp}`);
  const fileName = `marketing-helper-backup-${stamp}.zip`;
  const zipPath = join(backupDir, fileName);

  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, "files"), { recursive: true });

  try {
    await run(findPgTool("pg_dump"), ["--format=custom", "--no-owner", "--no-privileges", "--file", join(staging, "database.dump"), libpqUrl(databaseUrl)], rootDir);

    const includedPaths: string[] = [];

    for (const path of BACKUP_PATHS) {
      const source = join(rootDir, path);

      if (!existsSync(source)) continue;
      await cp(source, join(staging, "files", path), { recursive: true });
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

    const { size } = await stat(zipPath);

    return { fileName, sizeBytes: size, includedPaths };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function listBackups(rootDir: string): Promise<string[]> {
  try {
    return (await readdir(join(rootDir, BACKUP_DIR))).filter((name) => /^marketing-helper-backup-\d{8}-\d{4}\.zip$/.test(name)).sort().reverse();
  } catch {
    return [];
  }
}
