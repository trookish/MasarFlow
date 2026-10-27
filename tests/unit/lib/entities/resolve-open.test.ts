import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notesRepo, tasksRepo } from "@/lib/db/repos";
import { titleOfEntity } from "@/lib/entities/resolve";
import { openEntity } from "@/lib/entities/open";
import { useDockStore } from "@/lib/stores/dock";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { collectPages } from "@/lib/dock/tree";
import { pageIdOf } from "@/lib/dock/types";

beforeEach(async () => {
  await db.delete();
  await db.open();
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
  useDockStore.getState().setProject("p1");
});

describe("titleOfEntity", () => {
  it("returns the display title, or null when the entity is gone", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "Auth design", body: "" });
    const task = await tasksRepo.create({ projectId: "p1", title: "Fix login" });
    expect(await titleOfEntity({ kind: "note", id: note.id })).toBe("Auth design");
    expect(await titleOfEntity({ kind: "task", id: task.id })).toBe("Fix login");
    expect(await titleOfEntity({ kind: "task", id: "missing" })).toBeNull();
  });
});

describe("openEntity", () => {
  const state = () => useDockStore.getState().getProject()!;
  it("focuses the page that shows it, entity selected", () => {
    openEntity({ kind: "task", id: "t1" });
    expect(urlOfFocused(state())).toBe("/work?task=t1");
  });
  it("re-targets an already-open page instead of duplicating it", () => {
    openEntity({ kind: "task", id: "t1" });
    openEntity({ kind: "task", id: "t2" });
    expect(urlOfFocused(state())).toBe("/work?task=t2");
    const s = state();
    const pages = collectPages(s.workspaces[s.activeWorkspace].tree).map(pageIdOf);
    expect(pages.filter((p) => p === "/work")).toHaveLength(1);
  });
  it("kinds without a selection param open their surface section", () => {
    openEntity({ kind: "commit", id: "c1" });
    expect(urlOfFocused(state())).toBe("/today?view=dashboard");
  });
});
