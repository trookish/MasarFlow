import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, useDockStore } from "@/lib/stores/dock";
import { collectPages } from "@/lib/dock/tree";

function project() {
  const s = useDockStore.getState();
  const id = s.activeProjectId;
  if (!id) throw new Error("no active project in test");
  return s.projects[id];
}

beforeEach(() => {
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
});

describe("project lifecycle", () => {
  it("getProject is null with no active project", () => {
    expect(useDockStore.getState().getProject()).toBeNull();
  });

  it("setProject lazily initializes a default dock state", () => {
    useDockStore.getState().setProject("p1");
    const s = project();
    expect(s.version).toBe(2);
    expect(s.activeWorkspace).toBe("Development");
    expect(collectPages(s.workspaces.Development.tree)).toContain("/dashboard");
  });

  it("setProject(null) keeps saved projects but clears the active id", () => {
    useDockStore.getState().setProject("p1");
    useDockStore.getState().setProject(null);
    expect(useDockStore.getState().activeProjectId).toBeNull();
    expect(useDockStore.getState().getProject()).toBeNull();
  });

  it("reopening a project restores its saved state", () => {
    useDockStore.getState().setProject("p1");
    useDockStore.getState().open("/brain");
    const saved = project();
    useDockStore.getState().setProject("p2");
    useDockStore.getState().setProject("p1");
    expect(useDockStore.getState().projects.p1).toBe(saved);
  });
});

describe("action wrappers", () => {
  beforeEach(() => {
    useDockStore.getState().setProject("p1");
  });

  it("open adds a panel to the tree", () => {
    useDockStore.getState().open("/brain");
    const s = project();
    expect(collectPages(s.workspaces.Development.tree)).toContain("/brain");
    expect(s.focusGroupId).not.toBeNull();
  });

  it("close removes a panel everywhere", () => {
    useDockStore.getState().open("/brain");
    useDockStore.getState().close("/brain");
    const s = project();
    expect(collectPages(s.workspaces.Development.tree)).not.toContain("/brain");
  });

  it("resize updates the targeted split ratio", () => {
    const s0 = project();
    const rootId = s0.workspaces.Development.tree.id;
    useDockStore.getState().resize(rootId, 0.7);
    const s = project();
    const root = s.workspaces.Development.tree;
    if (root.type !== "split") return expect.unreachable();
    expect(root.ratio).toBe(0.7);
  });

  it("float + dockFloater roundtrip", () => {
    useDockStore.getState().float("/chat", { x: 10, y: 10 });
    let s = project();
    expect(s.floaters).toHaveLength(1);
    const fid = s.floaters[0].id;
    expect(collectPages(s.workspaces.Development.tree)).not.toContain("/chat");

    useDockStore.getState().dockFloater(fid, "root", "tab");
    s = project();
    expect(s.floaters).toHaveLength(0);
    expect(collectPages(s.workspaces.Development.tree)).toContain("/chat");
  });

  it("actions no-op without an active project", () => {
    useDockStore.setState({ activeProjectId: null });
    expect(() => useDockStore.getState().open("/brain")).not.toThrow();
    expect(useDockStore.getState().projects.p1).toBeDefined(); // untouched
  });

  it("move updates the tree", () => {
    useDockStore.getState().open("/brain");
    const s0 = project();
    const target = s0.workspaces.Development.tree.id;
    useDockStore.getState().move("/brain", target, "left");
    const s = project();
    expect(collectPages(s.workspaces.Development.tree)).toContain("/brain");
  });
});

describe("workspaces + drag", () => {
  beforeEach(() => {
    useDockStore.getState().setProject("p1");
  });

  it("setWorkspace switches the active workspace", () => {
    useDockStore.getState().setWorkspace("Planning");
    expect(project().activeWorkspace).toBe("Planning");
  });

  it("saveWorkspaceAs copies and switches", () => {
    useDockStore.getState().saveWorkspaceAs("Mine");
    expect(project().activeWorkspace).toBe("Mine");
    expect(project().workspaces.Mine).toBeDefined();
  });

  it("resetWorkspace restores the preset tree", () => {
    useDockStore.getState().setWorkspace("Development");
    useDockStore.getState().open("/brain");
    useDockStore.getState().resetWorkspace();
    const s = project();
    expect(collectPages(s.workspaces.Development.tree).sort()).toEqual(
      ["/dashboard", "/chat"].sort(),
    );
  });

  it("setDrag toggles transient drag state and is excluded from persistence", () => {
    const drag = {
      source: { kind: "panel", panelId: "/brain", nodeId: "n1" } as const,
      pointer: { x: 5, y: 5 },
      zone: null,
      targetId: null,
    };
    useDockStore.getState().setDrag(drag);
    expect(useDockStore.getState().drag).toEqual(drag);

    const partial = useDockStore.persist.getOptions().partialize?.(
      useDockStore.getState() as never,
    ) as Record<string, unknown>;
    expect(partial).not.toHaveProperty("drag");
    expect(partial).toHaveProperty("projects");
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
