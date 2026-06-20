import { describe, it, expect } from "vitest";
import { inferFileType, pickChange, SIMULATED_CHANGES } from "./watcher";

describe("inferFileType", () => {
  it("classifies by extension", () => {
    expect(inferFileType("src/combat/CombatCore.cs")).toBe("code");
    expect(inferFileType("assets/hero.png")).toBe("asset");
    expect(inferFileType("scenes/Arena.scene")).toBe("scene");
    expect(inferFileType("shaders/Dissolve.shader")).toBe("shader");
    expect(inferFileType("config/balance.json")).toBe("config");
    expect(inferFileType("docs/changelog.md")).toBe("doc");
  });

  it("is case-insensitive on the extension", () => {
    expect(inferFileType("Assets/Hero.PNG")).toBe("asset");
  });

  it("falls back to other for unknown or extensionless paths", () => {
    expect(inferFileType("Makefile")).toBe("other");
    expect(inferFileType("data.qwerty")).toBe("other");
    expect(inferFileType(".gitignore")).toBe("other");
  });
});

describe("pickChange", () => {
  it("is deterministic given a fixed rng", () => {
    const a = pickChange(() => 0);
    expect(a.path).toBe(SIMULATED_CHANGES[0].path);
    expect(a.kind).toBe("modified");
    expect(a.fileType).toBe("code");
    expect(a.systemHint).toBe("Input System");
  });

  it("derives fileType from the chosen path", () => {
    // rng just below 1 selects the last entries.
    const c = pickChange(() => 0.99);
    const tpl = SIMULATED_CHANGES[SIMULATED_CHANGES.length - 1];
    expect(c.path).toBe(tpl.path);
    expect(c.fileType).toBe("doc");
  });
});
