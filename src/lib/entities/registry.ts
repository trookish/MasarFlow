/**
 * The one place that knows how an entity maps to a page. Pure TypeScript:
 * no React, no Dexie, no Next — safe in node tests and server code.
 *
 * Order of ENTITY_KINDS must equal `entityKindSchema.options` (guarded by
 * tests/unit/lib/entities/kinds-parity.test.ts — P5.T2).
 */

export const ENTITY_KINDS = [
  "note",
  "spec",
  "task",
  "system",
  "commit",
  "memory",
  "doc",
  "archNode",
  "standard",
  "sprint",
  "devlog",
  "canvas",
  "agent",
  "thread",
] as const;

export type EntityKindId = (typeof ENTITY_KINDS)[number];

export interface EntityRef {
  kind: EntityKindId;
  id: string;
}

export interface KindMeta {
  /** Human label, singular. */
  label: string;
  /** The page that shows this kind (must be a dock page). */
  route: string;
  /** Query param that selects one entity on that page; null = page has none. */
  param: string | null;
}

export const KIND_META: Record<EntityKindId, KindMeta> = {
  note: { label: "Note", route: "/brain", param: "note" },
  spec: { label: "Spec", route: "/specs", param: "spec" },
  task: { label: "Task", route: "/tasks", param: "task" },
  system: { label: "System", route: "/architecture", param: "system" },
  commit: { label: "Commit", route: "/dashboard", param: null },
  memory: { label: "Memory", route: "/dashboard", param: null },
  doc: { label: "Doc", route: "/docs", param: "doc" },
  archNode: { label: "Architecture node", route: "/architecture", param: null },
  standard: { label: "Standard", route: "/standards", param: "standard" },
  sprint: { label: "Sprint", route: "/sprints", param: "sprint" },
  devlog: { label: "Dev log", route: "/devlogs", param: "devlog" },
  canvas: { label: "Canvas", route: "/brain/canvas", param: "canvas" },
  agent: { label: "Agent", route: "/agents", param: "agent" },
  thread: { label: "Chat", route: "/chat", param: "thread" },
};

export function isEntityKind(value: unknown): value is EntityKindId {
  return typeof value === "string" && (ENTITY_KINDS as readonly string[]).includes(value);
}

/** URL (path + query) that shows `ref`. */
export function entityHref(ref: EntityRef): string {
  const meta = KIND_META[ref.kind];
  return meta.param
    ? `${meta.route}?${meta.param}=${encodeURIComponent(ref.id)}`
    : meta.route;
}

/**
 * Inverse of entityHref: which entity does (path, query) select?
 * An empty value (`task=`) means "cleared" and yields null.
 */
export function refFromUrl(path: string, query: string): EntityRef | null {
  const params = new URLSearchParams(query);
  for (const kind of ENTITY_KINDS) {
    const meta = KIND_META[kind];
    if (!meta.param || meta.route !== path) continue;
    const id = params.get(meta.param);
    if (id) return { kind, id };
  }
  return null;
}

/** `entity:note/<id>` — the link scheme used inside markdown (chat replies, notes). */
export function entityUri(ref: EntityRef): string {
  return `entity:${ref.kind}/${encodeURIComponent(ref.id)}`;
}

export function parseEntityUri(uri: string): EntityRef | null {
  const m = /^entity:([A-Za-z]+)\/(.+)$/.exec(uri);
  if (!m || !isEntityKind(m[1])) return null;
  try {
    return { kind: m[1], id: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}
