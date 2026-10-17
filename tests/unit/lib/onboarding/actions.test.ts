import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { readMigrationFile } from "@/lib/onboarding/actions";
import { serializeBackup, exportBackup } from "@/lib/db/backup";
import { db } from "@/lib/db";

describe("readMigrationFile", () => {
  it("rejects garbage with a human message", () => {
    expect(readMigrationFile("not json")).toEqual({ ok: false, error: expect.stringMatching(/backup/i) });
  });
  it("accepts a real export and reports its size", async () => {
    const text = serializeBackup(await exportBackup(db, "0.1.6.0"));
    const result = readMigrationFile(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toMatch(/records/);
  });
});
