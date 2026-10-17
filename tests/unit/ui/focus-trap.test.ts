import { describe, expect, it } from "vitest";
import { stepIndex } from "@/lib/ui/focus-trap";

describe("stepIndex", () => {
  it("wraps forward and backward", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });

  it("handles a single focusable element", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, -1)).toBe(0);
  });

  it("handles an empty container", () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it("clamps an out-of-range current index", () => {
    // Plan deviation: the plan's snippet expected 1 here, but its own
    // implementation returns (from=-1 + 1 + 3) % 3 = 0 — which is also the
    // correct result for the hook's real out-of-range case (focus outside the
    // list: indexOf -> -1, so Tab lands on the first focusable, Shift+Tab on
    // the last). The expectation was corrected to match the implementation.
    expect(stepIndex(9, 3, 1)).toBe(0);
    expect(stepIndex(-2, 3, -1)).toBe(2);
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
  });
});
