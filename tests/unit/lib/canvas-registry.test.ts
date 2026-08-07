import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCanvasCardType,
  unregisterCanvasCardType,
  customCardTypes,
  getCardType,
  getCardTypeByDbType,
  resolveNodeTypes,
  resolveRfType,
  clearRegistry,
  registerBuiltIns,
  BUILT_IN_RF_TYPES,
} from "@/lib/canvas-registry";
import { planMindMap, planSummaryCard, type CanvasNodeSummary } from "@/lib/canvas-ai";

beforeEach(() => {
  clearRegistry();
  registerBuiltIns({
    textNode: {
      rfType: "textNode",
      dbType: "text",
      label: "Text card",
      icon: "type",
      component: (() => null) as never,
      defaultSize: { width: 280, height: 160 },
    },
  });
});

describe("canvas-registry", () => {
  it("registers and retrieves a custom card type", () => {
    registerCanvasCardType({
      rfType: "kanbanCard",
      dbType: "kanban",
      label: "Kanban card",
      icon: "kanban",
      component: (() => null) as never,
      defaultProps: { columns: [] },
      defaultSize: { width: 320, height: 400 },
    });
    const def = getCardType("kanbanCard");
    expect(def).toBeDefined();
    expect(def?.label).toBe("Kanban card");
    expect(def?.dbType).toBe("kanban");
  });

  it("lists only custom types (not built-ins)", () => {
    registerCanvasCardType({
      rfType: "mermaidCard",
      dbType: "mermaid",
      label: "Mermaid",
      icon: "network",
      component: (() => null) as never,
    });
    const customs = customCardTypes();
    expect(customs).toHaveLength(1);
    expect(customs[0].rfType).toBe("mermaidCard");
  });

  it("looks up a type by its DB type", () => {
    registerCanvasCardType({
      rfType: "timelineCard",
      dbType: "timeline",
      label: "Timeline",
      icon: "clock",
      component: (() => null) as never,
    });
    const def = getCardTypeByDbType("timeline");
    expect(def).toBeDefined();
    expect(def?.rfType).toBe("timelineCard");
  });

  it("throws when registering a reserved built-in type", () => {
    expect(() =>
      registerCanvasCardType({
        rfType: "textNode",
        dbType: "custom",
        label: "Override",
        icon: "x",
        component: (() => null) as never,
      }),
    ).toThrow(/reserved/);
  });

  it("throws when registering a duplicate rfType", () => {
    registerCanvasCardType({
      rfType: "kanbanCard",
      dbType: "kanban",
      label: "Kanban",
      icon: "kanban",
      component: (() => null) as never,
    });
    expect(() =>
      registerCanvasCardType({
        rfType: "kanbanCard",
        dbType: "other",
        label: "Duplicate",
        icon: "x",
        component: (() => null) as never,
      }),
    ).toThrow(/already exists/);
  });

  it("unregisters a custom type", () => {
    registerCanvasCardType({
      rfType: "tempCard",
      dbType: "temp",
      label: "Temp",
      icon: "x",
      component: (() => null) as never,
    });
    expect(getCardType("tempCard")).toBeDefined();
    unregisterCanvasCardType("tempCard");
    expect(getCardType("tempCard")).toBeUndefined();
  });

  it("resolveNodeTypes merges built-ins with customs", () => {
    registerCanvasCardType({
      rfType: "kanbanCard",
      dbType: "kanban",
      label: "Kanban",
      icon: "kanban",
      component: (() => null) as never,
    });
    const builtIns = { textNode: (() => null) as never };
    const merged = resolveNodeTypes(builtIns);
    expect(merged.textNode).toBeDefined();
    expect(merged.kanbanCard).toBeDefined();
  });

  it("resolveRfType finds custom db types", () => {
    registerCanvasCardType({
      rfType: "mermaidCard",
      dbType: "mermaid",
      label: "Mermaid",
      icon: "network",
      component: (() => null) as never,
    });
    expect(resolveRfType("mermaid", { text: "textNode" })).toBe("mermaidCard");
    // Falls back to built-in
    expect(resolveRfType("text", { text: "textNode" })).toBe("textNode");
    // Falls back to textNode for unknown
    expect(resolveRfType("nonexistent", { text: "textNode" })).toBe("textNode");
  });

  it("BUILT_IN_RF_TYPES lists all 5 reserved types", () => {
    expect(BUILT_IN_RF_TYPES).toHaveLength(5);
    expect(BUILT_IN_RF_TYPES).toContain("textNode");
    expect(BUILT_IN_RF_TYPES).toContain("noteNode");
  });
});

describe("canvas-ai", () => {
  it("planMindMap creates a root + radial branches", () => {
    const ops = planMindMap("Central idea", ["Branch A", "Branch B", "Branch C"]);
    expect(ops).toHaveLength(4);
    expect(ops[0].text).toBe("Central idea");
    expect(ops[0].pos).toEqual({ x: 0, y: 0 });
    // Branches are arranged radially (at least one is off the origin)
    const anyNonZero = ops.slice(1).some((op) => op.pos.x !== 0 || op.pos.y !== 0);
    expect(anyNonZero).toBe(true);
  });

  it("planSummaryCard aggregates node titles", () => {
    const nodes: CanvasNodeSummary[] = [
      { id: "n1", type: "text", title: "Idea A", position: { x: 0, y: 0 } },
      { id: "n2", type: "text", title: "Idea B", position: { x: 100, y: 0 } },
    ];
    const summary = planSummaryCard(nodes);
    expect(summary).toContain("Idea A");
    expect(summary).toContain("Idea B");
    expect(summary).toContain("2 cards summarized");
  });
});
