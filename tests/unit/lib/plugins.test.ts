import { describe, it, expect } from "vitest";
import {
  PLUGIN_CATALOG,
  filterPlugins,
  defaultSettings,
} from "@/lib/plugins";

describe("PLUGIN_CATALOG", () => {
  it("has unique plugin ids", () => {
    const ids = PLUGIN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("filterPlugins", () => {
  it("returns the whole catalog with no filters", () => {
    expect(filterPlugins(PLUGIN_CATALOG, {})).toHaveLength(
      PLUGIN_CATALOG.length,
    );
  });

  it("filters by category", () => {
    const out = filterPlugins(PLUGIN_CATALOG, { category: "Editor" });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.category === "Editor")).toBe(true);
  });

  it("matches query against name, description, and capabilities", () => {
    expect(filterPlugins(PLUGIN_CATALOG, { query: "mermaid" })).toHaveLength(1);
    // "writing" is a capability shared by spell-check + word-count.
    const writing = filterPlugins(PLUGIN_CATALOG, { query: "writing" });
    expect(writing.map((p) => p.id).sort()).toEqual(["spell-check", "word-count"]);
  });

  it("restricts to installed plugins when installedOnly is set", () => {
    const installedIds = new Set(["pomodoro"]);
    const out = filterPlugins(PLUGIN_CATALOG, {
      installedOnly: true,
      installedIds,
    });
    expect(out.map((p) => p.id)).toEqual(["pomodoro"]);
  });
});

describe("defaultSettings", () => {
  it("builds defaults from a plugin's setting fields", () => {
    // obsidian-sync was deleted in P9 (its capability shipped as core in /sync);
    // pomodoro carries the same single-text-field-default shape.
    const pomodoro = PLUGIN_CATALOG.find((p) => p.id === "pomodoro")!;
    expect(defaultSettings(pomodoro)).toEqual({ minutes: "25" });
  });

  it("returns an empty object for plugins without settings", () => {
    const wc = PLUGIN_CATALOG.find((p) => p.id === "word-count")!;
    expect(defaultSettings(wc)).toEqual({});
  });
});
