import { describe, it, expect } from "vitest";
import { parseStatusPorcelainV2 } from "@desktop/git/parse-status";

const NUL = "\u0000";

describe("parseStatusPorcelainV2", () => {
  it("separates staged, unstaged, untracked and reads the branch header", () => {
    const raw =
      "# branch.oid 4d2d6f2e0cf4c7fa53ccda3673985cdee9e8faa3" + NUL +
      "# branch.head main" + NUL +
      "1 .M N... 100644 100644 100644 0c2aa38e0600e0d2df09c2f84664d8a14f899879 0c2aa38e0600e0d2df09c2f84664d8a14f899879 alpha.txt" + NUL +
      "1 M. N... 100644 100644 100644 d5a09df94c94924d13f8b5cd72a193b3eddb08cb b6627ebc3d5a807da19acab4983072fb29939e24 gamma.md" + NUL +
      "1 .M N... 100644 100644 100644 cc798ff50da9473effe8bdb31c8c120fe42b61e3 cc798ff50da9473effe8bdb31c8c120fe42b61e3 src/one.ts" + NUL +
      "? newfile.txt" + NUL +
      "? out/" + NUL;
    const s = parseStatusPorcelainV2(raw);
    expect(s.head).toBe("main");
    expect(s.detached).toBe(false);
    expect(s.oid).toBe("4d2d6f2e0cf4c7fa53ccda3673985cdee9e8faa3");
    expect(s.staged.map((c) => c.path)).toEqual(["gamma.md"]);
    expect(s.unstaged.map((c) => c.path)).toEqual(["alpha.txt", "src/one.ts"]);
    expect(s.untracked).toEqual(["newfile.txt", "out/"]);
    expect(s.conflicted).toEqual([]);
  });

  it("reads upstream, ahead and behind", () => {
    const raw =
      "# branch.oid 3c5177cc0a2ec71e5ba2b67658c34dae5f848e26" + NUL +
      "# branch.head main" + NUL +
      "# branch.upstream origin/main" + NUL +
      "# branch.ab +17 -0" + NUL;
    const s = parseStatusPorcelainV2(raw);
    expect(s.upstream).toBe("origin/main");
    expect(s.ahead).toBe(17);
    expect(s.behind).toBe(0);
  });

  it("reads a rename record (path NUL origPath)", () => {
    const raw =
      "# branch.oid 7786190adeaa8953f502e2fc38c42c4530a9770e" + NUL +
      "# branch.head main" + NUL +
      "2 R. N... 100644 100644 100644 bab081fdb7372d4e471fcbb12b886e1a7cddcae2 bab081fdb7372d4e471fcbb12b886e1a7cddcae2 R100 renamed-big.txt" + NUL +
      "big.txt" + NUL;
    const [rename] = parseStatusPorcelainV2(raw).staged;
    expect(rename).toMatchObject({
      path: "renamed-big.txt",
      origPath: "big.txt",
      index: "R",
      worktree: ".",
      conflicted: false,
    });
  });

  it("reads an unmerged record and marks it conflicted", () => {
    const raw =
      "# branch.oid 761a193b683565863dcd7d36be3427bf28bcb216" + NUL +
      "# branch.head main" + NUL +
      "u UU N... 100644 100644 100644 100644 8a205e8dc3e7c7914d69c3e900f2e944d77bb100 abd82dff563c33bd93afe51ee53d60e7aa20123d 846f0439115b2e71a3f64a46cbfbbb37e5e61f7f conflict.txt" + NUL +
      "? out/" + NUL;
    const s = parseStatusPorcelainV2(raw);
    expect(s.conflicted.map((c) => c.path)).toEqual(["conflict.txt"]);
    expect(s.conflicted[0].conflicted).toBe(true);
    expect(s.staged).toEqual([]);
    expect(s.unstaged).toEqual([]);
  });

  it("marks a detached HEAD", () => {
    const raw =
      "# branch.oid 4d2d6f2e0cf4c7fa53ccda3673985cdee9e8faa3" + NUL +
      "# branch.head (detached)" + NUL +
      "1 .M N... 100644 100644 100644 0c2aa38e0600e0d2df09c2f84664d8a14f899879 0c2aa38e0600e0d2df09c2f84664d8a14f899879 alpha.txt" + NUL;
    const s = parseStatusPorcelainV2(raw);
    expect(s.detached).toBe(true);
    expect(s.head).toBe("HEAD");
    expect(s.upstream).toBeNull();
  });

  it("tolerates an empty tree (no commits yet) and blank input", () => {
    const s = parseStatusPorcelainV2(
      "# branch.oid (initial)" + NUL + "# branch.head main" + NUL + "? .gitignore" + NUL,
    );
    expect(s.oid).toBe("");
    expect(s.untracked).toEqual([".gitignore"]);
    expect(parseStatusPorcelainV2("").staged).toEqual([]);
  });

  it("keeps raw UTF-8 paths with spaces (verified -z behaviour)", () => {
    const s = parseStatusPorcelainV2("? ملف فيه مسافة.txt" + NUL);
    expect(s.untracked).toEqual(["ملف فيه مسافة.txt"]);
  });
});
