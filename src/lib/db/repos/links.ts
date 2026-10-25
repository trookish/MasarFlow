import { db } from "@/lib/db";
import type { EntityKind, Link } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

export const linksRepo = {
  /** Resolved links of a project (unresolved wikilinks have no target; see `listUnresolved`). */
  listByProject(projectId: string): Promise<Link[]> {
    return db.links
      .where("projectId")
      .equals(projectId)
      .filter((l) => !l.unresolvedTitle)
      .toArray();
  },

  /** `[[wikilinks]]` whose title matches no note yet. */
  listUnresolved(projectId: string): Promise<Link[]> {
    return db.links
      .where("projectId")
      .equals(projectId)
      .filter((l) => !!l.unresolvedTitle)
      .toArray();
  },

  /** Outgoing links from an entity. */
  listBySource(type: EntityKind, id: string): Promise<Link[]> {
    return db.links
      .where("[sourceType+sourceId]")
      .equals([type, id])
      .filter((l) => !l.unresolvedTitle)
      .toArray();
  },

  get(id: string): Promise<Link | undefined> {
    return db.links.get(id);
  },

  /** Incoming links to an entity (backlinks). */
  listByTarget(type: EntityKind, id: string): Promise<Link[]> {
    return db.links.where("[targetType+targetId]").equals([type, id]).toArray();
  },

  async create(
    input: Omit<Link, "id" | "createdAt" | "label"> &
      Partial<Pick<Link, "id" | "label">>,
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
};
