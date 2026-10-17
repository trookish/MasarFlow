import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { linksRepo, notesRepo, tasksRepo, activityRepo } from "@/lib/db/repos";
import { executeWorkspaceTool, WORKSPACE_TOOL_NAMES } from "@/lib/ai/tools";
import { useDockStore } from "@/lib/stores/dock";
import { urlOfFocused } from "@/lib/dock/dock-core";

const P = "aware-project";
const run = async (name: string, args: Record<string, unknown> = {}) =>
  JSON.parse(await executeWorkspaceTool(P, { id: `c-${name}`, name, arguments: args }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
  useDockStore.getState().setProject(P);
});

describe("tool registration", () => {
  it("exposes the four awareness tools", () => {
    for (const n of ["get_active_context", "open_entity", "get_backlinks", "list_activity"]) {
      expect(WORKSPACE_TOOL_NAMES).toContain(n);
    }
  });
});

describe("get_active_context", () => {
  it("reports the focused entity with its title", async () => {
    const task = await tasksRepo.create({ projectId: P, title: "Fix login" });
    useDockStore.getState().open(`/tasks?task=${task.id}`);
    const res = await run("get_active_context");
    expect(res.ok).toBe(true);
    expect(res.focused).toMatchObject({ page: "/tasks", entity: { kind: "task", id: task.id, title: "Fix login" } });
    expect(res.panels.length).toBeGreaterThan(0);
  });
});

describe("open_entity", () => {
  it("opens an existing entity in the dock", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth", body: "" });
    const res = await run("open_entity", { kind: "note", id: note.id });
    expect(res.ok).toBe(true);
    expect(urlOfFocused(useDockStore.getState().getProject()!)).toBe(`/brain?note=${note.id}`);
  });
  it("refuses an unknown entity and an unknown kind", async () => {
    expect((await run("open_entity", { kind: "task", id: "nope" })).ok).toBe(false);
    expect((await run("open_entity", { kind: "bogus", id: "x" })).ok).toBe(false);
  });
});

describe("get_backlinks", () => {
  it("returns incoming and outgoing links with titles", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth", body: "" });
    const task = await tasksRepo.create({ projectId: P, title: "Fix login" });
    await linksRepo.create({
      projectId: P, sourceType: "task", sourceId: task.id,
      targetType: "note", targetId: note.id, linkType: "implements",
    });
    const res = await run("get_backlinks", { kind: "note", id: note.id });
    expect(res.incoming).toEqual([
      expect.objectContaining({ kind: "task", id: task.id, title: "Fix login", linkType: "implements" }),
    ]);
    expect(res.outgoing).toEqual([]);
  });
});

describe("list_activity", () => {
  it("returns newest first and respects limit", async () => {
    await activityRepo.addMany([1, 2, 3].map((n) => ({
      projectId: P, entityKind: "task" as const, entityId: `t${n}`, op: "created" as const, summary: `S${n}`,
    })));
    const res = await run("list_activity", { limit: 2 });
    expect(res.activity.map((a: { summary: string }) => a.summary)).toEqual(["S3", "S2"]);
  });
});
