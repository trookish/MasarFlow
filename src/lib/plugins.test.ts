import { describe, it, expect } from "vitest";
import {
  PLUGIN_CATALOG,
  filterPlugins,
  defaultSettings,
} from "./plugins";

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
    const out = filterPlugins(PLUGIN_CATALOG, { category: "Sync" });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.category === "Sync")).toBe(true);
  });

  it("matches query against name, description, and capabilities", () => {
    expect(filterPlugins(PLUGIN_CATALOG, { query: "obsidian" })).toHaveLength(1);
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
    const obsidian = PLUGIN_CATALOG.find((p) => p.id === "obsidian-sync")!;
    expect(defaultSettings(obsidian)).toEqual({ vaultPath: "", autoSync: true });
  });

  it("returns an empty object for plugins without settings", () => {
    const wc = PLUGIN_CATALOG.find((p) => p.id === "word-count")!;
    expect(defaultSettings(wc)).toEqual({});
  });
});
