#!/usr/bin/env node
/**
 * MasarFlow production launcher (Python-required mode).
 *
 * Ensures the python-service venv exists (creates + pip-installs on first
 * run), then starts the Next.js production server and the uvicorn AI service
 * together, prefixing each process's output. Kills both when either exits or
 * on Ctrl-C. Mirrors `npm run dev:full` but for `next start`.
 *
 * Requires Python 3.11+ on PATH and a prior `next build`.
 */
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pyDir = path.join(root, "python-service");
const require = createRequire(path.join(root, "package.json"));

const PYTHON_PORT = process.env.PYTHON_PORT ?? "8000";
const OPENCODE_PORT = process.env.OPENCODE_PORT ?? "4096";
const venvBin = process.platform === "win32" ? "Scripts" : "bin";
const venvPythonExe = process.platform === "win32" ? "python.exe" : "python";
const venvPython = path.join(pyDir, ".venv", venvBin, venvPythonExe);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET a URL with a short timeout; resolves to the parsed JSON or null. */
async function fetchJson(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Locate the opencode binary: OPENCODE_BIN override → npm global install
 * (opencode-ai ships the compiled binary) → PATH.
 */
function resolveOpencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const candidates = [];
  if (process.platform === "win32") {
    // Windows default npm global root (no npm call needed — execFileSync
    // cannot resolve the extension-less `npm` shim).
    const appDataRoot = path.join(process.env.APPDATA ?? "", "npm", "node_modules");
    candidates.push(path.join(appDataRoot, "opencode-ai", "bin", "opencode.exe"));
    try {
      const npmRoot = execFileSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["root", "-g"],
        { encoding: "utf8", shell: process.platform === "win32" },
      ).trim();
      candidates.push(path.join(npmRoot, "opencode-ai", "bin", "opencode.exe"));
    } catch {}
  } else {
    try {
      const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
      candidates.push(path.join(npmRoot, "opencode-ai", "bin", "opencode"));
    } catch {}
  }
  for (const exe of candidates) {
    if (exe && existsSync(exe)) return exe;
  }
  return process.platform === "win32" ? "opencode.cmd" : "opencode";
}

/**
 * Spawn `opencode serve` on the first free port at or above the requested one
 * and wait until /global/health responds. Returns the child, or null when the
 * server is already running / spawning is disabled / health never came up.
 */
async function startOpencode() {
  const requestedUrl = process.env.OPENCODE_BASE_URL?.trim();
  if (requestedUrl) {
    const health = await fetchJson(
      `${requestedUrl.replace(/\/+$/, "")}/global/health`,
      2000,
    );
    if (health?.healthy) {
      console.log(`[opencode] already reachable at ${requestedUrl} — reusing.`);
      return null;
    }
  }
  if (process.env.OPENCODE_AUTO_START === "false") {
    console.warn(
      "[opencode] not reachable and OPENCODE_AUTO_START=false — chat will show availability errors.",
    );
    return null;
  }
  const bin = resolveOpencodeBin();
  const requestedPort = Number(OPENCODE_PORT) || 4096;
  const port = await findFreePort(requestedPort);
  if (port !== requestedPort) {
    console.warn(
      `[opencode] port ${requestedPort} is occupied (Kilo Code or another tool?) — running on ${port} instead.`,
    );
  }
  console.log(`[opencode] starting server on http://127.0.0.1:${port} …`);
  // Own state + providers come from the shared opencode data dir; strip the
  // VS Code extension's instance markers so this server never tries to attach
  // to the user's running TUI instance.
  const env = { ...process.env };
  delete env.OPENCODE;
  delete env.OPENCODE_PID;
  delete env.OPENCODE_CALLER;
  const serverPassword =
    process.env.OPENCODE_SERVER_PASSWORD ?? process.env.OPENCODE_PASSWORD ?? "";
  if (serverPassword) {
    env.OPENCODE_SERVER_PASSWORD = serverPassword;
    env.OPENCODE_SERVER_USERNAME =
      process.env.OPENCODE_SERVER_USERNAME ?? process.env.OPENCODE_USERNAME ?? "opencode";
  }
  const child = startProcess(
    "opencode",
    bin.endsWith(".cmd") ? "cmd.exe" : bin,
    bin.endsWith(".cmd") ? ["/c", bin, "serve", "--hostname", "127.0.0.1", "--port", String(port)] : ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: root, env },
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  // Wait up to ~30s for health so Next boots with a live chat backend.
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      console.error(
        "[opencode] server exited during startup — chat will show availability errors.",
      );
      return null;
    }
    if ((await fetchJson(`${baseUrl}/global/health`, 1000))?.healthy) {
      console.log(`[opencode] ready at ${baseUrl}.`);
      return { child, baseUrl };
    }
    await sleep(500);
  }
  console.warn("[opencode] health check timed out — continuing without it.");
  return { child, baseUrl };
}

/** Is something already bound to this loopback port? */
function isPortInUse(port) {
  return new Promise((resolvePromise) => {
    const probe = net.createServer();
    probe.once("error", () => resolvePromise(true));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolvePromise(false));
    });
  });
}

/**
 * First free port at or above `startPort`. Windows can leave "phantom"
 * listening sockets behind when a uvicorn process is force-killed (the TCB
 * outlives the process, so the port reports busy and stays that way until
 * reboot). Scanning forward keeps the app working on a squatted default port
 * instead of dying with EADDRINUSE.
 */
async function findFreePort(startPort) {
  for (let p = startPort; p < startPort + 200; p++) {
    if (!(await isPortInUse(p))) return p;
  }
  return startPort; // give up — the spawn surfaces the real bind error
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function ensureVenv() {
  if (existsSync(venvPython)) return;
  console.log("[setup] creating python-service/.venv …");
  await run("python", ["-m", "venv", ".venv"], { cwd: pyDir });
  console.log("[setup] installing requirements/base.txt …");
  await run(venvPython, ["-m", "pip", "install", "-r", "requirements/base.txt"], {
    cwd: pyDir,
  });
  console.log("[setup] python service ready.");
}

function startProcess(label, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...opts,
  });
  const prefix = `[${label}] `;
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  return child;
}

async function main() {
  await ensureVenv();

  if (process.argv.includes("--setup-only")) {
    console.log("[start] venv ready (--setup-only).");
    return;
  }

  let nextCli;
  try {
    nextCli = require.resolve("next/dist/bin/next");
  } catch {
    console.error("[start] next is not installed — run `npm install` first.");
    process.exit(1);
  }

  const isDev = process.argv.includes("--dev");
  const nextArgs = isDev
    ? ["dev", "--webpack"]
    : (process.env.PORT ? ["start", "-p", String(process.env.PORT)] : ["start"]);
  if (isDev && process.env.PORT) {
    nextArgs.push("-p", String(process.env.PORT));
  }

  // Resolve the Python port BEFORE spawning either child, and hand the real
  // address to Next via its env so the app probes the instance we actually
  // started (and the boot gate reuses it instead of spawning a second one).
  // A squatted default port (see findFreePort) shifts both sides in sync.
  const requestedUrl = process.env.PYTHON_SERVICE_URL?.trim();
  const requestedPort = requestedUrl
    ? Number(new URL(requestedUrl).port) || Number(PYTHON_PORT)
    : Number(PYTHON_PORT);
  const pyPort = await findFreePort(requestedPort);
  if (pyPort !== requestedPort) {
    console.error(
      `[start] port ${requestedPort} is occupied — running the Python service on ${pyPort} instead. ` +
        "(A reboot clears stale Windows socket entries.)",
    );
  }

  // Bring up the OpenCode agent backend before Next so the chat works on the
  // first page load (spawn skipped when a server is already reachable).
  const opencode = await startOpencode();
  const nextEnv = {
    ...process.env,
    PYTHON_SERVICE_URL: `http://127.0.0.1:${pyPort}`,
    PYTHON_PORT: String(pyPort),
  };
  if (opencode?.baseUrl) nextEnv.OPENCODE_BASE_URL = opencode.baseUrl;

  const nextChild = startProcess(
    "next",
    process.execPath,
    [nextCli, ...nextArgs],
    { cwd: root, env: nextEnv },
  );

  const pyArgs = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "python-service",
    "--port",
    String(pyPort),
  ];
  if (isDev) {
    // Watch ONLY the Python app source, never the whole python-service dir.
    // Chroma's persistent store (store/chroma/) writes constantly during
    // embedding syncs and would otherwise restart the worker mid-job — the
    // "watchfiles: N changes detected" restart loop that killed in-flight
    // embeddings and stalled chat turns. Code edits still hot-reload.
    pyArgs.push("--reload", "--reload-dir", "python-service/app");
  }

  const pyChild = startProcess(
    "py",
    venvPython,
    pyArgs,
    { cwd: root },
  );

  const cleanup = (signal) => {
    for (const c of [
      nextChild,
      pyChild,
      ...(opencode?.child ? [opencode.child] : []),
    ]) {
      try {
        if (process.platform === "win32") {
          c.kill("SIGKILL");
        } else {
          c.kill(signal);
        }
      } catch {}
    }
    process.exit(0);
  };
  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));

  const exited = new Promise((resolve) => {
    nextChild.on("exit", (code) => resolve({ who: "next", code }));
    pyChild.on("exit", (code) => resolve({ who: "py", code }));
    if (opencode?.child) {
      opencode.child.on("exit", (code) => resolve({ who: "opencode", code }));
    }
  });
  const { who, code } = await exited;
  console.error(`[start] ${who} exited (code ${code}) — shutting down.`);
  cleanup("SIGKILL");
}

main().catch((err) => {
  console.error(`[start] ${err.message}`);
  process.exit(1);
});
