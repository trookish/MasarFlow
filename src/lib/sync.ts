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

// ── Obsidian file type support ───────────────────────────────────────────────

/** All file extensions Obsidian natively supports (without the leading dot). */
export const OBSIDIAN_MD_EXTENSIONS = new Set(["md"]);

export const OBSIDIAN_CANVAS_EXTENSIONS = new Set(["canvas"]);

export const OBSIDIAN_IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp",
]);

export const OBSIDIAN_AUDIO_EXTENSIONS = new Set([
  "3gp", "flac", "m4a", "mp3", "ogg", "wav", "webm",
]);

export const OBSIDIAN_VIDEO_EXTENSIONS = new Set([
  "mkv", "mov", "mp4", "ogv", "webm",
]);

export const OBSIDIAN_PDF_EXTENSIONS = new Set(["pdf"]);

/** Every extension Obsidian can natively open / embed. */
export const OBSIDIAN_EXTENSIONS = new Set([
  ...OBSIDIAN_MD_EXTENSIONS,
  ...OBSIDIAN_CANVAS_EXTENSIONS,
  ...OBSIDIAN_IMAGE_EXTENSIONS,
  ...OBSIDIAN_AUDIO_EXTENSIONS,
  ...OBSIDIAN_VIDEO_EXTENSIONS,
  ...OBSIDIAN_PDF_EXTENSIONS,
]);

/** Extract the lowercase extension from a vault-relative path. */
export function fileExtension(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Is this a file Obsidian natively supports? */
export function isObsidianFile(path: string): boolean {
  return OBSIDIAN_EXTENSIONS.has(fileExtension(path));
}

/** Is this a binary (non-text) file that needs base64 transport? */
export function isBinaryFile(path: string): boolean {
  const ext = fileExtension(path);
  if (OBSIDIAN_MD_EXTENSIONS.has(ext)) return false;
  if (OBSIDIAN_CANVAS_EXTENSIONS.has(ext)) return false; // canvas is JSON
  return OBSIDIAN_EXTENSIONS.has(ext);
}

/** Map a file extension to its MIME type for Obsidian REST API pushes. */
export function getMimeType(path: string): string {
  const ext = fileExtension(path);
  const MIME: Record<string, string> = {
    // markdown
    md: "text/markdown",
    // canvas (JSON)
    canvas: "application/json",
    // images
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
    // audio
    "3gp": "audio/3gpp",
    flac: "audio/flac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    webm: "audio/webm",
    // video
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    ogv: "video/ogg",
    // pdf
    pdf: "application/pdf",
  };
  return MIME[ext] ?? "application/octet-stream";
}

// ── Content hashing ──────────────────────────────────────────────────────────

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

// ── Path generation ──────────────────────────────────────────────────────────

/**
 * Default vault-relative path for an entity's markdown file.
 * Only used as a fallback when the entity has never been synced (no existing
 * vault path). Imported files preserve their original vault location.
 */
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

/**
 * Build the list of desired vault files from the current entities.
 * If `existing` sync records are provided, previously-imported vault paths are
 * preserved — only brand-new entities (never synced) fall back to the default
 * `notes/<slug>.md` / `docs/<cat>/<slug>.md` paths.
 */
export function buildDesiredFiles(
  notes: Note[],
  docs: Doc[],
  existing: SyncFile[] = [],
): DesiredFile[] {
  const pathByEntity = new Map(
    existing
      .filter((e) => e.entityId != null)
      .map((e) => [e.entityId, e.path]),
  );
  const files: DesiredFile[] = [
    ...notes.map((n) => ({
      path: pathByEntity.get(n.id) ?? noteFilePath(n),
      hash: hashContent(serializeNote(n)),
      entityType: "note" as EntityKind,
      entityId: n.id,
    })),
    ...docs.map((d) => ({
      path: pathByEntity.get(d.id) ?? docFilePath(d),
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

// ── Remote (Obsidian) comparison ─────────────────────────────────────────────

/** Normalize markdown for content comparison (ignore CRLF + edge whitespace). */
export function normalizeMd(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

/** Split our serialized markdown back into frontmatter fields + body. */
export function parseFrontmatter(md: string): {
  fields: Record<string, string>;
  body: string;
} {
  const norm = md.replace(/\r\n/g, "\n");
  const m = norm.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fields: {}, body: norm.replace(/^\n+/, "") };
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) fields[k] = v;
  }
  return { fields, body: norm.slice(m[0].length).replace(/^\n+/, "") };
}

/**
 * Three-way classify a file given the current local hash, the current remote
 * (Obsidian) hash, and the hash recorded at the last successful sync (base).
 *  - no remote file           → "new" (push needed)
 *  - local === remote         → "synced"
 *  - both diverged from base  → "conflict"
 *  - only remote diverged     → "remote_modified" (pull needed)
 *  - only local diverged      → "local_modified" (push needed)
 * With no base (never synced) and differing content, it's a "conflict".
 */
export function classifyRemoteStatus(
  localHash: string,
  remoteHash: string | null,
  baseHash: string | null,
  hadSync: boolean,
): SyncStatus {
  if (remoteHash == null) return "new";
  if (localHash === remoteHash) return "synced";
  if (baseHash == null || !hadSync) return "conflict";
  const localChanged = localHash !== baseHash;
  const remoteChanged = remoteHash !== baseHash;
  if (localChanged && remoteChanged) return "conflict";
  if (remoteChanged) return "remote_modified";
  return "local_modified";
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
