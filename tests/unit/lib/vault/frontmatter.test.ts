import { describe, expect, it } from "vitest";
import {
  asList,
  asString,
  parseFrontmatter,
  stringifyFrontmatter,
  yamlScalar,
} from "@/lib/vault/frontmatter";

describe("parseFrontmatter", () => {
  it("parses scalars, numbers and booleans", () => {
    const { fields, body } = parseFrontmatter(
      "---\ntitle: Auth design\nprogress: 40\ndone: true\n---\n\nThe body",
    );
    expect(fields).toEqual({ title: "Auth design", progress: 40, done: true });
    expect(body).toBe("The body");
  });

  it("reads the legacy comma form, inline lists and block lists as the same list", () => {
    expect(parseFrontmatter("---\ntags: auth, security\n---\nx").fields.tags).toEqual(["auth", "security"]);
    expect(parseFrontmatter("---\ntags: [auth, security]\n---\nx").fields.tags).toEqual(["auth", "security"]);
    expect(parseFrontmatter("---\ntags:\n  - auth\n  - security\n---\nx").fields.tags).toEqual(["auth", "security"]);
    expect(parseFrontmatter("---\ntags: auth\n---\nx").fields.tags).toEqual(["auth"]);
    expect(parseFrontmatter("---\naliases:\n  - Auth\n---\nx").fields.aliases).toEqual(["Auth"]);
  });

  it("keeps unknown keys and tolerates junk lines", () => {
    const { fields } = parseFrontmatter("---\nnot: : valid\ncssclass: wide\n: empty key\nno separator\n---\nx");
    expect(fields.not).toBe(": valid");
    expect(fields.cssclass).toBe("wide");
    expect(Object.keys(fields)).toEqual(["not", "cssclass"]);
  });

  it("treats a document without a closing fence as body-only", () => {
    expect(parseFrontmatter("---\ntitle: A\nbody").fields).toEqual({});
    expect(parseFrontmatter("# hello").body).toBe("# hello");
    expect(parseFrontmatter("---\r\ntitle: A\r\n---\r\nbody").fields.title).toBe("A");
  });
});

describe("stringifyFrontmatter", () => {
  it("writes YAML lists for list values and quotes risky scalars", () => {
    expect(stringifyFrontmatter({ title: "RFC-001: auth", tags: ["a", "b"] }, "Body")).toBe(
      '---\ntitle: "RFC-001: auth"\ntags:\n  - a\n  - b\n---\n\nBody\n',
    );
  });

  it("keeps an explicit empty string and drops empty lists / undefined", () => {
    expect(stringifyFrontmatter({ subtitle: "" }, "b")).toBe('---\nsubtitle: ""\n---\n\nb\n');
    expect(stringifyFrontmatter({ aliases: [], note: undefined, title: "T" }, "b")).toBe(
      "---\ntitle: T\n---\n\nb\n",
    );
  });

  it("round-trips every value kind", () => {
    const fields = { title: "Auth design", tags: ["a", "b"], progress: 40, done: true, blank: "" };
    expect(parseFrontmatter(stringifyFrontmatter(fields, "x")).fields).toEqual(fields);
  });
});

describe("yamlScalar", () => {
  it("quotes only what YAML would misread", () => {
    expect(yamlScalar("plain")).toBe("plain");
    expect(yamlScalar("Auth design")).toBe("Auth design");
    expect(yamlScalar("true")).toBe('"true"');
    expect(yamlScalar("42")).toBe('"42"');
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar("# not a comment")).toBe('"# not a comment"');
    expect(yamlScalar(7)).toBe("7");
    expect(yamlScalar(true)).toBe("true");
  });
});

describe("asString / asList", () => {
  it("normalises both shapes", () => {
    expect(asString(["a", "b"])).toBe("a, b");
    expect(asString(undefined, "fallback")).toBe("fallback");
    expect(asList("auth, security")).toEqual(["auth", "security"]);
    expect(asList(["auth"])).toEqual(["auth"]);
    expect(asList(undefined)).toEqual([]);
  });
});
