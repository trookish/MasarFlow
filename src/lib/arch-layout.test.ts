import { describe, it, expect } from "vitest";
import {
  layoutSystems,
  LAYER_HEIGHT,
  COLUMN_WIDTH,
  type LayoutSystem,
} from "./arch-layout";

describe("layoutSystems", () => {
  it("places dependency-free systems on the top layer", () => {
    const systems: LayoutSystem[] = [
      { id: "a", name: "Alpha", dependencies: [] },
      { id: "b", name: "Bravo", dependencies: [] },
    ];
    const pos = layoutSystems(systems);
    expect(pos.a.y).toBe(0);
    expect(pos.b.y).toBe(0);
    // Alphabetical ordering within the layer → distinct columns.
    expect(pos.a.x).toBe(0);
    expect(pos.b.x).toBe(COLUMN_WIDTH);
  });

  it("layers dependents below the things they depend on", () => {
    const systems: LayoutSystem[] = [
      { id: "core", name: "Core", dependencies: [] },
      { id: "ai", name: "AI", dependencies: ["core"] },
      { id: "boss", name: "Boss", dependencies: ["ai"] },
    ];
    const pos = layoutSystems(systems);
    expect(pos.core.y).toBe(0);
    expect(pos.ai.y).toBe(LAYER_HEIGHT);
    expect(pos.boss.y).toBe(2 * LAYER_HEIGHT);
  });

  it("uses the deepest dependency to determine a layer", () => {
    const systems: LayoutSystem[] = [
      { id: "a", name: "A", dependencies: [] },
      { id: "b", name: "B", dependencies: ["a"] },
      // c depends on both a (depth 0) and b (depth 1) → should sit at depth 2.
      { id: "c", name: "C", dependencies: ["a", "b"] },
    ];
    const pos = layoutSystems(systems);
    expect(pos.c.y).toBe(2 * LAYER_HEIGHT);
  });

  it("ignores dangling dependency ids", () => {
    const systems: LayoutSystem[] = [
      { id: "a", name: "A", dependencies: ["ghost"] },
    ];
    const pos = layoutSystems(systems);
    expect(pos.a).toEqual({ x: 0, y: 0 });
  });

  it("does not hang on dependency cycles", () => {
    const systems: LayoutSystem[] = [
      { id: "a", name: "A", dependencies: ["b"] },
      { id: "b", name: "B", dependencies: ["a"] },
    ];
    const pos = layoutSystems(systems);
    // Every system still gets a position.
    expect(Object.keys(pos).sort()).toEqual(["a", "b"]);
  });

  it("is deterministic regardless of input order", () => {
    const a: LayoutSystem = { id: "a", name: "Alpha", dependencies: [] };
    const b: LayoutSystem = { id: "b", name: "Bravo", dependencies: ["a"] };
    const c: LayoutSystem = { id: "c", name: "Charlie", dependencies: ["a"] };
    expect(layoutSystems([a, b, c])).toEqual(layoutSystems([c, b, a]));
  });
});
