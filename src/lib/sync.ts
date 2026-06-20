import type { Note, Doc, SyncFile, EntityKind } from "@/lib/db/schema";
import { slugify } from "@/lib/utils/ids";

export type SyncStatus = SyncFile["status"];

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: "Synced",
  local_modified: "Modified",
  remote_modified: "Remote",
  conflict: "Conflict",
  new: "New",
};

/**
 * Deterministic FNV-1a 32-bit hash as 8-char hex. Pure — same input always
 * yields the same digest, so a file's status only changes when its content
 * actually changes.
 */
export function hashContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Vault-relative path for an entity's markdown file. */
export function noteFilePath(note: Note): string {
  return `notes/${slugify(note.title || "untitled")}.md`;
}
export function docFilePath(doc: Doc): string {
  const cat = slugify(doc.category || "general");
  const slug = doc.slug || slugify(doc.title || "untitled");
  return `docs/${cat}/${slug}.md`;
}

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function serializeNote(note: Note): string {
  return (
    frontmatter({
      title: note.title,
      type: note.type,
      tags: note.tags.join(", "),
    }) +
    "\n" +
    note.body
  );
}
export function serializeDoc(doc: Doc): string {
  return (
    frontmatter({ title: doc.title, category: doc.category }) + "\n" + doc.body
  );
}

/** One desired file in the vault, derived from a live entity. */
export interface DesiredFile {
  path: string;
  hash: string;
  entityType: EntityKind;
  entityId: string;
}

export function buildDesiredFiles(notes: Note[], docs: Doc[]): DesiredFile[] {
  const files: DesiredFile[] = [
    ...notes.map((n) => ({
      path: noteFilePath(n),
      hash: hashContent(serializeNote(n)),
      entityType: "note" as EntityKind,
      entityId: n.id,
    })),
    ...docs.map((d) => ({
      path: docFilePath(d),
      hash: hashContent(serializeDoc(d)),
      entityType: "doc" as EntityKind,
      entityId: d.id,
    })),
  ];
  // Stable ordering so the scan output is deterministic.
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** A reconciled file state (no db id — the repo assigns/preserves that). */
export interface SyncFileState {
  path: string;
  hash: string;
  status: SyncStatus;
  entityType: EntityKind;
  entityId: string;
  lastSyncedAt: number | null;
}

/**
 * Compare the desired vault (from current entities) against what was last
 * persisted and classify each file. Pure and total; orphaned records (entity
 * deleted) are dropped by virtue of iterating `desired` only.
 */
export function reconcile(
  desired: DesiredFile[],
  existing: SyncFile[],
): SyncFileState[] {
  const byEntity = new Map(existing.map((e) => [e.entityId, e]));
  return desired.map((d) => {
    const ex = byEntity.get(d.entityId);
    let status: SyncStatus;
    let lastSyncedAt: number | null = null;
    if (!ex) {
      status = "new";
    } else if (ex.hash !== d.hash) {
      status = "local_modified";
      lastSyncedAt = ex.lastSyncedAt;
    } else if (ex.lastSyncedAt == null) {
      status = "new";
    } else {
      status = "synced";
      lastSyncedAt = ex.lastSyncedAt;
    }
    return { ...d, status, lastSyncedAt };
  });
}

export function summarize(states: { status: SyncStatus }[]): Record<SyncStatus, number> {
  const counts: Record<SyncStatus, number> = {
    synced: 0,
    local_modified: 0,
    remote_modified: 0,
    conflict: 0,
    new: 0,
  };
  for (const s of states) counts[s.status] += 1;
  return counts;
}
