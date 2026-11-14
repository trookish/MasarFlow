import { beforeEach, describe, expect, it } from "vitest";
import { activePins, memoryStorage, useDockStore } from "@/lib/stores/dock";
import { collectPages } from "@/lib/dock/tree";
import { focusedPanelId } from "@/lib/dock/dock-core";

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
  useDockStore.setState({ projects: {}, activeProjectId: null, closedTabs: {}, pinnedTabs: {} });
});

describe("amendLastClosed", () => {
  it("records a navigation that reached the dock after its tab was closed", () => {
    const store = useDockStore.getState();
    store.setProject("p1");
    store.open("/library?view=docs");
    store.close("/library?view=docs");
    store.amendLastClosed("/library?view=standards");
    store.amendLastClosed("/work"); // another page's address never rewrites the entry
    expect(useDockStore.getState().closedTabs.p1).toEqual(["/library?view=standards"]);
  });
});

describe("pinned tabs", () => {
  function open(...routes: string[]) {
    const store = useDockStore.getState();
    store.setProject("p1");
    for (const route of routes) store.open(route);
  }

  it("moves a pinned tab to the front and keeps the focused tab focused", () => {
    open("/work", "/library", "/ai");
    useDockStore.getState().togglePin("/library");
    expect(pages()).toEqual(["/library", "/today", "/work", "/ai"]);
    expect(activePins(useDockStore.getState())).toEqual(["/library"]);
    expect(focusedPanelId(project())).toBe("/ai");
  });

  it("refuses to close a pinned tab until it is unpinned", () => {
    open("/work", "/library");
    const store = useDockStore.getState();
    store.togglePin("/work");
    store.close("/work");
    expect(pages()).toContain("/work");
    expect(useDockStore.getState().closedTabs.p1 ?? []).toEqual([]);
    store.togglePin("/work");
    expect(activePins(useDockStore.getState())).toEqual([]);
    store.close("/work");
    expect(pages()).not.toContain("/work");
  });

  it("keeps the pinned block at the front when tabs are reordered", () => {
    open("/work", "/library");
    const store = useDockStore.getState();
    store.togglePin("/library");
    store.togglePin("/work");
    expect(pages()).toEqual(["/library", "/work", "/today"]);
    const holder = project().workspaces.Workspace.tree.id;
    store.reorder(holder, "/today", 0); // an unpinned tab cannot jump the pinned block
    expect(pages()).toEqual(["/library", "/work", "/today"]);
    store.reorder(holder, "/library", 2); // a pinned tab cannot leave it
    expect(pages()).toEqual(["/work", "/library", "/today"]);
  });

  it("unpins to just after the pinned block, and pins stay per project", () => {
    open("/work", "/library");
    const store = useDockStore.getState();
    store.togglePin("/library");
    store.togglePin("/work");
    store.togglePin("/library");
    expect(pages()).toEqual(["/work", "/library", "/today"]);
    store.setProject("p2");
    expect(activePins(useDockStore.getState())).toEqual([]);
  });
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
    store.open("/ai");
    store.setProject("p1");
    expect(pages()).toEqual(["/today", "/work"]);
    expect(project().focusGroupId).toBe("workspace-tabs");
    store.setProject("p2");
    expect(pages()).toEqual(["/today", "/ai"]);
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
    store.open("/ai?thread=thread-1");
    store.close("/ai?thread=thread-1");
    expect(pages()).not.toContain("/ai");
    expect(useDockStore.getState().closedTabs.p1).toEqual(["/ai?thread=thread-1"]);
    store.reopenClosedTab();
    expect(pages()).toContain("/ai");
    expect(project().workspaces.Workspace.params["/ai"]).toBe("thread=thread-1");
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
