import { app } from "electron";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ProjectUpdateResult,
  SessionExitPayload,
  SessionInfo,
  SetupState,
  SetupStep,
  SetupStepKey,
  StartSessionRequest,
} from "@shared/types";
import { ptyManager } from "./pty";
import { settings } from "./settings";
import { fetchLatestRelease, isNewerVersion } from "./updates";

// Node 22.6+ — the OpenCode workspace-tool installer uses Node's built-in
// TypeScript support (older versions still run, minus those tools).
const MIN_NODE = 22;
const MIN_PYTHON = 3.11;

/**
 * Packages the Python service imports at boot (python-service/app/main.py →
 * embeddings.py, job_queue.py). Everything else in requirements/base.txt is
 * lazily imported or marker-skipped on some Python versions (e.g.
 * tree-sitter-languages has no 3.13 wheels), so it never blocks startup.
 */
const BOOT_REQUIRED = [
  "fastapi",
  "uvicorn",
  "pydantic",
  "httpx",
  "chromadb",
  "sentence-transformers",
];

/** Verify the venv has every boot-critical package installed (fast, no heavy imports). */
function pythonDepsOk(pyDir: string, venvPython: string): boolean {
  try {
    for (const name of BOOT_REQUIRED) {
      const res = spawnSync(
        venvPython,
        ["-c", "import importlib.metadata as im, sys; im.distribution(sys.argv[1])", name],
        { cwd: pyDir, encoding: "utf8", timeout: 30_000 },
      );
      if (res.status !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface PythonInfo {
  file: string;
  /** Interpreter-selector prefix validated with `--version` (e.g. ["-3"] for the `py` launcher). */
  args: string[];
}

interface CheckResults {
  steps: SetupStep[];
  python: PythonInfo | null;
}

/**
 * Quote a single argument for the Windows cmd.exe command line. Arguments
 * that are already "safe" (no spaces or shell metacharacters) pass through
 * unquoted; everything else is wrapped in quotes with embedded `"` doubled
 * (cmd.exe's escaping rule — it has no backslash escapes).
 */
function cmdQuote(arg: string): string {
  return /^[A-Za-z0-9_./:=+@%,\-]+$/.test(arg)
    ? arg
    : `"${arg.replace(/"/g, '""')}"`;
}

function tryCommand(file: string, args: string[]): { code: number; out: string } {
  try {
    // .cmd/.bat shims cannot be spawned directly by CreateProcess — go through
    // cmd. Passing args with shell:true is deprecated (DEP0190) and unsafe
    // (arguments get concatenated unescaped), so build a single, properly
    // quoted command line instead.
    const useShell = file.endsWith(".cmd") || file.endsWith(".bat");
    const res = useShell
      ? spawnSync(`${file} ${args.map(cmdQuote).join(" ")}`, {
          encoding: "utf8",
          timeout: 15_000,
          shell: true,
        })
      : spawnSync(file, args, {
          encoding: "utf8",
          timeout: 15_000,
        });
    return { code: res.status ?? -1, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
  } catch {
    return { code: -1, out: "" };
  }
}

function checkNode(): SetupStep {
  const { code, out } = tryCommand("node", ["--version"]);
  const m = /v?(\d+)\./.exec(out);
  const version = m?.[1] ? parseInt(m[1], 10) : null;
  const step: SetupStep = {
    key: "node",
    label: "Node.js 22+",
    description: "Runtime for the Next.js app, launcher scripts, and tooling.",
    status: "missing",
  };
  if (code !== 0 || version === null) {
    step.status = "fail";
    step.detail = "Node.js not found. Install Node.js 22+ from https://nodejs.org and restart the launcher.";
  } else if (version >= MIN_NODE) {
    step.status = "pass";
    step.detail = `Found v${out}`;
  } else {
    step.status = "fail";
    step.detail = `Found v${out} — MasarFlow needs Node.js 22+.`;
  }
  return step;
}

function checkNpm(): SetupStep {
  // On Windows `npm` is npm.cmd — spawnSync needs the real file or shell:true.
  const candidates = process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  let code = -1;
  let out = "";
  for (const file of candidates) {
    const res = tryCommand(file, ["--version"]);
    if (res.code === 0) {
      code = res.code;
      out = res.out;
      break;
    }
    code = res.code;
  }
  const step: SetupStep = {
    key: "npm",
    label: "npm",
    description: "Package manager for installing MasarFlow dependencies.",
    status: "missing",
  };
  if (code !== 0) {
    step.status = "fail";
    step.detail = "npm not found. It ships with Node.js — reinstall Node.js 20+.";
  } else {
    step.status = "pass";
    step.detail = `Found v${out}`;
  }
  return step;
}

function checkPython(): { step: SetupStep; python: PythonInfo | null } {
  // [file, interpreter-selector args] — the same prefix is re-used later when
  // creating the venv, so the interpreter that was validated is the one that
  // builds the venv (e.g. `py -3` must stay `py -3 -m venv`, not `py -m venv`).
  const candidates: Array<[string, string[]]> = [
    ["python", []],
    ["py", ["-3"]],
  ];
  const step: SetupStep = {
    key: "python",
    label: "Python 3.11+",
    description: "Powers the local AI sidecar (embeddings, semantic search, RAG).",
    status: "missing",
  };
  for (const [file, versionArgs] of candidates) {
    const { code, out } = tryCommand(file, [...versionArgs, "--version"]);
    const m = /Python (\d+)\.(\d+)/.exec(out);
    if (code === 0 && m) {
      const major = parseInt(m[1], 10);
      const minor = parseInt(m[2], 10);
      if (major * 100 + minor >= MIN_PYTHON * 100) {
        step.status = "pass";
        step.detail = `Found ${out}`;
        return { step, python: { file, args: versionArgs } };
      }
      step.status = "fail";
      step.detail = `Found ${out} — MasarFlow needs Python 3.11+.`;
      return { step, python: null };
    }
  }
  step.status = "fail";
  step.detail = "Python not found. Install Python 3.11+ from https://python.org (check \"Add to PATH\") and restart the launcher.";
  return { step, python: null };
}

function checkProject(targetDir: string): SetupStep {
  const step: SetupStep = {
    key: "project",
    label: "MasarFlow project",
    description: "The MasarFlow project files (cloned from GitHub).",
    status: "missing",
  };
  const pkg = join(targetDir, "package.json");
  if (!existsSync(pkg)) {
    step.status = "fail";
    step.detail =
      "This folder is not a MasarFlow project. Clone the official repo from GitHub on this page, or browse to a folder that already contains it.";
    return step;
  }
  try {
    const name = (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name;
    if (name === "masarflow") {
      step.status = "pass";
      step.detail = "MasarFlow project found.";
    } else {
      step.status = "fail";
      step.detail = `"${name ?? "unknown"}" is not the MasarFlow project — MasarFlow requires the official project from GitHub.`;
    }
  } catch {
    step.status = "fail";
    step.detail = "Invalid package.json — this doesn't look like the MasarFlow project.";
  }
  return step;
}

/**
 * Compares the installed project version (package.json) against the latest
 * GitHub release. Never blocks initialization — an available update is
 * surfaced to the user, but the project stays runnable in the meantime
 * (and an offline check just passes with a note).
 */
async function checkVersion(targetDir: string): Promise<SetupStep> {
  const step: SetupStep = {
    key: "version",
    label: "MasarFlow version",
    description: "Installed version vs. the latest GitHub release.",
    status: "missing",
  };
  const pkg = join(targetDir, "package.json");
  if (!existsSync(pkg)) {
    step.detail = "Install the MasarFlow project first.";
    return step;
  }
  let installed = "";
  try {
    installed = String((JSON.parse(readFileSync(pkg, "utf8")) as { version?: unknown }).version ?? "");
  } catch {
    installed = "";
  }
  if (!installed) {
    step.status = "pass";
    step.detail = "Version unknown — the project's package.json has no version field.";
    return step;
  }
  let latest: Awaited<ReturnType<typeof fetchLatestRelease>>;
  try {
    latest = await fetchLatestRelease();
  } catch {
    step.status = "pass";
    step.detail = `v${installed} installed — couldn't reach GitHub, so no update check.`;
    return step;
  }
  if (isNewerVersion(latest.version, installed)) {
    step.status = "missing";
    step.detail = `v${installed} installed, v${latest.version} available — use "Update project" below.`;
  } else {
    step.status = "pass";
    step.detail = `v${installed} installed — up to date.`;
  }
  return step;
}

function checkDeps(targetDir: string): SetupStep {
  const step: SetupStep = {
    key: "deps",
    label: "Dependencies",
    description: "MasarFlow's node_modules (next, react, …).",
    status: "missing",
  };
  if (existsSync(join(targetDir, "node_modules", "next", "package.json"))) {
    step.status = "pass";
    step.detail = "node_modules present.";
  } else {
    step.status = existsSync(join(targetDir, "node_modules")) ? "fail" : "missing";
    step.detail = "Run npm install to install dependencies.";
  }
  return step;
}

function checkEnvFile(targetDir: string): SetupStep {
  const step: SetupStep = {
    key: "envfile",
    label: ".env.local",
    description: "Environment configuration for the services.",
    status: "missing",
  };
  if (existsSync(join(targetDir, ".env.local"))) {
    step.status = "pass";
    step.detail = ".env.local present.";
  } else {
    step.detail = existsSync(join(targetDir, ".env.local.example"))
      ? "Copied from .env.local.example on initialization."
      : ".env.local.example missing — create .env.local manually.";
  }
  return step;
}

function checkVenv(targetDir: string): SetupStep {
  const step: SetupStep = {
    key: "venv",
    label: "Python environment",
    description: "python-service/.venv with the AI requirements installed.",
    status: "missing",
  };
  const pyDir = join(targetDir, "python-service");
  const venvPython = join(
    pyDir,
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  if (existsSync(venvPython)) {
    if (pythonDepsOk(pyDir, venvPython)) {
      step.status = "pass";
      step.detail = ".venv present, requirements verified.";
    } else {
      step.status = "missing";
      step.detail = ".venv present but requirements are missing — initialization will reinstall them.";
    }
  } else {
    step.detail = "Create the venv and install requirements (pip install -r requirements/base.txt).";
  }
  return step;
}

async function checkAll(targetDir: string): Promise<CheckResults> {
  const project = checkProject(targetDir);
  const version = await checkVersion(targetDir);
  const node = checkNode();
  const npm = checkNpm();
  const { step: python, python: pyInfo } = checkPython();
  const deps = checkDeps(targetDir);
  const envfile = checkEnvFile(targetDir);
  const venv = checkVenv(targetDir);
  return { steps: [project, version, node, npm, python, deps, envfile, venv], python: pyInfo };
}

function buildState(targetDir: string, steps: SetupStep[]): SetupState {
  // The version step is informational: an available update must not make the
  // project look "not initialized" — running stays possible either way.
  const gate = steps.filter((s) => s.key !== "version");
  return { targetDir, initialized: gate.every((s) => s.status === "pass"), steps };
}

/**
 * A previously-initialized project stays "initialized" on fast checks — but
 * only while the steps initialization actually installs (deps, venv) are
 * genuinely satisfied. A stale override would mask a broken venv (e.g. one
 * missing uvicorn) and show "all requirements satisfied" when it isn't.
 */
function applyPersistedInitialized(state: SetupState, targetDir: string, persistedFor: (d: string) => boolean): SetupState {
  if (state.initialized || !persistedFor(targetDir)) return state;
  if (state.steps.some((s) => s.status === "fail")) return state;
  const installable = ["deps", "venv"];
  const allOk = installable.every((key) => state.steps.some((s) => s.key === key && s.status === "pass"));
  return allOk ? { ...state, initialized: true } : state;
}

class SetupEngine {
  private state: SetupState = { targetDir: "", initialized: false, steps: [] };
  private stateFile = "";
  private busy = false;

  constructor(private emit: (state: SetupState) => void) {}

  init(targetDir: string): void {
    this.stateFile = join(app.getPath("userData"), "launcher-init.json");
    this.state.targetDir = targetDir;
  }

  private persistedFor(targetDir: string): boolean {
    try {
      if (!existsSync(this.stateFile)) return false;
      const raw = JSON.parse(readFileSync(this.stateFile, "utf8")) as {
        targetDir: string;
        initializedAt: number;
      };
      return raw.targetDir === targetDir;
    } catch {
      return false;
    }
  }

  private persist(targetDir: string): void {
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true });
      writeFileSync(this.stateFile, JSON.stringify({ targetDir, initializedAt: Date.now() }, null, 2), "utf8");
    } catch {
      // best effort
    }
  }

  getState(): SetupState {
    return { ...this.state, steps: this.state.steps.map((s) => ({ ...s })) };
  }

  /** Fast checks; no installs. */
  async check(targetDir: string): Promise<SetupState> {
    const res = await checkAll(targetDir);
    const state = applyPersistedInitialized(
      buildState(targetDir, res.steps),
      targetDir,
      (d) => this.persistedFor(d),
    );
    this.state = state;
    this.emit(state);
    return this.getState();
  }

  /**
   * Pull the latest MasarFlow code from GitHub (git pull --ff-only), then
   * re-install dependencies so the update's package.json is honored.
   */
  async update(targetDir: string): Promise<ProjectUpdateResult> {
    if (this.busy) return { ok: false, error: "Another setup operation is already running." };
    this.busy = true;
    try {
      if (!existsSync(join(targetDir, ".git"))) {
        return {
          ok: false,
          error:
            "This copy isn't a git clone (no .git folder) — to update, browse to a git clone or re-clone the project from GitHub.",
        };
      }
      const gitCheck = spawnSync("git", ["--version"], { encoding: "utf8", timeout: 10_000 });
      if (gitCheck.status !== 0) {
        return {
          ok: false,
          error: "git is not installed. Install git from https://git-scm.com and try again.",
        };
      }

      const pullOk = await this.runInstallSession(targetDir, {
        label: "Update MasarFlow project",
        kind: "setup",
        command: "git pull --ff-only",
        file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        args: process.platform === "win32" ? ["/c", "git", "pull", "--ff-only"] : ["-lc", "git pull --ff-only"],
        cwd: targetDir,
      });
      if (!pullOk) {
        return { ok: false, error: "git pull failed — see the terminal output above." };
      }

      const depsOk = await this.runInstallSession(targetDir, {
        label: "Install updated dependencies",
        kind: "setup",
        command: "npm install",
        file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        args: process.platform === "win32" ? ["/c", "npm install"] : ["-lc", "npm install"],
        cwd: targetDir,
      });
      if (!depsOk) {
        return { ok: false, error: "npm install after the update failed — see the terminal output above." };
      }

      const res = await checkAll(targetDir);
      this.state = applyPersistedInitialized(
        buildState(targetDir, res.steps),
        targetDir,
        (d) => this.persistedFor(d),
      );
      if (this.state.initialized) this.persist(targetDir);
      this.emit(this.state);
      return { ok: true };
    } finally {
      this.busy = false;
    }
  }

  /** Run the full initialization: checks + installs for every missing step. */
  async run(targetDir: string): Promise<SetupState> {
    if (this.busy) return this.getState();
    this.busy = true;
    try {
      const state = await this.ensure(targetDir);
      this.state = state;
      if (state.initialized) this.persist(targetDir);
      return this.getState();
    } finally {
      this.busy = false;
    }
  }

  private async ensure(targetDir: string): Promise<SetupState> {
    let res = await checkAll(targetDir);
    let state = buildState(targetDir, res.steps);
    this.emit(state);

    if (state.steps.some((s) => s.status === "fail")) {
      return state; // hard requirement missing — stop, tell the user
    }

    const order: SetupStepKey[] = ["deps", "envfile", "venv"];
    for (const key of order) {
      const step = state.steps.find((s) => s.key === key);
      if (!step || step.status === "pass") continue;

      step.status = "running";
      step.detail = "Installing…";
      this.emit(state);

      let ok = false;
      if (key === "envfile") {
        ok = this.createEnvFile(targetDir);
      } else if (key === "deps") {
        ok = await this.runInstallSession(targetDir, {
          label: "npm install",
          kind: "setup",
          command: "npm install",
          file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
          args: process.platform === "win32" ? ["/c", "npm install"] : ["-lc", "npm install"],
          cwd: targetDir,
        });
      } else if (key === "venv" && res.python) {
        ok = await this.ensureVenv(targetDir, res.python);
      }

      res = await checkAll(targetDir);
      state = applyPersistedInitialized(
        buildState(targetDir, res.steps),
        targetDir,
        (d) => this.persistedFor(d),
      );
      const next = state.steps.find((s) => s.key === key);
      if (next && !ok) {
        next.status = "fail";
        next.detail = "Installation failed — see the terminal output above.";
      }
      this.emit(state);
    }
    return state;
  }

  private async ensureVenv(targetDir: string, python: PythonInfo): Promise<boolean> {
    const pyDir = join(targetDir, "python-service");
    const venvBin = process.platform === "win32" ? "Scripts" : "bin";
    const venvPython = join(pyDir, ".venv", venvBin, process.platform === "win32" ? "python.exe" : "python");
    if (!existsSync(venvPython)) {
      const venvOk = await this.runInstallSession(targetDir, {
        label: "Create Python venv",
        kind: "setup",
        command: `${python.file} ${python.args.join(" ")} -m venv .venv`.trim(),
        file: python.file,
        args: [...python.args, "-m", "venv", ".venv"],
        cwd: pyDir,
      });
      if (!venvOk || !existsSync(venvPython)) return false;
    }
    // Always (re)install the requirements: pip is a no-op when they are
    // already satisfied, and this repairs venvs that exist but are missing
    // packages (e.g. a stale venv without uvicorn). Upgrading pip first
    // avoids broken installs from outdated pip inside the fresh venv.
    const installOk = await this.runInstallSession(targetDir, {
      label: "Verify Python requirements",
      kind: "setup",
      command: "pip install --upgrade pip -r requirements/base.txt",
      file: venvPython,
      args: ["-m", "pip", "install", "--upgrade", "pip", "-r", "requirements/base.txt"],
      cwd: pyDir,
    });
    if (!installOk) return false;
    if (!pythonDepsOk(pyDir, venvPython)) {
      return false;
    }
    return true;
  }

  private createEnvFile(targetDir: string): boolean {
    try {
      const example = join(targetDir, ".env.local.example");
      if (!existsSync(example)) return false;
      copyFileSync(example, join(targetDir, ".env.local"));
      return true;
    } catch {
      return false;
    }
  }

  private runInstallSession(targetDir: string, req: StartSessionRequest): Promise<boolean> {
    return new Promise((resolvePromise) => {
      let info: SessionInfo;
      try {
        info = ptyManager.start({ ...req, cwd: req.cwd || targetDir });
      } catch {
        // A crash at spawn (e.g. node-pty failure) must fail the step now,
        // not leave the setup stuck on a 30-minute timeout.
        resolvePromise(false);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        resolvePromise(false);
      }, 30 * 60_000);

      const onExit = (p: SessionExitPayload): void => {
        if (p.id !== info.id) return;
        cleanup();
        resolvePromise(p.exitCode === 0);
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        ptyManager.removeListener("exit", onExit);
      };

      ptyManager.on("exit", onExit);
    });
  }
}

export function createSetupEngine(emit: (state: SetupState) => void): SetupEngine {
  return new SetupEngine(emit);
}

export function currentTargetDir(): string {
  return settings.get().targetDir;
}
