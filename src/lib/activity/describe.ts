import type { EntityKindId } from "@/lib/entities/registry";

export type ActivityOp = "created" | "updated" | "deleted";

export interface ActivityDraft {
  projectId: string;
  entityKind: EntityKindId;
  entityId: string;
  op: ActivityOp;
  summary: string;
}

type Row = Record<string, unknown>;

const firstLine = (v: unknown): string => String(v ?? "").split("\n")[0].slice(0, 80);

/** Dexie table -> entity kind + how to name a row. Tables not listed are not tracked. */
const TRACKED: Record<string, { kind: EntityKindId; name: (r: Row) => string }> = {
  notes: { kind: "note", name: (r) => firstLine(r.title) },
  specs: { kind: "spec", name: (r) => firstLine(r.title) },
  tasks: { kind: "task", name: (r) => firstLine(r.title) },
  docs: { kind: "doc", name: (r) => firstLine(r.title) },
  standards: { kind: "standard", name: (r) => firstLine(r.title) },
  sprints: { kind: "sprint", name: (r) => firstLine(r.name) },
  systems: { kind: "system", name: (r) => firstLine(r.name) },
  canvases: { kind: "canvas", name: (r) => firstLine(r.name) },
  chatThreads: { kind: "thread", name: (r) => firstLine(r.title) },
  memories: { kind: "memory", name: (r) => firstLine(r.content) },
  commits: { kind: "commit", name: (r) => firstLine(r.message) },
};

export const TRACKED_TABLES: readonly string[] = Object.keys(TRACKED);

export function describeChange(
  table: string,
  op: ActivityOp,
  row: Row,
  changes?: Row,
): ActivityDraft | null {
  const meta = TRACKED[table];
  const projectId = row.projectId;
  const id = row.id;
  if (!meta || typeof projectId !== "string" || !projectId || typeof id !== "string") return null;
  const verb = op === "created" ? "Created" : op === "updated" ? "Updated" : "Deleted";
  let summary = `${verb} ${meta.kind} "${meta.name(row)}"`;
  if (op === "updated" && typeof changes?.status === "string") summary += ` → ${changes.status}`;
  return { projectId, entityKind: meta.kind, entityId: id, op, summary };
}

/** `allow(key)` is true at most once per `windowMs` per key (autosave coalescing). */
export function makeThrottle(windowMs: number, clock: () => number = Date.now) {
  const last = new Map<string, number>();
  return (key: string): boolean => {
    const t = clock();
    const prev = last.get(key);
    if (prev !== undefined && t - prev < windowMs) return false;
    last.set(key, t);
    return true;
  };
}
