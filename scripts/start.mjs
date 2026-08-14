#!/usr/bin/env node
/**
 * MasarFlow production launcher (Python-required mode).
 *
 * Ensures the python-service venv exists (creates + pip-installs on first
 * run), then starts the Next.js production server and the uvicorn AI service
 * together, prefixing each process's output. Kills both when either exits or
 * on Ctrl-C. Mirrors `pnpm run dev:full` but for `next start`.
 *
 * Requires Python 3.11+ on PATH and a prior `next build`.
 */
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
const DEFAULT_APP_PORT = 3000;
const venvBin = process.platform === "win32" ? "Scripts" : "bin";
const venvPythonExe = process.platform === "win32" ? "python.exe" : "python";
const venvPython = path.join(pyDir, ".venv", venvBin, venvPythonExe);

/** Where the launcher looks for the ports we actually bound (gitignored). */
const PORTS_FILE = path.join(root, ".masarflow", "run-ports.json");

function writePortsFile(appPort, pyPort, opencodePort) {
  try {
    mkdirSync(path.dirname(PORTS_FILE), { recursive: true });
    writeFileSync(
      PORTS_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          app: appPort,
          python: pyPort,
          opencode: opencodePort,
          startedAt: Date.now(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // best effort — the launcher falls back to the configured ports
  }
}

/** Delete the ports file only when this run wrote it (pid match). */
function clearPortsFile() {
  try {
    if (!existsSync(PORTS_FILE)) return;
    const data = JSON.parse(readFileSync(PORTS_FILE, "utf8"));
    if (data?.pid === process.pid) unlinkSync(PORTS_FILE);
  } catch {
    // best effort
  }
}

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
 * Locate the opencode binary: OPENCODE_BIN override → npm/pnpm global
 * install (opencode-ai ships the compiled binary) → PATH.
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
    // Same for a pnpm global install (PNPM_HOME or `pnpm root -g`).
    for (const pnpmRoot of [
      process.env.PNPM_HOME,
      (() => {
        try {
          return execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm root -g"], {
            encoding: "utf8",
          }).trim();
        } catch {
          return "";
        }
      })(),
    ]) {
      if (pnpmRoot) {
        candidates.push(
          path.join(pnpmRoot, "opencode-ai", "bin", "opencode.exe"),
        );
      }
    }
  } else {
    try {
      const npmRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
      }).trim();
      candidates.push(path.join(npmRoot, "opencode-ai", "bin", "opencode"));
    } catch {}
    try {
      const pnpmRoot = execFileSync("pnpm", ["root", "-g"], {
        encoding: "utf8",
      }).trim();
      candidates.push(path.join(pnpmRoot, "opencode-ai", "bin", "opencode"));
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
 * missing packages. A single Python spawn checks all packages at once — six
 * separate `python -c` launches cost ~1s of interpreter startup on Windows.
 */
function missingRequirements() {
  try {
    const script = [
      "import importlib.metadata as im, sys",
      "missing = []",
      "for n in sys.argv[1:]:",
      "    try:",
      "        im.distribution(n)",
      "    except Exception:",
      "        missing.append(n)",
      "print('\\n'.join(missing))",
    ].join("\n");
    const out = execFileSync(venvPython, ["-c", script, ...BOOT_REQUIRED], {
      cwd: pyDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return out.split(/\r?\n/).filter((n) => n.trim().length > 0);
  } catch {
    // A broken interpreter is itself a failure — report everything missing.
    return [...BOOT_REQUIRED];
  }
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
  // Fast path: check what's missing first — pip install (even a satisfied
  // no-op) still resolves the index and costs seconds on every boot.
  let missing = missingRequirements();
  if (!missing.length) {
    console.log("[setup] python service ready.");
    return;
  }
  console.log(
    `[setup] installing missing Python requirements: ${missing.join(", ")} …`,
  );
  try {
    await run(
      venvPython,
      ["-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", "requirements/base.txt"],
      { cwd: pyDir },
    );
  } catch (e) {
    throw new Error(
      `pip install failed: ${e.message} — fix the error, then rerun: ` +
        `${venvPython} -m pip install -r ${path.join(pyDir, "requirements", "base.txt")}`,
    );
  }

  missing = missingRequirements();
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
    throw new Error(
      `FAILED: the Python service is missing required packages: ${missing.join(", ")} — ` +
        `install them manually with: ${venvPython} -m pip install -r ` +
        `${path.join(pyDir, "requirements", "base.txt")} — then restart MasarFlow.`,
    );
  }
  console.log("[setup] python service ready.");
}

/**
 * Spawn `opencode serve` on the first free port at or above the requested one
 * — WITHOUT waiting for it to become healthy, so the Next compile can start
 * immediately. Returns the child, or null when the server is already running
 * / spawning is disabled.
 */
async function prepareOpencode(bridgeEnv) {
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
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

/**
 * Wait (up to ~30s) for a prepared opencode server to report healthy, then
 * verify the workspace tools are registered. Runs detached from the launcher
 * boot path — it must never block the Next compile or the Python service.
 */
async function waitForOpencode({ child, baseUrl }) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null || child.spawnFailed) {
      console.warn(
        "[opencode] server failed to start — chat will show availability errors, everything else keeps running.",
      );
      return;
    }
    if ((await fetchJson(`${baseUrl}/global/health`, 1000))?.healthy) {
      console.log(`[opencode] ready at ${baseUrl}.`);
      await verifyWorkspaceTools(baseUrl);
      return;
    }
    await sleep(500);
  }
  console.warn("[opencode] health check timed out — continuing without it.");
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
        "[opencode] the workspace functions are NOT registered — the server was already running and needs a restart to pick up the installed tools (or run `pnpm run tools:install` and restart it).",
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

/** Is a process with this pid still alive? */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next dev/build hold an exclusive lockfile at .next/lock while they run. A
 * stale dev server from a previous force-killed run keeps holding it, and a
 * new `next dev` then refuses to start ("Another next dev server is already
 * running") — the launcher's terminal dies with no way to recover. When the
 * lock's owner is still alive, stop it first so dev can always come up.
 */
function releaseNextLock() {
  // Next 16 dev keeps its lock at .next/dev/lock; older builds used .next/lock.
  const lockPath = [
    path.join(root, ".next", "dev", "lock"),
    path.join(root, ".next", "lock"),
  ].find((p) => existsSync(p));
  if (!lockPath) return Promise.resolve();
  let info = null;
  try {
    info = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    // unreadable lock — Next's own retry/exit message takes over
  }
  const pid = typeof info?.pid === "number" ? info.pid : null;
  if (!pid || !isPidAlive(pid)) {
    // The OS released the lock with its process — nothing to do.
    return Promise.resolve();
  }
  console.error(
    `[next] another server is already running for this project (pid ${pid}) ` +
      "— stopping it so this run can take over. " +
      "(Only one dev server can run per project.)",
  );
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    // fall through — the lock will fail and Next surfaces its own error
  }
  // Give the killed process a moment to release the native lock.
  return sleep(700);
}

/** Is something already bound to this port (IPv4 or IPv6)? */
function isPortInUse(port) {
  // Next dev/start binds `::` (IPv6 any) while uvicorn binds 127.0.0.1 —
  // probe both families or a stale v6-only listener slips past and the child
  // dies with EADDRINUSE at spawn time.
  const probe = (host) =>
    new Promise((resolvePromise) => {
      const s = net.createServer();
      s.once("error", () => resolvePromise(true));
      s.listen(port, host, () => {
        s.close(() => resolvePromise(false));
      });
    });
  return (async () => (await probe("::")) || (await probe("127.0.0.1")))();
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
  if (process.argv.includes("--setup-only")) {
    await ensurePythonDeps();
    console.log("[start] venv ready (--setup-only).");
    return;
  }

  let nextCli;
  try {
    nextCli = require.resolve("next/dist/bin/next");
  } catch {
    console.error("[start] next is not installed — run `pnpm install` first.");
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
        "[start] no production build found in .next — the last `pnpm run build` did not complete.",
      );
      console.error("[start]   Run `pnpm run build` and make sure no other MasarFlow server is running");
      console.error("[start]   (stop the app first — a running dev/prod server locks the .next folder),");
      console.error("[start]   then run `pnpm start` again.");
      process.exit(1);
    }
  }
  const nextArgs = isDev ? ["dev"] : ["start"];
  if (process.env.PORT) {
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

  // Next dev refuses to start while another dev/build server for this project
  // holds .next/lock (e.g. a stale server from a force-killed previous run).
  // Release it first so the launcher never dies on "another server running".
  if (isDev) await releaseNextLock();

  // Same shift strategy for the app port: a stale Next process from a
  // previous force-killed run must never wedge startup. Next dev prompts
  // interactively on a busy port, which would hang the launcher's terminal
  // with no way to answer — so resolve a free port up front and pass it
  // explicitly (dev and prod), then publish it for the launcher below.
  const requestedAppPort = Number(process.env.PORT) || DEFAULT_APP_PORT;
  const appPort = await findFreePort(requestedAppPort);
  if (appPort !== requestedAppPort) {
    console.error(
      `[start] port ${requestedAppPort} is occupied — running Next on ${appPort} instead. ` +
        "(A reboot clears stale Windows socket entries.)",
    );
  }
  nextArgs.push("-p", String(appPort));

  // Fast pre-flight: install the workspace tools and spawn the opencode
  // server WITHOUT waiting for it to report healthy. The slow parts (tool
  // compilation, health polling) are pushed to waitForOpencode below, which
  // runs detached while Next compiles. A running server only registers tools
  // that existed when it started, so the install must still precede the
  // spawn. OpenCode is OPTIONAL: when the binary is missing we skip the tool
  // install and the server start, and the app runs without the agentic chat.
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
  const opencode = await prepareOpencode(bridgeEnv);
  const opencodePort = opencode?.baseUrl
    ? Number(new URL(opencode.baseUrl).port) || null
    : null;
  const nextEnv = {
    ...process.env,
    PORT: String(appPort),
    PYTHON_SERVICE_URL: `http://127.0.0.1:${pyPort}`,
    PYTHON_PORT: String(pyPort),
    // start.mjs owns the Python process — the app must never spawn a second
    // uvicorn that races this one for the same port (a stale probe can win
    // the race and kill the whole stack with EADDRINUSE). The app follows
    // the shifted port via .masarflow/run-ports.json instead.
    MASARFLOW_PYTHON_MANAGED: "1",
  };
  if (bridgeEnv.secret) nextEnv.MASARFLOW_BRIDGE_SECRET = bridgeEnv.secret;
  if (bridgeEnv.url) nextEnv.MASARFLOW_BRIDGE_URL = bridgeEnv.url;
  if (opencode?.baseUrl) nextEnv.OPENCODE_BASE_URL = opencode.baseUrl;

  // Publish the ports we actually bound so the desktop launcher's status
  // chips and browser-open button follow any shift instead of polling the
  // configured (possibly squatted) ports.
  writePortsFile(appPort, pyPort, opencodePort);

  // Spawn Next FIRST — its compile is the long pole, so it must overlap the
  // Python setup and the opencode warm-up instead of starting after them.
  const nextChild = startProcess(
    "next",
    process.execPath,
    [nextCli, ...nextArgs],
    { cwd: root, env: nextEnv },
  );

  // uvicorn needs the venv ready; check/install it while Next compiles.
  try {
    await ensurePythonDeps();
  } catch (e) {
    console.error(`[setup] ${e.message}`);
    try {
      nextChild.kill("SIGKILL");
    } catch {}
    process.exit(1);
  }

  const pyArgsBase = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "python-service",
  ];
  if (isDev) {
    // Watch ONLY the Python app source, never the whole python-service dir.
    // Chroma's persistent store (store/chroma/) writes constantly during
    // embedding syncs and would otherwise restart the worker mid-job — the
    // "watchfiles: N changes detected" restart loop that killed in-flight
    // embeddings and stalled chat turns. Code edits still hot-reload.
    pyArgsBase.push("--reload", "--reload-dir", "python-service/app");
  }

  // Windows can leave "phantom" sockets that pass the findFreePort probe but
  // still reject the real bind — and a foreign process can squat the port
  // between probe and spawn. A single bad port must never take the whole app
  // down: retry by shifting forward, keeping the ports file (and therefore
  // the app's boot gate) in sync with the port that actually works.
  let workingPyPort = pyPort;
  let pyChild = null;
  for (let attempt = 0; attempt < 8 && !pyChild; attempt++) {
    const child = startProcess(
      "py",
      venvPython,
      [...pyArgsBase, "--port", String(workingPyPort)],
      { cwd: root },
    );
    const deadline = Date.now() + 25_000;
    let healthy = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.spawnFailed) break;
      const health = await fetchJson(
        `http://127.0.0.1:${workingPyPort}/health`,
        1000,
      );
      if (health?.status === "ok") {
        healthy = true;
        break;
      }
      await sleep(500);
    }
    if (healthy) {
      pyChild = child;
      break;
    }
    console.warn(
      `[start] python service did not become healthy on port ${workingPyPort} — retrying on ${workingPyPort + 1}.`,
    );
    try {
      child.kill("SIGKILL");
    } catch {}
    workingPyPort += 1;
    writePortsFile(appPort, workingPyPort, opencodePort);
  }
  if (!pyChild) {
    console.error(
      "[start] python service failed to start on any port — check the python-service logs above.",
    );
    try {
      nextChild.kill("SIGKILL");
    } catch {}
    process.exit(1);
  }
  if (workingPyPort !== requestedPort) {
    console.error(
      `[start] port ${requestedPort} was unusable — running the Python service on ${workingPyPort} instead. ` +
        "(A reboot clears stale Windows socket entries.)",
    );
  }

  const cleanup = (signal) => {
    clearPortsFile();
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
  process.on("exit", () => clearPortsFile());

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
  // Detached: opencode readiness + workspace-tool verification must never
  // delay the boot path — it logs while the app is already serving.
  if (opencode) {
    waitForOpencode(opencode).catch((e) => {
      console.warn(`[opencode] readiness check failed: ${e.message}`);
    });
  }

  const { who, code } = await exited;
  console.error(`[start] ${who} exited (code ${code}) — shutting down.`);
  cleanup("SIGKILL");
}

main().catch((err) => {
  console.error(`[start] ${err.message}`);
  process.exit(1);
});
