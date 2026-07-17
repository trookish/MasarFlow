import { describe, it, expect } from "vitest";
import {
  detectTrigger,
  pageToken,
  recordToken,
  stripMentionToken,
  firstPlaceholderRange,
  SLASH_COMMANDS,
} from "./mentions";

describe("detectTrigger", () => {
  it("detects a slash at the start", () => {
    expect(detectTrigger("/create", 7)).toEqual({
      kind: "slash",
      query: "create",
      start: 0,
      end: 7,
    });
  });

  it("detects @ after a space", () => {
    expect(detectTrigger("hi @br", 6)).toEqual({
      kind: "page",
      query: "br",
      start: 3,
      end: 6,
    });
  });

  it("detects # at the start with empty query", () => {
    expect(detectTrigger("#", 1)).toEqual({
      kind: "record",
      query: "",
      start: 0,
      end: 1,
    });
  });

  it("returns null when trigger is preceded by a non-space char (URL/email)", () => {
    expect(detectTrigger("https://x", 9)).toBeNull();
    expect(detectTrigger("a@b", 3)).toBeNull();
  });

  it("returns null when whitespace is hit before any trigger", () => {
    expect(detectTrigger("hello world", 11)).toBeNull();
  });

  it("returns null for an empty query with preceding space only (caret < 1)", () => {
    expect(detectTrigger("", 0)).toBeNull();
  });

  it("closes the menu once a space follows the query", () => {
    // caret after the space: walking back hits the space immediately
    expect(detectTrigger("@brain ", 7)).toBeNull();
  });
});

describe("tokens", () => {
  it("builds a page token", () => {
    expect(pageToken("Brain")).toBe("@Brain");
  });

  it("builds a record token", () => {
    expect(recordToken("note", "Project goals")).toBe("#Note: Project goals");
  });
});

describe("stripMentionToken", () => {
  it("removes the token and a single trailing space", () => {
    expect(stripMentionToken("hello @Brain world", "@Brain")).toBe(
      "hello world",
    );
  });

  it("removes the token with no trailing space", () => {
    expect(stripMentionToken("@Brainworld", "@Brain")).toBe("world");
  });

  it("is a no-op when the token is absent", () => {
    expect(stripMentionToken("nothing here", "@Brain")).toBe("nothing here");
  });
});

describe("firstPlaceholderRange", () => {
  it("finds the first __ placeholder", () => {
    expect(firstPlaceholderRange('Create a note titled "__" with body __')).toEqual(
      { start: 22, end: 24 },
    );
  });

  it("returns null when there is no placeholder", () => {
    expect(firstPlaceholderRange("Summarize the workspace.")).toBeNull();
  });
});

describe("SLASH_COMMANDS", () => {
  it("has unique ids", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every command has non-empty insert text", () => {
    for (const c of SLASH_COMMANDS) {
      expect(c.insert.trim().length).toBeGreaterThan(0);
    }
  });
});
