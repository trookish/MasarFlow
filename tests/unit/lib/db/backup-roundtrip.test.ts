import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, serializeBackup } from "@/lib/db/backup";
import { importBackup, parseBackup } from "@/lib/db/backup-import";
import { seedDemoProject } from "@/lib/db/demo-seed";
import { runDoctor } from "@/lib/db/doctor";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("backup round trip (P3 gate)", () => {
  it("restores the demo project exactly and the data doctor finds nothing", async () => {
    await seedDemoProject();
    const before = Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.count()] as const)));
    const text = serializeBackup(await exportBackup(db, "0.2.0.0"));

    await Promise.all(db.tables.map((t) => t.clear()));
    await importBackup(db, parseBackup(text, db), "replace");

    for (const t of db.tables) {
      if (t.name === "embeddings") continue; // not shipped in backups; rebuilt on demand
      expect(await t.count(), t.name).toBe(before[t.name]);
    }
    const report = await runDoctor(db);
    const failing = report.results.filter((r) => r.count > 0).map((r) => `${r.check}: ${r.count}`);
    expect(failing).toEqual([]);
  });
});
