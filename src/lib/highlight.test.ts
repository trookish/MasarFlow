import { describe, it, expect } from "vitest";
import { highlightSegments, snippetAround } from "./highlight";

describe("highlightSegments", () => {
  it("splits text around a single match", () => {
    expect(highlightSegments("hello world", [[6, 10]])).toEqual([
      { text: "hello ", hit: false },
      { text: "world", hit: true },
    ]);
  });

  it("handles a match at the very start", () => {
    expect(highlightSegments("abcdef", [[0, 2]])).toEqual([
      { text: "abc", hit: true },
      { text: "def", hit: false },
    ]);
  });

  it("merges overlapping and adjacent ranges", () => {
    const segs = highlightSegments("abcdef", [
      [0, 1],
      [2, 3],
      [1, 2],
    ]);
    expect(segs).toEqual([
      { text: "abcd", hit: true },
      { text: "ef", hit: false },
    ]);
  });

  it("returns a single unmatched segment when there are no ranges", () => {
    expect(highlightSegments("plain", [])).toEqual([
      { text: "plain", hit: false },
    ]);
  });

  it("is total — empty text yields no segments", () => {
    expect(highlightSegments("", [[0, 5]])).toEqual([]);
  });

  it("clamps out-of-bounds ranges", () => {
    expect(highlightSegments("hi", [[0, 99]])).toEqual([
      { text: "hi", hit: true },
    ]);
  });
});

describe("snippetAround", () => {
  it("windows long text around the first match with ellipses", () => {
    const text = "x".repeat(100) + "TARGET" + "y".repeat(100);
    const { text: snip, ranges } = snippetAround(text, [[100, 105]], 10);
    expect(snip.startsWith("…")).toBe(true);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip).toContain("TARGET");
    // The rebased range still points at TARGET within the snippet.
    const [a, b] = ranges[0];
    expect(snip.slice(a, b + 1)).toBe("TARGET");
  });

  it("returns a leading slice when there are no matches", () => {
    expect(snippetAround("short body", [], 60).text).toBe("short body");
  });
});
