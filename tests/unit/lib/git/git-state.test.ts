import { describe, it, expect } from "vitest";
import { describeGitState } from "@/lib/git/format";
import type { GitFailureCode } from "@desktop-shared/git";

const CODES: GitFailureCode[] = [
  "git-missing", "not-a-repo", "root-not-allowed", "permission-denied",
  "index-locked", "nothing-to-commit", "invalid-input", "no-remote",
  "detached-head", "timeout", "unknown",
];

describe("describeGitState", () => {
  it("has a headline and a body for every failure code", () => {
    for (const code of CODES) {
      const state = describeGitState({ kind: "failure", code });
      expect(state.title.length, code).toBeGreaterThan(3);
      expect(state.body.length, code).toBeGreaterThan(10);
    }
  });
  it("offers a recovery action where one exists", () => {
    expect(describeGitState({ kind: "failure", code: "not-a-repo" }).action).toBe("init");
    expect(describeGitState({ kind: "failure", code: "permission-denied" }).action).toBe("retry");
    expect(describeGitState({ kind: "failure", code: "git-missing" }).action).toBe("install");
  });
  it("describes the missing-desktop case and the detached-head state", () => {
    expect(describeGitState({ kind: "no-desktop" }).title).toMatch(/unavailable/i);
    expect(describeGitState({ kind: "detached" }).action).toBe("create-branch");
  });
  it("keeps git's raw diagnostics as the detail line", () => {
    const state = describeGitState({ kind: "failure", code: "unknown", detail: "fatal: boom" });
    expect(state.detail).toBe("fatal: boom");
  });
});
