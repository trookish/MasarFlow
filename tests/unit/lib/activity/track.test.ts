import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activityRepo, devLogsRepo, tasksRepo, notesRepo } from "@/lib/db/repos";
import { installActivityTracking, flushActivity, withoutActivity } from "@/lib/activity/track";

let off: () => void;

beforeEach(async () => {
  await db.delete();
  await db.open();
  off?.();
  off = installActivityTracking(db);
});

describe("activity tracking", () => {
  it("records create / update / delete of tracked entities", async () => {
    const task = await tasksRepo.create({ projectId: "p1", title: "Fix login" });
    await tasksRepo.update(task.id, { status: "in_progress" });
    await tasksRepo.remove(task.id);
    await flushActivity();
    const rows = (await activityRepo.listRecent("p1", 10)).map((r) => r.summary).reverse();
    expect(rows).toEqual([
      'Created task "Fix login"',
      'Updated task "Fix login" → in_progress',
      'Deleted task "Fix login"',
    ]);
  });

  it("does not record untracked tables or the activity table itself", async () => {
    await devLogsRepo.create({ projectId: "p1", title: "manual log" });
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
  });

  it("coalesces rapid note autosaves into one 'updated' row", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "N", body: "" });
    for (let i = 0; i < 5; i++) await notesRepo.update(note.id, { body: `v${i}` });
    await flushActivity();
    const updates = (await activityRepo.listRecent("p1", 20)).filter((r) => r.op === "updated");
    expect(updates).toHaveLength(1);
  });

  it("stops recording after uninstall", async () => {
    off();
    await tasksRepo.create({ projectId: "p1", title: "silent" });
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
  });
});

describe("bulk writes", () => {
  it("withoutActivity suppresses recording, then recording resumes", async () => {
    await withoutActivity(() => tasksRepo.create({ projectId: "p1", title: "seeded" }));
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
    await tasksRepo.create({ projectId: "p1", title: "real" });
    await flushActivity();
    expect(await db.activity.count()).toBe(1);
  });
});

describe("automation: finishing a task writes a dev-log entry", () => {
  it("creates exactly one 'task' dev log when status becomes done", async () => {
    const task = await tasksRepo.create({ projectId: "p1", title: "Ship v1" });
    await tasksRepo.update(task.id, { status: "done" });
    await flushActivity();
    const logs = await devLogsRepo.listByProject("p1");
    expect(logs.map((l) => [l.type, l.title, l.refType, l.refId])).toEqual([
      ["task", 'Completed task "Ship v1"', "task", task.id],
    ]);
    await tasksRepo.update(task.id, { progress: 100 }); // already done: no duplicate
    await flushActivity();
    expect(await devLogsRepo.listByProject("p1")).toHaveLength(1);
  });
});
