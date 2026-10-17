import { describe, it, expect } from "vitest";
import { formatRepoLine, type RepoBrief } from "@/lib/ai/git-context";

const brief = (over: Partial<RepoBrief> = {}): RepoBrief => ({
  root: "C:/Users/trookish/Dev/Web-Projects/MasarFlow",
  head: "main", detached: false, upstream: "origin/main", ahead: 2, behind: 0,
  staged: 1, modified: 3, untracked: 2, conflicted: 0,
  remoteUrl: "https://github.com/trookish/MasarFlow.git",
  lastCommit: { shortSha: "ef0c80f", subject: "refactor: rename", date: "2026-10-16T20:46:58+03:00" },
  ...over,
});

describe("formatRepoLine", () => {
  it("summarises a clean repository on a tracked branch", () => {
    const line = formatRepoLine(brief({ staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 }));
    expect(line).toContain("on main");
    expect(line).toContain("up to date with origin/main");
    expect(line).toContain("ef0c80f");
  });
  it("mentions divergence and the dirty counts", () => {
    const line = formatRepoLine(brief());
    expect(line).toContain("2 ahead");
    expect(line).toContain("1 staged");
    expect(line).toContain("3 modified");
    expect(line).toContain("2 untracked");
  });
  it("calls out detached HEAD and missing remotes", () => {
    expect(formatRepoLine(brief({ detached: true, head: "HEAD" }))).toContain("detached HEAD");
    expect(formatRepoLine(brief({ remoteUrl: null, upstream: null }))).toContain("no origin remote");
  });
  it("is stable with no commits at all", () => {
    expect(formatRepoLine(brief({ lastCommit: null }))).toContain("no commits yet");
  });
});
