import { app } from "electron";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  SessionExitPayload,
  SetupState,
  SetupStep,
  SetupStepKey,
  StartSessionRequest,
} from "@shared/types";
import { ptyManager } from "./pty";
import { settings } from "./settings";

const MIN_NODE = 20;
const MIN_PYTHON = 3.11;

interface PythonInfo {
  file: string;
  args: string[];
}

interface CheckResults {
  steps: SetupStep[];
  python: PythonInfo | null;
}

function tryCommand(file: string, args: string[]): { code: number; out: string } {
  try {
    const res = spawnSync(file, args, {
      encoding: "utf8",
      timeout: 15_000,
      // .cmd/.bat shims cannot be spawned directly by CreateProcess — go through cmd.
      shell: file.endsWith(".cmd") || file.endsWith(".bat"),
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
    label: "Node.js 20+",
    description: "Runtime for the Next.js app, launcher scripts, and tooling.",
    status: "missing",
  };
  if (code !== 0 || version === null) {
    step.status = "fail";
    step.detail = "Node.js not found. Install Node.js 20+ from https://nodejs.org and restart the launcher.";
  } else if (version >= MIN_NODE) {
    step.status = "pass";
    step.detail = `Found v${out}`;
  } else {
    step.status = "fail";
    step.detail = `Found v${out} — MasarFlow needs Node.js 20+.`;
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
  const candidates: Array<[string, string[]]> = [
    ["python", ["--version"]],
    ["py", ["-3", "--version"]],
  ];
  const step: SetupStep = {
    key: "python",
    label: "Python 3.11+",
    description: "Powers the local AI sidecar (embeddings, semantic search, RAG).",
    status: "missing",
  };
  for (const [file, args] of candidates) {
    const { code, out } = tryCommand(file, args);
    const m = /Python (\d+)\.(\d+)/.exec(out);
    if (code === 0 && m) {
      const major = parseInt(m[1], 10);
      const minor = parseInt(m[2], 10);
      if (major * 100 + minor >= MIN_PYTHON * 100) {
        step.status = "pass";
        step.detail = `Found ${out}`;
        return { step, python: { file, args: ["-m"] } };
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
  const venvPython = join(
    targetDir,
    "python-service",
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  if (existsSync(venvPython)) {
    step.status = "pass";
    step.detail = ".venv present.";
  } else {
    step.detail = "Create the venv and install requirements (pip install -r requirements/base.txt).";
  }
  return step;
}

function checkAll(targetDir: string): CheckResults {
  const node = checkNode();
  const npm = checkNpm();
  const { step: python, python: pyInfo } = checkPython();
  const deps = checkDeps(targetDir);
  const envfile = checkEnvFile(targetDir);
  const venv = checkVenv(targetDir);
  return { steps: [node, npm, python, deps, envfile, venv], python: pyInfo };
}

function buildState(targetDir: string, steps: SetupStep[]): SetupState {
  return { targetDir, initialized: steps.every((s) => s.status === "pass"), steps };
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
  check(targetDir: string): SetupState {
    const res = checkAll(targetDir);
    const state = buildState(targetDir, res.steps);
    if (!state.initialized && this.persistedFor(targetDir)) state.initialized = true;
    this.state = state;
    this.emit(state);
    return this.getState();
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
    let res = checkAll(targetDir);
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

      res = checkAll(targetDir);
      state = buildState(targetDir, res.steps);
      if (!state.initialized && this.persistedFor(targetDir)) state.initialized = true;
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
    const venvOk = await this.runInstallSession(targetDir, {
      label: "Create Python venv",
      kind: "setup",
      command: "python -m venv .venv",
      file: python.file,
      args: [...python.args, "venv", ".venv"],
      cwd: pyDir,
    });
    if (!venvOk || !existsSync(venvPython)) return false;
    return this.runInstallSession(targetDir, {
      label: "Install Python requirements",
      kind: "setup",
      command: "pip install -r requirements/base.txt",
      file: venvPython,
      args: ["-m", "pip", "install", "-r", "requirements/base.txt"],
      cwd: pyDir,
    });
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
      const info = ptyManager.start({ ...req, cwd: req.cwd || targetDir });
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
