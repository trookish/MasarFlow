import { describe, it, expect } from "vitest";
import { applyResult, initialGitRepoState } from "@/lib/git/use-git-repo";

describe("applyResult", () => {
  it("stores data and clears the error on success", () => {
    const next = applyResult(initialGitRepoState(), { ok: true, data: { a: 1 } }, "status");
    expect(next.status).toEqual({ a: 1 });
    expect(next.error).toBeNull();
  });
  it("stores the typed error and keeps the previous data", () => {
    const withData = applyResult(initialGitRepoState(), { ok: true, data: { a: 1 } }, "status");
    const next = applyResult(withData, { ok: false, code: "no-remote", message: "error: No such remote 'origin'" }, "status");
    expect(next.status).toEqual({ a: 1 });
    expect(next.error).toEqual({ code: "no-remote", detail: "error: No such remote 'origin'", op: "status" });
  });
});

describe("initialGitRepoState", () => {
  it("starts empty and loading", () => {
    const s = initialGitRepoState();
    expect(s).toMatchObject({ root: null, branch: null, loading: true, error: null });
    expect(s.status).toBeNull();
  });
});
