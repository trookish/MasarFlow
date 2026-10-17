import { describe, it, expect } from "vitest";
import { APP_DISPLAY_VERSION, formatDisplayVersion, isDisplayVersion } from "@desktop-shared/version";

describe("display version", () => {
  it("pads a semver to four parts", () => {
    expect(formatDisplayVersion("0.2.0")).toBe("0.2.0.0");
    expect(formatDisplayVersion("0.2.1-3")).toBe("0.2.1.3");
    expect(formatDisplayVersion("v0.2.0-alpha.0")).toBe("0.2.0.0");
    expect(formatDisplayVersion("0.2.0.0")).toBe("0.2.0.0");
  });
  it("recognises the 4-part shape", () => {
    expect(isDisplayVersion(APP_DISPLAY_VERSION)).toBe(true);
    expect(isDisplayVersion("0.2.0")).toBe(false);
    expect(isDisplayVersion("0.2.0.0-rc1")).toBe(false);
  });
});
