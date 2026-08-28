import { describe, expect, it } from "vitest";
import {
  joinPanelId,
  newId,
  pageIdOf,
  paramsOf,
  validateNode,
} from "@/lib/dock/types";

describe("pageIdOf", () => {
  it("strips everything from the first ?", () => {
    expect(pageIdOf("/brain?note=a")).toBe("/brain");
  });

  it("returns the path unchanged when there is no query", () => {
    expect(pageIdOf("/brain")).toBe("/brain");
  });

  it("strips multiple query params", () => {
    expect(pageIdOf("/brain?note=a&x=1")).toBe("/brain");
  });

  it("splits at the FIRST ? only", () => {
    expect(pageIdOf("/a?b?c")).toBe("/a");
  });
});

describe("paramsOf", () => {
  it("returns the raw query part after ?", () => {
    expect(paramsOf("/brain?note=a")).toBe("note=a");
  });

  it("returns empty string when there is no query", () => {
    expect(paramsOf("/brain")).toBe("");
  });

  it("keeps multiple params intact", () => {
    expect(paramsOf("/brain?note=a&x=1")).toBe("note=a&x=1");
  });
});

describe("joinPanelId", () => {
  it("returns the bare path when query is empty", () => {
    expect(joinPanelId("/brain", "")).toBe("/brain");
  });

  it("joins path and query with ?", () => {
    expect(joinPanelId("/brain", "note=a")).toBe("/brain?note=a");
  });

  it("roundtrips with pageIdOf/paramsOf", () => {
    const panelId = "/brain?note=a&x=1";
    expect(joinPanelId(pageIdOf(panelId), paramsOf(panelId))).toBe(panelId);
  });
});

describe("newId", () => {
  it("uses the given prefix", () => {
    const id = newId("split");
    expect(id).toMatch(/^split_/);
    expect(id.length).toBeGreaterThan("split_".length);
  });

  it("generates unique ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(newId());
    expect(seen.size).toBe(50);
  });
});

describe("validateNode", () => {
  const page = { type: "page", id: "p1", pageId: "/brain" };
  const tabs = {
    type: "tabs",
    id: "t1",
    activePage: "/brain",
    pages: ["/brain", "/tasks"],
  };
  const split = {
    type: "split",
    id: "s1",
    direction: "horizontal",
    ratio: 0.5,
    children: [page, tabs],
  };

  it("accepts a page node", () => {
    expect(validateNode(page)).toEqual({ ok: true });
  });

  it("accepts a tabs node", () => {
    expect(validateNode(tabs)).toEqual({ ok: true });
  });

  it("accepts a split node with valid nested children", () => {
    expect(validateNode(split)).toEqual({ ok: true });
  });

  it("rejects an unknown node type", () => {
    expect(validateNode({ type: "blob", id: "x" }).ok).toBe(false);
  });

  it("rejects a node with a missing/empty id", () => {
    expect(validateNode({ type: "page", pageId: "/brain" }).ok).toBe(false);
    expect(validateNode({ type: "page", id: "", pageId: "/brain" }).ok).toBe(
      false,
    );
  });

  it("rejects a split with fewer than 2 children", () => {
    const oneChild = { ...split, children: [page] };
    expect(validateNode(oneChild).ok).toBe(false);
  });

  it("rejects a split with 3 children", () => {
    const three = { ...split, children: [page, page, page] };
    expect(validateNode(three).ok).toBe(false);
  });

  it("rejects a split ratio outside [0.05, 0.95]", () => {
    expect(
      validateNode({ ...split, ratio: 1.2 }).ok,
      "ratio 1.2 must fail",
    ).toBe(false);
    expect(
      validateNode({ ...split, ratio: 0.01 }).ok,
      "ratio 0.01 must fail",
    ).toBe(false);
  });

  it("rejects a split with an invalid child (recursive)", () => {
    const badChild = { type: "tabs", id: "t2", activePage: "/x", pages: [] };
    expect(validateNode({ ...split, children: [page, badChild] }).ok).toBe(
      false,
    );
  });

  it("rejects tabs with duplicate pages", () => {
    expect(
      validateNode({ ...tabs, pages: ["/brain", "/brain"] }).ok,
    ).toBe(false);
  });

  it("rejects tabs with empty pages", () => {
    expect(validateNode({ ...tabs, pages: [] }).ok).toBe(false);
  });

  it("rejects tabs whose activePage is not in pages", () => {
    expect(
      validateNode({ ...tabs, activePage: "/settings" }).ok,
    ).toBe(false);
  });

  it("rejects a page node with an empty pageId", () => {
    expect(validateNode({ type: "page", id: "p2", pageId: "" }).ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateNode(null).ok).toBe(false);
    expect(validateNode("split").ok).toBe(false);
  });
});
