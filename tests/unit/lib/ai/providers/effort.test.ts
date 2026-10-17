import { describe, it, expect } from "vitest";
import { effortToReasoning, EFFORT_LEVELS } from "@/lib/ai/providers/effort";

describe("effortToReasoning", () => {
  it("is off for 'off' or when the model cannot reason", () => {
    expect(effortToReasoning("off", true)).toBeUndefined();
    expect(effortToReasoning("high", false)).toBeUndefined();
  });
  it("maps levels to increasing budgets", () => {
    const b = (e: "low" | "medium" | "high") => effortToReasoning(e, true)!.budget!;
    expect(b("low")).toBeLessThan(b("medium"));
    expect(b("medium")).toBeLessThan(b("high"));
    expect(effortToReasoning("medium", true)!.enabled).toBe(true);
  });
  it("lists the levels in UI order", () => {
    expect(EFFORT_LEVELS).toEqual(["off", "low", "medium", "high"]);
  });
});
