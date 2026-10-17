import { describe, it, expect } from "vitest";
import {
  buildGitArgs,
  candidateGitBinaries,
  classifyGitFailure,
  parseGitVersion,
  DIFF_EXIT_CODES,
} from "@desktop/git/run";

describe("buildGitArgs", () => {
  it("puts the machine-readable prelude before the command", () => {
    expect(buildGitArgs(["status", "--porcelain=v2"])).toEqual([
      "-c", "core.quotepath=false",
      "-c", "i18n.logOutputEncoding=UTF-8",
      "status", "--porcelain=v2",
    ]);
  });
  it("passes a message as one argv element (never a shell string)", () => {
    const args = buildGitArgs(["commit", "-m", 'feat: "quoted" & $HOME; rm -rf /']);
    expect(args).toHaveLength(7);
    // prelude is 4 argv elements (see the test above), so the command starts at index 4
    expect(args[4]).toBe("commit");
    expect(args[6]).toBe('feat: "quoted" & $HOME; rm -rf /');
  });
});

describe("parseGitVersion", () => {
  it("reads the windows build string", () => {
    expect(parseGitVersion("git version 2.53.0.windows.3\n")).toEqual({
      version: "2.53.0",
      raw: "git version 2.53.0.windows.3",
    });
  });
  it("reads a plain build and rejects junk", () => {
    expect(parseGitVersion("git version 2.45.1\n")?.version).toBe("2.45.1");
    expect(parseGitVersion("nonsense")).toBeNull();
  });
});

describe("candidateGitBinaries", () => {
  const exists = (paths: string[]) => (p: string) => paths.includes(p);
  it("treats MASARFLOW_GIT_PATH as a strict override (portable installs / tests)", () => {
    expect(
      candidateGitBinaries(
        { MASARFLOW_GIT_PATH: "D:/portable/git.exe" },
        "win32",
        exists(["C:\\Program Files\\Git\\cmd\\git.exe"]),
      ),
    ).toEqual(["D:/portable/git.exe"]);
  });
  it("falls back to PATH and then the installed locations", () => {
    expect(
      candidateGitBinaries({}, "win32", exists(["C:\\Program Files\\Git\\cmd\\git.exe"])),
    ).toEqual(["git", "C:\\Program Files\\Git\\cmd\\git.exe"]);
  });
  it("adds no Windows paths on other platforms", () => {
    expect(candidateGitBinaries({}, "linux", exists(["C:\\Program Files\\Git\\cmd\\git.exe"]))).toEqual(["git"]);
  });
});

describe("classifyGitFailure", () => {
  const run = (over: Partial<Parameters<typeof classifyGitFailure>[0]>) => ({
    code: 0, stdout: "", stderr: "", timedOut: false, ...over,
  });
  it("returns null for accepted exits even with stderr noise", () => {
    expect(classifyGitFailure(run({ stderr: "warning: LF will be replaced by CRLF" }))).toBeNull();
    expect(classifyGitFailure(run({ code: 1 }), DIFF_EXIT_CODES)).toBeNull();
  });
  it("maps spawn errors", () => {
    expect(classifyGitFailure(run({ code: null, errno: "ENOENT" }))).toBe("git-missing");
    expect(classifyGitFailure(run({ code: null, errno: "EACCES" }))).toBe("permission-denied");
    expect(classifyGitFailure(run({ code: null, timedOut: true }))).toBe("timeout");
  });
  it("maps stderr messages (real strings from git 2.53.0)", () => {
    expect(classifyGitFailure(run({ code: 128, stderr: "fatal: not a git repository (or any of the parent directories): .git" }))).toBe("not-a-repo");
    expect(classifyGitFailure(run({ code: 2, stderr: "error: No such remote 'origin'" }))).toBe("no-remote");
    expect(classifyGitFailure(run({ code: 1, stderr: "fatal: 'origin' does not appear to be a git repository" }))).toBe("no-remote");
    expect(classifyGitFailure(run({ code: 128, stderr: "fatal: invalid reference: nosuchbranch" }))).toBe("invalid-input");
    expect(classifyGitFailure(run({ code: 128, stderr: "fatal: 'a..b' is not a valid branch name" }))).toBe("invalid-input");
    expect(classifyGitFailure(run({ code: 1, stderr: "fatal: Unable to create 'C:/p/.git/index.lock': File exists." }))).toBe("index-locked");
    expect(classifyGitFailure(run({ code: 1, stderr: "nothing to commit, working tree clean" }))).toBe("nothing-to-commit");
    expect(classifyGitFailure(run({ code: 128, stderr: "fatal: something new" }))).toBe("unknown");
  });
});
