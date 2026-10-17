import { describe, it, expect, vi, afterEach } from "vitest";
import { GIT_DESKTOP_REQUIRED, gitBridge, gitFailureCopy } from "@/lib/git/client";
import type { GitFailureCode } from "@desktop-shared/git";

afterEach(() => vi.unstubAllGlobals());

const CODES: GitFailureCode[] = [
  "git-missing", "not-a-repo", "root-not-allowed", "permission-denied",
  "index-locked", "nothing-to-commit", "invalid-input", "no-remote",
  "detached-head", "timeout", "unknown",
];

describe("gitBridge", () => {
  it("is null in a browser tab (no window.masarflow)", () => {
    vi.stubGlobal("window", {});
    expect(gitBridge()).toBeNull();
  });
  it("returns the desktop git surface when the preload exposed it", () => {
    const git = { status: vi.fn() };
    vi.stubGlobal("window", { masarflow: { git } });
    expect(gitBridge()).toBe(git);
  });
  it("returns null when the preload exists without a git surface (older desktop build)", () => {
    vi.stubGlobal("window", { masarflow: {} });
    expect(gitBridge()).toBeNull();
  });
});

describe("gitFailureCopy", () => {
  it("has copy for every failure code", () => {
    for (const code of CODES) {
      const copy = gitFailureCopy(code);
      expect(copy.length, code).toBeGreaterThan(10);
    }
  });
  it("names the missing-desktop case explicitly", () => {
    expect(GIT_DESKTOP_REQUIRED).toContain("desktop");
  });
  it("appends the raw git diagnostics when present", () => {
    expect(gitFailureCopy("unknown", "fatal: boom")).toContain("fatal: boom");
    expect(gitFailureCopy("unknown", "")).not.toContain("Details");
  });
});
