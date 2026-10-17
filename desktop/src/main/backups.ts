import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const NAME_RE = /^masarflow-\d{8}-\d{6}\.json\.gz$/;
const DAY = 86_400_000;

export const isBackupFileName = (name: string): boolean => NAME_RE.test(name);

export function backupFileName(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `masarflow-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.json.gz`;
}

export interface BackupInfo {
  name: string;
  mtimeMs: number;
}

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const weekKey = (ms: number): string => String(Math.floor(ms / (7 * DAY)));

/** Names to delete: keep newest 5, newest per day (7 days), newest per week (4 weeks). */
export function planRetention(files: BackupInfo[], now: number): string[] {
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keep = new Set(sorted.slice(0, 5).map((f) => f.name));
  const days = new Set<string>();
  const weeks = new Set<string>();
  for (const f of sorted) {
    const age = now - f.mtimeMs;
    if (age < 7 * DAY && !days.has(dayKey(f.mtimeMs))) {
      days.add(dayKey(f.mtimeMs));
      keep.add(f.name);
    }
    if (age < 28 * DAY && !weeks.has(weekKey(f.mtimeMs))) {
      weeks.add(weekKey(f.mtimeMs));
      keep.add(f.name);
    }
  }
  return sorted.filter((f) => !keep.has(f.name)).map((f) => f.name);
}

export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isBackupFileName)
    .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function writeBackup(dir: string, json: string, now = new Date()): BackupInfo {
  mkdirSync(dir, { recursive: true });
  const name = backupFileName(now);
  writeFileSync(join(dir, name), gzipSync(Buffer.from(json, "utf8")));
  for (const old of planRetention(listBackups(dir), now.getTime())) unlinkSync(join(dir, old));
  return { name, mtimeMs: now.getTime() };
}

export function readBackup(dir: string, name: string): string {
  if (!isBackupFileName(name)) throw new Error("Invalid backup name");
  return gunzipSync(readFileSync(join(dir, name))).toString("utf8");
}
