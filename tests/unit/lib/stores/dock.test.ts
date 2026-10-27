import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, useDockStore } from "@/lib/stores/dock";
import { collectPages } from "@/lib/dock/tree";

function project() {
  const state = useDockStore.getState();
  const id = state.activeProjectId;
  if (!id) throw new Error("no active project in test");
  return state.projects[id];
}

function pages() {
  return collectPages(project().workspaces.Workspace.tree);
}

beforeEach(() => {
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null, closedTabs: {} });
});

describe("project tab lifecycle", () => {
  it("starts a new project with one Today tab", () => {
    useDockStore.getState().setProject("p1");
    expect(project().version).toBe(2);
    expect(project().activeWorkspace).toBe("Workspace");
    expect(pages()).toEqual(["/today"]);
  });

  it("keeps each project's open tabs and selection independent", () => {
    const store = useDockStore.getState();
    store.setProject("p1");
    store.open("/work");
    store.setProject("p2");
    store.open("/ask");
    store.setProject("p1");
    expect(pages()).toEqual(["/today", "/work"]);
    expect(project().focusGroupId).toBe("workspace-tabs");
    store.setProject("p2");
    expect(pages()).toEqual(["/today", "/ask"]);
  });

  it("canonicalizes legacy pages when opening them", () => {
    useDockStore.getState().setProject("p1");
    useDockStore.getState().open("/dashboard");
    expect(pages()).toEqual(["/today"]);
    expect(project().workspaces.Workspace.params["/today"]).toBe("view=dashboard");
  });

  it("closes and reopens a tab with its selection parameters", () => {
    const store = useDockStore.getState();
    store.setProject("p1");
    store.open("/ask?thread=thread-1");
    store.close("/ask?thread=thread-1");
    expect(pages()).not.toContain("/ask");
    expect(useDockStore.getState().closedTabs.p1).toEqual(["/ask?thread=thread-1"]);
    store.reopenClosedTab();
    expect(pages()).toContain("/ask");
    expect(project().workspaces.Workspace.params["/ask"]).toBe("thread=thread-1");
    expect(useDockStore.getState().closedTabs.p1).toEqual([]);
  });

  it("never leaves the workspace without a tab", () => {
    const store = useDockStore.getState();
    store.setProject("p1");
    store.close("/today");
    expect(pages()).toEqual(["/today"]);
  });

  it("reopen is a no-op without an active project or closed tab", () => {
    expect(() => useDockStore.getState().reopenClosedTab()).not.toThrow();
    useDockStore.getState().setProject("p1");
    expect(() => useDockStore.getState().reopenClosedTab()).not.toThrow();
    expect(pages()).toEqual(["/today"]);
  });
});

describe("memoryStorage", () => {
  it("roundtrips values like Storage", () => {
    memoryStorage.clear();
    memoryStorage.setItem("k", "v");
    expect(memoryStorage.getItem("k")).toBe("v");
    expect(memoryStorage.getItem("missing")).toBeNull();
    memoryStorage.removeItem("k");
    expect(memoryStorage.getItem("k")).toBeNull();
    memoryStorage.setItem("k", "v");
    memoryStorage.clear();
    expect(memoryStorage.getItem("k")).toBeNull();
  });
});
