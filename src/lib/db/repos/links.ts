import { db } from "@/lib/db";
import type { EntityKind, Link } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

export const linksRepo = {
  listByProject(projectId: string): Promise<Link[]> {
    return db.links.where("projectId").equals(projectId).toArray();
  },

  /** Outgoing links from an entity. */
  listBySource(type: EntityKind, id: string): Promise<Link[]> {
    return db.links.where("[sourceType+sourceId]").equals([type, id]).toArray();
  },

  /** Incoming links to an entity (backlinks). */
  listByTarget(type: EntityKind, id: string): Promise<Link[]> {
    return db.links.where("[targetType+targetId]").equals([type, id]).toArray();
  },

  async create(
    input: Omit<Link, "id" | "createdAt"> & Partial<Pick<Link, "id">>,
  ): Promise<Link> {
    const link: Link = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      linkType: input.linkType,
      label: input.label ?? "",
      createdAt: now(),
    };
    await db.links.add(link);
    return link;
  },

  async remove(id: string): Promise<void> {
    await db.links.delete(id);
  },

  /** Remove every link (any direction) that references an entity. */
  async removeForEntity(type: EntityKind, id: string): Promise<void> {
    await db.transaction("rw", db.links, async () => {
      await db.links.where("[sourceType+sourceId]").equals([type, id]).delete();
      await db.links.where("[targetType+targetId]").equals([type, id]).delete();
    });
  },

  /**
   * Replace the set of wikilink edges originating from a note so it matches
   * `targetNoteIds` exactly. Called whenever a note body is saved.
   */
  async replaceNoteWikilinks(
    projectId: string,
    noteId: string,
    targetNoteIds: string[],
  ): Promise<void> {
    await db.transaction("rw", db.links, async () => {
      await db.links
        .where("[sourceType+sourceId]")
        .equals(["note", noteId])
        .and((l) => l.linkType === "wikilink")
        .delete();
      const ts = now();
      const rows: Link[] = targetNoteIds
        .filter((targetId) => targetId !== noteId)
        .map((targetId) => ({
          id: uuid(),
          projectId,
          sourceType: "note" as EntityKind,
          sourceId: noteId,
          targetType: "note" as EntityKind,
          targetId,
          linkType: "wikilink" as const,
          label: "",
          createdAt: ts,
        }));
      if (rows.length) await db.links.bulkAdd(rows);
    });
  },
};
