#!/usr/bin/env node
// Agent tool (not shipped): build the packaged app under a cross-process lock,
// then snapshot desktop/dist/win-unpacked into a private directory so parallel
// agents never boot a binary that a sibling is rebuilding.
//
//   node .hermes/tools/build-snapshot.mjs <stream-letter>
//   -> builds, copies to %LOCALAPPDATA%/Temp/msf-e2e-<letter>/win-unpacked
//   -> prints: export MASARFLOW_E2E_APP_DIR=<that path>
//
// Lock: an atomic mkdir at %LOCALAPPDATA%/Temp/masarflow-build.lock. A lock older
// than 25 minutes is treated as stale (its owner died) and removed.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const letter = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[a-z]$/.test(letter)) {
  console.error("Usage: node .hermes/tools/build-snapshot.mjs <stream-letter a-z>");
  process.exit(2);
}
const tmp = path.join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? ".", "Temp");
const lock = path.join(tmp, "masarflow-build.lock");
const out = path.join(tmp, `msf-e2e-${letter}`, "win-unpacked");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const STALE_MS = 25 * 60_000;
const WAIT_MS = 45 * 60_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const started = Date.now();
for (;;) {
  try {
    mkdirSync(lock);
    writeFileSync(path.join(lock, "owner"), `stream ${letter} pid ${process.pid} ${new Date().toISOString()}`);
    break;
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs > STALE_MS) {
        rmSync(lock, { recursive: true, force: true });
        console.log("Removed a stale build lock.");
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() - started > WAIT_MS) {
      console.error("Timed out waiting for the build lock.");
      process.exit(3);
    }
    console.log("Another agent is building; waiting 20 s...");
    sleep(20_000);
  }
}

let code = 1;
try {
  const env = { ...process.env };
  for (const k of ["MASARFLOW_TOKEN", "PORT", "MASARFLOW_VERSION"]) delete env[k];
  const r = spawnSync("pnpm desktop:dist:dir", { cwd: root, stdio: "inherit", shell: true, env });
  code = r.status ?? 1;
  if (code === 0) {
    rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    mkdirSync(path.dirname(out), { recursive: true });
    cpSync(path.join(root, "desktop", "dist", "win-unpacked"), out, { recursive: true });
  }
} finally {
  rmSync(lock, { recursive: true, force: true });
}
if (code !== 0) {
  console.error(`BUILD_SNAPSHOT_FAIL exit ${code}`);
  process.exit(code);
}
console.log(`BUILD_SNAPSHOT_OK ${out}`);
console.log(`export MASARFLOW_E2E_APP_DIR='${out.replaceAll("\\", "/")}'`);
