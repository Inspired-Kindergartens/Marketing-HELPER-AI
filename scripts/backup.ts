// Same backup as the landing footer's "Back up data" button, runnable while the
// app is stopped (cutover): `npm run backup`. Writes to backups/.
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { BACKUP_DIR, createBackup } from "../src/backup.js";

loadDotenv({ override: true, quiet: true });

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const result = await createBackup(process.cwd(), databaseUrl);
console.log(`Backup written: ${join(process.cwd(), BACKUP_DIR, result.fileName)} (${(result.sizeBytes / 1048576).toFixed(1)} MB)`);
console.log(`Included: database, ${result.includedPaths.join(", ")}`);
