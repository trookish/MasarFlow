import { describe, it, expect } from "vitest";
import { chatThreadSchema } from "@/lib/db/schema";

const base = { id: "t", projectId: "p", createdAt: 1, updatedAt: 1 };

describe("chatThreadSchema backend", () => {
  it("defaults to api", () => {
    expect(chatThreadSchema.parse(base).backend).toBe("api");
  });
  it("maps legacy opencode threads to api", () => {
    expect(chatThreadSchema.parse({ ...base, backend: "opencode" }).backend).toBe("api");
  });
  it("keeps ollama", () => {
    expect(chatThreadSchema.parse({ ...base, backend: "ollama" }).backend).toBe("ollama");
  });
  it("carries effort and fallbacks with safe defaults", () => {
    const t = chatThreadSchema.parse(base);
    expect(t.effort).toBe("off");
    expect(t.fallbacks).toEqual([]);
  });
  it("migrates the old reasoningEnabled flag to effort medium", () => {
    expect(chatThreadSchema.parse({ ...base, reasoningEnabled: true }).effort).toBe("medium");
  });
  it("drops the removed opencode session fields", () => {
    const t = chatThreadSchema.parse({ ...base, opencodeSessionId: "x", opencodeDirectory: "y" }) as Record<string, unknown>;
    expect("opencodeSessionId" in t).toBe(false);
    expect("opencodeDirectory" in t).toBe(false);
  });
});
