/**
 * Formatting helpers for the System info panel. Pure: the panel only renders
 * what Electron and IndexedDB report through the bridge.
 *
 * Pure TypeScript only — no React, Next, DOM, or Electron imports.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${units[unit]}`;
}

export type StorageHealth = "healthy" | "nearly full" | "full" | "unknown";

/** Share of the origin quota in use. */
export function storageSummary(usage: number, quota: number): StorageHealth {
  if (!Number.isFinite(quota) || quota <= 0) return "unknown";
  const ratio = usage / quota;
  if (ratio >= 1) return "full";
  if (ratio >= 0.8) return "nearly full";
  return "healthy";
}

/** One line per registered folder, in plain language. */
export function describeRoot(path: string, allowed: boolean): string {
  const name = path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || path;
  return allowed
    ? `${name} — allowed: the agent and the terminal may read and run here.`
    : `${name} — not allowed: link it again in Chat → Linked folders.`;
}
