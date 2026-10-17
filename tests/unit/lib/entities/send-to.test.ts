import { describe, it, expect } from "vitest";
import { noteFromText, taskFromText } from "@/lib/entities/send-to";

describe("taskFromText", () => {
  it("uses the first meaningful line as the title and keeps the rest as description", () => {
    const t = taskFromText("## Fix login redirect\nUsers loop back after token expiry.\nSee auth flow.");
    expect(t.title).toBe("Fix login redirect");
    expect(t.description).toBe("Users loop back after token expiry.\nSee auth flow.");
  });
  it("strips list / quote markers and clips long titles", () => {
    expect(taskFromText("- [ ] write the migration").title).toBe("write the migration");
    expect(taskFromText("x".repeat(200)).title).toHaveLength(80);
  });
  it("never returns an empty title", () => {
    expect(taskFromText("   \n  ").title).toBe("Untitled task");
  });
});

describe("noteFromText", () => {
  it("keeps the full text as the body", () => {
    const n = noteFromText("# Auth notes\nJWT everywhere.");
    expect(n.title).toBe("Auth notes");
    expect(n.body).toBe("# Auth notes\nJWT everywhere.");
  });
});
