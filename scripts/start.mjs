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
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pyDir = path.join(root, "python-service");
const require = createRequire(path.join(root, "package.json"));

const PYTHON_PORT = process.env.PYTHON_PORT ?? "8000";
const venvBin = process.platform === "win32" ? "Scripts" : "bin";
const venvPythonExe = process.platform === "win32" ? "python.exe" : "python";
const venvPython = path.join(pyDir, ".venv", venvBin, venvPythonExe);

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

  const nextChild = startProcess(
    "next",
    process.execPath,
    [nextCli, ...nextArgs],
    { cwd: root },
  );

  const pyArgs = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "python-service",
    "--port",
    PYTHON_PORT,
  ];
  if (isDev) {
    pyArgs.push("--reload");
  }

  const pyChild = startProcess(
    "py",
    venvPython,
    pyArgs,
    { cwd: root },
  );

  const cleanup = (signal) => {
    for (const c of [nextChild, pyChild]) {
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
  });
  const { who, code } = await exited;
  console.error(`[start] ${who} exited (code ${code}) — shutting down.`);
  cleanup("SIGKILL");
}

main().catch((err) => {
  console.error(`[start] ${err.message}`);
  process.exit(1);
});
