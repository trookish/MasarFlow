import { describe, it, expect } from "vitest";
import { classifyDbError } from "@/lib/db/health";

const err = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("classifyDbError", () => {
  it.each([
    ["VersionError", "version"],
    ["QuotaExceededError", "quota"],
    ["DatabaseClosedError", "closed"],
    ["OpenFailedError", "unreadable"],
    ["UnknownError", "unreadable"],
    ["SomethingElse", "unknown"],
  ])("%s → %s", (name, kind) => {
    expect(classifyDbError(err(name)).kind).toBe(kind);
  });
  it("gives plain-language, formal messages and never leaks stack traces", () => {
    const c = classifyDbError(err("QuotaExceededError"));
    expect(c.message).toMatch(/storage/i);
    expect(c.message).not.toMatch(/at |\.ts:/);
  });
  it("treats non-Error values as unknown", () => {
    expect(classifyDbError("boom").kind).toBe("unknown");
  });
});
