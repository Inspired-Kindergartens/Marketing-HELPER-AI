// Import this first (before anything that reads process.env). It:
// 1. encrypts any credential still stored as plain text in .env (DPAPI, Windows),
//    including a fresh google-oauth-token.json from `npm run google:oauth`;
// 2. loads .env;
// 3. decrypts the sealed credentials into process.env for this process only;
// 4. re-seals any value still sealed per-user at machine scope.
import { config as loadDotenv } from "dotenv";
import { setDotenvValues, sealPlaintextSecrets } from "./env-file.js";
import { isMachineSealed, isSealed, unsealEnv } from "./secrets.js";

try {
  const report = sealPlaintextSecrets();
  if (report.sealed.length > 0) {
    console.log(`Encrypted ${report.sealed.length} credential(s) in .env${report.migratedGoogleToken ? " (Google token file moved into .env)" : ""}.`);
  }
} catch (error) {
  console.warn(`Could not encrypt credentials in .env; they stay readable: ${error instanceof Error ? error.message : error}`);
}

loadDotenv({ override: true, quiet: true });

const userScoped = Object.keys(process.env).filter((key) => isSealed(process.env[key]) && !isMachineSealed(process.env[key]));

unsealEnv();

if (userScoped.length > 0) {
  try {
    setDotenvValues(Object.fromEntries(userScoped.map((key) => [key, process.env[key] as string])));
    console.log(`Re-encrypted ${userScoped.length} credential(s) in .env for any account on this computer.`);
  } catch (error) {
    console.warn(`Could not re-encrypt credentials at machine scope: ${error instanceof Error ? error.message : error}`);
  }
}
