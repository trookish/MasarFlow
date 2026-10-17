import { describe, expect, it } from "vitest";
import { migrate, parseProjectState } from "@/lib/dock/serde";

/** A v1 payload as written by the current build, then damaged the way real
 *  hand-edits / older builds damage it: "?"-prefixed params, a duplicate page,
 *  an activePage that is not a member, absurd floater geometry, dead panel
 *  references in collapsedPanels / maximizedPanelId / focusGroupId. */
function damagedV1() {
  return {
    version: 1,
    activeWorkspace: "Development",
    workspaces: {
      Development: {
        tree: {
          type: "tabs",
          id: "t1",
          activePage: "/gone",
          pages: ["/tasks", "/specs", "/tasks"],
        },
        params: { "/tasks": "?task=a1", "/gone": "?x=1" },
      },
      Broken: { tree: { type: "page", id: "p1", pageId: "" }, params: {} },
    },
    floaters: [
      {
        id: "f1",
        panelIds: ["/chat", "/chat"],
        activePanel: "/nope",
        x: -50,
        y: 10,
        width: 40,
        height: 9000,
        z: 7,
        minimized: "yes",
        maximized: null,
      },
    ],
    collapsedPanels: ["/tasks", "/never"],
    maximizedPanelId: "/never",
    focusGroupId: "no-such-node",
  };
}

describe("migrate", () => {
  it("never throws on junk", () => {
    for (const value of [null, 42, "nope", [], { version: 1 }, { version: 1, workspaces: 7 }]) {
      expect(() => migrate(value)).not.toThrow();
    }
  });

  it("leaves a current payload untouched", () => {
    const v2 = { version: 2, hello: "world" };
    expect(migrate(v2)).toBe(v2);
  });

  it("leaves an unknown future version untouched (validation decides)", () => {
    const v3 = { version: 3, workspaces: {} };
    expect(migrate(v3)).toBe(v3);
    expect(parseProjectState(v3)).toBeNull();
  });

  it("returns the raw payload when nothing is repairable", () => {
    const raw = { version: 1, workspaces: { X: { tree: { type: "nope" }, params: {} } } };
    expect(migrate(raw)).toBe(raw);
    expect(parseProjectState(raw)).toBeNull();
  });
});

describe("parseProjectState on a damaged v1 payload", () => {
  it("migrates instead of discarding the layout", () => {
    const state = parseProjectState(damagedV1());
    expect(state).not.toBeNull();
    expect(state!.version).toBe(2);
  });

  it("repairs the tree: duplicate pages dropped, activePage repaired", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.workspaces.Development.tree).toEqual({
      type: "tabs",
      id: "t1",
      activePage: "/tasks",
      pages: ["/tasks", "/specs"],
    });
  });

  it("drops unrepairable workspaces and falls back to a survivor", () => {
    const state = parseProjectState({ ...damagedV1(), activeWorkspace: "Broken" })!;
    expect(Object.keys(state.workspaces)).toEqual(["Development"]);
    expect(state.activeWorkspace).toBe("Development");
  });

  it("canonicalizes params and prunes keys for panels that no longer exist", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.workspaces.Development.params).toEqual({ "/tasks": "task=a1" });
  });

  it("clamps floater geometry, rebases z, dedupes panels", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.floaters).toHaveLength(1);
    expect(state.floaters[0]).toMatchObject({
      id: "f1",
      panelIds: ["/chat"],
      activePanel: "/chat",
      x: 0,
      y: 10,
      width: 280,
      height: 6000,
      z: 1,
      minimized: false,
      maximized: false,
    });
  });

  it("clears dangling collapsed/maximized/focus references", () => {
    const state = parseProjectState(damagedV1())!;
    expect(state.collapsedPanels).toEqual(["/tasks"]);
    expect(state.maximizedPanelId).toBeNull();
    expect(state.focusGroupId).toBeNull();
  });

  it("keeps a valid focusGroupId", () => {
    const payload = damagedV1();
    payload.focusGroupId = "t1";
    expect(parseProjectState(payload)!.focusGroupId).toBe("t1");
  });
});
