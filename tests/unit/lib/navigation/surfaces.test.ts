import { describe, it, expect } from "vitest";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { SURFACES, surfaceForPath, locate, isPageLocation, pageUrl } from "@/lib/navigation/surfaces";
import { LEGACY_REDIRECTS, resolveLegacyUrl } from "@/lib/navigation/redirects";

describe("surfaces", () => {
  it("has exactly six surfaces", () => {
    expect(SURFACES.map((s) => s.label)).toEqual(["Today", "Capture", "Work", "Library", "AI", "System"]);
  });

  it("every legacy nav destination maps to exactly one surface section", () => {
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
  it("every legacy route except /today is a source", () => {
    const sources = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    for (const item of ALL_NAV_ITEMS) if (item.href !== "/today") expect(sources.has(item.href), item.href).toBe(true);
  });

  it("no destination is itself a source (no chains)", () => {
    const sources = new Set(LEGACY_REDIRECTS.map((r) => r.source));
    for (const r of LEGACY_REDIRECTS) expect(sources.has(r.destination.split("?")[0]), r.destination).toBe(false);
  });

  it("keeps deep-link query parameters", () => {
    expect(resolveLegacyUrl("/tasks")).toBe("/work");
    expect(resolveLegacyUrl("/chat", "?thread=t1")).toBe("/ai?thread=t1");
    expect(resolveLegacyUrl("/knowledge", "?categories=a")).toBe("/library?view=graph&categories=a");
    expect(resolveLegacyUrl("/today")).toBeNull();
  });

  it("the renamed /ask surface lands on /ai and keeps its section", () => {
    expect(resolveLegacyUrl("/ask")).toBe("/ai");
    expect(resolveLegacyUrl("/ask/")).toBe("/ai");
    expect(resolveLegacyUrl("/ask", "?view=agents")).toBe("/ai?view=agents");
    expect(resolveLegacyUrl("/ask", "view=workflow&run=r1")).toBe("/ai?view=workflow&run=r1");
    expect(resolveLegacyUrl("/ai")).toBeNull();
    expect(LEGACY_REDIRECTS).toContainEqual({ source: "/ask", destination: "/ai" });
  });
});

describe("isPageLocation / pageUrl (pages hosted as surface sections)", () => {
  it("a page is shown by its legacy URL and by its surface section", () => {
    expect(isPageLocation("/specs", "/specs")).toBe(true);
    expect(isPageLocation("/specs", "/work", "view=specs&spec=s1")).toBe(true);
    expect(isPageLocation("/specs", "/work", "?view=specs")).toBe(true);
  });

  it("a surface URL without view shows its first section only", () => {
    expect(isPageLocation("/tasks", "/work")).toBe(true);
    expect(isPageLocation("/tasks", "/work", "task=t1")).toBe(true);
    expect(isPageLocation("/specs", "/work")).toBe(false);
    expect(isPageLocation("/brain", "/capture", "note=n1")).toBe(true);
  });

  it("another section or surface is not this page", () => {
    expect(isPageLocation("/specs", "/work", "view=sprints")).toBe(false);
    expect(isPageLocation("/specs", "/library", "view=specs")).toBe(false);
    expect(isPageLocation("/sprints", "/tasks")).toBe(false);
  });

  it("pageUrl writes the canonical surface URL and keeps the query", () => {
    expect(pageUrl("/specs", "spec=s1")).toBe("/work?view=specs&spec=s1");
    expect(pageUrl("/tasks", "task=t1")).toBe("/work?task=t1");
    expect(pageUrl("/brain", "?note=n1")).toBe("/capture?note=n1");
    expect(pageUrl("/specs")).toBe("/work?view=specs");
    expect(pageUrl("/not-a-page", "a=1")).toBe("/not-a-page?a=1");
  });
});
