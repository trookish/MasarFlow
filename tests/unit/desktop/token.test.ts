import { describe, it, expect } from "vitest";
import { createLaunchToken, tokensMatch } from "@desktop/backend/token";

describe("launch token", () => {
  it("is 64 hex chars and unique per call", () => {
    const a = createLaunchToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(createLaunchToken()).not.toBe(a);
  });

  it("matches only the identical token", () => {
    const t = createLaunchToken();
    const wrong = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
    expect(tokensMatch(t, t)).toBe(true);
    expect(tokensMatch(t, wrong)).toBe(false);
    expect(tokensMatch(t, `${t}x`)).toBe(false);
    expect(tokensMatch(t, "")).toBe(false);
    expect(tokensMatch(t, null)).toBe(false);
    expect(tokensMatch(t, undefined)).toBe(false);
  });

  it("never matches when the expected token is empty", () => {
    expect(tokensMatch("", "")).toBe(false);
  });
});
