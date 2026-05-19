import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const source = join(repoRoot, "generated", "prisma");
const target = join(repoRoot, "dist", "generated", "prisma");

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
