import { describe, expect, it } from "vitest";
import { TAB_MENU_THRESHOLD, shouldUseTabMenu, tabCounts } from "@/lib/dock/overflow";

describe("tabCounts", () => {
  it("reports how many tabs sit before and after the active one", () => {
    expect(tabCounts(5, 0)).toEqual({ before: 0, after: 4 });
    expect(tabCounts(5, 2)).toEqual({ before: 2, after: 2 });
    expect(tabCounts(5, 4)).toEqual({ before: 4, after: 0 });
  });

  it("clamps out-of-range indexes and handles an empty strip", () => {
    expect(tabCounts(3, 9)).toEqual({ before: 2, after: 0 });
    expect(tabCounts(3, -4)).toEqual({ before: 0, after: 2 });
    expect(tabCounts(0, 0)).toEqual({ before: 0, after: 0 });
  });
});

describe("shouldUseTabMenu", () => {
  it("switches to the menu only for genuinely crowded strips", () => {
    expect(TAB_MENU_THRESHOLD).toBe(8);
    expect(shouldUseTabMenu(7)).toBe(false);
    expect(shouldUseTabMenu(8)).toBe(true);
  });
});
