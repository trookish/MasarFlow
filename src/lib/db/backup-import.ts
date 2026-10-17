import type { MasarFlowDB } from "@/lib/db";
import { BACKUP_FORMAT, BACKUP_VERSION, decodeValue, type BackupFile } from "./backup";

export type BackupErrorCode = "not-json" | "wrong-format" | "too-new" | "unknown-table";

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

/** Validate a backup file's text against this database. Throws BackupError. */
export function parseBackup(text: string, db: MasarFlowDB): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text) as Partial<BackupFile>;
  } catch {
    throw new BackupError("not-json", "This file is not a MasarFlow backup (it is not valid JSON).");
  }
  if (data.format !== BACKUP_FORMAT || typeof data.tables !== "object" || data.tables === null) {
    throw new BackupError("wrong-format", "This file is not a MasarFlow backup.");
  }
  if ((data.version ?? 0) > BACKUP_VERSION || (data.dexieVersion ?? 0) > db.verno) {
    throw new BackupError("too-new", "This backup was created by a newer version of MasarFlow. Update the application and try again.");
  }
  const known = new Set(db.tables.map((t) => t.name));
  for (const name of Object.keys(data.tables)) {
    if (!known.has(name)) throw new BackupError("unknown-table", `The backup contains an unknown table: ${name}.`);
  }
  return data as BackupFile;
}

export interface ImportSummary {
  tables: Record<string, number>;
}

/** Atomic: either everything lands or nothing changes. */
export async function importBackup(db: MasarFlowDB, file: BackupFile, mode: "replace" | "merge"): Promise<ImportSummary> {
  const summary: ImportSummary = { tables: {} };
  await db.transaction("rw", db.tables, async () => {
    if (mode === "replace") await Promise.all(db.tables.map((t) => t.clear()));
    for (const table of db.tables) {
      const rows = file.tables[table.name];
      if (!rows) continue;
      const decoded = rows.map(decodeValue);
      if (mode === "replace") {
        await table.bulkAdd(decoded);
        summary.tables[table.name] = decoded.length;
      } else {
        const have = new Set(await table.toCollection().primaryKeys());
        const fresh = decoded.filter((r) => !have.has((r as { id: string }).id));
        if (fresh.length) await table.bulkAdd(fresh);
        summary.tables[table.name] = fresh.length;
      }
    }
  });
  return summary;
}
