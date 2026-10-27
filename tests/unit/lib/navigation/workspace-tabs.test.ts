import { describe, expect, it } from "vitest";
import { defaultProjectState } from "@/lib/dock/presets";
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

    expect(workspaceTabIds(state)).toEqual(["/today?view=dashboard", "/ask", "/system"]);
    expect(state.workspaces.Workspace.params["/ask?thread=thread-1"]).toBe("thread=thread-1");
    expect(state.floaters).toEqual([]);
    expect(state.collapsedPanels).toEqual([]);
    expect(state.maximizedPanelId).toBeNull();
    expect(state.workspaces.Workspace.tree.type).toBe("tabs");
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
    expect(getPageDef("/ask")).toMatchObject({ label: "Ask" });
    expect(getPageDef("/ask?view=agents")).toMatchObject({ label: "Ask" });
    expect(isKnownPage("/system")).toBe(true);
  });

  it("cycles in both directions and wraps at the ends", () => {
    const tabs = ["/today", "/work", "/ask"];

    expect(adjacentTabId(tabs, "/today", 1)).toBe("/work");
    expect(adjacentTabId(tabs, "/today", -1)).toBe("/ask");
    expect(adjacentTabId(tabs, "/ask", 1)).toBe("/today");
    expect(adjacentTabId(tabs, "/missing", 1)).toBe("/today");
  });
});
