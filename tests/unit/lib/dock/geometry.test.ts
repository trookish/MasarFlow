import { describe, expect, it } from "vitest";
import {
  clampRatio,
  splitPreviewRect,
  translateRect,
  zoneForPoint,
  type Rect,
} from "@/lib/dock/geometry";

const WIDE: Rect = { x: 0, y: 0, width: 800, height: 400 };

describe("zoneForPoint", () => {
  it("returns tab for a pointer in the center band", () => {
    expect(zoneForPoint(WIDE, 400, 200)).toBe("tab");
  });

  it("returns left near the left edge", () => {
    expect(zoneForPoint(WIDE, 40, 200)).toBe("left");
  });

  it("returns right near the right edge", () => {
    expect(zoneForPoint(WIDE, 770, 200)).toBe("right");
  });

  it("returns top near the top edge", () => {
    expect(zoneForPoint(WIDE, 400, 30)).toBe("top");
  });

  it("returns bottom near the bottom edge", () => {
    expect(zoneForPoint(WIDE, 400, 380)).toBe("bottom");
  });

  it("resolves corner overlaps to the nearest edge", () => {
    // (30,20): 30px from left, 20px from top -> top.
    expect(zoneForPoint(WIDE, 30, 20)).toBe("top");
    // (20,30): 20px from left, 30px from top -> left.
    expect(zoneForPoint(WIDE, 20, 30)).toBe("left");
    // (780,390): 20px from right, 10px from bottom -> bottom.
    expect(zoneForPoint(WIDE, 780, 390)).toBe("bottom");
  });

  it("returns tab for degenerate rects (any dimension < 40px)", () => {
    const tiny: Rect = { x: 0, y: 0, width: 30, height: 30 };
    expect(zoneForPoint(tiny, 15, 15)).toBe("tab");
    const thin: Rect = { x: 0, y: 0, width: 30, height: 400 };
    expect(zoneForPoint(thin, 10, 200)).toBe("tab");
  });

  it("honors an offset rect (coordinates are absolute)", () => {
    const offset: Rect = { x: 100, y: 50, width: 800, height: 400 };
    expect(zoneForPoint(offset, 130, 250)).toBe("left");
    expect(zoneForPoint(offset, 500, 250)).toBe("tab");
  });
});

describe("splitPreviewRect", () => {
  it("left zone previews the left portion", () => {
    expect(splitPreviewRect(WIDE, "left", 0.5)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    });
  });

  it("right zone previews the remaining portion", () => {
    expect(splitPreviewRect(WIDE, "right", 0.25)).toEqual({
      x: 200,
      y: 0,
      width: 600,
      height: 400,
    });
  });

  it("top zone previews the top portion", () => {
    expect(splitPreviewRect(WIDE, "top", 0.5)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 200,
    });
  });

  it("bottom zone previews the remaining portion", () => {
    expect(splitPreviewRect(WIDE, "bottom", 0.75)).toEqual({
      x: 0,
      y: 300,
      width: 800,
      height: 100,
    });
  });

  it("returns null for the tab zone", () => {
    expect(splitPreviewRect(WIDE, "tab")).toBeNull();
  });
});

describe("clampRatio", () => {
  it("clamps below the minimum", () => {
    expect(clampRatio(0.01)).toBe(0.05);
  });
  it("clamps above the maximum", () => {
    expect(clampRatio(1.2)).toBe(0.95);
  });
  it("keeps in-range values", () => {
    expect(clampRatio(0.5)).toBe(0.5);
  });
});

describe("translateRect", () => {
  it("shifts the rect by (x, y)", () => {
    expect(translateRect(WIDE, 10, -20)).toEqual({
      x: 10,
      y: -20,
      width: 800,
      height: 400,
    });
  });
});
