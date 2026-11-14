import { describe, it, expect } from "vitest";
import { logoPaint, type LogoPaintInput } from "@/lib/stores/logo-paint";

const base: LogoPaintInput = {
  accentMode: "solid",
  accentColor: "#7c5cfc",
  gradientStops: [
    { color: "#ff0000", position: 0 },
    { color: "#0000ff", position: 100 },
  ],
  gradientAngle: 135,
  logoColorMode: "accent",
  logoColor: "#123456",
  logoBgMode: "accent",
  logoBgColor: "#654321",
};

describe("logoPaint", () => {
  it("keeps solid accent on both layers in solid mode", () => {
    const p = logoPaint(base);
    expect(p.plate).toEqual({ backgroundColor: "#7c5cfc" });
    expect(p.mark).toEqual({ backgroundColor: "#7c5cfc" });
  });

  it("paints the plate and the mark with a gradient in gradient mode", () => {
    const p = logoPaint({ ...base, accentMode: "gradient" });
    expect(p.plate.backgroundImage).toContain("linear-gradient(135deg");
    expect(p.mark.backgroundImage).toContain("linear-gradient(");
    expect(p.plate.backgroundColor).toBeUndefined();
    expect(p.mark.backgroundColor).toBeUndefined();
  });

  it("reverses the mark gradient and adds a hairline shadow when both layers are accent", () => {
    const p = logoPaint({ ...base, accentMode: "gradient" });
    expect(p.mark.backgroundImage).toContain("linear-gradient(315deg");
    expect(p.mark.filter).toContain("drop-shadow");
  });

  it("uses the plain gradient on a mark over a non-accent plate", () => {
    const p = logoPaint({ ...base, accentMode: "gradient", logoBgMode: "white" });
    expect(p.plate).toEqual({ backgroundColor: "#ffffff" });
    expect(p.mark.backgroundImage).toContain("linear-gradient(135deg");
    expect(p.mark.filter).toBeUndefined();
  });

  it("gradient plate under a custom-coloured mark", () => {
    const p = logoPaint({ ...base, accentMode: "gradient", logoColorMode: "custom" });
    expect(p.plate.backgroundImage).toContain("linear-gradient(");
    expect(p.mark).toEqual({ backgroundColor: "#123456" });
  });

  it("leaves none and custom plates alone", () => {
    expect(logoPaint({ ...base, accentMode: "gradient", logoBgMode: "none" }).plate).toEqual({
      backgroundColor: "transparent",
    });
    expect(logoPaint({ ...base, accentMode: "gradient", logoBgMode: "custom" }).plate).toEqual({
      backgroundColor: "#654321",
    });
  });
});
