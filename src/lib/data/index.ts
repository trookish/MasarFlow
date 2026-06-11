import { getDb } from "../db/schema";

const TABLES = ["projects", "notes", "specs", "tasks", "standards", "systems", "archNodes", "archEdges", "docs", "devLogs", "agents", "commits", "memories", "links", "tags", "folders", "plans", "meta"] as const;

export type ExportShape = {
  version: number;
  exportedAt: number;
  data: Record<string, unknown[]>;
};

export async function exportAll(): Promise<ExportShape> {
  const db = getDb();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    data[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray();
  }
  return { version: 2, exportedAt: Date.now(), data };
}

export function downloadExport(shape: ExportShape) {
  const blob = new Blob([JSON.stringify(shape, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "masarflow-export-" + new Date(shape.exportedAt).toISOString().replace(/[:.]/g, "-") + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAll(shape: ExportShape, opts: { replace?: boolean } = {}): Promise<{ ok: boolean; counts: Record<string, number>; error?: string }> {
  if (!shape || typeof shape !== "object" || !shape.data) {
    return { ok: false, counts: {}, error: "Invalid file shape" };
  }
  const db = getDb();
  const counts: Record<string, number> = {};
  try {
    for (const t of TABLES) {
      const rows = (shape.data as Record<string, unknown[]>)[t];
      if (!Array.isArray(rows)) continue;
      if (opts.replace) {
        await (db as unknown as Record<string, { clear: () => Promise<void> }>)[t].clear();
      }
      for (const r of rows) {
        await (db as unknown as Record<string, { put: (v: unknown) => Promise<unknown> }>)[t].put(r);
      }
      counts[t] = rows.length;
    }
    return { ok: true, counts };
  } catch (e) {
    return { ok: false, counts, error: (e as Error).message };
  }
}

export async function clearAll(): Promise<void> {
  const db = getDb();
  for (const t of TABLES) {
    await (db as unknown as Record<string, { clear: () => Promise<void> }>)[t].clear();
  }
}
