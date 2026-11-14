import { describe, expect, it } from "vitest";
import { defaultProjectState } from "../dock/legacy-presets";
import { getPageDef, isKnownPage } from "@/lib/dock/registry";
import type { ProjectDockState } from "@/lib/dock/types";
import {
  adjacentTabId,
  defaultWorkspaceTabsState,
  normalizeWorkspaceTabs,
  workspaceTabIds,
} from "@/lib/navigation/workspace-tabs";

describe("workspace tabs", () => {
  it("starts a new project with one Today tab and no docking state", () => {
    const state = defaultWorkspaceTabsState();

    expect(workspaceTabIds(state)).toEqual(["/today"]);
    expect(state.activeWorkspace).toBe("Workspace");
    expect(state.floaters).toEqual([]);
    expect(state.collapsedPanels).toEqual([]);
    expect(state.maximizedPanelId).toBeNull();
  });

  it("flattens every legacy workspace layout without losing open pages or params", () => {
    const legacy = defaultProjectState();
    legacy.workspaces.Development.params = {
      "/dashboard?range=7d": "range=7d",
      "/chat?thread=thread-1": "thread=thread-1",
    };
    legacy.floaters.push({
      id: "legacy-floater",
      panelIds: ["/settings"],
      activePanel: "/settings",
      x: 10,
      y: 10,
      width: 600,
      height: 400,
      z: 1,
      minimized: false,
      maximized: false,
    });

    const state = normalizeWorkspaceTabs(legacy);

    expect(workspaceTabIds(state)).toEqual(["/today?view=dashboard", "/ai", "/system"]);
    expect(state.workspaces.Workspace.params["/ai?thread=thread-1"]).toBe("thread=thread-1");
    expect(state.floaters).toEqual([]);
    expect(state.collapsedPanels).toEqual([]);
    expect(state.maximizedPanelId).toBeNull();
    expect(state.workspaces.Workspace.tree.type).toBe("tabs");
  });

  it("migrates a stored tab from the renamed /ask surface to /ai, section and selection kept", () => {
    const stored = defaultWorkspaceTabsState();
    const ws = stored.workspaces.Workspace;
    ws.tree = { ...ws.tree, pages: ["/today", "/ask?view=agents"], activePage: "/ask?view=agents" } as typeof ws.tree;
    ws.params = { "/ask?view=agents": "view=agents&agent=a1" };

    const state = normalizeWorkspaceTabs(stored);

    expect(workspaceTabIds(state)).toEqual(["/today", "/ai?view=agents"]);
    expect(state.workspaces.Workspace.tree).toMatchObject({ activePage: "/ai?view=agents" });
    expect(state.workspaces.Workspace.params["/ai?view=agents"]).toBe("view=agents&agent=a1");
  });

  it("keeps the active page when it was in a legacy split", () => {
    const legacy: ProjectDockState = {
      ...defaultProjectState(),
      focusGroupId: null,
    };
    const state = normalizeWorkspaceTabs(legacy);

    expect(state.workspaces.Workspace.tree).toMatchObject({
      type: "tabs",
      activePage: "/today?view=dashboard",
    });
  });

  it("recognizes the six surfaces as project tabs", () => {
    expect(getPageDef("/ai")).toMatchObject({ label: "AI" });
    expect(getPageDef("/ai?view=agents")).toMatchObject({ label: "AI" });
    expect(getPageDef("/ask")).toBeNull();
    expect(isKnownPage("/system")).toBe(true);
  });

  it("cycles in both directions and wraps at the ends", () => {
    const tabs = ["/today", "/work", "/ai"];

    expect(adjacentTabId(tabs, "/today", 1)).toBe("/work");
    expect(adjacentTabId(tabs, "/today", -1)).toBe("/ai");
    expect(adjacentTabId(tabs, "/ai", 1)).toBe("/today");
    expect(adjacentTabId(tabs, "/missing", 1)).toBe("/today");
  });
});
