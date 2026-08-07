import { describe, it, expect } from "vitest";
import {
  extractWikilinks,
  extractWikilinkTargets,
  makeExcerpt,
  stripMarkdown,
} from "@/lib/utils/markdown";

describe("extractWikilinks", () => {
  it("parses plain and aliased links and dedupes case-insensitively", () => {
    const md =
      "See [[Combat System]] and [[combat system]] plus [[Enemy AI|the AI]].";
    expect(extractWikilinks(md)).toEqual([
      { target: "Combat System", alias: null },
      { target: "Enemy AI", alias: "the AI" },
    ]);
  });

  it("ignores empty brackets and trims whitespace", () => {
    expect(extractWikilinks("[[ ]] and [[  Spaced Title  ]]")).toEqual([
      { target: "Spaced Title", alias: null },
    ]);
  });

  it("returns just the targets via extractWikilinkTargets", () => {
    expect(extractWikilinkTargets("[[A]] [[B|b]] [[A]]")).toEqual(["A", "B"]);
  });
});

describe("stripMarkdown", () => {
  it("removes headings, links, and code, collapsing whitespace", () => {
    const md = "# Title\n\nSome `code` and [a link](http://x) and **bold**.";
    expect(stripMarkdown(md)).toBe("Title Some and a link and bold.");
  });

  it("renders wikilinks as their alias or target", () => {
    expect(stripMarkdown("Go to [[Target|Alias]] and [[Plain]]")).toBe(
      "Go to Alias and Plain",
    );
  });
});

describe("makeExcerpt", () => {
  it("returns short text unchanged", () => {
    expect(makeExcerpt("# Hi\n\nshort body")).toBe("Hi short body");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "word ".repeat(80);
    const excerpt = makeExcerpt(long, 40);
    expect(excerpt.length).toBeLessThanOrEqual(41);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
