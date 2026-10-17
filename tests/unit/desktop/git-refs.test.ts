import { describe, it, expect } from "vitest";
import {
  parseBranchList,
  parseCommitLog,
  parseRemoteUrl,
  parseSingleLine,
  LOG_FORMAT,
  BRANCH_FORMAT,
} from "@desktop/git/parse-refs";

describe("log format constants", () => {
  it("use separators that cannot appear in a git field separator", () => {
    expect(LOG_FORMAT).toContain("%x1f");
    expect(LOG_FORMAT).toContain("%x1e");
    expect(BRANCH_FORMAT).toContain("%00");
    expect(BRANCH_FORMAT).not.toContain("%x1f");
  });
});

describe("parseCommitLog", () => {
  it("reads two records with subject, body and parents", () => {
    const raw =
      "ef0c80f18579bb4ce75cb62be767f81501595310\u001fef0c80f\u001fDev Example\u001fdev@example.com\u001f2026-10-16T23:46:58+03:00\u001fDev Example\u001f649b5328e4c0fd2aa29cccfa112b0d7ef1fdda28\u001frefactor: rename\u001f\u001e\n" +
      "649b5328e4c0fd2aa29cccfa112b0d7ef1fdda28\u001f649b532\u001fDev Example\u001fdev@example.com\u001f2026-10-16T23:46:58+03:00\u001fDev Example\u001f\u001ffeat: first\u001fbody line one\nbody line two\u001e\n";
    const commits = parseCommitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      sha: "ef0c80f18579bb4ce75cb62be767f81501595310",
      shortSha: "ef0c80f",
      author: "Dev Example",
      email: "dev@example.com",
      subject: "refactor: rename",
      body: "",
      parents: ["649b5328e4c0fd2aa29cccfa112b0d7ef1fdda28"],
    });
    expect(commits[1].body).toBe("body line one\nbody line two");
    expect(commits[1].parents).toEqual([]);
  });
  it("keeps a multi-line body and tolerates a trailing newline", () => {
    const raw =
      "aaaa\u001faaaaaaa\u001fA\u001fa@b.c\u001f2026-01-01T00:00:00+00:00\u001fA\u001f\u001fsubject\u001fline1\n\nline3\u001e\n";
    expect(parseCommitLog(raw)[0].body).toBe("line1\n\nline3");
  });
  it("returns [] for empty output", () => {
    expect(parseCommitLog("")).toEqual([]);
  });
});

describe("parseBranchList", () => {
  it("marks the current branch and reads upstreams", () => {
    // Real for-each-ref bytes (re-verified with git 2.53.0 on this machine):
    // a non-checked-out branch prints a single SPACE for %(HEAD), and an empty
    // upstream field, before the line's newline.
    const real = "feature/x\u00001e6c3a5ed700df90995254673b3ca7fc8ff75b4a\u0000 \u0000\n" +
      "main\u00001e6c3a5ed700df90995254673b3ca7fc8ff75b4a\u0000*\u0000\n";
    const branches = parseBranchList(real);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toEqual({
      name: "feature/x",
      oid: "1e6c3a5ed700df90995254673b3ca7fc8ff75b4a",
      head: false,
      upstream: "",
    });
    expect(branches[1].head).toBe(true);
  });
  it("ignores blank lines", () => {
    expect(parseBranchList("\nmain\u0000abc\u0000*\u0000origin/main\n\n")).toHaveLength(1);
  });
});

describe("parseRemoteUrl / parseSingleLine", () => {
  it("reads a url and trims the trailing newline", () => {
    expect(parseRemoteUrl("https://github.com/trookish/MasarFlow.git\n")).toBe(
      "https://github.com/trookish/MasarFlow.git",
    );
    expect(parseSingleLine("C:/Users/x/proj\n")).toBe("C:/Users/x/proj");
    expect(parseSingleLine("")).toBeNull();
  });
  it("maps the no-remote error to null", () => {
    expect(parseRemoteUrl("error: No such remote 'origin'")).toBeNull();
  });
});
