import { db } from "@/lib/db";
import type { Note, NoteType, PropValue } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { makeExcerpt } from "@/lib/utils/markdown";
import { asList } from "@/lib/vault/frontmatter";
import { createNoteFromLink, removeEntity, resolveWikilinks } from "@/lib/domain/commands";

interface CreateNoteInput {
  projectId: string;
  title: string;
  body?: string;
  type?: NoteType;
  folderId?: string | null;
  tags?: string[];
  props?: Record<string, PropValue>;
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

  /** Resolve a `[[wikilink]]` target through the note's frontmatter aliases. */
  async findByAlias(projectId: string, alias: string): Promise<Note | undefined> {
    const target = alias.trim().toLowerCase();
    if (!target) return undefined;
    const candidates = await db.notes.where("projectId").equals(projectId).toArray();
    const found = candidates
      .map(normalize)
      .find((n) => asList(n.props?.aliases).some((a) => a.trim().toLowerCase() === target));
    return found;
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
      ...(input.props ? { props: input.props } : {}),
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

  /** Moves the note to the trash; other notes' `[[links]]` to it become unresolved. */
  async remove(id: string): Promise<void> {
    await removeEntity("note", id);
  },

  /**
   * The user followed a `[[link]]`: find the note by title or alias, or create it, and resolve
   * every link that was waiting for that title. Saving a note never calls this.
   */
  async ensureByTitle(projectId: string, title: string): Promise<Note> {
    return normalize(await createNoteFromLink(projectId, title));
  },

  /**
   * Reconcile the note's `[[wikilinks]]` with the links table. Unknown titles become unresolved
   * links; no note is created on save.
   */
  async syncWikilinks(note: Note): Promise<void> {
    await resolveWikilinks(note.id);
  },
};
