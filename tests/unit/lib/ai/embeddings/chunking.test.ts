import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/ai/embeddings/chunking";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
  it("keeps short text as a single chunk", () => {
    const text = "Just a short note about the login flow.";
    expect(chunkText(text, 1000)).toEqual([text]);
  });
  it("packs paragraphs until the budget is hit", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i}. ${"word ".repeat(20)}`);
    const chunks = chunkText(paragraphs.join("\n\n"), 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < 6; i++) expect(chunks.some((c) => c.includes(`Paragraph ${i}.`))).toBe(true);
  });
  it("hard-splits an oversized paragraph with overlap", () => {
    const chunks = chunkText("x".repeat(500), 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i - 1].slice(-50)).toBe(chunks[i].slice(0, 50));
  });
  it("overlaps consecutive packed chunks", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Section ${i} content here with enough words to matter.`).join("\n\n");
    const chunks = chunkText(text, 120, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].includes(chunks[i - 1].slice(-30))).toBe(true);
  });
});
