import { describe, it, expect } from "vitest";
import {
  ENTITY_KINDS,
  KIND_META,
  entityHref,
  entityUri,
  isEntityKind,
  parseEntityUri,
  refFromUrl,
} from "@/lib/entities/registry";
import { PAGE_PATHS } from "@/lib/dock/registry";

describe("entityHref", () => {
  it("selects the entity on the page that shows it", () => {
    expect(entityHref({ kind: "note", id: "n1" })).toBe("/brain?note=n1");
    expect(entityHref({ kind: "canvas", id: "c1" })).toBe("/brain/canvas?canvas=c1");
    expect(entityHref({ kind: "system", id: "s1" })).toBe("/architecture?system=s1");
    expect(entityHref({ kind: "thread", id: "t1" })).toBe("/chat?thread=t1");
  });
  it("encodes ids", () => {
    expect(entityHref({ kind: "task", id: "a b&c" })).toBe("/tasks?task=a%20b%26c");
  });
  it("kinds without a selection param open their page bare", () => {
    expect(entityHref({ kind: "commit", id: "x" })).toBe("/dashboard");
    expect(entityHref({ kind: "memory", id: "x" })).toBe("/dashboard");
    expect(entityHref({ kind: "archNode", id: "x" })).toBe("/architecture");
  });
});

describe("refFromUrl", () => {
  it("round-trips every kind that has a param", () => {
    for (const kind of ENTITY_KINDS) {
      if (!KIND_META[kind].param) continue;
      const [path, query = ""] = entityHref({ kind, id: "id 1" }).split("?");
      expect(refFromUrl(path, query)).toEqual({ kind, id: "id 1" });
    }
  });
  it("returns null when nothing is selected", () => {
    expect(refFromUrl("/tasks", "")).toBeNull();
    expect(refFromUrl("/tasks", "task=")).toBeNull(); // explicit-empty = cleared (see A5)
    expect(refFromUrl("/dashboard", "task=abc")).toBeNull(); // param on the wrong page
  });
});

describe("entity uris", () => {
  it("round-trips", () => {
    const ref = { kind: "spec", id: "a/b c" } as const;
    expect(entityUri(ref)).toBe("entity:spec/a%2Fb%20c");
    expect(parseEntityUri(entityUri(ref))).toEqual(ref);
  });
  it("rejects unknown kinds and malformed input", () => {
    expect(parseEntityUri("entity:bogus/1")).toBeNull();
    expect(parseEntityUri("https://x.dev")).toBeNull();
    expect(parseEntityUri("entity:note/%E0%A4%A")).toBeNull();
  });
  it("isEntityKind narrows", () => {
    expect(isEntityKind("note")).toBe(true);
    expect(isEntityKind("nope")).toBe(false);
  });
});

describe("registry integrity", () => {
  it("every route is a real dock page", () => {
    for (const kind of ENTITY_KINDS) {
      expect(PAGE_PATHS, kind).toContain(KIND_META[kind].route);
    }
  });
  it("no two kinds claim the same route + param", () => {
    const seen = new Set<string>();
    for (const kind of ENTITY_KINDS) {
      const { route, param } = KIND_META[kind];
      if (!param) continue;
      const key = `${route}?${param}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});
