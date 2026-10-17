import type { Doc, Folder, Note, Spec, Task } from "@/lib/db/schema";

/**
 * Every path in the mirror is relative to the project's mirror folder and is
 * validated here. Nothing else in P7 may build a vault path by hand.
 */

export const VAULT_SUBFOLDER = "MasarFlow";
export type MirrorKind = "note" | "doc" | "spec" | "task";
export const MIRROR_KINDS: readonly MirrorKind[] = ["note", "doc", "spec", "task"];
export const MIRROR_DIRS = ["notes", "docs", "specs", "tasks", "daily"] as const;

export class VaultPathError extends Error {}

const ILLEGAL_ALL = /[<>:"/\\|?*\u0000-\u001f]/g;
const ILLEGAL_ONE = /[<>:"/\\|?*\u0000-\u001f]/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PATH = 240;
/** Windows refuses these stems even with an extension (CON.txt is invalid). */
const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** Windows/macOS/Linux-safe single segment. Keeps unicode letters. */
export function fileSegment(input: string, fallback = "untitled"): string {
  let cleaned = (input || "")
    .normalize("NFC")
    .replace(ILLEGAL_ALL, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, 64)
    .trim();
  if (!cleaned) return fallback;
  if (WIN_RESERVED.test(cleaned.split(".")[0])) cleaned = `_${cleaned}`;
  return cleaned;
}

/** Validate a mirror-relative path. Returns it unchanged when it is safe. */
export function assertRelativeVaultPath(rel: string): string {
  if (typeof rel !== "string" || rel.trim() === "") throw new VaultPathError("empty vault path");
  if (rel.length > MAX_PATH) throw new VaultPathError(`vault path too long (${rel.length} > ${MAX_PATH})`);
  if (rel.includes("\\")) throw new VaultPathError(`vault paths use forward slashes: ${rel}`);
  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) throw new VaultPathError(`vault paths are relative: ${rel}`);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === "." || seg === "..") throw new VaultPathError(`illegal "${seg}" segment in: ${rel}`);
    if (ILLEGAL_ONE.test(seg)) throw new VaultPathError(`illegal character in path segment: ${seg}`);
    if (/[.\s]$/.test(seg)) throw new VaultPathError(`segment ends with dot/space: ${seg}`);
    if (WIN_RESERVED.test(seg.split(".")[0])) throw new VaultPathError(`windows-reserved name: ${seg}`);
  }
  return rel;
}

export function joinVaultPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split("/"))
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .join("/");
}

/** Absolute-ish folder path for a folder row, walking up to the root. */
export function folderChain(folders: Folder[], folderId: string | null): string | null {
  if (!folderId) return null;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = folderId;
  while (cur) {
    if (seen.has(cur)) break; // corrupt parent cycle: stop, never hang
    seen.add(cur);
    const f = byId.get(cur);
    if (!f) break;
    names.unshift(fileSegment(f.name, "folder"));
    cur = f.parentId;
  }
  return names.length ? names.join("/") : null;
}

/** `props.day` of a note (daily notes) or null. */
export function dayOfNote(note: Note): string | null {
  const raw = note.props?.day;
  return typeof raw === "string" && DAY_RE.test(raw) ? raw : null;
}

export function pathFor(
  kind: MirrorKind,
  row: Note | Doc | Spec | Task,
  folderPath: string | null = null,
): string {
  switch (kind) {
    case "note": {
      const note = row as Note;
      const day = dayOfNote(note);
      if (day) return assertRelativeVaultPath(`daily/${day}.md`);
      const dir = joinVaultPath("notes", folderPath ?? "");
      return assertRelativeVaultPath(`${dir}/${fileSegment(note.title)}.md`);
    }
    case "doc": {
      const doc = row as Doc;
      const dir = joinVaultPath("docs", fileSegment(doc.category || "general", "general"));
      return assertRelativeVaultPath(`${dir}/${fileSegment(doc.title)}.md`);
    }
    case "spec": {
      const spec = row as Spec;
      return assertRelativeVaultPath(
        `specs/${fileSegment(spec.number || "RFC", "RFC")}-${fileSegment(spec.title)}.md`,
      );
    }
    case "task":
      return assertRelativeVaultPath(`tasks/${fileSegment((row as Task).title)}.md`);
  }
}

/** Which mirror kind a mirror-relative path claims (by its first directory). */
export function claimOf(rel: string): MirrorKind | null {
  const dir = rel.split("/")[0];
  if (dir === "notes" || dir === "daily") return "note";
  if (dir === "docs") return "doc";
  if (dir === "specs") return "spec";
  if (dir === "tasks") return "task";
  return null;
}

/** A `.md` file inside one of the mirror directories. */
export function isMirroredPath(rel: string): boolean {
  if (!rel.endsWith(".md")) return false;
  return (MIRROR_DIRS as readonly string[]).includes(rel.split("/")[0]);
}

/**
 * Make paths unique (case-insensitively — Windows): the first entity keeps the
 * natural path, later collisions get `-2`, `-3`, … before the extension.
 */
export function uniquePaths<T extends { path: string }>(entries: T[]): T[] {
  const taken = new Set<string>();
  return entries.map((entry) => {
    assertRelativeVaultPath(entry.path);
    let path = entry.path;
    if (taken.has(path.toLowerCase())) {
      const m = /^(.*?)(\.[A-Za-z0-9]+)$/.exec(path);
      const base = m ? m[1] : path;
      const ext = m ? m[2] : "";
      let n = 2;
      do {
        path = `${base}-${n}${ext}`;
        n += 1;
      } while (taken.has(path.toLowerCase()));
    }
    taken.add(path.toLowerCase());
    return { ...entry, path };
  });
}
