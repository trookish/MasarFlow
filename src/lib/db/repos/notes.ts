import { db } from "@/lib/db";
import type { Note, NoteType } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { makeExcerpt, extractWikilinkTargets } from "@/lib/utils/markdown";
import { linksRepo } from "./links";

interface CreateNoteInput {
  projectId: string;
  title: string;
  body?: string;
  type?: NoteType;
  folderId?: string | null;
  tags?: string[];
  id?: string;
}

/** Legacy rows can lack defaulted fields — normalize on read. */
function normalize(n: Note): Note {
  return {
    ...n,
    type: n.type ?? "note",
    body: n.body ?? "",
    excerpt: n.excerpt ?? "",
    tags: n.tags ?? [],
    folderId: n.folderId ?? null,
  };
}

export const notesRepo = {
  async listByProject(projectId?: string | null): Promise<Note[]> {
    if (!projectId) return [];
    return (await db.notes.where("projectId").equals(projectId).toArray()).map(
      normalize,
    );
  },

  async get(id: string): Promise<Note | undefined> {
    const n = await db.notes.get(id);
    return n ? normalize(n) : undefined;
  },

  /** Case-insensitive title lookup within a project. */
  async getByTitle(
    projectId: string,
    title: string,
  ): Promise<Note | undefined> {
    const target = title.trim().toLowerCase();
    const candidates = await db.notes
      .where("projectId")
      .equals(projectId)
      .toArray();
    const found = candidates.find(
      (n) => n.title.trim().toLowerCase() === target,
    );
    return found ? normalize(found) : undefined;
  },

  async create(input: CreateNoteInput): Promise<Note> {
    const ts = now();
    const body = input.body ?? "";
    const note: Note = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      type: input.type ?? "note",
      title: input.title,
      body,
      excerpt: makeExcerpt(body),
      tags: input.tags ?? [],
      folderId: input.folderId ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.notes.add(note);
    await this.syncWikilinks(note);
    return note;
  },

  async update(
    id: string,
    patch: Partial<Omit<Note, "id" | "projectId" | "createdAt">>,
  ): Promise<void> {
    const next: Partial<Note> = { ...patch, updatedAt: now() };
    if (patch.body !== undefined) next.excerpt = makeExcerpt(patch.body);
    await db.notes.update(id, next);
    if (patch.body !== undefined) {
      const note = await db.notes.get(id);
      if (note) await this.syncWikilinks(note);
    }
  },

  async remove(id: string): Promise<void> {
    await linksRepo.removeForEntity("note", id);
    await db.notes.delete(id);
  },

  /**
   * Resolve a note by title, creating an empty placeholder if it does not yet
   * exist (mirrors Obsidian's "create on link" behavior).
   */
  async ensureByTitle(projectId: string, title: string): Promise<Note> {
    const existing = await this.getByTitle(projectId, title);
    if (existing) return existing;
    return this.create({ projectId, title, type: "note" });
  },

  /**
   * Reconcile the note's `[[wikilinks]]` with the links table: every linked
   * title resolves to (or creates) a note, then the wikilink edge set for this
   * note is replaced to match.
   */
  async syncWikilinks(note: Note): Promise<void> {
    const targets = extractWikilinkTargets(note.body);
    const targetIds: string[] = [];
    for (const title of targets) {
      const target = await this.ensureByTitle(note.projectId, title);
      targetIds.push(target.id);
    }
    await linksRepo.replaceNoteWikilinks(note.projectId, note.id, targetIds);
  },
};
