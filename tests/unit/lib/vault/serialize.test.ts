import { describe, expect, it } from "vitest";
import type { Doc, Note } from "@/lib/db/schema";
import {
  RESERVED_KEYS,
  applyVaultDoc,
  parseVaultDoc,
  propsFromFields,
  serializeEntity,
} from "@/lib/vault/serialize";

const note = (over: Partial<Note> = {}): Note => ({
  id: "n1", projectId: "p1", type: "idea", title: "Auth design", body: "JWT everywhere",
  excerpt: "", tags: ["auth", "security"], folderId: null, createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_600_000, ...over,
});
const doc = (over: Partial<Doc> = {}): Doc => ({
  id: "d1", projectId: "p1", title: "Setup guide", slug: "setup-guide", category: "guides",
  body: "Step 1", sourceType: "manual", createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, ...over,
});

describe("serializeEntity (note)", () => {
  it("writes the frontmatter Obsidian can read", () => {
    expect(serializeEntity("note", note(), { projectSlug: "p1" })).toBe(
      [
        "---",
        "title: Auth design",
        "type: idea",
        "tags:",
        "  - auth",
        "  - security",
        "created: 2023-11-14T22:13:20.000Z",
        "updated: 2023-11-14T22:23:20.000Z",
        "msf_id: n1",
        "msf_kind: note",
        "msf_project: p1",
        "---",
        "",
        "JWT everywhere",
        "",
      ].join("\n"),
    );
  });

  it("keeps aliases and unknown properties", () => {
    const out = serializeEntity(
      "note",
      note({ props: { aliases: ["Auth"], cssclass: "wide", order: 2 } }),
      { projectSlug: "p1" },
    );
    expect(out).toContain("aliases:\n  - Auth\n");
    expect(out).toContain("cssclass: wide\n");
    expect(out).toContain("order: 2\n");
  });
});

describe("parseVaultDoc", () => {
  it("recovers kind, id, title, tags, props and body", () => {
    const parsed = parseVaultDoc(
      '---\ntitle: "Auth flow: v2"\nmsf_id: n9\nmsf_kind: note\ntags: [auth]\ncssclass: wide\n---\n\nBody text\n',
    );
    expect(parsed).toMatchObject({ kind: "note", id: "n9", title: "Auth flow: v2", tags: ["auth"], body: "Body text" });
    expect(parsed.props).toEqual({ cssclass: "wide" });
  });

  it("returns kind null when msf_kind is missing or unknown", () => {
    expect(parseVaultDoc("---\ntitle: T\n---\nx").kind).toBeNull();
    expect(parseVaultDoc("---\nmsf_kind: canvas\n---\nx").kind).toBeNull();
  });

  it("treats a foreign msf_kind/msf_id pair as data, never as truth by itself", () => {
    const parsed = parseVaultDoc("---\nmsf_kind: spec\nmsf_id: s1\n---\nx");
    expect(parsed.kind).toBe("spec");
    expect(parsed.id).toBe("s1");
  });
});

describe("propsFromFields / RESERVED_KEYS", () => {
  it("drops every reserved key and keeps the rest", () => {
    expect(propsFromFields({ title: "a", msf_id: "x", day: "2026-10-16", mine: "keep" })).toEqual({ mine: "keep" });
    expect(RESERVED_KEYS).toContain("title");
    expect(RESERVED_KEYS).toContain("msf_project");
  });
});

describe("applyVaultDoc", () => {
  it("maps a note file onto a note patch, ignoring an invalid type", () => {
    const patch = applyVaultDoc("note", parseVaultDoc("---\ntitle: New\ntype: bogus\ntags: [a, b]\naliases:\n  - N\n---\n\nBody"));
    if (patch.kind !== "note") throw new Error("wrong kind");
    expect(patch.patch).toEqual({ title: "New", body: "Body", tags: ["a", "b"], props: { aliases: ["N"] } });
  });

  it("maps a doc file onto a doc patch", () => {
    const patch = applyVaultDoc("doc", parseVaultDoc("---\ntitle: Doc\ncategory: api\nmine: 1\n---\n\nBody"));
    if (patch.kind !== "doc") throw new Error("wrong kind");
    expect(patch.patch).toEqual({ title: "Doc", body: "Body", category: "api", props: { mine: 1 } });
  });

  it("round-trips a note and a doc through serialize -> parse -> apply", () => {
    const n = note({ props: { cssclass: "wide" } });
    const back = applyVaultDoc("note", parseVaultDoc(serializeEntity("note", n, { projectSlug: "p1" })));
    if (back.kind !== "note") throw new Error("wrong kind");
    expect(back.patch).toEqual({
      title: n.title, body: n.body, type: n.type, tags: n.tags, props: { cssclass: "wide" },
    });

    const d = doc();
    const dback = applyVaultDoc("doc", parseVaultDoc(serializeEntity("doc", d, { projectSlug: "p1" })));
    if (dback.kind !== "doc") throw new Error("wrong kind");
    expect(dback.patch).toEqual({ title: d.title, body: d.body, category: d.category, props: {} });
  });
});
