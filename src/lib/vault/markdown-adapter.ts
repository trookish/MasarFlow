import type { Note } from "../db/schema";
import { parseFrontmatter, serializeFrontmatter, stripFrontmatter, extractTitleFromBody, hasFrontmatter } from "./frontmatter";
import { findWikilinks, wikilinkToTarget } from "./wikilinks";

export interface VaultNoteInput {
  projectId: string;
  body: string;
  relativePath: string;
  defaultType?: Note["type"];
  defaultTags?: string[];
  mtime: number;
}

export interface VaultNoteOutput {
  note: Note;
  wikilinkTargets: string[];
  isTask: boolean;
  title: string;
}

export function vaultNoteToBrain(input: VaultNoteInput): VaultNoteOutput {
  const fm = parseFrontmatter(input.body);
  const bodyContent = stripFrontmatter(input.body);
  const filename = input.relativePath.split("/").pop() ?? "";
  const baseTitle = filename.replace(/\.md$/i, "");
  const title = (fm.raw.title as string) ?? extractTitleFromBody(bodyContent, baseTitle);
  const tags = Array.from(new Set([...(fm.tags ?? []), ...(input.defaultTags ?? [])]));
  const id = "note_" + input.projectId + "_" + hashPath(input.relativePath);
  const isTask = !!fm.status;
  const note: Note = {
    id,
    projectId: input.projectId,
    type: fm.type ?? input.defaultType ?? "note",
    title,
    body: bodyContent.trim(),
    excerpt: deriveExcerpt(bodyContent),
    tags,
    folderId: null,
    createdAt: fm.dateCreated ?? input.mtime,
    updatedAt: fm.dateModified ?? input.mtime,
  };
  const links = findWikilinks(input.body);
  return {
    note,
    wikilinkTargets: links.filter((l) => !l.isEmbed).map((l) => wikilinkToTarget(l.target)),
    isTask,
    title,
  };
}

export function brainNoteToVault(note: Note, opts: { includeTemplateMarker?: boolean } = {}): string {
  const fm = parseFrontmatter("");
  fm.type = note.type;
  if (note.tags.length) fm.tags = note.tags;
  if (note.title) (fm.raw as Record<string, unknown>).title = note.title;
  const header = serializeFrontmatter(fm).trimEnd();
  const body = note.body?.trim() ?? "";
  if (!body) return header + String.fromCharCode(10) + String.fromCharCode(10);
  if (body.startsWith("# ")) return header + String.fromCharCode(10) + String.fromCharCode(10) + body + String.fromCharCode(10);
  return header + String.fromCharCode(10) + String.fromCharCode(10) + "# " + note.title + String.fromCharCode(10) + String.fromCharCode(10) + body + String.fromCharCode(10);
}

export function deriveExcerpt(body: string, max = 160): string {
  const cleaned = body.replace(/```[\s\S]*?```/g, "").replace(/[#>*_`~\-\[\]\(\)]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

export function hashPath(p: string): string {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h << 5) + h) + p.charCodeAt(i);
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

export async function md5Hex(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h) + text.charCodeAt(i) | 0;
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
