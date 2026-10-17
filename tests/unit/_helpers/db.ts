import "fake-indexeddb/auto";
import { db } from "@/lib/db";

/**
 * Dexie test harness: resets the named tables (or every table when none are
 * given) so each test starts from a clean database. The plan expected this
 * helper from P0.T4; it did not exist in the tree, so P6.T13 creates it here.
 */
export async function freshDb(tables: string[] = []): Promise<void> {
  const names = tables.length ? tables : db.tables.map((t) => t.name);
  await Promise.all(names.map((name) => db.table(name).clear()));
}
