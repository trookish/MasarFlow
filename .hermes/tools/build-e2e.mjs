#!/usr/bin/env node
// Agent tool (not shipped): build the packaged app into desktop/dist-e2e under a cross-process lock,
// then copy win-unpacked to a private per-stream directory so parallel agents never boot a binary
// that a sibling is rebuilding. NEVER touches desktop/dist/win-unpacked.
//
//   node.exe .hermes/tools/build-e2e.mjs <stream-letter a-z>  > <log> 2>&1
//   -> BUILD_E2E_OK <dir>   and   export MASARFLOW_E2E_APP_DIR='<dir>'      (check for this line)
//   -> BUILD_E2E_FAIL exit N                                                 (first error is above it)
//
// Lock: atomic mkdir at %LOCALAPPDATA%/Temp/masarflow-build.lock; older than 30 minutes = stale.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const letter = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[a-z]$/.test(letter)) {
  console.error("Usage: node.exe .hermes/tools/build-e2e.mjs <stream-letter a-z>");
  process.exit(2);
}
const tmp = path.join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? ".", "Temp");
const lock = path.join(tmp, "masarflow-build.lock");
const out = path.join(tmp, `msf-e2e-${letter}`, "win-unpacked");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const STALE_MS = 30 * 60_000;
const WAIT_MS = 90 * 60_000;
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
      console.error("BUILD_E2E_FAIL timed out waiting for the build lock");
      process.exit(3);
    }
    console.log("Another stream is building; waiting 20 s...");
    sleep(20_000);
  }
}

let code = 1;
try {
  const env = { ...process.env };
  for (const k of ["MASARFLOW_TOKEN", "PORT", "MASARFLOW_VERSION", "MASARFLOW_DATA_DIR"]) delete env[k];
  const run = (cmd, cwd) => spawnSync(cmd, { cwd, stdio: "inherit", shell: true, env }).status ?? 1;
  code = run("pnpm build:app", root);
  if (code === 0) code = run("pnpm exec electron-vite build", path.join(root, "desktop"));
  if (code === 0) code = run("pnpm exec electron-builder --win --dir -c.directories.output=dist-e2e", path.join(root, "desktop"));
  const src = path.join(root, "desktop", "dist-e2e", "win-unpacked");
  if (code === 0 && !existsSync(path.join(src, "MasarFlow.exe"))) code = 4;
  if (code === 0) {
    rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    mkdirSync(path.dirname(out), { recursive: true });
    cpSync(src, out, { recursive: true });
  }
} finally {
  rmSync(lock, { recursive: true, force: true });
}
if (code !== 0) {
  console.error(`BUILD_E2E_FAIL exit ${code}`);
  process.exit(code);
}
console.log(`BUILD_E2E_OK ${out}`);
console.log(`export MASARFLOW_E2E_APP_DIR='${out.replaceAll("\\", "/")}'`);
