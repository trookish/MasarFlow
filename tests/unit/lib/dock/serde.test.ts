import { describe, expect, it } from "vitest";
import {
  dockNodeSchema,
  migrate,
  parseProjectState,
  projectDockStateSchema,
} from "@/lib/dock/serde";
import type { DockNode, ProjectDockState } from "@/lib/dock/types";

const TREE: DockNode = {
  type: "split",
  id: "s1",
  direction: "horizontal",
  ratio: 0.6,
  children: [
    { type: "page", id: "p1", pageId: "/brain" },
    {
      type: "tabs",
      id: "t1",
      activePage: "/tasks",
      pages: ["/tasks", "/specs"],
    },
  ],
};

const STATE: ProjectDockState = {
  version: 2,
  activeWorkspace: "Development",
  workspaces: {
    Development: { tree: TREE, params: { "/brain": "note=abc" } },
  },
  floaters: [
    {
      id: "f1",
      panelIds: ["/chat"],
      activePanel: "/chat",
      x: 120,
      y: 80,
      width: 560,
      height: 420,
      z: 2,
      minimized: false,
      maximized: false,
    },
  ],
  collapsedPanels: ["/specs"],
  maximizedPanelId: null,
  focusGroupId: "t1",
};

describe("dockNodeSchema", () => {
  it("accepts a valid nested tree", () => {
    expect(dockNodeSchema.safeParse(TREE).success).toBe(true);
  });

  it("rejects a split with 3 children", () => {
    const bad: DockNode = {
      type: "split",
      id: "s",
      direction: "vertical",
      ratio: 0.5,
      children: [
        { type: "page", id: "a", pageId: "/a" },
        { type: "page", id: "b", pageId: "/b" },
        { type: "page", id: "c", pageId: "/c" },
      ],
    };
    expect(dockNodeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an out-of-range ratio", () => {
    const bad = { ...TREE, ratio: 1.2 };
    expect(dockNodeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tabs with duplicate pages", () => {
    const bad: DockNode = {
      type: "tabs",
      id: "t",
      activePage: "/a",
      pages: ["/a", "/a"],
    };
    expect(dockNodeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tabs whose activePage is not in pages", () => {
    const bad: DockNode = {
      type: "tabs",
      id: "t",
      activePage: "/zzz",
      pages: ["/a"],
    };
    expect(dockNodeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("projectDockStateSchema", () => {
  it("accepts a valid full state", () => {
    const result = projectDockStateSchema.safeParse(STATE);
    expect(result.success).toBe(true);
  });

  it("rejects a missing version", () => {
    const bad = structuredClone(STATE) as unknown as Record<string, unknown>;
    delete bad.version;
    expect(projectDockStateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a wrong version", () => {
    expect(
      projectDockStateSchema.safeParse({ ...STATE, version: 3 }).success,
    ).toBe(false);
  });

  it("rejects a floater missing width", () => {
    const bad = {
      ...STATE,
      floaters: [{ ...STATE.floaters[0], width: undefined }],
    };
    expect(projectDockStateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects params with a non-string value", () => {
    const bad = {
      ...STATE,
      workspaces: {
        Development: { tree: TREE, params: { "/brain": 42 } },
      },
    };
    expect(projectDockStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("parseProjectState", () => {
  it("roundtrips a valid state", () => {
    expect(parseProjectState(JSON.parse(JSON.stringify(STATE)))).toEqual(STATE);
  });

  it("returns null for null / primitives / garbage", () => {
    expect(parseProjectState(null)).toBeNull();
    expect(parseProjectState(42)).toBeNull();
    expect(parseProjectState("x")).toBeNull();
    expect(parseProjectState(undefined)).toBeNull();
    expect(parseProjectState({})).toBeNull();
  });

  it("returns null when a nested node is invalid", () => {
    const bad = JSON.parse(JSON.stringify(STATE));
    bad.workspaces.Development.tree.ratio = 99;
    expect(parseProjectState(bad)).toBeNull();
  });

  it("never throws", () => {
    expect(() => parseProjectState({ version: 1 })).not.toThrow();
  });
});

describe("migrate", () => {
  it("returns the payload unchanged when nothing is repairable", () => {
    const raw = { version: 1, hello: "world" };
    expect(migrate(raw)).toBe(raw);
  });
});

describe("olds layouts keep loading", () => {
  it("a v1 payload written by the previous build still parses", () => {
    const v1 = {
      version: 1,
      activeWorkspace: "Development",
      workspaces: {
        Development: {
          tree: { type: "page", id: "p1", pageId: "/dashboard" },
          params: {},
        },
      },
      floaters: [],
      collapsedPanels: [],
      maximizedPanelId: null,
      focusGroupId: null,
    };
    const state = parseProjectState(v1);
    expect(state).not.toBeNull();
    expect(state!.version).toBe(2);
    expect(state!.workspaces.Development.tree.type).toBe("page");
  });
});
