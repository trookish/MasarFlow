import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activityRepo } from "@/lib/db/repos";
import { exportBackup } from "@/lib/db/backup";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const draft = (n: number, projectId = "p1") => ({
  projectId,
  entityKind: "task" as const,
  entityId: `t${n}`,
  op: "created" as const,
  summary: `Created task "T${n}"`,
});

describe("activityRepo", () => {
  it("lists newest first, scoped by project", async () => {
    await activityRepo.addMany([draft(1), draft(2), draft(3), draft(9, "other")]);
    const rows = await activityRepo.listRecent("p1", 2);
    expect(rows.map((r) => r.entityId)).toEqual(["t3", "t2"]);
  });
  it("prune keeps the newest N", async () => {
    await activityRepo.addMany([draft(1), draft(2), draft(3), draft(4)]);
    expect(await activityRepo.prune("p1", 2)).toBe(2);
    expect((await activityRepo.listRecent("p1", 10)).map((r) => r.entityId)).toEqual(["t4", "t3"]);
  });
  it("finds activity for one entity", async () => {
    await activityRepo.addMany([draft(1), draft(2)]);
    expect(await activityRepo.listForEntity("p1", "task", "t2")).toHaveLength(1);
  });
  it("is included in backups (round-trips), unlike the rebuildable embeddings", async () => {
    await activityRepo.addMany([draft(1)]);
    const file = await exportBackup(db, "0.2.0.0");
    expect(file.tables.activity).toHaveLength(1);
    expect(file.tables.activity[0]).toMatchObject({ entityId: "t1", op: "created" });
  });
});
