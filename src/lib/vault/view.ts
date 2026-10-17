import type { SyncFile } from "@/lib/db/schema";
import type { SyncStatus } from "@/lib/sync";
import type { VaultRunSummary } from "./engine";

/** Everything the vault UI derives from the file index (no React in here). */

export function countByStatus(rows: SyncFile[]): Record<SyncStatus, number> {
  const counts: Record<SyncStatus, number> = {
    synced: 0, local_modified: 0, remote_modified: 0, conflict: 0, new: 0, deleted: 0,
  };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

/** Rows the user must decide about, in the order they should look. */
export function vaultConflicts(rows: SyncFile[]): SyncFile[] {
  const rank: Partial<Record<SyncStatus, number>> = { conflict: 0, deleted: 1 };
  return rows
    .filter((r) => rank[r.status] !== undefined)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.path.localeCompare(b.path));
}

const RANK: Partial<Record<SyncStatus, number>> = { conflict: 0, deleted: 1, local_modified: 2, remote_modified: 3, new: 4, synced: 5 };

export function visibleRows(rows: SyncFile[], filter: SyncStatus | "all"): SyncFile[] {
  const list = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return [...list].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || a.path.localeCompare(b.path));
}

export function vaultSummaryLine(summary: VaultRunSummary): string {
  const parts: string[] = [];
  if (summary.written) parts.push(`${summary.written} written`);
  if (summary.imported) parts.push(`${summary.imported} imported`);
  if (summary.external) parts.push(`${summary.external} new file${summary.external === 1 ? "" : "s"}`);
  if (summary.conflicts) parts.push(`${summary.conflicts} conflict${summary.conflicts === 1 ? "" : "s"}`);
  if (summary.missing) parts.push(`${summary.missing} deleted on disk`);
  if (summary.skipped) parts.push(`${summary.skipped} unchanged`);
  if (summary.errors.length) parts.push(`${summary.errors.length} warning${summary.errors.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "Everything is in sync";
}
