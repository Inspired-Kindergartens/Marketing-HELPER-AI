// Used by scripts/restore-backup.ps1: decrypts a .mhbak backup into a plain zip.
// The passphrase comes from MH_BACKUP_PASSPHRASE (never the command line).
//   tsx scripts/backup-decrypt.ts <backup.mhbak> <output.zip>
import { decryptFile } from "../src/backup.js";

const [input, output] = process.argv.slice(2);
const passphrase = process.env.MH_BACKUP_PASSPHRASE ?? "";

if (!input || !output || !passphrase) {
  console.error("Usage: MH_BACKUP_PASSPHRASE=... tsx scripts/backup-decrypt.ts <backup.mhbak> <output.zip>");
  process.exit(2);
}

try {
  await decryptFile(input, output, passphrase);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
