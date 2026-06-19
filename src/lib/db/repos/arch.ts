import { db } from "@/lib/db";
import { archNodeSchema, type ArchNode } from "@/lib/db/schema";
import { now } from "@/lib/utils/ids";

/**
 * Architecture-diagram layout persistence.
 *
 * The diagram's nodes *are* the project's systems, so we don't store a separate
 * node record per system — we only persist a system's hand-placed position so a
 * user's arrangement survives reloads. Each `archNode` is keyed by its system's
 * id; systems without a saved position fall back to the deterministic
 * auto-layout (`layoutSystems`).
 */
export const archRepo = {
  /** All saved positions for a project, as a `systemId → {x, y}` map. */
  async positions(
    projectId: string | null | undefined,
  ): Promise<Record<string, { x: number; y: number }>> {
    if (!projectId) return {};
    const rows = await db.archNodes.where("projectId").equals(projectId).toArray();
    const map: Record<string, { x: number; y: number }> = {};
    for (const r of rows) map[r.id] = { x: r.x, y: r.y };
    return map;
  },

  /** Persist (insert or update) a system's diagram position. */
  async savePosition(
    projectId: string,
    systemId: string,
    label: string,
    x: number,
    y: number,
  ): Promise<void> {
    const ts = now();
    const existing = await db.archNodes.get(systemId);
    const node: ArchNode = archNodeSchema.parse({
      id: systemId,
      projectId,
      label,
      type: "system",
      x,
      y,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    });
    await db.archNodes.put(node);
  },

  /** Drop a saved position (e.g. when its system is deleted). */
  async remove(systemId: string): Promise<void> {
    await db.archNodes.delete(systemId);
  },
};
