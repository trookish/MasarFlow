import type Dexie from "dexie";
import type { EntityKind } from "./schema";

/**
 * Data doctor: read-only integrity checks over the local database. Each check reports how many
 * defective rows it found and up to five sample ids. `pnpm doctor:data` runs it against the packaged
 * app's IndexedDB (tests/e2e/desktop/audit-data.spec.ts); after P2 every count must be zero.
 */
export type DoctorCheck =
  | "orphan-project-rows"
  | "dangling-links"
  | "stale-linked-task-ids"
  | "sync-rows-without-entity"
  | "duplicate-sync-paths";

export interface DoctorResult {
  check: DoctorCheck;
  count: number;
  sample: string[];
}

export interface DoctorReport {
  ranAt: number;
  results: DoctorResult[];
  total: number;
}

/** Entity kind → Dexie table holding it. */
export const ENTITY_TABLES: Record<EntityKind, string> = {
  note: "notes",
  spec: "specs",
  task: "tasks",
  system: "systems",
  commit: "commits",
  memory: "memories",
  doc: "docs",
  archNode: "archNodes",
  standard: "standards",
  sprint: "sprints",
  devlog: "devLogs",
  canvas: "canvases",
  agent: "agents",
  thread: "chatThreads",
};

const SAMPLE = 5;
const result = (check: DoctorCheck, ids: string[]): DoctorResult => ({
  check,
  count: ids.length,
  sample: ids.slice(0, SAMPLE),
});

/** A database as plain rows: what the packaged harness reads straight from IndexedDB. */
export interface DbSnapshot {
  tables: Array<{ name: string; indexes: string[]; rows: Array<Record<string, unknown>> }>;
}

/** Snapshot a live Dexie database (unit tests, in-app use). */
export async function snapshotDexie(db: Dexie): Promise<DbSnapshot> {
  return {
    tables: await Promise.all(
      db.tables.map(async (t) => ({
        name: t.name,
        indexes: t.schema.indexes.map((i) => i.name),
        rows: (await t.toArray()) as Array<Record<string, unknown>>,
      })),
    ),
  };
}

export async function runDoctor(db: Dexie): Promise<DoctorReport> {
  return runDoctorOnSnapshot(await snapshotDexie(db));
}

export function runDoctorOnSnapshot(snap: DbSnapshot): DoctorReport {
  const byName = new Map(snap.tables.map((t) => [t.name, t]));
  const rowsOf = <T>(name: string) => (byName.get(name)?.rows ?? []) as T[];
  const cache = new Map<string, Set<string>>();
  const ids = (table: string) => {
    let s = cache.get(table);
    if (!s) cache.set(table, (s = new Set(rowsOf<{ id: string }>(table).map((r) => r.id))));
    return s;
  };
  const exists = (kind: string | null | undefined, id: string) => {
    const table = kind ? ENTITY_TABLES[kind as EntityKind] : undefined;
    return table ? ids(table).has(id) : false;
  };
  const projects = ids("projects");

  // 1. Rows in any project-scoped table whose project no longer exists.
  const orphans: string[] = [];
  for (const table of snap.tables) {
    if (table.name === "projects" || !table.indexes.includes("projectId")) continue;
    for (const r of table.rows) {
      if (typeof r.projectId === "string" && r.projectId && !projects.has(r.projectId)) {
        orphans.push(`${table.name}:${String(r.id)}`);
      }
    }
  }

  // 2. Links whose source or target entity is missing (unresolved wikilinks have no target by design).
  const dangling = rowsOf<{
    id: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    unresolvedTitle?: string;
  }>("links")
    .filter(
      (l) => !exists(l.sourceType, l.sourceId) || (!l.unresolvedTitle && !exists(l.targetType, l.targetId)),
    )
    .map((l) => l.id);

  // 3. Specs, docs and commits pointing at tasks that are gone.
  const taskIds = ids("tasks");
  const stale: string[] = [];
  for (const table of ["specs", "docs", "commits"]) {
    for (const r of rowsOf<{ id: string; linkedTaskIds?: string[] }>(table)) {
      if ((r.linkedTaskIds ?? []).some((t) => !taskIds.has(t))) stale.push(`${table}:${r.id}`);
    }
  }

  // 4 + 5. Sync bookkeeping.
  const syncRows = rowsOf<{ id: string; projectId: string; path: string; entityType: string | null; entityId: string | null }>(
    "syncFiles",
  );
  const withoutEntity = syncRows.filter((s) => s.entityId && !exists(s.entityType, s.entityId)).map((s) => s.id);
  const seen = new Map<string, number>();
  for (const s of syncRows) {
    const key = `${s.projectId}:${s.path}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  const results = [
    result("orphan-project-rows", orphans),
    result("dangling-links", dangling),
    result("stale-linked-task-ids", stale),
    result("sync-rows-without-entity", withoutEntity),
    result("duplicate-sync-paths", duplicates),
  ];
  return { ranAt: Date.now(), results, total: results.reduce((n, r) => n + r.count, 0) };
}
