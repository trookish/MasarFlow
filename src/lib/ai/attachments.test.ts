import { describe, it, expect } from "vitest";
import {
  fileExt,
  isTextLikeFile,
  isImageFile,
  formatFileBlock,
  splitDataUrl,
} from "./attachments";

describe("fileExt", () => {
  it("extracts the lowercase extension", () => {
    expect(fileExt("Notes.MD")).toBe("md");
    expect(fileExt("src/main.test.ts")).toBe("ts");
  });
  it("is empty for extensionless or dot-prefixed names", () => {
    expect(fileExt("Makefile")).toBe("");
    expect(fileExt(".gitignore")).toBe("");
  });
});

describe("isTextLikeFile", () => {
  it("accepts text mime types regardless of extension", () => {
    expect(isTextLikeFile("weird.bin", "text/plain")).toBe(true);
  });
  it("accepts known code/text extensions with generic mime", () => {
    expect(isTextLikeFile("schema.prisma", "")).toBe(true);
    expect(isTextLikeFile("app.tsx", "application/octet-stream")).toBe(true);
  });
  it("rejects binaries", () => {
    expect(isTextLikeFile("photo.raw", "application/octet-stream")).toBe(false);
    expect(isTextLikeFile("video.mp4", "video/mp4")).toBe(false);
  });
});

describe("isImageFile", () => {
  it("accepts the model-supported formats", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(isImageFile(t)).toBe(true);
    }
  });
  it("rejects unsupported image types", () => {
    expect(isImageFile("image/tiff")).toBe(false);
  });
});

describe("formatFileBlock", () => {
  it("fences content with the extension", () => {
    const block = formatFileBlock("util.ts", "export const x = 1;");
    expect(block).toContain("Attached file: util.ts");
    expect(block).toContain("```ts");
    expect(block).toContain("export const x = 1;");
  });
  it("truncates very long content", () => {
    const block = formatFileBlock("big.txt", "a".repeat(30_000));
    expect(block).toContain("truncated");
    expect(block.length).toBeLessThan(25_000);
  });
});

describe("splitDataUrl", () => {
  it("splits mime and payload", () => {
    expect(splitDataUrl("data:image/png;base64,AAAA")).toEqual({
      mimeType: "image/png",
      data: "AAAA",
    });
  });
  it("returns null for non-data URLs", () => {
    expect(splitDataUrl("https://example.com/x.png")).toBeNull();
  });
});
