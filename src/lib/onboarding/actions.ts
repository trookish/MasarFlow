/**
 * First-run wizard actions (P10.T4/T5). The pure helpers live here so the
 * wizard's decision logic is testable in the node-only vitest environment;
 * the IO entry points are thin wrappers over existing surfaces
 * (POST /api/fs/list + the P4 backup import), not new machinery.
 */

import { db } from "@/lib/db";
import { linkedProjectsRepo } from "@/lib/db/repos";
import { BackupError, importBackup, parseBackup } from "@/lib/db/backup-import";

/** Last non-empty segment of a Windows or POSIX path; "" for a drive/root itself. */
export function basenameOf(input: string): string {
  const clean = input.trim().replace(/[/\\]+$/, "");
  if (!clean) return "";
  const parts = clean.split(/[/\\]+/).filter(Boolean);
  return parts.length <= 1 ? "" : parts[parts.length - 1];
}

export type LinkResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * Link a folder the user just picked. The folder is already in the main
 * process root allow-list (the native picker writes roots.json, P2.T4), so the
 * validation call goes through the P2 guard. In a browser this is expected to
 * fail with the "not been linked" message — that is the guard working.
 */
export async function linkFolder({ projectId, path }: { projectId: string; path: string }): Promise<LinkResult> {
  const name = basenameOf(path) || path;
  const res = await fetch("/api/fs/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ root: path, depth: 0, maxEntries: 1 }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) return { ok: false, error: json.error ?? "That folder could not be opened." };
  await linkedProjectsRepo.create({ projectId, name, rootPath: path });
  return { ok: true, name };
}

/** Read + validate a v0.1.x / v0.2 export without touching the database (preview before import). */
export function readMigrationFile(text: string): { ok: true; summary: string; rows: number } | { ok: false; error: string } {
  try {
    const file = parseBackup(text, db);
    const rows = Object.values(file.tables).reduce((n, t) => n + t.length, 0);
    return { ok: true, summary: `${rows} records, exported ${new Date(file.exportedAt).toLocaleString()}`, rows };
  } catch (e) {
    return { ok: false, error: e instanceof BackupError ? e.message : "That file is not a MasarFlow backup." };
  }
}

/** Apply a validated export in place (replace semantics, same as Settings → Data). */
export async function applyMigration(text: string): Promise<number> {
  const summary = await importBackup(db, parseBackup(text, db), "replace");
  return Object.values(summary.tables).reduce((a, b) => a + b, 0);
}
