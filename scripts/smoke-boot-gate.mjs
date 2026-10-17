#!/usr/bin/env node
// Boot-gate proof (P3.T8/T9): boot the packaged app and read its live DOM over CDP.
//
// The packaged smoke harness asserts the URL/origin/guard; it cannot tell the
// workspace shell apart from the old Python boot gate because both render at
// /dashboard. This probe boots the same packaged tree (copied outside the repo,
// like scripts/smoke-desktop.mjs) with --remote-debugging-port, waits for the
// shell's topbar, and asserts the word "Python" is absent from the DOM.
//
// Requires `pnpm desktop:dist:dir` first. Prints BOOT_GATE_OK {...} and exits 0
// on success; BOOT_GATE_FAIL {...} (DOM text snippet included) and exits 1 otherwise.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = path.join(root, "desktop", "dist", "win-unpacked");
const exeName = process.platform === "win32" ? "MasarFlow.exe" : "MasarFlow";
if (!existsSync(path.join(unpacked, exeName))) {
  console.error("Missing", path.join(unpacked, exeName), "— run `pnpm desktop:dist:dir` first.");
  process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "masarflow-gate-"));
const appDir = path.join(tmp, "app");
console.log("copying", unpacked, "->", appDir);
cpSync(unpacked, appDir, { recursive: true });
const exe = path.join(appDir, exeName);
const profile = path.join(tmp, "profile");

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill();
}
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

/** One Runtime.evaluate round-trip over the DevTools websocket. */
function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("cdp timeout"));
    }, 10_000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("cdp socket error"));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        resolve(msg.result?.result?.value);
      } catch {
        /* ignore non-JSON frames */
      }
    };
  });
}

const EXPR = `(() => {
  const text = document.body.innerText;
  const palette = document.querySelector('[aria-label="Command palette"]');
  return {
    path: location.pathname,
    origin: location.origin,
    hasTopbar: Boolean(palette),
    hasPython: text.includes("Python"),
    text: text.slice(0, 500),
  };
})()`;

const port = await freePort();
const child = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { stdio: "ignore" });
const deadline = Date.now() + 90_000;
let last = null;
let result = { ok: false, error: "timeout waiting for the shell" };
try {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
      const targets = await res.json();
      const target = targets.find((t) => t.type === "page" && String(t.url).startsWith("masarflow://"));
      if (target?.webSocketDebuggerUrl) {
        last = await cdpEvaluate(target.webSocketDebuggerUrl, EXPR);
        if (last?.hasTopbar && String(last.path).startsWith("/dashboard")) {
          result = { ok: !last.hasPython && last.hasTopbar === true, path: last.path, origin: last.origin, hasTopbar: last.hasTopbar, hasPython: last.hasPython };
          break;
        }
      }
    } catch {
      /* devtools endpoint not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!result.ok && last) result = { ...result, last };
} finally {
  killTree(child);
}

if (result.ok) {
  console.log("BOOT_GATE_OK", JSON.stringify(result));
  // Best-effort cleanup: the just-terminated app-server child can hold file
  // handles for a moment (and Windows may still be scanning the copy).
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(tmp, { recursive: true, force: true });
      break;
    } catch {
      if (i === 9) console.warn("(could not remove", tmp + " — leaving it)");
      else await new Promise((r) => setTimeout(r, 500));
    }
  }
  process.exit(0);
}
console.error("BOOT_GATE_FAIL", JSON.stringify(result));
console.error("(kept for inspection:", tmp + ")");
process.exit(1);
