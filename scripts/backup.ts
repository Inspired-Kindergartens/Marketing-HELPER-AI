// Same backup as the landing footer's "Back up data" page, runnable while the
// app is stopped (cutover): `npm run backup`. Asks for the passphrase without
// echoing it (or reads MH_BACKUP_PASSPHRASE for unattended use). Writes to backups/.
import "../src/load-env.js";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { BACKUP_DIR, MIN_PASSPHRASE_LENGTH, createBackup } from "../src/backup.js";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error("No terminal to ask for the passphrase; set MH_BACKUP_PASSPHRASE."));
      return;
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };

    stdin.on("data", onData);
  });
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

let passphrase = process.env.MH_BACKUP_PASSPHRASE ?? "";

if (!passphrase) {
  console.log(`Choose a passphrase for this backup (at least ${MIN_PASSPHRASE_LENGTH} characters).`);
  console.log("Store it in the organisation's password manager: without it the backup cannot be opened.");
  passphrase = await promptHidden("Passphrase: ");
  if ((await promptHidden("Type it again: ")) !== passphrase) {
    console.error("The passphrases don't match.");
    process.exit(1);
  }
}

const result = await createBackup(process.cwd(), databaseUrl, passphrase);
console.log(`Backup written: ${join(process.cwd(), BACKUP_DIR, result.fileName)} (${(result.sizeBytes / 1048576).toFixed(1)} MB)`);
console.log(`Included: database, ${result.includedPaths.join(", ")}`);
