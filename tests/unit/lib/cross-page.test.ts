import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { linksRepo, notesRepo, tasksRepo, devLogsRepo } from "@/lib/db/repos";
import { installActivityTracking, flushActivity } from "@/lib/activity/track";
import { assembleWorkspaceContext } from "@/lib/ai/context";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { useDockStore } from "@/lib/stores/dock";
import { openEntity } from "@/lib/entities/open";

const P = "xp";
let off: () => void;

beforeEach(async () => {
  await db.delete();
  await db.open();
  off?.();
  off = installActivityTracking(db);
  useDockStore.setState({ projects: {}, activeProjectId: null });
  useDockStore.getState().setProject(P);
});

describe("one change is visible everywhere", () => {
  it("note -> link -> task done -> chat briefing knows all of it", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth design", body: "JWT" });
    const task = await tasksRepo.create({ projectId: P, title: "Implement auth" });
    await linksRepo.create({
      projectId: P, sourceType: "task", sourceId: task.id,
      targetType: "note", targetId: note.id, linkType: "implements",
    });
    await tasksRepo.update(task.id, { status: "done" });
    await flushActivity();
    openEntity({ kind: "task", id: task.id });

    const briefing = await assembleWorkspaceContext(P, { query: "auth" });

    expect(briefing).toContain("## Currently open");
    expect(briefing).toContain(`Task "Implement auth" (id ${task.id})`);
    expect(briefing).toContain('task "Implement auth" —implements→ note "Auth design"');
    expect(briefing).toContain('Updated task "Implement auth" → done');
    expect((await devLogsRepo.listByProject(P)).map((l) => l.title)).toContain('Completed task "Implement auth"');
  });

  it("the model can ask what the user is looking at", async () => {
    const task = await tasksRepo.create({ projectId: P, title: "Look here" });
    openEntity({ kind: "task", id: task.id });
    const res = JSON.parse(await executeWorkspaceTool(P, { id: "1", name: "get_active_context", arguments: {} }));
    expect(res.focused.entity.title).toBe("Look here");
  });
});
