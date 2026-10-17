/**
 * The terminal contract between the renderer and the main process: which shell
 * to spawn, and — the security boundary — whether a requested working
 * directory may be spawned in at all.
 *
 * The renderer is NEVER trusted with a path decision (master D3): it may only
 * propose a `cwd`; the main process validates it against the registered roots
 * (roots.json, written only by a folder the user picked in the native dialog).
 *
 * Pure TypeScript only — no Electron, node:fs, or DOM imports, so node-env
 * tests cover every branch.
 */

import { isAbsolute, resolve } from "node:path";
import { isRootAllowed } from "./roots";

export interface ShellSpec {
  file: string;
  args: string[];
  /** Human label used in the session list: "PowerShell", "zsh". */
  label: string;
}

/** Bounds for a renderer-supplied viewport (rows fall back to the pty default). */
export const MIN_COLS = 20;
export const MAX_COLS = 400;
export const MIN_ROWS = 5;
export const MAX_ROWS = 200;

/**
 * The shell to start for a platform. Windows prefers ComSpec (cmd.exe), then
 * PowerShell; POSIX uses $SHELL, then /bin/bash. A login shell on POSIX keeps
 * the user's PATH exactly as their terminal has it.
 */
export function resolveShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): ShellSpec {
  if (platform === "win32") {
    const comspec = env.ComSpec ?? env.COMSPEC;
    if (comspec && comspec.length > 0) {
      return { file: comspec, args: [], label: "Command Prompt" };
    }
    return {
      file: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      args: ["-NoLogo"],
      label: "PowerShell",
    };
  }
  const shell = env.SHELL && env.SHELL.length > 0 ? env.SHELL : "/bin/bash";
  const label = shell.split("/").pop() ?? "shell";
  return { file: shell, args: ["-l"], label };
}

export type StartVerdict =
  | { ok: true; cwd: string; cols: number; rows: number }
  | { ok: false; error: string };

/**
 * Validate a renderer-supplied start request.
 * Order matters: shape, then absolute path, then the root allow-list — the
 * allow-list check resolves ".." and symlink-free canonical forms first, so
 * "C:\\Projects\\Game\\..\\..\\Windows" is refused.
 */
export function validateTerminalStart(
  request: unknown,
  roots: string[],
  platform: NodeJS.Platform = process.platform,
): StartVerdict {
  if (typeof request !== "object" || request === null) {
    return { ok: false, error: "The terminal request was malformed." };
  }
  const { cwd, cols, rows } = request as { cwd?: unknown; cols?: unknown; rows?: unknown };
  if (typeof cwd !== "string" || cwd.length === 0) {
    return { ok: false, error: "No folder was given for the terminal session." };
  }
  if (!isAbsolute(cwd)) {
    return { ok: false, error: "The terminal needs an absolute folder path." };
  }
  if (roots.length === 0) {
    return {
      ok: false,
      error:
        "No folder is registered for this machine. Link the project folder in Chat → Linked folders first.",
    };
  }
  if (!isRootAllowed(cwd, roots, platform)) {
    return {
      ok: false,
      error: `“${cwd}” is not inside a registered folder. Link it in Chat → Linked folders, then try again.`,
    };
  }
  return {
    ok: true,
    cwd: resolve(cwd),
    cols: clampNumber(cols, MIN_COLS, MAX_COLS, 120),
    rows: clampNumber(rows, MIN_ROWS, MAX_ROWS, 30),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
