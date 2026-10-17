import { describe, expect, it } from "vitest";
import {
  PROP_BLOCKLIST, addPropRow, fromPropRows, parsePropInput, propKind,
  removePropRow, renamePropRow, setPropValue, toPropRows,
} from "@/lib/vault/props";

describe("propKind", () => {
  it("infers the kind from the value shape", () => {
    expect(propKind("x")).toBe("text");
    expect(propKind(3)).toBe("number");
    expect(propKind(false)).toBe("boolean");
    expect(propKind(["a"])).toBe("list");
  });
});

describe("toPropRows / fromPropRows", () => {
  it("hides file-level keys but keeps aliases editable", () => {
    const rows = toPropRows({ aliases: ["Auth"], cssclass: "wide", title: "nope", msf_id: "n1", status: "x" });
    expect(rows.map((r) => [r.key, r.kind])).toEqual([["aliases", "list"], ["cssclass", "text"]]);
    expect(PROP_BLOCKLIST.has("title")).toBe(true);
    expect(PROP_BLOCKLIST.has("aliases")).toBe(false);
  });

  it("drops blank and blocked rows on save and round-trips the rest", () => {
    const props = { aliases: ["Auth"], cssclass: "wide", priority: 2 };
    expect(fromPropRows(toPropRows(props))).toEqual(props);
    expect(fromPropRows([{ key: "  ", value: "x", kind: "text" }, { key: "title", value: "x", kind: "text" }])).toEqual({});
    expect(fromPropRows([{ key: "empty", value: "", kind: "text" }, { key: "none", value: [], kind: "list" }])).toEqual({});
  });
});

describe("parsePropInput", () => {
  it("parses per kind and falls back to text", () => {
    expect(parsePropInput("42", "number")).toBe(42);
    expect(parsePropInput("nope", "number")).toBe("nope");
    expect(parsePropInput("true", "boolean")).toBe(true);
    expect(parsePropInput("false", "boolean")).toBe(false);
    expect(parsePropInput("a, b ,c", "list")).toEqual(["a", "b", "c"]);
    expect(parsePropInput(" wide ", "text")).toBe("wide");
  });
});

describe("row edits", () => {
  it("adds, renames, removes and re-parses a value", () => {
    let rows = addPropRow([]);
    expect(rows).toHaveLength(1);
    rows = addPropRow(rows, "aliases");
    rows = renamePropRow(rows, 0, "cssclass");
    expect(rows[0].key).toBe("cssclass");
    rows = setPropValue(rows, 0, "wide");
    expect(rows[0]).toMatchObject({ key: "cssclass", value: "wide", kind: "text" });
    rows = setPropValue(rows, 1, "Auth, Login");
    expect(rows[1]).toMatchObject({ key: "aliases", value: ["Auth", "Login"], kind: "list" });
    expect(removePropRow(rows, 0).map((r) => r.key)).toEqual(["aliases"]);
  });
});
