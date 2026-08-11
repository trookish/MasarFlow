import { describe, it, expect } from "vitest";
import { clampPosition, gradientCss, normalizeStops } from "@/lib/stores/theme";

describe("clampPosition", () => {
  it("clamps into 0–100 and rounds", () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(150)).toBe(100);
    expect(clampPosition(33.4)).toBe(33);
    expect(clampPosition(42.6)).toBe(43);
  });
});

describe("normalizeStops", () => {
  it("sorts by position and clamps", () => {
    expect(
      normalizeStops([
        { color: "#111111", position: 80 },
        { color: "#222222", position: 10 },
      ]),
    ).toEqual([
      { color: "#222222", position: 10 },
      { color: "#111111", position: 80 },
    ]);
  });

  it("dedupes stops sharing a position (later wins)", () => {
    expect(
      normalizeStops([
        { color: "#111111", position: 50 },
        { color: "#222222", position: 50 },
        { color: "#333333", position: 100 },
      ]),
    ).toEqual([
      { color: "#222222", position: 50 },
      { color: "#333333", position: 100 },
    ]);
  });

  it("falls back to the default two stops when fewer than two", () => {
    expect(normalizeStops([{ color: "#111111", position: 20 }])).toHaveLength(
      2,
    );
    expect(normalizeStops([])).toHaveLength(2);
  });

  it("replaces invalid colors with the default white", () => {
    const stops = normalizeStops([
      { color: "not-a-color", position: 0 },
      { color: "#FF0000", position: 100 },
    ]);
    expect(stops[0].color).toBe("#dedede");
    expect(stops[1].color).toBe("#ff0000");
  });
});

describe("gradientCss", () => {
  it("builds a multi-stop linear gradient", () => {
    expect(
      gradientCss(
        [
          { color: "#ff0000", position: 0 },
          { color: "#00ff00", position: 50 },
          { color: "#0000ff", position: 100 },
        ],
        135,
      ),
    ).toBe("linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)");
  });

  it("normalizes the stops before building", () => {
    expect(
      gradientCss(
        [
          { color: "#ffffff", position: 90 },
          { color: "#000000", position: 10 },
        ],
        90,
      ),
    ).toBe("linear-gradient(90deg, #000000 10%, #ffffff 90%)");
  });
});
