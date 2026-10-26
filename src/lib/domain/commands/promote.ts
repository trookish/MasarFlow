import { db } from "@/lib/db";
import { docsRepo } from "@/lib/db/repos/docs";
import { specsRepo } from "@/lib/db/repos/specs";
import { tasksRepo } from "@/lib/db/repos/tasks";
import type { EntityKind } from "@/lib/db/schema";
import { uuid } from "@/lib/utils/ids";
import type { Actor } from "../events";
import { runCommand } from "./kernel";

export type PromoteTarget = "task" | "spec" | "doc";

/** Next free `RFC-###` number for a project. */
async function nextSpecNumber(projectId: string): Promise<string> {
  const specs = await db.specs.where("projectId").equals(projectId).toArray();
  const max = specs.reduce((m, s) => {
    const hit = /^RFC-(\d+)$/.exec(s.number);
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
  return `RFC-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Turn a note into a task, spec or doc (v0.3 P6 T3). The new record and a `relates` link from the
 * note to it are written in one transaction, so the note's backlinks always show what it became.
 */
export async function promoteNote(
  noteId: string,
  target: PromoteTarget,
  actor: Actor = "user",
): Promise<{ kind: EntityKind; id: string } | null> {
  return runCommand(
    [db.notes, db.tasks, db.specs, db.docs, db.links],
    actor,
    async (tx) => {
      const note = await db.notes.get(noteId);
      if (!note) return null;
      const { projectId } = note;
      let id: string;
      switch (target) {
        case "task":
          id = (
            await tasksRepo.create({
              projectId,
              title: note.title,
              description: note.body,
            })
          ).id;
          break;
        case "spec":
          id = (
            await specsRepo.create({
              projectId,
              number: await nextSpecNumber(projectId),
              title: note.title,
              purpose: note.excerpt,
              linkedNoteIds: [note.id],
            })
          ).id;
          break;
        case "doc":
          id = (
            await docsRepo.create({
              projectId,
              title: note.title,
              body: note.body,
            })
          ).id;
          break;
      }
      await db.links.add({
        id: uuid(),
        projectId,
        sourceType: "note",
        sourceId: note.id,
        targetType: target,
        targetId: id,
        linkType: "relates",
        label: "promoted",
        createdAt: tx.at,
      });
      tx.emit({
        projectId,
        entityKind: target,
        entityId: id,
        op: "create",
        patch: { promotedFrom: note.id },
      });
      return { kind: target, id };
    },
  );
}
