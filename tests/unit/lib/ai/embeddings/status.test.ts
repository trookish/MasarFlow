import { describe, expect, it } from "vitest";
import { searchStatus } from "@/lib/ai/embeddings/status";

describe("searchStatus", () => {
  it("never calls keyword results semantic", () => {
    const s = searchStatus({
      embedder: "loading",
      mode: "semantic",
      semanticAnswered: false,
    });
    expect(s).toEqual({
      index: "Semantic model loading",
      results: "Keyword results",
      fallback: true,
    });
  });

  it("shows index progress while building", () => {
    const s = searchStatus({
      embedder: "ready",
      mode: "hybrid",
      progress: { done: 64, total: 200 },
      semanticAnswered: true,
    });
    expect(s.index).toBe("Semantic index building (64 of 200)");
    expect(s.results).toBe("Semantic and keyword results");
  });

  it("reports ready, unavailable and plain keyword modes", () => {
    expect(
      searchStatus({
        embedder: "ready",
        mode: "semantic",
        progress: { done: 5, total: 5 },
        semanticAnswered: true,
      }).index,
    ).toBe("Semantic index ready");
    expect(
      searchStatus({
        embedder: "error",
        mode: "semantic",
        semanticAnswered: false,
      }).index,
    ).toBe("Semantic index unavailable");
    expect(
      searchStatus({
        embedder: "error",
        mode: "keyword",
        semanticAnswered: false,
      }),
    ).toMatchObject({ results: "Keyword results", fallback: false });
  });
});
