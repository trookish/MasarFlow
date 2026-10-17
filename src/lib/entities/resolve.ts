import { db } from "@/lib/db";
import type { EntityKindId, EntityRef } from "./registry";

const clip = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const TITLE: { [K in EntityKindId]: (id: string) => Promise<string | undefined> } = {
  note: async (id) => (await db.notes.get(id))?.title,
  spec: async (id) => (await db.specs.get(id))?.title,
  task: async (id) => (await db.tasks.get(id))?.title,
  system: async (id) => (await db.systems.get(id))?.name,
  commit: async (id) => {
    const c = await db.commits.get(id);
    return c ? clip(c.message.split("\n")[0]) : undefined;
  },
  memory: async (id) => {
    const m = await db.memories.get(id);
    return m ? clip(m.content) : undefined;
  },
  doc: async (id) => (await db.docs.get(id))?.title,
  archNode: async (id) => (await db.archNodes.get(id))?.label,
  standard: async (id) => (await db.standards.get(id))?.title,
  sprint: async (id) => (await db.sprints.get(id))?.name,
  devlog: async (id) => (await db.devLogs.get(id))?.title,
  canvas: async (id) => (await db.canvases.get(id))?.name,
  agent: async (id) => (await db.agents.get(id))?.name,
  thread: async (id) => (await db.chatThreads.get(id))?.title,
};

/** Display title of an entity, or null when it no longer exists. */
export async function titleOfEntity(ref: EntityRef): Promise<string | null> {
  return (await TITLE[ref.kind](ref.id)) ?? null;
}
