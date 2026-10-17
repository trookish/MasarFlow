/**
 * Log reading for the Logs panel. Read-only, bounded, and never leaves the
 * app's own log directory: names are validated as single path segments and
 * the directory is never taken from the renderer.
 *
 * Pure node — no Electron import — so node-env tests can use a temp dir.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface LogFile {
  name: string;
  bytes: number;
  modifiedAt: number;
}

/** Hard caps: the panel shows a tail, not a whole log. */
export const MAX_LINES = 1000;
export const MAX_BYTES = 512 * 1024;

/** A single path segment ending in .log — no traversal, no dotfiles. */
export function safeLogName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  if (name.length === 0 || name.length > 128) return null;
  if (name.startsWith(".")) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!name.endsWith(".log")) return null;
  return name;
}

/** The last `max` lines of a text blob (max clamped to MAX_LINES). */
export function tailLines(text: string, max = 200): string[] {
  const limit = Math.max(1, Math.min(MAX_LINES, Math.floor(max)));
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-limit);
}

/** Every *.log directly inside `dir`, newest first. Empty when unreadable. */
export function listLogs(dir: string): LogFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files: LogFile[] = [];
  for (const name of names) {
    const safe = safeLogName(name);
    if (!safe) continue;
    try {
      const stat = statSync(join(dir, safe));
      if (!stat.isFile()) continue;
      files.push({ name: safe, bytes: stat.size, modifiedAt: stat.mtimeMs });
    } catch {
      // unreadable entry — skip it rather than failing the whole list
    }
  }
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** The tail of one log file. [] when the name or the file is not usable. */
export function readLogTail(dir: string, name: unknown, max = 200): string[] {
  const safe = safeLogName(name);
  if (!safe) return [];
  try {
    const path = join(dir, safe);
    const stat = statSync(path);
    const slice = Math.min(stat.size, MAX_BYTES);
    const buffer = readFileSync(path);
    const text = buffer.subarray(Math.max(0, buffer.length - slice)).toString("utf8");
    return tailLines(text, max);
  } catch {
    return [];
  }
}
