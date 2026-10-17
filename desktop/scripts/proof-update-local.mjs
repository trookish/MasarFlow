#!/usr/bin/env node
/**
 * P10.T10 — the update path, proven fully locally.
 *
 * Three scenarios, no network to github.com anywhere:
 *
 *   A. local feed: the packaged app boots with MASARFLOW_UPDATER_DEV_FEED=1 and
 *      points electron-updater at a *generic* feed on 127.0.0.1
 *      (forceDevUpdateConfig + updateConfigPath — desktop/src/main/updater.ts).
 *      `window.masarflow.updater.check()` (renderer → preload → IPC → main)
 *      resolves the feed's latest.yml and reports "available" for a newer
 *      version; `updater.download()` downloads the asset, verifies its sha512
 *      and reports "ready" at 100%. The status events the renderer received are
 *      recorded as evidence.
 *   B. offline: with the feed server stopped, `check()` must land on phase
 *      "error" with a message — no crash, no hang, the app stays alive.
 *   C. portable: the portable exe (PORTABLE_EXECUTABLE_DIR set by the stub, no
 *      dev-feed flag) must report phase "disabled" with the portable reason —
 *      portable builds never update themselves.
 *
 * What it does NOT prove (owner actions, listed in reports/p10/): NSIS install
 * on quit / restart-now against a real GitHub release — that needs a push and a
 * second build, per the plan's OWNER ACTION procedure.
 *
 * Run after `pnpm desktop:dist:dir` (or `pnpm proof:update-local`).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const unpacked = path.join(root, "desktop", "dist", "win-unpacked");
const exeName = process.platform === "win32" ? "MasarFlow.exe" : "MasarFlow";
const exe = path.join(unpacked, exeName);
if (!existsSync(exe)) {
  console.error("Missing", exe, "— run `pnpm desktop:dist:dir` first.");
  process.exit(1);
}

/** The portable artifact, e.g. "MasarFlow 0.2.0-alpha.0.exe" (no "Setup"). */
const distDir = path.join(root, "desktop", "dist");
const portableExe =
  existsSync(distDir) &&
  readdirSync(distDir)
    .filter((f) => /^MasarFlow .+\.exe$/i.test(f))
    .map((f) => path.join(distDir, f))[0];

/** The version the feed advertises; must be semver-newer than the installed one. */
const FEED_VERSION = "0.2.1";

const tmp = mkdtempSync(path.join(os.tmpdir(), "masarflow-update-proof-"));
const feedDir = path.join(tmp, "feed");
mkdirSync(feedDir, { recursive: true });

/* ── 1. Build the feed: a dummy installer + latest.yml with its real sha512 ── */
const installerName = `MasarFlow Setup ${FEED_VERSION}.exe`;
const payload = Buffer.concat([Buffer.from("MZ"), createHash("sha256").update(String(Date.now())).digest(), Buffer.alloc(1_500_000, 7)]);
writeFileSync(path.join(feedDir, installerName), payload);
const sha512 = createHash("sha512").update(payload).digest("base64");
const latestYml = [
  `version: ${FEED_VERSION}`,
  "files:",
  `  - url: ${installerName}`,
  `    sha512: ${sha512}`,
  `    size: ${payload.length}`,
  `path: ${installerName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");
writeFileSync(path.join(feedDir, "latest.yml"), latestYml);

/* ── 2. Serve it on a loopback port ───────────────────────────────────────── */
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname.replace(/^\/+/, ""));
  const file = path.join(feedDir, name);
  if (!file.startsWith(feedDir) || !existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-length": statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const feedPort = server.address().port;

/* ── 3. Feed config + throwaway profile ───────────────────────────────────── */
const feedConfig = path.join(tmp, "dev-app-update.yml");
writeFileSync(
  feedConfig,
  `provider: generic\nurl: http://127.0.0.1:${feedPort}/\nchannel: latest\nupdaterCacheDirName: masarflow-updater-proof\n`,
);

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill();
}

/** One Runtime.evaluate round-trip over the DevTools websocket. */
function cdpEvaluate(wsUrl, expression, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("cdp timeout"));
    }, timeoutMs);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
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
        if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.text ?? "renderer threw"));
        else resolve(msg.result?.result?.value);
      } catch {
        /* ignore non-JSON frames */
      }
    };
  });
}

/** Launch an exe, wait for its masarflow:// renderer, evaluate `expr`, kill it. */
async function runScenario({ label, exePath, env, expr, evalTimeoutMs = 90_000, bootMs = 120_000 }) {
  const cdpPort = await freePort();
  const profile = path.join(tmp, `profile-${label}`);
  const child = spawn(exePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`], {
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
  let result = null;
  let error = "timeout waiting for the app's renderer";
  const deadline = Date.now() + bootMs;
  try {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(2000) });
        const targets = await res.json();
        const target = targets.find((t) => t.type === "page" && String(t.url).startsWith("masarflow://"));
        if (target?.webSocketDebuggerUrl) {
          result = await cdpEvaluate(target.webSocketDebuggerUrl, expr, evalTimeoutMs);
          error = null;
          break;
        }
      } catch (e) {
        error = String(e?.message ?? e);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    killTree(child);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { result, error };
}

const EXPR_FEED = `(async () => {
  const events = [];
  const off = window.masarflow.updater.onStatus((s) =>
    events.push({ phase: s.phase, percent: s.percent, availableVersion: s.availableVersion }));
  const before = await window.masarflow.updater.get();
  const afterCheck = await window.masarflow.updater.check();
  const afterDownload = await window.masarflow.updater.download();
  off();
  return { origin: location.origin, before, afterCheck, afterDownload, events };
})()`;

const EXPR_OFFLINE = `(async () => {
  const s = await window.masarflow.updater.check();
  const after = await window.masarflow.updater.get();
  return { phase: s.phase, message: s.message, after: after.phase, alive: document.title.length > 0 };
})()`;

const EXPR_PORTABLE = `(async () => {
  const deadline = Date.now() + 8000;
  let s = await window.masarflow.updater.get();
  while (s.phase === "idle" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    s = await window.masarflow.updater.get();
  }
  return { phase: s.phase, disabledReason: s.disabledReason, currentVersion: s.currentVersion };
})()`;

/* ── A. the local feed path ───────────────────────────────────────────────── */
const a = await runScenario({
  label: "feed",
  exePath: exe,
  env: { MASARFLOW_UPDATER_DEV_FEED: "1", MASARFLOW_UPDATER_FEED_FILE: feedConfig },
  expr: EXPR_FEED,
});
const events = a.result?.events ?? [];
const okA =
  a.error === null &&
  a.result?.afterCheck?.phase === "available" &&
  a.result?.afterCheck?.availableVersion === FEED_VERSION &&
  a.result?.afterDownload?.phase === "ready" &&
  a.result?.afterDownload?.percent === 100 &&
  events.some((e) => e.phase === "ready");

/* ── B. offline: feed server stopped ─────────────────────────────────────── */
server.close();
await new Promise((r) => setTimeout(r, 500));
const b = await runScenario({
  label: "offline",
  exePath: exe,
  env: { MASARFLOW_UPDATER_DEV_FEED: "1", MASARFLOW_UPDATER_FEED_FILE: feedConfig },
  expr: EXPR_OFFLINE,
});
const okB = b.error === null && b.result?.phase === "error" && Boolean(b.result?.message) && b.result?.alive === true;

/* ── C. portable build stays disabled ────────────────────────────────────── */
let c = { result: null, error: portableExe ? "not run" : "no portable artifact in desktop/dist" };
if (portableExe) {
  c = await runScenario({ label: "portable", exePath: portableExe, env: {}, expr: EXPR_PORTABLE, bootMs: 180_000 });
}
const okC = c.error === null && c.result?.phase === "disabled" && /portable/i.test(String(c.result?.disabledReason ?? ""));

const ok = okA && okB && okC;
const evidence = {
  at: new Date().toISOString(),
  mode: "local generic feed (no github.com)",
  app: exe,
  portableApp: portableExe ?? null,
  feed: { url: `http://127.0.0.1:${feedPort}/`, version: FEED_VERSION, installer: installerName, bytes: payload.length },
  ok,
  scenarios: {
    aLocalFeed: { ok: okA, ...a },
    bOffline: { ok: okB, ...b },
    cPortable: { ok: okC, ...c },
  },
};
const evidenceDir = path.join(root, "reports", "p10");
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(path.join(evidenceDir, "update-path-proof.json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");

try {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 1000 });
} catch {
  console.log("note: temp dir left in place (file handles):", tmp);
}

if (ok) {
  console.log(
    "PROOF_OK",
    JSON.stringify({
      aLocalFeed: { afterCheck: a.result.afterCheck, afterDownload: a.result.afterDownload, events },
      bOffline: b.result,
      cPortable: c.result,
    }),
  );
  process.exit(0);
}
console.error("PROOF_FAIL", JSON.stringify(evidence, null, 2));
process.exit(1);
