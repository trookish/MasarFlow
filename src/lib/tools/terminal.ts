/**
 * Client-side pure helpers for the terminal panel. Everything that decides
 * *what* runs lives in the main process (desktop/src/shared/terminal.ts);
 * this module only formats what the user sees.
 *
 * Pure TypeScript only — no React, Next, DOM, or Electron imports.
 */

export interface TerminalSessionView {
  id: string;
  label: string;
  cwd: string;
  status: "running" | "exited";
  exitCode: number | null;
}

/** Last path segment of `dir`, tolerating both separators. */
export function folderName(dir: string): string {
  const trimmed = dir.replace(/[/\\]+$/, "");
  if (trimmed.length === 0) return "/";
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function sessionLabel(shellLabel: string, cwd: string): string {
  if (!cwd) return `${shellLabel} — unknown folder`;
  return `${shellLabel} — ${folderName(cwd)}`;
}

/** One line for the terminal's scrollback when the shell ends. */
export function exitNote(exitCode: number | null): string {
  return exitCode === null
    ? "Process exited."
    : `Process exited with code ${exitCode}.`;
}

/**
 * The warning shown ABOVE the terminal, before the first keystroke. Plain
 * language, no jargon: this is the user's rule for destructive affordances.
 */
export function terminalWarning(cwd: string): string {
  return `Commands run on this computer, inside ${cwd}. What you type here runs for real and cannot be undone from MasarFlow.`;
}

/** Is the given folder one the desktop app has on its allow-list? */
export function rootStateText(allowed: boolean, desktop: boolean): string {
  if (!desktop) return "Only the desktop app can run commands.";
  return allowed
    ? "This folder is allowed for the agent and the terminal."
    : "This folder is not registered. Link it in Chat → Linked folders to allow commands.";
}
