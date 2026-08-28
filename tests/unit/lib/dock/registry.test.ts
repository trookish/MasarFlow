import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { getPageDef, isKnownPage, PAGE_PATHS } from "@/lib/dock/registry";

describe("PAGE_PATHS", () => {
  it("covers every navigable route", () => {
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
    for (const href of hrefs) {
      expect(PAGE_PATHS, href).toContain(href);
    }
  });

  it("includes the brain children and the core pages", () => {
    for (const p of [
      "/dashboard",
      "/brain",
      "/brain/canvas",
      "/brain/templates",
      "/brain/graph",
      "/chat",
      "/tasks",
      "/specs",
      "/settings",
      "/knowledge",
    ]) {
      expect(PAGE_PATHS, p).toContain(p);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(PAGE_PATHS).size).toBe(PAGE_PATHS.length);
  });
});

describe("getPageDef", () => {
  it("returns label + icon for known pages", () => {
    const def = getPageDef("/brain");
    expect(def).not.toBeNull();
    expect(def?.label).toBe("Brain");
    expect(def?.icon).toBeDefined();
  });

  it("looks up by path, ignoring a query snapshot", () => {
    expect(getPageDef("/brain?note=abc")?.label).toBe("Brain");
  });

  it("returns null for unknown pages", () => {
    expect(getPageDef("/nope")).toBeNull();
    expect(getPageDef("")).toBeNull();
  });
});

describe("isKnownPage", () => {
  it("is true for nav routes and false for strangers", () => {
    expect(isKnownPage("/tasks")).toBe(true);
    expect(isKnownPage("/tasks?x=1")).toBe(true);
    expect(isKnownPage("/not-a-page")).toBe(false);
  });
});
