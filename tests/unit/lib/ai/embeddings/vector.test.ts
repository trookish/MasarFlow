import { describe, it, expect } from "vitest";
import { cosine, topK } from "@/lib/ai/embeddings/vector";

const v = (...n: number[]) => new Float32Array(n);

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal, -1 for opposite, 0 for zero vectors", () => {
    expect(cosine(v(1, 2, 3), v(1, 2, 3))).toBeCloseTo(1, 5);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0, 5);
    expect(cosine(v(1, 0), v(-1, 0))).toBeCloseTo(-1, 5);
    expect(cosine(v(0, 0), v(1, 1))).toBe(0);
  });
  it("throws on a dimension mismatch", () => {
    expect(() => cosine(v(1, 2), v(1))).toThrow(/dimension/i);
  });
});

describe("topK", () => {
  const rows = [
    { id: "a", vector: v(1, 0) },
    { id: "b", vector: v(0.9, 0.1) },
    { id: "c", vector: v(0, 1) },
  ];
  it("returns the best rows in order, honouring k and minScore", () => {
    expect(topK(v(1, 0), rows, 2, 0).map((r) => r.row.id)).toEqual(["a", "b"]);
    expect(topK(v(1, 0), rows, 10, 0.5).map((r) => r.row.id)).toEqual(["a", "b"]);
    expect(topK(v(1, 0), rows, 0, 0)).toEqual([]);
  });
});
