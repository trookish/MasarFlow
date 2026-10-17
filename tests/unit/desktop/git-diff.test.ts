import { describe, it, expect } from "vitest";
import {
  countDiffLines,
  mergeDiffStats,
  parseNumstatZ,
  parseUnifiedDiff,
  stripTabSuffix,
  unquoteGitPath,
} from "@desktop/git/parse-diff";

describe("parseNumstatZ", () => {
  it("reads plain entries", () => {
    expect(parseNumstatZ("3\t1\talpha.txt\u00001\t1\tsrc/one.ts\u0000")).toEqual([
      { path: "alpha.txt", origPath: null, additions: 3, deletions: 1, binary: false },
      { path: "src/one.ts", origPath: null, additions: 1, deletions: 1, binary: false },
    ]);
  });
  it("reads a rename entry (empty path then old NUL new)", () => {
    expect(parseNumstatZ("0\t0\t\u0000big.txt\u0000renamed-big.txt\u0000")).toEqual([
      {
        path: "renamed-big.txt",
        origPath: "big.txt",
        additions: 0,
        deletions: 0,
        binary: false,
      },
    ]);
  });
  it("marks binary entries", () => {
    expect(parseNumstatZ("-\t-\tblob.bin\u0000")).toEqual([
      { path: "blob.bin", origPath: null, additions: 0, deletions: 0, binary: true },
    ]);
  });
});

describe("unquoteGitPath / stripTabSuffix", () => {
  it("unquotes the C-escaped form git prints when quotepath is on", () => {
    // Computed, not remembered: node -e "console.log(Buffer.from([0o331,0o205]).toString('utf8'))" -> "م" (U+0645)
    expect(unquoteGitPath('"a/\\331\\205.txt"')).toBe("a/\u0645.txt");
  });
  it("drops git's trailing tab suffix on ---/+++ lines", () => {
    expect(stripTabSuffix("b/\u0645\u0644\u0641.txt\t")).toBe("b/\u0645\u0644\u0641.txt");
    expect(stripTabSuffix("b/plain.txt")).toBe("b/plain.txt");
  });
});

describe("parseUnifiedDiff", () => {
  it("parses a modified file with two hunks (unified=0 sample)", () => {
    const raw =
      "diff --git a/new-name.txt b/new-name.txt\n" +
      "index de98044..457419d 100644\n" +
      "--- a/new-name.txt\n" +
      "+++ b/new-name.txt\n" +
      "@@ -2 +2 @@ a\n" +
      "-b\n" +
      "+b-changed\n" +
      "@@ -3,0 +4 @@ c\n" +
      "+d\n";
    const [file] = parseUnifiedDiff(raw);
    expect(file.path).toBe("new-name.txt");
    expect(file.status).toBe("modified");
    expect(file.isNew).toBe(false);
    expect(file.hunks).toHaveLength(2);
    expect(file.hunks[1].header).toBe("@@ -3,0 +4 @@ c");
    expect(file.hunks[1].lines).toEqual(["+d"]);
  });

  it("parses a new file (--no-index against /dev/null, and staged new files)", () => {
    const raw =
      "diff --git a/untrk.txt b/untrk.txt\n" +
      "new file mode 100644\n" +
      "index 0000000..b698677\n" +
      "--- /dev/null\n" +
      "+++ b/untrk.txt\n" +
      "@@ -0,0 +1 @@\n" +
      "+brand new file\n";
    const [file] = parseUnifiedDiff(raw);
    expect(file).toMatchObject({ path: "untrk.txt", status: "added", isNew: true });
    expect(countDiffLines(file)).toEqual({ additions: 1, deletions: 0 });
  });

  it("parses a pure rename (no hunks, no ---/+++ lines)", () => {
    const raw =
      "diff --git a/move.txt b/moved.txt\n" +
      "similarity index 100%\n" +
      "rename from move.txt\n" +
      "rename to moved.txt\n";
    const [file] = parseUnifiedDiff(raw);
    expect(file).toMatchObject({
      path: "moved.txt",
      origPath: "move.txt",
      status: "renamed",
      binary: false,
    });
    expect(file.hunks).toEqual([]);
  });

  it("parses binary files and a path with spaces (tab suffix)", () => {
    const raw =
      "diff --git a/blob.bin b/blob.bin\n" +
      "index 742c16a..627161b 100644\n" +
      "Binary files a/blob.bin and b/blob.bin differ\n" +
      "diff --git a/\u0645\u0644\u0641 \u0645\u0633\u0627\u0641\u0629.txt b/\u0645\u0644\u0641 \u0645\u0633\u0627\u0641\u0629.txt\n" +
      "new file mode 100644\n" +
      "index 0000000..587be6b\n" +
      "--- /dev/null\n" +
      "+++ b/\u0645\u0644\u0641 \u0645\u0633\u0627\u0641\u0629.txt\t\n" +
      "@@ -0,0 +1 @@\n" +
      "+x\n";
    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "blob.bin", status: "binary", binary: true });
    expect(files[1].path).toBe("\u0645\u0644\u0641 \u0645\u0633\u0627\u0641\u0629.txt");
  });

  it("keeps the no-newline marker inside the hunk", () => {
    const raw =
      "diff --git a/x.txt b/x.txt\n--- a/x.txt\n+++ b/x.txt\n@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n";
    expect(parseUnifiedDiff(raw)[0].hunks[0].lines).toEqual(["-old", "+new", "\\ No newline at end of file"]);
  });
});

describe("mergeDiffStats", () => {
  it("zips numstat counts onto parsed files by path", () => {
    const files = parseUnifiedDiff(
      "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n",
    );
    const merged = mergeDiffStats(files, [
      { path: "a.txt", origPath: null, additions: 4, deletions: 1, binary: false },
    ]);
    expect(merged[0]).toMatchObject({ additions: 4, deletions: 1 });
  });
  it("falls back to counting hunk lines when numstat has no entry (untracked --no-index)", () => {
    const files = parseUnifiedDiff(
      "diff --git a/u.txt b/u.txt\n--- /dev/null\n+++ b/u.txt\n@@ -0,0 +1 @@\n+one\n+two\n",
    );
    expect(mergeDiffStats(files, [])[0]).toMatchObject({ additions: 2, deletions: 0 });
  });
});
