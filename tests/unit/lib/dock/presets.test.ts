import { describe, expect, it } from "vitest";
import { defaultProjectState, WORKSPACE_PRESETS } from "@/lib/dock/presets";
import { dockNodeSchema, parseProjectState } from "@/lib/dock/serde";
import type { DockNode } from "@/lib/dock/types";

/** All node ids in a tree (for uniqueness checks). */
function allIds(node: DockNode): string[] {
  const ids = [node.id];
  if (node.type === "split") {
    for (const child of node.children) ids.push(...allIds(child));
  }
  return ids;
}

/** All pageIds in a tree. */
function pagesOf(node: DockNode): string[] {
  if (node.type === "page") return [node.pageId];
  if (node.type === "tabs") return [...node.pages];
  return node.children.flatMap(pagesOf);
}

describe("WORKSPACE_PRESETS", () => {
  it("defines the four named workspaces", () => {
    expect(Object.keys(WORKSPACE_PRESETS).sort()).toEqual(
      ["AI Research", "Debugging", "Development", "Planning"].sort(),
    );
  });

  it("every preset tree validates under dockNodeSchema", () => {
    for (const [name, ws] of Object.entries(WORKSPACE_PRESETS)) {
      const result = dockNodeSchema.safeParse(ws.tree);
      if (!result.success) {
        throw new Error(`preset "${name}" has an invalid tree`);
      }
    }
  });

  it("node ids are unique within each preset", () => {
    for (const [name, ws] of Object.entries(WORKSPACE_PRESETS)) {
      const ids = allIds(ws.tree);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("Development opens Dashboard + Chat side by side", () => {
    const dev = WORKSPACE_PRESETS.Development;
    expect(pagesOf(dev.tree).sort()).toEqual(["/chat", "/dashboard"].sort());
    expect(dev.tree.type).toBe("split");
  });

  it("Planning opens Specs/Tasks tabs beside Standards (vertical split)", () => {
    const planning = WORKSPACE_PRESETS.Planning;
    expect(pagesOf(planning.tree).sort()).toEqual(
      ["/specs", "/tasks", "/standards"].sort(),
    );
    if (planning.tree.type !== "split") return expect.unreachable();
    expect(planning.tree.direction).toBe("vertical");
  });

  it("Debugging opens Dev Logs beside Knowledge Graph", () => {
    const debugging = WORKSPACE_PRESETS.Debugging;
    expect(pagesOf(debugging.tree).sort()).toEqual(
      ["/devlogs", "/knowledge"].sort(),
    );
  });

  it("AI Research opens Chat beside Semantic Search", () => {
    const research = WORKSPACE_PRESETS["AI Research"];
    expect(pagesOf(research.tree).sort()).toEqual(
      ["/chat", "/search"].sort(),
    );
  });

  it("presets carry no params snapshots", () => {
    for (const ws of Object.values(WORKSPACE_PRESETS)) {
      expect(ws.params).toEqual({});
    }
  });
});

describe("defaultProjectState", () => {
  it("parses as a valid ProjectDockState", () => {
    expect(parseProjectState(defaultProjectState())).not.toBeNull();
  });

  it("starts on the Development workspace", () => {
    const s = defaultProjectState();
    expect(s.activeWorkspace).toBe("Development");
    expect(s.focusGroupId).toBeNull();
    expect(s.maximizedPanelId).toBeNull();
    expect(s.floaters).toEqual([]);
    expect(s.collapsedPanels).toEqual([]);
  });

  it("returns independent clones per call", () => {
    const a = defaultProjectState();
    const b = defaultProjectState();
    // Mutate a's tree object; b must be unaffected (deep clone on return).
    if (a.workspaces.Development.tree.type === "split") {
      a.workspaces.Development.tree.ratio = 0.9;
    }
    expect(b.workspaces.Development.tree).not.toBe(a.workspaces.Development.tree);
  });
});
