import { RingBuffer } from "@shared/ring-buffer";
import { isRotatable, isPrunable, isRotatedFileName } from "@shared/log-rotation";
import { existsSync, renameSync, rmSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** Last 400 log lines of the main process, for the Control Center and Copy diagnostics. */
export const LOG_BUFFER = new RingBuffer(400);

/** Prefix console output with a scope and keep the tail in memory + in the log file. */
export function installLogBuffer(): void {
  const wrap = (level: "log" | "warn" | "error"): void => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      LOG_BUFFER.push(`${new Date().toISOString()} ${level.toUpperCase()} ${args.map(String).join(" ")}`);
      original(...args);
    };
  };
  (["log", "warn", "error"] as const).forEach(wrap);
}

export function logLine(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

export function logTail(n: number): string[] {
  return LOG_BUFFER.tail(n);
}

/* ---------------------------------------------------------------------------
 * Server-log rotation + deletion — P8's R-P8-5 hands this to P10: nothing
 * truncated logs/server.log before, so a long-running install grows it forever.
 * The app-server child appends to it; the main process rotates it before the
 * child starts, so no file is written by two processes at once.
 * ------------------------------------------------------------------------- */

export function logDir(): string {
  return join(app.getPath("userData"), "logs");
}

/** Rename a log file over the limit to <name>.1 (replacing any previous .1). */
export function rotateLogFile(file: string): boolean {
  if (!existsSync(file)) return false;
  if (!isRotatable(statSync(file).size)) return false;
  rmSync(`${file}.1`, { force: true });
  renameSync(file, `${file}.1`);
  return true;
}

/** Rotate every server log we own; called once at startup, before the child spawns. */
export function rotateServerLogs(): void {
  for (const name of ["server.log", "desktop.log"]) rotateLogFile(join(logDir(), name));
}

/** Delete rotated files (.1/.2…) older than KEEP_ROTATED_DAYS. Returns the count removed. */
export function pruneRotatedLogs(now = Date.now()): number {
  if (!existsSync(logDir())) return 0;
  let removed = 0;
  for (const entry of readdirSync(logDir())) {
    if (!isRotatedFileName(entry)) continue;
    const path = join(logDir(), entry);
    if (isPrunable(now - statSync(path).mtimeMs)) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}
