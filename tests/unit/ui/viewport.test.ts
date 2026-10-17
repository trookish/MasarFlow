import { describe, expect, it } from "vitest";
import { COMPACT_MAX, WIDE_MIN, viewportMode } from "@/lib/ui/viewport";

describe("viewportMode", () => {
  it("classifies the three widths the dock cares about", () => {
    expect(viewportMode(900)).toBe("compact");
    expect(viewportMode(1280)).toBe("regular");
    expect(viewportMode(1920)).toBe("wide");
  });

  it("uses inclusive lower bounds", () => {
    expect(viewportMode(COMPACT_MAX)).toBe("compact");
    expect(viewportMode(COMPACT_MAX + 1)).toBe("regular");
    expect(viewportMode(WIDE_MIN)).toBe("wide");
  });

  it("never reports a mode for a nonsense width", () => {
    expect(viewportMode(0)).toBe("compact");
    expect(viewportMode(-100)).toBe("compact");
  });
});
