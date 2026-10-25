import type { Table } from "dexie";
import { db } from "@/lib/db";
import { runCommand } from "./kernel";
import type { Actor } from "../events";

/**
 * Tables without a `projectId` index, and how their rows belong to a project: through a parent
 * table's ids. Global tables (no project at all) map to null. A unit test fails when a new table
 * has neither a `projectId` index nor an entry here.
 */
export const PROJECT_CHILD_TABLES: Record<string, { parent: string; key: string } | null> = {
  projects: null,
  agents: null,
  aiConnections: null,
  canvasNodes: { parent: "canvases", key: "canvasId" },
  canvasEdges: { parent: "canvases", key: "canvasId" },
  chatMessages: { parent: "chatThreads", key: "threadId" },
  agentSteps: { parent: "agentRuns", key: "runId" },
  workflowSteps: { parent: "workflowRuns", key: "runId" },
};

const hasProjectIndex = (t: Table) => t.schema.indexes.some((i) => i.name === "projectId");

/** Every table that holds project-owned rows directly. Discovered from the schema, not listed. */
export function projectTableNames(): string[] {
  return db.tables.filter(hasProjectIndex).map((t) => t.name);
}

/**
 * Delete a project and everything it owns in one transaction: every table with a `projectId`
 * index (discovered), then child tables keyed through a parent. Secrets are not project-scoped
 * (AI connections are global), so nothing outside IndexedDB is awaited here.
 */
export async function removeProject(id: string, actor: Actor = "user"): Promise<void> {
  const direct = db.tables.filter(hasProjectIndex);
  const children = Object.entries(PROJECT_CHILD_TABLES).filter(([, v]) => v) as Array<
    [string, { parent: string; key: string }]
  >;
  const tables = [db.projects, ...direct, ...children.map(([name]) => db.table(name))];
  await runCommand(tables, actor, async () => {
    for (const [name, { parent, key }] of children) {
      const parentIds = (await db.table(parent).where("projectId").equals(id).primaryKeys()) as string[];
      if (parentIds.length) await db.table(name).where(key).anyOf(parentIds).delete();
    }
    for (const t of direct) {
      if (t.name === "events") continue;
      await t.where("projectId").equals(id).delete();
    }
    // The feed keeps no rows for a project that no longer exists, so nothing is emitted here.
    await db.events.where("projectId").equals(id).delete();
    await db.projects.delete(id);
  });
}
