import { db } from "@/lib/db";

/** Remove every record from every table (full local wipe). */
export async function resetData(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
