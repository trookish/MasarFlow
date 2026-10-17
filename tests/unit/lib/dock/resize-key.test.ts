import { describe, expect, it } from "vitest";
import { resizeDelta } from "@/lib/dock/geometry";

describe("resizeDelta", () => {
  it("shrinks with Left/Up and grows with Right/Down in the matching direction", () => {
    expect(resizeDelta("ArrowLeft", "horizontal")).toBe(-0.02);
    expect(resizeDelta("ArrowRight", "horizontal")).toBe(0.02);
    expect(resizeDelta("ArrowUp", "vertical")).toBe(-0.02);
    expect(resizeDelta("ArrowDown", "vertical")).toBe(0.02);
  });

  it("ignores the axis it does not resize", () => {
    expect(resizeDelta("ArrowUp", "horizontal")).toBeNull();
    expect(resizeDelta("ArrowLeft", "vertical")).toBeNull();
  });

  it("uses a coarse step with Shift and the limits with Home/End", () => {
    expect(resizeDelta("ArrowRight", "horizontal", true)).toBe(0.1);
    expect(resizeDelta("Home", "horizontal")).toBe(-1);
    expect(resizeDelta("End", "horizontal")).toBe(1);
  });

  it("ignores every other key", () => {
    expect(resizeDelta("Enter", "horizontal")).toBeNull();
    expect(resizeDelta("a", "horizontal")).toBeNull();
  });
});
