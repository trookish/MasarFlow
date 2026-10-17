import { describe, it, expect } from "vitest";
import { createGitService, createMutex } from "@desktop/git/service";
import type { GitExec, GitInvocation, GitRawRun } from "@desktop/git/run";

const ROOT = "C:\\proj";

/** Records every invocation and returns scripted results in order. */
function fakeExec(script: Array<Partial<GitRawRun>>) {
  const calls: GitInvocation[] = [];
  const exec: GitExec = async (inv) => {
    calls.push(inv);
    const next = script.shift() ?? {};
    return { code: 0, stdout: "", stderr: "", timedOut: false, ...next };
  };
  return { calls, exec };
}

const svc = (exec: GitExec, roots: string[] = [ROOT]) =>
  createGitService({ exec, roots: () => roots, platform: "win32" });

describe("root enforcement", () => {
  it("refuses a root that is not registered, without running git", async () => {
    const { calls, exec } = fakeExec([]);
    const res = await svc(exec).status("C:\\elsewhere");
    expect(res).toEqual({ ok: false, code: "root-not-allowed", message: "C:\\elsewhere is not a linked folder" });
    expect(calls).toHaveLength(0);
  });
  it("accepts a sub-folder of a registered root", async () => {
    const { exec } = fakeExec([{ stdout: "" }]);
    const res = await svc(exec).status("C:\\proj\\src");
    expect(res.ok).toBe(true);
  });
});

describe("status", () => {
  it("runs porcelain v2 with cwd at the root and parses the result", async () => {
    const { calls, exec } = fakeExec([{ stdout: "# branch.head main\u0000# branch.oid abc\u0000? a.txt\u0000" }]);
    const res = await svc(exec).status(ROOT);
    expect(calls[0].cwd).toBe(ROOT);
    expect(calls[0].args).toEqual([
      "-c", "core.quotepath=false",
      "-c", "i18n.logOutputEncoding=UTF-8",
      "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal",
    ]);
    expect(res.ok && res.data.untracked).toEqual(["a.txt"]);
  });
  it("maps a non-repository error to not-a-repo", async () => {
    const { exec } = fakeExec([
      { code: 128, stderr: "fatal: not a git repository (or any of the parent directories): .git" },
    ]);
    expect(await svc(exec).status(ROOT)).toMatchObject({ ok: false, code: "not-a-repo" });
  });
  it("maps a spawn failure to git-missing", async () => {
    const { exec } = fakeExec([{ code: null, errno: "ENOENT" }]);
    expect(await svc(exec).status(ROOT)).toMatchObject({ ok: false, code: "git-missing" });
  });
  it("maps a killed run to timeout", async () => {
    const { exec } = fakeExec([{ code: null, timedOut: true }]);
    expect(await svc(exec).status(ROOT)).toMatchObject({ ok: false, code: "timeout" });
  });
});

describe("diff", () => {
  it("asks for unified=3 plus numstat and merges them", async () => {
    const { calls, exec } = fakeExec([
      { stdout: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n" },
      { stdout: "2\t1\ta.txt\u0000" },
    ]);
    const res = await svc(exec).diff(ROOT, { staged: false, path: "a.txt" });
    expect(calls[0].args.slice(4)).toEqual(["diff", "--no-color", "--unified=3", "--", "a.txt"]);
    expect(calls[1].args.slice(4)).toEqual(["diff", "--numstat", "-z", "--", "a.txt"]);
    expect(res.ok && res.data[0]).toMatchObject({ path: "a.txt", additions: 2, deletions: 1 });
  });
  it("uses --cached for the staged side and --no-index for untracked files", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }, { stdout: "" }, { code: 1, stdout: "" }]);
    await svc(exec).diff(ROOT, { staged: true, path: "a.txt" });
    await svc(exec).diff(ROOT, { untracked: true, path: "new.txt" });
    expect(calls[0].args.slice(4)).toEqual(["diff", "--cached", "--no-color", "--unified=3", "--", "a.txt"]);
    expect(calls[2].args.slice(4)).toEqual([
      "diff", "--no-index", "--no-color", "--unified=3", "--", "/dev/null", "new.txt",
    ]);
    expect(calls[2].args.slice(4)).not.toContain("--cached");
  });
});

describe("mutations", () => {
  it("stage passes paths after -- and rejects an empty list", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    const service = svc(exec);
    expect(await service.stage(ROOT, [])).toMatchObject({ ok: false, code: "invalid-input" });
    await service.stage(ROOT, ["a.txt", "src/one.ts"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(4)).toEqual(["add", "--", "a.txt", "src/one.ts"]);
  });
  it("unstage uses restore --staged", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    await svc(exec).unstage(ROOT, ["a.txt"]);
    expect(calls[0].args.slice(4)).toEqual(["restore", "--staged", "--", "a.txt"]);
  });
  it("commit passes the message as one argument and returns the new sha", async () => {
    const { calls, exec } = fakeExec([{ stdout: "abc123\n" }]);
    const res = await svc(exec).commit(ROOT, { message: "feat: x\n\nbody" });
    expect(calls[0].args.slice(4)).toEqual(["commit", "-m", "feat: x\n\nbody"]);
    expect(res).toEqual({ ok: true, data: { sha: "abc123" } });
  });
  it("commit refuses an empty message before running git", async () => {
    const { calls, exec } = fakeExec([]);
    const res = await svc(exec).commit(ROOT, { message: "   " });
    expect(res).toMatchObject({ ok: false, code: "invalid-input" });
    expect(calls).toHaveLength(0);
  });
  it("switchBranch validates the name with check-ref-format first", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    await svc(exec).createBranch(ROOT, "feat/good-name", true);
    expect(calls[0].args.slice(4)).toEqual(["check-ref-format", "--branch", "feat/good-name"]);
    expect(calls[1].args.slice(4)).toEqual(["switch", "-c", "feat/good-name"]);
  });
  it("createBranch forwards git's own refusal for an invalid name", async () => {
    const { calls, exec } = fakeExec([
      { code: 128, stderr: "fatal: 'a..b' is not a valid branch name" },
    ]);
    const res = await svc(exec).createBranch(ROOT, "a..b", true);
    expect(res).toMatchObject({ ok: false, code: "invalid-input" });
    expect(calls).toHaveLength(1);
  });
  it("init runs git init and reports the created repository", async () => {
    const { calls, exec } = fakeExec([{ stdout: "Initialized empty Git repository" }]);
    const res = await svc(exec).init(ROOT);
    expect(calls[0].args.slice(4)).toEqual(["init"]);
    expect(res.ok).toBe(true);
  });
});

describe("log / branches / remote", () => {
  it("caps the log limit and always passes the format", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    await svc(exec).log(ROOT, { limit: 500 });
    const args = calls[0].args.slice(4);
    expect(args.slice(0, 3)).toEqual(["log", "--max-count=200", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%P%x1f%s%x1f%b%x1e"]);
    expect(args.slice(3)).toEqual(["--no-color", "--"]);
  });
  it("lists branches through for-each-ref with %00 separators", async () => {
    const { calls, exec } = fakeExec([{ stdout: "main\u0000abc\u0000*\u0000\n" }]);
    const res = await svc(exec).branches(ROOT);
    expect(calls[0].args.slice(4)).toEqual([
      "for-each-ref", "--format=%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)", "refs/heads",
    ]);
    expect(res.ok && res.data[0].head).toBe(true);
  });
  it("reads the origin url and maps a missing remote to null", async () => {
    const { exec } = fakeExec([
      { stdout: "https://github.com/x/y.git\n" },
      { code: 2, stderr: "error: No such remote 'origin'" },
    ]);
    const service = svc(exec);
    expect(await service.remote(ROOT)).toEqual({ ok: true, data: { url: "https://github.com/x/y.git" } });
    expect(await service.remote(ROOT)).toEqual({ ok: true, data: null });
  });
  it("available reports the version and the failing binary eats a git-missing result", async () => {
    const ok = fakeExec([{ stdout: "git version 2.53.0.windows.3\n" }]);
    expect(await svc(ok.exec).available()).toEqual({
      ok: true,
      data: { version: "2.53.0", raw: "git version 2.53.0.windows.3", binary: "git" },
    });
    const missing = fakeExec([{ code: null, errno: "ENOENT" }, { code: null, errno: "ENOENT" }]);
    expect(await svc(missing.exec).available()).toMatchObject({ ok: false, code: "git-missing" });
  });
});

describe("mutex", () => {
  it("serializes calls in submission order", async () => {
    const withLock = createMutex();
    const order: string[] = [];
    const slow = (name: string, ms: number) =>
      withLock(async () => {
        await new Promise((r) => setTimeout(r, ms));
        order.push(name);
      });
    await Promise.all([slow("a", 20), slow("b", 1), slow("c", 1)]);
    expect(order).toEqual(["a", "b", "c"]);
  });
});
