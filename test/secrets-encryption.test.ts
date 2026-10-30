import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse as parseDotenv } from "dotenv";

import { decryptFile, encryptFile } from "../src/backup.js";
import { formatDotenvLine, readEnvFileUnsealed, setDotenvValues } from "../src/env-file.js";
import { canSeal, isMachineSealed, isSealed, sealValues, unsealValues } from "../src/secrets.js";

const PASSPHRASE = "correct horse battery staple";

test("backup encryption round-trips and rejects a wrong passphrase or tampering", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mh-enc-"));
  try {
    const plain = Buffer.from("PK fake zip with INFOCAREPASS=hunter2 inside");
    writeFileSync(join(dir, "in.zip"), plain);
    await encryptFile(join(dir, "in.zip"), join(dir, "b.mhbak"), PASSPHRASE);

    const sealed = readFileSync(join(dir, "b.mhbak"));
    assert.equal(sealed.includes(Buffer.from("hunter2")), false, "ciphertext must not contain plain text");

    await decryptFile(join(dir, "b.mhbak"), join(dir, "out.zip"), PASSPHRASE);
    assert.deepEqual(readFileSync(join(dir, "out.zip")), plain);

    await assert.rejects(decryptFile(join(dir, "b.mhbak"), join(dir, "x.zip"), "wrong passphrase!!"), /Wrong passphrase/);

    sealed[sealed.length - 20] ^= 0xff;
    writeFileSync(join(dir, "b.mhbak"), sealed);
    await assert.rejects(decryptFile(join(dir, "b.mhbak"), join(dir, "x.zip"), PASSPHRASE), /Wrong passphrase|damaged/);

    await assert.rejects(encryptFile(join(dir, "in.zip"), join(dir, "c.mhbak"), "short"), /at least/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("formatDotenvLine round-trips awkward passwords", () => {
  for (const value of ['p#ss w$rd', 'has"double', "has'single", 'both"and\'', "$1$&"]) {
    const line = formatDotenvLine("K", value);
    assert.equal(parseDotenv(line).K, value, line);
  }
  assert.throws(() => formatDotenvLine("K", 'all"three\'`'), /cannot be stored/);
  assert.throws(() => formatDotenvLine("K", "line\nbreak"), /line breaks/);
});

test("credentials are sealed when written and unsealed for backups (Windows DPAPI)", { skip: !canSeal }, () => {
  const [sealed] = sealValues(["s3cret value"]);
  assert.ok(isSealed(sealed));
  assert.ok(isMachineSealed(sealed), "sealed at machine scope so every account on this computer can start the app");
  assert.equal(unsealValues([sealed])[0], "s3cret value");

  const dir = mkdtempSync(join(tmpdir(), "mh-env-"));
  try {
    writeFileSync(join(dir, ".env"), '﻿INFOCAREUSER="old"\nHOST=127.0.0.1\n', "utf8");
    setDotenvValues({ INFOCAREUSER: "new-user", INFOCAREPASS: "p#ss", HOST: "0.0.0.0" }, dir);

    const raw = readFileSync(join(dir, ".env"), "utf8");
    assert.ok(!raw.includes("new-user") && !raw.includes("p#ss"), "credentials must not be stored in plain text");
    assert.equal(raw.match(/INFOCAREUSER=/g)?.length, 1, "BOM line replaced, not duplicated");
    const parsed = parseDotenv(raw);
    assert.ok(isSealed(parsed.INFOCAREUSER) && isSealed(parsed.INFOCAREPASS));
    assert.equal(parsed.HOST, "0.0.0.0", "non-secret settings stay readable");

    const plain = parseDotenv(readEnvFileUnsealed(dir));
    assert.equal(plain.INFOCAREUSER, "new-user");
    assert.equal(plain.INFOCAREPASS, "p#ss");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
