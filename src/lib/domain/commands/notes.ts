import { db } from "@/lib/db";
import type { EntityKind, Link, Note } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { extractWikilinkTargets, makeExcerpt } from "@/lib/utils/markdown";
import { asList } from "@/lib/vault/frontmatter";
import { runCommand } from "./kernel";
import type { Actor } from "../events";

const norm = (s: string) => s.trim().toLowerCase();

function findNote(notes: Note[], title: string): Note | undefined {
  const t = norm(title);
  return (
    notes.find((n) => norm(n.title) === t) ??
    notes.find((n) => asList(n.props?.aliases).some((a) => norm(a) === t))
  );
}

/**
 * Reconcile a note's `[[wikilinks]]` with the links table. Titles that match a note (or alias)
 * become resolved edges; the rest become unresolved links. Saving never creates notes (D7).
 * Also resolves other notes' unresolved links that point at this note's title.
 */
export async function resolveWikilinks(noteId: string, actor: Actor = "user"): Promise<void> {
  await runCommand([db.notes, db.links], actor, async () => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    const notes = await db.notes.where("projectId").equals(note.projectId).toArray();
    await db.links
      .where("[sourceType+sourceId]")
      .equals(["note", noteId])
      .and((l) => l.linkType === "wikilink")
      .delete();
    const ts = now();
    const seen = new Set<string>();
    const rows: Link[] = [];
    for (const title of extractWikilinkTargets(note.body ?? "")) {
      const target = findNote(notes, title);
      const key = target ? `id:${target.id}` : `t:${norm(title)}`;
      if (seen.has(key) || target?.id === noteId) continue;
      seen.add(key);
      rows.push({
        id: uuid(),
        projectId: note.projectId,
        sourceType: "note" as EntityKind,
        sourceId: noteId,
        targetType: "note" as EntityKind,
        targetId: target?.id ?? "",
        ...(target ? {} : { unresolvedTitle: title.trim() }),
        linkType: "wikilink",
        label: "",
        createdAt: ts,
      });
    }
    if (rows.length) await db.links.bulkAdd(rows);
    await resolvePending(note);
  });
}

/** Point every unresolved link in the project whose title matches `note` at it. */
async function resolvePending(note: Note): Promise<number> {
  const names = new Set([note.title, ...asList(note.props?.aliases)].map(norm).filter(Boolean));
  const pending = await db.links
    .where("projectId")
    .equals(note.projectId)
    .filter((l) => !!l.unresolvedTitle && names.has(norm(l.unresolvedTitle)) && l.sourceId !== note.id)
    .toArray();
  for (const l of pending) await db.links.update(l.id, { targetId: note.id, unresolvedTitle: undefined });
  return pending.length;
}

/**
 * The "Create note" action on an unresolved `[[link]]`: creates the note (or finds it) and resolves
 * every link that was waiting for that title.
 */
export async function createNoteFromLink(projectId: string, title: string, actor: Actor = "user"): Promise<Note> {
  return runCommand([db.notes, db.links], actor, async (tx) => {
    const existing = findNote(await db.notes.where("projectId").equals(projectId).toArray(), title);
    const ts = now();
    const note: Note =
      existing ??
      ({
        id: uuid(),
        projectId,
        type: "note",
        title: title.trim(),
        body: "",
        excerpt: makeExcerpt(""),
        tags: [],
        folderId: null,
        createdAt: ts,
        updatedAt: ts,
      } as Note);
    if (!existing) {
      await db.notes.add(note);
      tx.emit({ projectId, entityKind: "note", entityId: note.id, op: "create", patch: { title: note.title } });
    }
    await resolvePending(note);
    return note;
  });
}
