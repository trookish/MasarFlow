import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { CH } from "@shared/channels";
import { REPO_ROOT } from "../_helpers/fs-scan";
import { createGitService } from "@desktop/git/service";
import { readRootsFile } from "@desktop/security/roots";
import type { GitExec } from "@desktop/git/run";

const preload = readFileSync(join(REPO_ROOT, "desktop/src/preload/index.ts"), "utf8");
const mainIpc = readFileSync(join(REPO_ROOT, "desktop/src/main/ipc/index.ts"), "utf8");
const api = readFileSync(join(REPO_ROOT, "desktop/src/shared/api.ts"), "utf8");

const value_ = (name: string): string => (CH as Record<string, string>)[name];

describe("channel table", () => {
  it("has no duplicate channel strings", () => {
    const values = Object.values(CH as Record<string, string>);
    expect(values.length).toBe(new Set(values).size);
  });
  it("uses namespaced names", () => {
    for (const v of Object.values(CH as Record<string, string>)) {
      expect(v).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });
});

describe("git channels are wired end to end", () => {
  const gitChannels = [
    "gitAvailable", "gitStatus", "gitDiff", "gitStage", "gitUnstage",
    "gitCommit", "gitLog", "gitBranches", "gitSwitchBranch", "gitCreateBranch",
    "gitInit", "gitRemote",
  ];
  it("declares every git channel", () => {
    for (const name of gitChannels) expect(value_(name), name).toBeTruthy();
  });
  it("every git channel is handled in main and exposed in preload", () => {
    for (const name of gitChannels) {
      expect(mainIpc, `${name} handler`).toContain(`CH.${name}`);
      expect(preload, `${name} preload`).toContain(`CH.${name}`);
    }
  });
  it("the renderer type declares the git surface", () => {
    expect(api).toMatch(/git:\s*\{/);
    for (const method of ["available", "status", "diff", "stage", "unstage", "commit", "log", "branches", "switchBranch", "createBranch", "init", "remote"]) {
      expect(api, method).toMatch(new RegExp(`${method}\\(`));
    }
  });
  it("no git operation is exposed over http (main-process only)", () => {
    expect(() => readFileSync(join(REPO_ROOT, "src/app/api/git/route.ts"), "utf8")).toThrow();
  });
});

/**
 * The P2 allow-list is enforced inside the main process: the service main/ipc
 * builds reads roots.json on every call and refuses anything outside it before
 * a git process can spawn — the UI never gets the chance to widen it.
 */
describe("roots allow-list is enforced in the main process", () => {
  const rootsFile = join(mkdtempSync(join(tmpdir(), "masarflow-git-roots-")), "roots.json");
  writeFileSync(rootsFile, JSON.stringify({ roots: ["C:\\linked"] }));

  it("refuses an unlinked folder on every operation, without running git", async () => {
    let execCalls = 0;
    const exec: GitExec = async () => {
      execCalls += 1;
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    };
    const git = createGitService({ exec, roots: () => readRootsFile(rootsFile), platform: "win32" });
    const results = await Promise.all([
      git.status("C:\\elsewhere"),
      git.diff("C:\\elsewhere", {}),
      git.stage("C:\\elsewhere", ["a.txt"]),
      git.unstage("C:\\elsewhere", ["a.txt"]),
      git.commit("C:\\elsewhere", { message: "x" }),
      git.log("C:\\elsewhere"),
      git.branches("C:\\elsewhere"),
      git.switchBranch("C:\\elsewhere", "main"),
      git.createBranch("C:\\elsewhere", "feat/x", true),
      git.init("C:\\elsewhere"),
      git.remote("C:\\elsewhere"),
    ]);
    for (const res of results) expect(res).toMatchObject({ ok: false, code: "root-not-allowed" });
    expect(execCalls).toBe(0);
  });

  it("lets a folder inside the allow-list through to git", async () => {
    let execCalls = 0;
    const exec: GitExec = async () => {
      execCalls += 1;
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    };
    const git = createGitService({ exec, roots: () => readRootsFile(rootsFile), platform: "win32" });
    const res = await git.status("C:\\linked\\repo");
    expect(res.ok).toBe(true);
    expect(execCalls).toBe(1);
  });
});
