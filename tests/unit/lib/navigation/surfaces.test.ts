import { describe, it, expect } from "vitest";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { SURFACES, surfaceForPath, locate } from "@/lib/navigation/surfaces";
import { LEGACY_REDIRECTS, resolveLegacyUrl } from "@/lib/navigation/redirects";

describe("surfaces", () => {
  it("has exactly six surfaces", () => {
    expect(SURFACES.map((s) => s.label)).toEqual(["Today", "Capture", "Work", "Library", "Ask", "System"]);
  });

  it("every v0.2 nav destination maps to exactly one surface section", () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(locate(item.href), item.href).not.toBeNull();
      const owners = SURFACES.filter((s) => s.sections.some((x) => x.href === item.href));
      expect(owners.length, item.href).toBeLessThanOrEqual(1);
    }
  });

  it("resolves sub-paths and aliases", () => {
    expect(surfaceForPath("/brain/graph")).toBe("library");
    expect(surfaceForPath("/brain/canvas")).toBe("capture");
    expect(surfaceForPath("/tools/terminal")).toBe("system");
    expect(surfaceForPath("/work")).toBe("work");
    expect(surfaceForPath("/nowhere")).toBeNull();
  });
});

describe("legacy redirects", () => {
  it("every v0.2 route except /today is a source", () => {
    const sources = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    for (const item of ALL_NAV_ITEMS) if (item.href !== "/today") expect(sources.has(item.href), item.href).toBe(true);
  });

  it("no destination is itself a source (no chains)", () => {
    const sources = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    for (const r of LEGACY_REDIRECTS) expect(sources.has(r.destination.split("?")[0]), r.destination).toBe(false);
  });

  it("keeps deep-link query parameters", () => {
    expect(resolveLegacyUrl("/tasks")).toBe("/work");
    expect(resolveLegacyUrl("/chat", "?thread=t1")).toBe("/ask?thread=t1");
    expect(resolveLegacyUrl("/knowledge", "?categories=a")).toBe("/library?view=graph&categories=a");
    expect(resolveLegacyUrl("/today")).toBeNull();
  });
});
