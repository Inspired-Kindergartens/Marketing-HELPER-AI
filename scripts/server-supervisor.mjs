import { createWriteStream, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const log = createWriteStream(join(repoRoot, ".persistent-supervisor.log"), { flags: "a" });
const pidFile = join(repoRoot, ".persistent-supervisor.pid");
const restartDelayMs = Number.parseInt(process.env.RESTART_DELAY_MS ?? "3000", 10);

writeFileSync(pidFile, String(process.pid));

function stamp(message) {
  log.write(`[${new Date().toISOString()}] ${message}\n`);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("exit", (code, signal) => resolve({ code: code ?? 0, signal }));
  });
}

stamp(`Supervisor ${process.pid} starting.`);

const buildResult = await run("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"]);

if (buildResult.code !== 0) {
  stamp(`Build failed with code ${buildResult.code}; supervisor exiting.`);
  process.exit(buildResult.code);
}

while (true) {
  stamp("Starting compiled server.");
  const result = await run("node", ["dist/src/server.js"]);

  if (result.code === 0) {
    stamp("Server exited cleanly; supervisor exiting.");
    process.exit(0);
  }

  stamp(`Server exited with code ${result.code}${result.signal ? ` signal ${result.signal}` : ""}; restarting in ${restartDelayMs}ms.`);
  await new Promise((resolve) => setTimeout(resolve, restartDelayMs));
}
