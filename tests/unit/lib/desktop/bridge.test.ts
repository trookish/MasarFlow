import { describe, it, expect, afterEach, vi } from "vitest";
import { getDesktop } from "@/lib/desktop/bridge";

afterEach(() => vi.unstubAllGlobals());

describe("getDesktop", () => {
  it("is null without a window (SSR / node)", () => {
    expect(getDesktop()).toBeNull();
  });
  it("returns the preload API when present", () => {
    const api = { platform: "win32" };
    vi.stubGlobal("window", { masarflow: api });
    expect(getDesktop()).toBe(api);
  });
  it("is null in a plain browser window", () => {
    vi.stubGlobal("window", {});
    expect(getDesktop()).toBeNull();
  });
});
