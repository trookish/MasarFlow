/**
 * "3 minutes ago" timestamps for feeds (the Today activity list). Fixed unit
 * boundaries and no Intl: the wording is asserted in tests and must not drift
 * with the ICU version. `now` is injectable for exactly that reason.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString();
}
