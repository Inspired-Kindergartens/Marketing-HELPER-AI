// `npm run secrets:seal`: encrypt every credential in .env that is still plain
// text (Windows DPAPI, this computer only) and move the Google refresh
// token file into .env. The app also does this on every start; the restore
// script runs it so the new computer is sealed straight away.
import { sealPlaintextSecrets } from "../src/env-file.js";
import { SECRET_KEYS } from "../src/secrets.js";

const report = sealPlaintextSecrets();

console.log(`Encrypted now: ${report.sealed.length ? report.sealed.join(", ") : "none"}`);
console.log(`Already encrypted: ${report.alreadySealed.length ? report.alreadySealed.join(", ") : "none"}`);
if (report.migratedGoogleToken) console.log("Moved the Google refresh token from google-oauth-token.json into .env and deleted the file.");
const unset = SECRET_KEYS.filter((key) => !report.sealed.includes(key) && !report.alreadySealed.includes(key));
if (unset.length) console.log(`Not set (nothing to encrypt): ${unset.join(", ")}`);
