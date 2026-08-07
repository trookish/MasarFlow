import { describe, it, expect } from "vitest";
import { extractSpecRefs } from "@/lib/github-sync";

describe("extractSpecRefs", () => {
  it("finds RFC numbers in commit messages", () => {
    expect(extractSpecRefs("feat: implement RFC-001 combat loop")).toEqual([
      "RFC-001",
    ]);
  });

  it("de-duplicates and uppercases", () => {
    expect(
      extractSpecRefs("rfc-002 progress\n\nRefs RFC-002 and RFC-014."),
    ).toEqual(["RFC-002", "RFC-014"]);
  });

  it("returns empty for messages without refs", () => {
    expect(extractSpecRefs("chore: bump deps")).toEqual([]);
  });
});
