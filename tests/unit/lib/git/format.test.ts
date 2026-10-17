import { describe, it, expect } from "vitest";
import {
  branchNameProblem,
  commitProblem,
  diffLineTone,
  groupChanges,
  pickDefaultRoot,
  relativeDate,
  shortSha,
  statusLabel,
  summarizeCounts,
} from "@/lib/git/format";
import type { GitRepoStatus } from "@desktop-shared/git";

const emptyStatus = (over: Partial<GitRepoStatus> = {}): GitRepoStatus => ({
  head: "main", detached: false, oid: "abc", upstream: null, ahead: 0, behind: 0,
  staged: [], unstaged: [], untracked: [], conflicted: [], ...over,
});

describe("statusLabel", () => {
  it("maps every porcelain letter to a human label", () => {
    expect(statusLabel("M")).toMatchObject({ short: "M" });
    expect(statusLabel("M").label).toBe("Modified");
    expect(statusLabel("A").label).toBe("Added");
    expect(statusLabel("D").label).toBe("Deleted");
    expect(statusLabel("R").label).toBe("Renamed");
    expect(statusLabel("C").label).toBe("Copied");
    expect(statusLabel("T").label).toBe("Type changed");
    expect(statusLabel("U").label).toBe("Conflict");
    expect(statusLabel("?").label).toBe("Untracked");
    expect(statusLabel(".").label).toBe("Unchanged");
  });
  it("flags conflicts as danger tone", () => {
    expect(statusLabel("U").tone).toBe("danger");
    expect(statusLabel("M").tone).toBe("warn");
  });
});

describe("groupChanges / summarizeCounts", () => {
  it("counts and summarises", () => {
    const status = emptyStatus({
      staged: [{ path: "a", origPath: null, index: "M", worktree: ".", conflicted: false }],
      unstaged: [{ path: "b", origPath: null, index: ".", worktree: "M", conflicted: false }],
      untracked: ["c", "d"],
    });
    expect(groupChanges(status).unstaged.map((c) => c.path)).toEqual(["b"]);
    expect(summarizeCounts(status)).toBe("1 staged · 1 modified · 2 untracked");
    expect(summarizeCounts(emptyStatus())).toBe("Clean");
  });
});

describe("shortSha / relativeDate", () => {
  it("truncates to seven characters", () => {
    expect(shortSha("ef0c80f18579bb4ce75cb62be767f81501595310")).toBe("ef0c80f");
    expect(shortSha("abc")).toBe("abc");
  });
  it("formats relative times and falls back to a date", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(relativeDate(now - 5_000, now)).toBe("just now");
    expect(relativeDate(now - 4 * 60_000, now)).toBe("4 min ago");
    expect(relativeDate(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeDate(now - 2 * 86_400_000, now)).toBe("2 d ago");
    expect(relativeDate("2026-09-01T10:00:00Z", now)).toBe("2026-09-01");
    expect(relativeDate("not a date", now)).toBe("");
  });
});

describe("commitProblem", () => {
  it("requires a message", () => {
    expect(commitProblem("")).toBe("Write a commit message first.");
    expect(commitProblem("   \n ")).toBe("Write a commit message first.");
  });
  it("warns on a long subject but does not block", () => {
    expect(commitProblem("short subject")).toBeNull();
    expect(commitProblem("x".repeat(80) + "\n\nbody")).toContain("50 characters");
  });
});

describe("branchNameProblem", () => {
  it("accepts ordinary branch names", () => {
    for (const name of ["feat/git-panel", "release/v0.2.0", "fix-1", "main"]) {
      expect(branchNameProblem(name), name).toBeNull();
    }
  });
  it("rejects what git itself rejects (advisory — main re-validates with check-ref-format)", () => {
    for (const name of ["", "has space", "a..b", "bad~1", "bad^", "bad:ref", "bad*", "ends.lock", "-dash", "trailing/"]) {
      expect(branchNameProblem(name), name).not.toBeNull();
    }
  });
});

describe("pickDefaultRoot", () => {
  const allowed = ["C:\\proj", "C:\\other"];
  it("prefers the last used root when it is still allowed", () => {
    expect(pickDefaultRoot(["C:\\proj"], allowed, "C:\\other")).toBe("C:\\other");
  });
  it("falls back to the first linked folder inside an allowed root", () => {
    expect(pickDefaultRoot(["C:\\elsewhere", "C:\\proj\\sub"], allowed, null)).toBe("C:\\proj\\sub");
  });
  it("falls back to the first allowed root", () => {
    expect(pickDefaultRoot([], allowed, null)).toBe("C:\\proj");
  });
  it("is case- and separator-insensitive on Windows paths", () => {
    expect(pickDefaultRoot(["c:/proj/sub"], allowed, null)).toBe("c:/proj/sub");
  });
  it("returns null when nothing is allowed", () => {
    expect(pickDefaultRoot(["C:\\elsewhere"], [], null)).toBeNull();
  });
});

describe("diffLineTone", () => {
  it("classifies hunk lines", () => {
    expect(diffLineTone("+added")).toBe("added");
    expect(diffLineTone("-removed")).toBe("removed");
    expect(diffLineTone(" context")).toBe("context");
    expect(diffLineTone("@@ -1 +1 @@")).toBe("meta");
    expect(diffLineTone("\\ No newline at end of file")).toBe("meta");
  });
});
