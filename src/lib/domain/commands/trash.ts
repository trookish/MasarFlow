import type { Table } from "dexie";
import { db } from "@/lib/db";
import type { EntityKind, Link } from "@/lib/db/schema";
import { ENTITY_TABLES } from "@/lib/db/doctor";
import { runCommand } from "./kernel";
import { trashId, type Actor, type FieldEdit, type TrashEntry } from "../events";

/** Kinds the trash supports in v0.3 (the ones with cross-references worth restoring). */
export const REMOVABLE_KINDS = ["task", "spec", "doc", "note"] as const;
export type RemovableKind = (typeof REMOVABLE_KINDS)[number];

const table = (kind: EntityKind) => db.table(ENTITY_TABLES[kind]) as Table<Record<string, unknown>, string>;
const titleOf = (row: Record<string, unknown>) => String(row.title ?? row.name ?? row.id ?? "");

/** Tables a removal of `kind` may touch (Dexie needs them up front). */
function scope(kind: RemovableKind): Table[] {
  const base: Table[] = [table(kind), db.links, db.trash];
  if (kind === "task") return [...base, db.specs, db.docs, db.commits, db.tasks];
  if (kind === "spec") return [...base, db.tasks];
  return base;
}

async function specProgress(specId: string) {
  const tasks = await db.tasks.where("specId").equals(specId).toArray();
  const done = tasks.filter((t) => t.status === "done").length;
  return tasks.length ? Math.round((done / tasks.length) * 100) : 0;
}

/**
 * Move an entity to the trash and clean every reference to it in the same transaction:
 * links in both directions, `linkedTaskIds` arrays, `specId`/`parentTaskId` pointers and the owning
 * spec's progress. Incoming wikilinks to a removed note become unresolved instead of disappearing.
 */
export async function removeEntity(kind: RemovableKind, id: string, actor: Actor = "user"): Promise<TrashEntry | null> {
  return runCommand(scope(kind), actor, async (tx) => {
    const row = await table(kind).get(id);
    if (!row) return null;
    const projectId = String(row.projectId);
    const edits: FieldEdit[] = [];

    const outgoing = await db.links.where("[sourceType+sourceId]").equals([kind, id]).toArray();
    const incoming = await db.links.where("[targetType+targetId]").equals([kind, id]).toArray();
    const saved: Link[] = [...outgoing, ...incoming.filter((l) => !(kind === "note" && l.linkType === "wikilink"))];
    await db.links.bulkDelete(saved.map((l) => l.id));
    if (kind === "note") {
      for (const l of incoming.filter((l) => l.linkType === "wikilink")) {
        edits.push({ table: "links", id: l.id, field: "targetId", before: l.targetId });
        await db.links.update(l.id, { targetId: "", unresolvedTitle: titleOf(row) });
      }
    }

    if (kind === "task") {
      for (const t of ["specs", "docs", "commits"] as const) {
        const holders = await (db.table(t) as Table<{ id: string; linkedTaskIds?: string[] }, string>)
          .where("projectId")
          .equals(projectId)
          .filter((r) => (r.linkedTaskIds ?? []).includes(id))
          .toArray();
        for (const h of holders) {
          edits.push({ table: t, id: h.id, field: "linkedTaskIds", before: h.linkedTaskIds });
          await db.table(t).update(h.id, { linkedTaskIds: (h.linkedTaskIds ?? []).filter((x) => x !== id) });
        }
      }
      for (const child of await db.tasks.where("parentTaskId").equals(id).toArray()) {
        edits.push({ table: "tasks", id: child.id, field: "parentTaskId", before: id });
        await db.tasks.update(child.id, { parentTaskId: null });
      }
    }
    if (kind === "spec") {
      for (const t of await db.tasks.where("specId").equals(id).toArray()) {
        edits.push({ table: "tasks", id: t.id, field: "specId", before: id });
        await db.tasks.update(t.id, { specId: null });
      }
    }

    await table(kind).delete(id);
    if (kind === "task" && typeof row.specId === "string" && row.specId) {
      await db.specs.update(row.specId, { implementationProgress: await specProgress(row.specId) });
    }

    const entry: TrashEntry = {
      id: trashId(kind, id),
      projectId,
      kind,
      entityId: id,
      title: titleOf(row),
      deletedAt: tx.at,
      actor,
      row,
      links: saved as unknown as Array<Record<string, unknown>>,
      edits,
    };
    await db.trash.put(entry);
    tx.emit({ projectId, entityKind: kind, entityId: id, op: "remove" });
    return entry;
  });
}

/**
 * Put a trashed entity back. Links and field edits are re-applied only where the other side still
 * exists, so restoring never creates a dangling reference.
 */
export async function restoreEntity(entryId: string, actor: Actor = "user"): Promise<boolean> {
  const entry = await db.trash.get(entryId);
  if (!entry) return false;
  const kind = entry.kind as RemovableKind;
  return runCommand([...scope(kind), db.notes], actor, async (tx) => {
    const fresh = await db.trash.get(entryId);
    if (!fresh) return false;
    const exists = async (k: string, id: string) => {
      const t = ENTITY_TABLES[k as EntityKind];
      return t ? (await db.table(t).get(id)) !== undefined : false;
    };
    await table(kind).put(fresh.row);
    for (const l of fresh.links as unknown as Link[]) {
      const other = l.sourceId === fresh.entityId ? [l.targetType, l.targetId] : [l.sourceType, l.sourceId];
      if (await exists(other[0], other[1])) await db.links.put(l);
    }
    for (const e of fresh.edits) {
      const target = (await db.table(e.table).get(e.id)) as Record<string, unknown> | undefined;
      if (!target) continue;
      if (e.field === "linkedTaskIds") {
        const now = (target.linkedTaskIds as string[] | undefined) ?? [];
        if (!now.includes(fresh.entityId)) await db.table(e.table).update(e.id, { linkedTaskIds: [...now, fresh.entityId] });
      } else if (e.table === "links" && e.field === "targetId") {
        if (target.unresolvedTitle) await db.links.update(e.id, { targetId: fresh.entityId, unresolvedTitle: undefined });
      } else if (target[e.field] == null) {
        await db.table(e.table).update(e.id, { [e.field]: e.before });
      }
    }
    if (kind === "task" && typeof fresh.row.specId === "string" && (await db.specs.get(fresh.row.specId))) {
      await db.specs.update(fresh.row.specId, { implementationProgress: await specProgress(fresh.row.specId) });
    } else if (kind === "task" && typeof fresh.row.specId === "string") {
      await db.tasks.update(fresh.entityId, { specId: null });
    }
    await db.trash.delete(entryId);
    tx.emit({ projectId: fresh.projectId, entityKind: kind, entityId: fresh.entityId, op: "restore" });
    return true;
  });
}

/** Permanently delete one trash entry. */
export async function purgeTrash(entryId: string, actor: Actor = "user"): Promise<void> {
  await runCommand([db.trash], actor, async (tx) => {
    const e = await db.trash.get(entryId);
    if (!e) return;
    await db.trash.delete(entryId);
    tx.emit({ projectId: e.projectId, entityKind: e.kind, entityId: e.entityId, op: "purge" });
  });
}

/** Permanently delete every trash entry of a project. Returns how many were removed. */
export async function emptyTrash(projectId: string, actor: Actor = "user"): Promise<number> {
  return runCommand([db.trash], actor, async (tx) => {
    const entries = await db.trash.where("projectId").equals(projectId).toArray();
    await db.trash.bulkDelete(entries.map((e) => e.id));
    for (const e of entries) tx.emit({ projectId, entityKind: e.kind, entityId: e.entityId, op: "purge" });
    return entries.length;
  });
}
