import { db } from "@/lib/db";
import { aiUndoRepo } from "@/lib/db/repos";
import type { AiUndoKind } from "@/lib/db/schema";
import { executeWorkspaceTool, type ToolCallRequest } from "./tools";

/**
 * Reversible wrapper around `executeWorkspaceTool`. Before each mutating tool
 * call runs it snapshots the targeted entity; afterwards it re-reads the row
 * and records an `aiUndo` ledger entry (before/after) keyed to the assistant
 * chat message, so the UI can offer one-click rollback of model-made changes.
 *
 * Read-only tools pass straight through with zero overhead; failed calls and
 * no-op updates (e.g. rewriting identical content) are not recorded.
 */

interface MutationMeta {
  kind: AiUndoKind;
  table: string;
  /** True when the tool creates a new entity (id comes from the result). */
  creates?: boolean;
  /** True when the tool removes an entity (no "after" row exists). */
  removes?: boolean;
}

/** Workspace tools that mutate entity state, mapped to their backing table. */
const MUTATIONS: Record<string, MutationMeta> = {
  create_note: { kind: "note", table: "notes", creates: true },
  update_note: { kind: "note", table: "notes" },

  create_canvas: { kind: "canvas", table: "canvases", creates: true },
  update_canvas: { kind: "canvas", table: "canvases" },

  create_folder: { kind: "folder", table: "folders", creates: true },
  update_folder: { kind: "folder", table: "folders" },

  create_spec: { kind: "spec", table: "specs", creates: true },
  update_spec: { kind: "spec", table: "specs" },

  create_standard: { kind: "standard", table: "standards", creates: true },
  update_standard: { kind: "standard", table: "standards" },

  create_task: { kind: "task", table: "tasks", creates: true },
  update_task: { kind: "task", table: "tasks" },

  create_sprint: { kind: "sprint", table: "sprints", creates: true },
  update_sprint: { kind: "sprint", table: "sprints" },

  create_system: { kind: "system", table: "systems", creates: true },
  update_system: { kind: "system", table: "systems" },

  create_link: { kind: "link", table: "links", creates: true },
  remove_link: { kind: "link", table: "links", removes: true },

  create_doc: { kind: "doc", table: "docs", creates: true },
  update_doc: { kind: "doc", table: "docs" },

  create_devlog: { kind: "devlog", table: "devLogs", creates: true },
  update_devlog: { kind: "devlog", table: "devLogs" },

  create_memory: { kind: "memory", table: "memories", creates: true },
  update_memory: { kind: "memory", table: "memories" },

  update_commit: { kind: "commit", table: "commits" },
};

async function readRow(table: string, id: string): Promise<unknown> {
  return db.table<Record<string, unknown>, string>(table).get(id);
}

/** Extract the created entity id from a tool result `{ok: true, id}`. */
function createdId(result: string): string | null {
  try {
    const j = JSON.parse(result) as { ok?: boolean; id?: string };
    if (j.ok === false) return null;
    return typeof j.id === "string" && j.id ? j.id : null;
  } catch {
    return null;
  }
}

/** True when the tool result reports success. */
function succeeded(result: string): boolean {
  try {
    return (JSON.parse(result) as { ok?: boolean }).ok !== false;
  } catch {
    return true;
  }
}

/** True when two entity rows are identical except for `updatedAt` bumps. */
function sameRow(a: unknown, b: unknown): boolean {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return a === b;
  }
  const strip = (r: unknown): Record<string, unknown> => {
    const copy = { ...(r as Record<string, unknown>) };
    delete copy.updatedAt;
    return copy;
  };
  try {
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  } catch {
    return false;
  }
}

/**
 * Execute a workspace tool call, recording a reversible ledger entry when it
 * mutates workspace data. Returns the same result string as the plain
 * executor.
 */
export async function executeWorkspaceToolWithUndo(
  projectId: string,
  call: ToolCallRequest,
  chatMessageId: string,
): Promise<string> {
  const meta = MUTATIONS[call.name];
  if (!meta) return executeWorkspaceTool(projectId, call);

  const args = call.arguments ?? {};
  const targetId = meta.creates ? null : String(args.id ?? "");
  const before = meta.creates || !targetId ? null : await readRow(meta.table, targetId);
  const result = await executeWorkspaceTool(projectId, call);
  if (!succeeded(result)) return result;

  const entityId = meta.creates ? createdId(result) : targetId;
  if (!entityId) return result;

  const after = meta.removes ? null : await readRow(meta.table, entityId);
  if (before === null && after === null) return result;
  if (before !== null && after !== null && sameRow(before, after)) return result;

  await aiUndoRepo.create({
    projectId,
    chatMessageId,
    toolName: call.name,
    kind: meta.kind,
    table: meta.table,
    entityId,
    action: meta.creates ? "create" : meta.removes ? "delete" : "update",
    before,
    after,
  });
  return result;
}
