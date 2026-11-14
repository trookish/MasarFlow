import type { MasarFlowDB } from "@/lib/db";

export const BACKUP_FORMAT = "masarflow-backup";
/** File layout version (unchanged since 0.2). */
export const BACKUP_VERSION = 1;
/**
 * Meaning of the rows. 2 = 0.1.x and 0.2 pre-release builds (sync rows without an adapter, no
 * events/trash tables); 3 = 0.2 (replica adapter on sync rows, domain events and trash). Older values migrate forward.
 */
export const DATA_VERSION = 3;

/** Rebuildable data that is not worth shipping in a backup. */
const EXCLUDED_TABLES = new Set(["embeddings"]);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  /** Dexie schema version of the exporting database. */
  dexieVersion: number;
  /** absent in files written by 0.2.x (read as 2) */
  dataVersion?: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
}

/* ── value encoding (JSON cannot carry Blob / typed arrays) ─────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encodeValue(v: unknown): Promise<unknown> {
  if (v instanceof Blob) {
    return { __type: "blob", mime: v.type, data: bytesToBase64(new Uint8Array(await v.arrayBuffer())) };
  }
  if (v instanceof ArrayBuffer) return { __type: "bytes", data: bytesToBase64(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) {
    return { __type: "bytes", data: bytesToBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  if (Array.isArray(v)) return Promise.all(v.map(encodeValue));
  if (v && typeof v === "object") {
    const entries = await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await encodeValue(x)] as const));
    return Object.fromEntries(entries);
  }
  return v;
}

export function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.__type === "blob" && typeof o.data === "string") return new Blob([base64ToBytes(o.data)], { type: String(o.mime ?? "") });
    if (o.__type === "bytes" && typeof o.data === "string") return base64ToBytes(o.data).buffer;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeValue(x)]));
  }
  return v;
}

/** Credentials never leave the machine inside a backup file. */
function redactRow(table: string, row: unknown): unknown {
  if (table === "aiConnections" && row && typeof row === "object") return { ...(row as object), apiKey: "" };
  return row;
}

export async function exportBackup(db: MasarFlowDB, appVersion: string): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    if (EXCLUDED_TABLES.has(table.name)) continue;
    const rows = await table.toArray();
    tables[table.name] = await Promise.all(rows.map((r) => encodeValue(redactRow(table.name, r))));
  }
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, dataVersion: DATA_VERSION, appVersion,
    dexieVersion: db.verno, exportedAt: Date.now(), tables,
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}
