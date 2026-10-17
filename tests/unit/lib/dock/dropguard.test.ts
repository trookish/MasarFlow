import { describe, expect, it } from "vitest";
import type { DockNode } from "@/lib/dock/types";
import { dropVerdict, draggedNodeId, draggedPanels } from "@/lib/dock/dropguard";
import { movePanel, collectPages, normalizeTree } from "@/lib/dock/tree";

const page = (id: string, pageId: string): DockNode => ({ type: "page", id, pageId });
const tabs = (id: string, pages: string[]): DockNode => ({
  type: "tabs",
  id,
  activePage: pages[0],
  pages,
});
const split = (id: string, a: DockNode, b: DockNode, ratio = 0.5): DockNode => ({
  type: "split",
  id,
  direction: "horizontal",
  ratio,
  children: [a, b],
});

/** left | right  —  right holds a 2-page group. */
function tree(): DockNode {
  return split("s1", page("pl", "/tasks"), tabs("tr", ["/brain", "/docs"]));
}

describe("draggedPanels / draggedNodeId", () => {
  it("a panel in a multi-page group moves the whole group", () => {
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/brain" })).toEqual(["/brain", "/docs"]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/brain" })).toBe("tr");
  });

  it("a lone page moves itself", () => {
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/tasks" })).toEqual(["/tasks"]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/tasks" })).toBe("pl");
  });

  it("knows nothing about floaters or unknown panels", () => {
    expect(draggedPanels(tree(), { kind: "floater", floaterId: "f1" })).toEqual([]);
    expect(draggedPanels(tree(), { kind: "panel", panelId: "/nope" })).toEqual([]);
    expect(draggedNodeId(tree(), { kind: "panel", panelId: "/nope" })).toBeNull();
  });
});

describe("dropVerdict", () => {
  const source = { kind: "panel", panelId: "/tasks" } as const;

  it("accepts the root and a sibling group", () => {
    expect(dropVerdict(tree(), source, "root", "left").ok).toBe(true);
    expect(dropVerdict(tree(), source, "tr", "right").ok).toBe(true);
    expect(dropVerdict(tree(), source, "tr", "tab").ok).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(dropVerdict(tree(), source, null, null)).toEqual({
      ok: false,
      reason: "Release over free space or a drop zone.",
    });
    expect(dropVerdict(tree(), source, "outside", "left").ok).toBe(false);
  });

  it("refuses a stale target (the layout changed mid-drag)", () => {
    const verdict = dropVerdict(tree(), source, "gone", "left");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("layout changed");
  });

  it("refuses a split target — committing it would delete the panel", () => {
    const verdict = dropVerdict(tree(), source, "s1", "left");
    expect(verdict.ok).toBe(false);

    // Characterization of WHY: movePanel skips split targets, so the payload
    // that was removed from its source is never re-inserted and the panel
    // vanishes. The fixture must keep the split alive across the removal —
    // dragging onto a split that collapses with the source instead falls
    // back to a root insert (a silent position loss).
    const withSiblingSplit = split(
      "s1",
      page("pl", "/tasks"),
      split("s2", tabs("tr", ["/brain", "/docs"]), page("p2", "/chat")),
    );
    expect(collectPages(movePanel(withSiblingSplit, "/tasks", "s2", "left"))).toEqual([
      "/brain",
      "/docs",
      "/chat",
    ]);
  });

  it("refuses dropping a panel onto its own group", () => {
    const edge = dropVerdict(tree(), { kind: "panel", panelId: "/tasks" }, "pl", "left");
    expect(edge.ok).toBe(false);
    expect(edge.ok === false && edge.reason).toContain("cannot be docked next to itself");

    const tab = dropVerdict(tree(), { kind: "panel", panelId: "/brain" }, "tr", "tab");
    expect(tab.ok).toBe(false);
    expect(tab.ok === false && tab.reason).toContain("already in this group");
  });

  it("accepts a tab merge that would actually add a panel", () => {
    expect(dropVerdict(tree(), { kind: "panel", panelId: "/tasks" }, "tr", "tab").ok).toBe(true);
  });

  it("refuses a no-op tab merge from a group drag that changes nothing", () => {
    const whole = { kind: "group", nodeId: "tr" } as const;
    const verdict = dropVerdict(tree(), whole, "tr", "tab");
    expect(verdict.ok).toBe(false);
  });

  it("accepts a floater landing on a tab strip, known or unknown payload", () => {
    expect(
      dropVerdict(tree(), { kind: "floater", floaterId: "f1", panelIds: ["/chat"] }, "tr", "tab").ok,
    ).toBe(true);
    expect(dropVerdict(tree(), { kind: "floater", floaterId: "f2" }, "tr", "tab").ok).toBe(true);
  });

  it("keeps layout pages intact for every accepted drop", () => {
    const before = collectPages(tree()).sort();
    for (const zone of ["left", "right", "top", "bottom"] as const) {
      const after = collectPages(normalizeTree(movePanel(tree(), "/tasks", "tr", zone))).sort();
      expect(after).toEqual(before);
    }
  });
});
