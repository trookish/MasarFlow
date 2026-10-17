#!/usr/bin/env node
// Boots the UNPACKED packaged app with a throwaway profile and asserts the workspace loads.
//
// P1 exit gate. Two things make this stronger than an in-place boot (spike S1):
//  1. the packaged tree is checked for `resources/app-server/node_modules/next/package.json`
//     — electron-builder silently drops a top-level `node_modules` from extraResources,
//     and an in-place boot hides that by resolving modules upward into the repo;
//  2. the whole win-unpacked folder is copied OUTSIDE the repo and booted from there,
//     so nothing can resolve upward into the dev tree.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = path.join(root, "desktop", "dist", "win-unpacked");
const exeName = process.platform === "win32" ? "MasarFlow.exe" : "MasarFlow";
const srcExe = path.join(unpacked, exeName);
if (!existsSync(srcExe)) {
  console.error("Missing", srcExe, "— run `pnpm desktop:dist:dir` first.");
  process.exit(1);
}

/* ── 1. packaged-tree checks (S1's failures are invisible when booting in place) ── */
const serverDir = path.join(unpacked, "resources", "app-server");
const nextPkg = path.join(serverDir, "node_modules", "next", "package.json");
if (!existsSync(nextPkg)) {
  console.error(
    "SMOKE_FAIL: missing " + nextPkg +
      " — electron-builder dropped app-server/node_modules; check the two-entry extraResources in desktop/electron-builder.yml.",
  );
  process.exit(1);
}
function walk(dir) {
  const acc = { files: 0, links: 0, bytes: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) acc.links++;
    else if (entry.isDirectory()) {
      const s = walk(p);
      acc.files += s.files;
      acc.links += s.links;
      acc.bytes += s.bytes;
    } else {
      acc.files++;
      acc.bytes += lstatSync(p).size;
    }
  }
  return acc;
}
const stats = walk(serverDir);
console.log(
  `app-server check: next/package.json present; ${stats.files} files, ${stats.links} symlinks, ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`,
);
if (stats.links > 0) {
  console.error("SMOKE_FAIL:", stats.links, "symlinks inside the packaged app-server — S1's EPERM failure mode (build with nodeLinker: hoisted, copy dereferencing).");
  process.exit(1);
}

/* ── 2. copy outside the repo + throwaway profile, boot from the copy ── */
const tmp = mkdtempSync(path.join(os.tmpdir(), "masarflow-smoke-"));
const appDir = path.join(tmp, "app");
console.log("copying", unpacked, "->", appDir);
const t0 = Date.now();
cpSync(unpacked, appDir, { recursive: true });
console.log(`copy done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const exe = path.join(appDir, exeName);
const profile = path.join(tmp, "profile");
const out = path.join(tmp, "result.json");

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill();
}
function fail(msg) {
  console.error(msg);
  const log = path.join(profile, "logs", "server.log");
  if (existsSync(log)) {
    const tail = readFileSync(log, "utf8").trim().split(/\r?\n/).slice(-15);
    console.error("--- last lines of", log, "---");
    for (const line of tail) console.error("  " + line);
  } else {
    console.error("(no server log at", log + ")");
  }
  console.error("(kept for inspection:", tmp + ")");
  process.exit(1);
}

const child = spawn(exe, [`--user-data-dir=${profile}`], {
  env: { ...process.env, MASARFLOW_SMOKE: "1", MASARFLOW_SMOKE_OUT: out },
  stdio: "ignore",
});
let timedOut = false;
const killer = setTimeout(() => {
  timedOut = true;
  killTree(child);
}, 120_000);
child.on("exit", () => {
  clearTimeout(killer);
  if (timedOut) fail("SMOKE_FAIL: packaged app did not exit within 120s");
  if (!existsSync(out)) fail("SMOKE_FAIL: no result file at " + out);
  const r = JSON.parse(readFileSync(out, "utf8"));
  const ok =
    r.ok &&
    typeof r.path === "string" &&
    r.path.startsWith("/dashboard") &&
    r.origin === "masarflow://app" &&
    r.hasApi === true &&
    r.guard?.status === 403 &&
    (r.denial?.status === 401 || r.denial?.status === 403);
  if (ok) {
    console.log("booted from:", exe);
    console.log("SMOKE_OK", JSON.stringify(r));
    if (process.env.MASARFLOW_SMOKE_KEEP === "1") console.log("(kept for inspection:", tmp + ")");
    else {
      // The exiting app can hold file handles for a moment; a failed cleanup is not a failed smoke.
      try {
        rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      } catch (error) {
        console.warn("could not remove", tmp, "-", error.code ?? error.message);
      }
    }
    process.exit(0);
  }
  fail("SMOKE_FAIL " + JSON.stringify(r));
});
