import { describe, it, expect } from "vitest";
import { inferFileType, matchSystemByPath } from "@/lib/watcher";

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

describe("matchSystemByPath", () => {
  const systems = [
    { id: "1", name: "Combat Core" },
    { id: "2", name: "Input System" },
    { id: "3", name: "Telemetry" },
  ];

  it("matches when every word of the name appears in the path", () => {
    expect(matchSystemByPath("src/combat/core/Damage.cs", systems)?.id).toBe("1");
    expect(matchSystemByPath("src/input/system/Keys.ts", systems)?.id).toBe("2");
  });

  it("matches compact CamelCase / kebab-case forms", () => {
    expect(matchSystemByPath("src/CombatCore.cs", systems)?.id).toBe("1");
    expect(matchSystemByPath("lib/combat-core/resolver.ts", systems)?.id).toBe("1");
  });

  it("is case-insensitive", () => {
    expect(matchSystemByPath("SRC/TELEMETRY/log.ts", systems)?.id).toBe("3");
  });

  it("returns null when nothing matches", () => {
    expect(matchSystemByPath("assets/textures/hero.png", systems)).toBeNull();
  });

  it("prefers the most specific (longest) matching name", () => {
    const overlapping = [
      { id: "a", name: "Core" },
      { id: "b", name: "Combat Core" },
    ];
    expect(matchSystemByPath("src/combat/core/x.cs", overlapping)?.id).toBe("b");
  });
});
