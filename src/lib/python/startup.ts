// Server-side manager for the local Python AI service lifecycle.
//
// The Next.js server owns the spawn so the boot gate can do a real startup
// flow instead of only polling: resolve the address, spawn uvicorn from the
// project venv, and surface the process's actual stdout/stderr + exit code on
// failure.
//
// State lives on `globalThis`: in `next dev` each route handler compiles its
// own copy of this module, so a module-level singleton wouldn't be shared —
// the startup route would track a running process that the proxy routes can't
// see. A global slot guarantees every route talks to the same manager, keeps
// spawns idempotent (no duplicate processes), and lets the proxies follow a
// dynamically shifted port.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

export type PythonStartupState = "idle" | "starting" | "running" | "failed";

export interface PythonStartupStatus {
  state: PythonStartupState;
  /** Base URL the app probes — the actual port the service runs on. */
  serviceUrl: string;
  /** Set when the process exited on its own or was force-killed. */
  exitCode: number | null;
  exitSignal: string | null;
  /** Human-readable failure summary (spawn error, venv missing, exit). */
  error: string | null;
  /** Last N lines of process stdout, for the loading screen. */
  stdoutTail: string[];
  /** Last N lines of process stderr — the real error on failure. */
  stderrTail: string[];
  startedAt: number | null;
}

const GLOBAL_KEY = "__masarflowPythonServiceState";
const MAX_TAIL = 40;
const DEFAULT_URL = "http://127.0.0.1:8000";
const PORT_SCAN_RANGE = 100;

// The repo root is runtime data (wherever the app is launched from), so it
// must be resolved dynamically; the ignore comment stops Turbopack from
// treating this as a signal to trace/deploy the whole project.
const root = path.resolve(/*turbopackIgnore: true*/ process.cwd());
const pyDir = path.join(root, "python-service");
const venvBin = process.platform === "win32" ? "Scripts" : "bin";
const venvExe = process.platform === "win32" ? "python.exe" : "python";
const venvPython = path.join(pyDir, ".venv", venvBin, venvExe);

function resolveServiceUrl(): string {
  return process.env.PYTHON_SERVICE_URL?.trim() || DEFAULT_URL;
}

function resolvePort(): string {
  const url = resolveServiceUrl();
  try {
    const port = new URL(url).port;
    if (port) return port;
  } catch {
    // fall through to PYTHON_PORT / default
  }
  return process.env.PYTHON_PORT?.trim() || "8000";
}

/** Last N lines of a stream, buffering partial lines between chunks. */
class OutputTail {
  private tail: string[] = [];
  private partial = "";

  push(chunk: string) {
    this.partial += chunk;
    const parts = this.partial.split(/\r?\n/);
    this.partial = parts.pop() ?? "";
    for (const part of parts) {
      if (part.length > 0) this.tail.push(part);
    }
    while (this.tail.length > MAX_TAIL) this.tail.shift();
  }

  lines(): string[] {
    return this.tail;
  }

  clear() {
    this.tail = [];
    this.partial = "";
  }
}

interface ProcessState {
  child: ChildProcess | null;
  state: PythonStartupState;
  /** The port the app-managed service is actually bound to (dynamic when the
   *  configured port is squatted by a dead/foreign process). */
  port: number | null;
  exitCode: number | null;
  exitSignal: string | null;
  spawnError: string | null;
  stdout: OutputTail;
  stderr: OutputTail;
  startedAt: number | null;
}

/** The single shared manager instance, created lazily. */
function svc(): ProcessState {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[GLOBAL_KEY] as ProcessState | undefined;
  if (existing) return existing;
  const fresh: ProcessState = {
    child: null,
    state: "idle",
    port: null,
    exitCode: null,
    exitSignal: null,
    spawnError: null,
    stdout: new OutputTail(),
    stderr: new OutputTail(),
    startedAt: null,
  };
  g[GLOBAL_KEY] = fresh;
  return fresh;
}

let startPromise: Promise<PythonStartupStatus> | null = null;

function alive(child: ChildProcess | null): boolean {
  return child !== null && child.exitCode === null && !child.killed;
}

function summarizeError(): string | null {
  if (svc().spawnError) return svc().spawnError;
  if (svc().exitCode !== null || svc().exitSignal !== null) {
    const code =
      svc().exitCode !== null
        ? `exited with code ${svc().exitCode}`
        : `exited (${svc().exitSignal})`;
    return `The Python service ${code}.`;
  }
  return null;
}

/** The URL the app-managed service actually answers on right now. */
function activeUrl(): string {
  return `http://127.0.0.1:${svc().port ?? resolvePort()}`;
}

/**
 * The URL /api/python/* proxies should target. Returns the managed service's
 * live URL while it's up (so the app follows a dynamically shifted port), or
 * null when nothing managed is running (callers fall back to the env default).
 */
export function getManagedServiceUrl(): string | null {
  if (svc().state === "starting" || svc().state === "running") {
    return activeUrl();
  }
  return null;
}

function snapshot(): PythonStartupStatus {
  return {
    state: svc().state,
    serviceUrl: activeUrl(),
    exitCode: svc().exitCode,
    exitSignal: svc().exitSignal,
    error: summarizeError(),
    stdoutTail: svc().stdout.lines(),
    stderrTail: svc().stderr.lines(),
    startedAt: svc().startedAt,
  };
}

async function probeHealth(timeoutMs = 800): Promise<boolean> {
  try {
    const res = await fetch(`${resolveServiceUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const probe = net.createServer();
    probe.once("error", () => resolvePromise(true));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolvePromise(false));
    });
  });
}

/** First free port at or above `startPort`. Squatted-but-unhealthy ports
 *  (dead listeners that refuse to release their socket) are skipped so the
 *  service always finds somewhere to bind. */
async function findFreePort(startPort: number): Promise<number> {
  for (let p = startPort; p < startPort + PORT_SCAN_RANGE; p++) {
    if (!(await isPortInUse(p))) return p;
  }
  return startPort; // give up — the spawn surfaces the real bind error
}

function spawnService(): PythonStartupStatus {
  const current = svc();
  if (current.state === "failed" || current.state === "starting") {
    // A previous spawn never succeeded or is still in flight — don't stack.
    return snapshot();
  }

  if (!existsSync(venvPython)) {
    current.state = "failed";
    current.exitCode = null;
    current.exitSignal = null;
    current.spawnError =
      `Python venv not found at python-service/.venv — run ` +
      "`pnpm run setup:python` once, then try again.";
    return snapshot();
  }

  const port = String(current.port ?? resolvePort());
  const args = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "python-service",
    "--port",
    port,
  ];
  // No `--reload` on purpose: the app owns this process and restarts it
  // itself (Retry now). The reloader watches the repo root — which `next dev`
  // (.next/) and embedding syncs (store/chroma/) write to constantly — so the
  // worker gets restarted mid-boot and /health never settles. The manual
  // `scripts/start.mjs` flow still uses --reload in dev.

  current.state = "starting";
  current.exitCode = null;
  current.exitSignal = null;
  current.spawnError = null;
  current.stdout.clear();
  current.stderr.clear();
  current.startedAt = Date.now();

  const child = spawn(venvPython, args, {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  current.child = child;

  child.stdout?.on("data", (chunk: Buffer) =>
    current.stdout.push(chunk.toString()),
  );
  child.stderr?.on("data", (chunk: Buffer) =>
    current.stderr.push(chunk.toString()),
  );

  child.on("error", (err) => {
    current.spawnError = `Failed to start the Python service: ${err.message}`;
    current.state = "failed";
    current.port = null;
    current.child = null;
  });

  child.on("exit", (code, signal) => {
    current.exitCode = code;
    current.exitSignal = signal ?? null;
    current.child = null;
    current.port = null;
    // A deliberate stop (restart) is tracked by restartPythonService and
    // re-spawns immediately; anything else is a real failure.
    if (current.state === "starting" || current.state === "running") {
      current.state = "failed";
    }
  });

  current.state = "running";
  return snapshot();
}

/**
 * Ensures the Python service is running: if it's already healthy (e.g. the
 * user started it manually, or an orphan from a dev-server reload), no new
 * process is spawned. Idempotent — concurrent calls share one spawn.
 */
export async function startPythonService(): Promise<PythonStartupStatus> {
  const current = svc();
  if (alive(current.child)) return snapshot();
  if (startPromise) return startPromise;

  startPromise = (async () => {
    // Already answering? Nothing to do — this also prevents double-spawns
    // when route modules re-instantiate under dev HMR but uvicorn survived.
    if (await probeHealth()) {
      current.state = "running";
      current.port = null;
      return snapshot();
    }
    if (current.state !== "starting") {
      current.state = "idle";
    }
    // The configured port may be squatted by a dead/foreign listener that
    // never answers — shift to a free port so the service always binds.
    current.port = await findFreePort(Number(resolvePort()));
    return spawnService();
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

/**
 * Clean restart for the "Retry now" button: kill any child, then fall back to
 * the same start logic (health pre-check first, so an already-running manual
 * instance is reused instead of causing a port conflict).
 */
export async function restartPythonService(): Promise<PythonStartupStatus> {
  if (startPromise) await startPromise;
  const current = svc();

  if (alive(current.child)) {
    await new Promise<void>((resolvePromise) => {
      const child = current.child!;
      const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
      child.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
    });
    current.child = null;
    current.state = "idle";
  } else {
    current.state = "idle";
  }

  return startPythonService();
}

export function getStartupStatus(): PythonStartupStatus {
  return snapshot();
}
