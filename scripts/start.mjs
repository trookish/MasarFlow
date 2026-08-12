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
import { installOpencodeTools } from "./install-opencode-tools.mjs";

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
    const appDataRoot = path.join(
      process.env.APPDATA ?? "",
      "npm",
      "node_modules",
    );
    candidates.push(
      path.join(appDataRoot, "opencode-ai", "bin", "opencode.exe"),
    );
    try {
      // `cmd /c` (shell:false) instead of shell:true — avoids the DEP0190
      // deprecation warning while still resolving npm.cmd on Windows.
      const npmRoot = execFileSync(
        process.platform === "win32" ? "cmd.exe" : "npm",
        process.platform === "win32" ? ["/d", "/s", "/c", "npm root -g"] : ["root", "-g"],
        { encoding: "utf8" },
      ).trim();
      candidates.push(path.join(npmRoot, "opencode-ai", "bin", "opencode.exe"));
    } catch {}
  } else {
    try {
      const npmRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
      }).trim();
      candidates.push(path.join(npmRoot, "opencode-ai", "bin", "opencode"));
    } catch {}
  }
  for (const exe of candidates) {
    if (exe && existsSync(exe)) return exe;
  }
  return process.platform === "win32" ? "opencode.cmd" : "opencode";
}

/** Is `cmd` an executable we can actually run (absolute path or on PATH)? */
function commandExists(cmd) {
  if (!cmd) return false;
  const isPath = path.isAbsolute(cmd) || cmd.includes("/") || cmd.includes("\\");
  if (isPath) return existsSync(cmd);
  try {
    const probe = execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
    return probe.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Packages the Python service imports at boot (python-service/app/main.py →
 * embeddings.py, job_queue.py). Everything else in requirements/base.txt is
 * lazily imported or marker-skipped on some Python versions, so it must never
 * block startup — pip either installs it or resolves it via markers.
 */
const BOOT_REQUIRED = [
  "fastapi",
  "uvicorn",
  "pydantic",
  "httpx",
  "chromadb",
  "sentence-transformers",
];

/**
 * Check that every boot-critical package is actually installed in the venv.
 * Fast (importlib.metadata only — no heavy imports). Returns the names of the
 * missing packages.
 */
function missingRequirements() {
  const missing = [];
  for (const name of BOOT_REQUIRED) {
    try {
      execFileSync(venvPython, ["-c", "import importlib.metadata as im, sys; im.distribution(sys.argv[1])", name], {
        cwd: pyDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
    } catch {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Install (idempotent) and verify every required Python package. Fails with a
 * clear, actionable message when something is still missing.
 */
async function ensurePythonDeps() {
  if (!existsSync(venvPython)) {
    console.log("[setup] creating python-service/.venv …");
    await run("python", ["-m", "venv", ".venv"], { cwd: pyDir });
  }
  console.log("[setup] verifying Python requirements (pip install is a no-op when satisfied) …");
  try {
    await run(
      venvPython,
      ["-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", "requirements/base.txt"],
      { cwd: pyDir },
    );
  } catch (e) {
    console.error(`[setup] pip install failed: ${e.message}`);
    console.error(
      `[setup]   Fix the error above, then rerun: ${venvPython} -m pip install -r ${path.join(pyDir, "requirements", "base.txt")}`,
    );
    process.exit(1);
  }

  let missing = missingRequirements();
  if (missing.length) {
    console.error(`[setup] still missing: ${missing.join(", ")} — retrying the install once …`);
    try {
      await run(
        venvPython,
        ["-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", "requirements/base.txt"],
        { cwd: pyDir },
      );
    } catch (e) {
      console.error(`[setup] pip install failed on retry: ${e.message}`);
    }
    missing = missingRequirements();
  }
  if (missing.length) {
    console.error(`[setup] FAILED: the Python service is missing required packages: ${missing.join(", ")}`);
    console.error(`[setup]   Install them manually with:`);
    console.error(`[setup]     ${venvPython} -m pip install -r ${path.join(pyDir, "requirements", "base.txt")}`);
    console.error(`[setup]   then restart MasarFlow.`);
    process.exit(1);
  }
  console.log("[setup] python service ready.");
}

/**
 * Spawn `opencode serve` on the first free port at or above the requested one
 * and wait until /global/health responds. Returns the child, or null when the
 * server is already running / spawning is disabled / health never came up.
 */
async function startOpencode(bridgeEnv) {
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
  if (!commandExists(bin)) {
    // OpenCode is an OPTIONAL dependency: without it the agentic chat is
    // disabled, but MasarFlow itself must keep running normally.
    console.warn(
      `[opencode] binary "${bin}" not found — AI agent chat is disabled. ` +
        "Install it with `npm install -g opencode-ai` (or set OPENCODE_BIN) to enable it. " +
        "All other features keep working.",
    );
    return null;
  }
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
      process.env.OPENCODE_SERVER_USERNAME ??
      process.env.OPENCODE_USERNAME ??
      "opencode";
  }
  // Runtime overrides for the generated workspace-tool files (the baked-in
  // values stay valid, but these keep a manually-started server in sync with
  // a relocated MasarFlow server or rotated secret).
  if (bridgeEnv?.secret) env.MASARFLOW_BRIDGE_SECRET = bridgeEnv.secret;
  if (bridgeEnv?.url) env.MASARFLOW_BRIDGE_URL = bridgeEnv.url;
  const child = startProcess(
    "opencode",
    bin.endsWith(".cmd") ? "cmd.exe" : bin,
    bin.endsWith(".cmd")
      ? ["/c", bin, "serve", "--hostname", "127.0.0.1", "--port", String(port)]
      : ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: root, env },
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  // Wait up to ~30s for health so Next boots with a live chat backend.
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null || child.spawnFailed) {
      console.warn(
        "[opencode] server failed to start — chat will show availability errors, everything else keeps running.",
      );
      return null;
    }
    if ((await fetchJson(`${baseUrl}/global/health`, 1000))?.healthy) {
      console.log(`[opencode] ready at ${baseUrl}.`);
      await verifyWorkspaceTools(baseUrl);
      return { child, baseUrl };
    }
    await sleep(500);
  }
  console.warn("[opencode] health check timed out — continuing without it.");
  return { child, baseUrl };
}

/**
 * Confirm the opencode server actually registered MasarFlow's workspace
 * functions (create_note, read_spec, …). Only a server that started AFTER
 * the tool files were installed has them — an already-running server needs
 * a restart. Warns, never fails: chat degrades with a notice instead.
 */
async function verifyWorkspaceTools(baseUrl) {
  try {
    const ids = await fetchJson(
      `${baseUrl}/experimental/tool/ids`,
      // The first call compiles the custom tools (can take ~10-30s) — and
      // this call warms the cache so the first chat turn is fast.
      60_000,
    );
    if (!Array.isArray(ids)) {
      console.warn(
        "[opencode] could not list tool ids — workspace functions may not be registered.",
      );
      return;
    }
    // The first few workspace functions, as a spot check.
    const spot = [
      "search_workspace",
      "create_note",
      "read_spec",
      "create_task",
    ];
    const missing = spot.filter((name) => !ids.includes(name));
    if (missing.length === spot.length) {
      console.warn(
        "[opencode] the workspace functions are NOT registered — the server was already running and needs a restart to pick up the installed tools (or run `npm run tools:install` and restart it).",
      );
    } else if (missing.length) {
      console.warn(
        `[opencode] some workspace functions are missing: ${missing.join(", ")} — restart the server to register the full tool set.`,
      );
    } else {
      console.log(
        "[opencode] workspace functions registered (create_note, read_spec, create_task, …).",
      );
    }
  } catch {
    console.warn("[opencode] tool verification failed — continuing.");
  }
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

function startProcess(label, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...opts,
  });
  // A failed spawn (e.g. missing binary) must never crash the whole app.
  child.on("error", (err) => {
    child.spawnFailed = true;
    console.error(`[${label}] failed to start: ${err.message}`);
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
  await ensurePythonDeps();

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
  if (!isDev) {
    // Production mode needs a completed `next build`. A missing or torn
    // .next (e.g. after an interrupted build, or a build that ran while the
    // dev server was writing to the same .next) fails inside next start with
    // a cryptic ENOENT — catch it here with a clear message instead.
    const buildId = path.join(root, ".next", "BUILD_ID");
    const prerenderManifest = path.join(root, ".next", "prerender-manifest.json");
    if (!existsSync(buildId) || !existsSync(prerenderManifest)) {
      console.error(
        "[start] no production build found in .next — the last `npm run build` did not complete.",
      );
      console.error("[start]   Run `npm run build` and make sure no other MasarFlow server is running");
      console.error("[start]   (stop the app first — a running dev/prod server locks the .next folder),");
      console.error("[start]   then run `npm start` again.");
      process.exit(1);
    }
  }
  const nextArgs = isDev
    ? ["dev", "--webpack"]
    : process.env.PORT
      ? ["start", "-p", String(process.env.PORT)]
      : ["start"];
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
  // first page load (spawn skipped when a server is already reachable). The
  // workspace functions are installed as opencode custom tools FIRST — a
  // running server only registers tools that existed when it started.
  // OpenCode is OPTIONAL: when the binary is missing we skip the tool install
  // and the server start, and the app runs without the agentic chat.
  let bridgeEnv = { secret: "", url: "" };
  if (commandExists(resolveOpencodeBin())) {
    try {
      const installed = await installOpencodeTools();
      bridgeEnv = { secret: installed.secret, url: installed.bridgeUrl };
    } catch (e) {
      console.warn(`[tools] ${e.message}`);
    }
  } else {
    console.warn(
      "[tools] opencode not found — skipping workspace-tool install (AI agent chat disabled).",
    );
  }
  const opencode = await startOpencode(bridgeEnv);
  const nextEnv = {
    ...process.env,
    PYTHON_SERVICE_URL: `http://127.0.0.1:${pyPort}`,
    PYTHON_PORT: String(pyPort),
  };
  if (bridgeEnv.secret) nextEnv.MASARFLOW_BRIDGE_SECRET = bridgeEnv.secret;
  if (bridgeEnv.url) nextEnv.MASARFLOW_BRIDGE_URL = bridgeEnv.url;
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

  const pyChild = startProcess("py", venvPython, pyArgs, { cwd: root });

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
    // The OpenCode server is OPTIONAL — when it exits on its own, MasarFlow
    // keeps running (the chat UI reports it as unavailable).
    if (opencode?.child) {
      opencode.child.on("exit", (code) => {
        console.warn(
          `[opencode] server exited (code ${code}) — AI agent chat is now unavailable. ` +
            "The web app and Python service keep running.",
        );
      });
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
