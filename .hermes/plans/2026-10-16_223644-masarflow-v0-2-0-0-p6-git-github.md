# MasarFlow v0.2.0.0 — P6: Git & GitHub (local git, issues/PRs/CI, commit ⇄ task)

> **For Hermes:** execute with `subagent-driven-development`, one task at a time, two-stage review per task. Read the master plan (`…-master.md`) §1, §4 (D7–D10) and §6 first.
> **Depends on:** P1 (Electron shell + `window.masarflow` + `@desktop`/`@shared` test aliases), P2 (launch-token guard, roots.json + native folder picker, `secrets`), P5 (entity registry, `EntityChip`, `links`/backlinks, activity v12). **Branch:** `release/v0.2.0`.
> **Phase map slot:** master §7 row P6. Dexie stays at **version 12** in this phase — see "Decisions" D-P6-3.

**Goal:** A `git` service in the Electron main process (argv-only `execFile`, registered roots only, pure parsers) surfaced as a dock page (`/git`) with status/diff/stage/commit/branch/log, plus GitHub issues + PR/CI status and bidirectional issue⇄task sync driven by a non-indexed `task.externalRef` — all wired into the P5 entity/activity fabric instead of a parallel graph.

## Verified context (read from the repo and from real git output on 2026-10-16)

| Area | Fact | Evidence |
|---|---|---|
| IPC contract (P1) | Channels live in one object: `export const CH = { appInfo: "app:info", …, winMaximized: "window:maximized" } as const`; the renderer API type is `MasarflowApi` in `desktop/src/shared/api.ts`; preload exposes it as `window.masarflow`; main registers everything in `registerIpc(getWindow: () => BrowserWindow \| null)` inside `desktop/src/main/ipc/index.ts` | P1 plan lines 736–755, 757–788, 790–827, 1116–1147 |
| Preload today | The **old** launcher preload exposes `window.masarFlow` with `session/run/setup/env/…/github/repoUrl` — P1.T2 replaces the whole file, so P6 appends to the new one | `desktop/src/preload/index.ts:21,131,133` |
| Roots allow-list (P2) | `@shared/roots` → `normalizeRoot`, `isRootAllowed` (rejects siblings/parents/traversal, case-folds on win32), `parseRoots`; `@desktop/security/roots` → `readRootsFile(file)`, `addRootToFile(file, dir)`; channels `CH.rootsList = "roots:list"`, `CH.rootsCovers = "roots:covers"`; `MasarflowApi.dialog.chooseFolder(defaultPath?)` registers the picked folder as a root | P2 plan lines 849–882, 1023–1048, 1052–1055 |
| Secrets (P2) | `src/lib/secrets.ts` (`getSecret/setSecret/deleteSecret/secretsAvailable`), `src/lib/secrets-binding.ts` (`bindSecretField`), the GitHub PAT key is `"github:pat"`, `useGithub` keeps `owner/repo/branch/lastSyncedAt` only in localStorage | P2 plan lines 1351–1389, 1547–1584, 1588, 1609 |
| Desktop bridge (P1) | `getDesktop(): MasarflowApi \| null` in `src/lib/desktop/bridge.ts` reading `window.masarflow` — null in the browser → every git UI needs a "desktop required" state | P1 plan lines 1352–1366 |
| Test aliases (P1) | `tests/vitest.config.ts` aliases `@`→`src`, `@desktop`→`desktop/src/main`, `@shared`→`desktop/src/shared`, `@desktop-shared`→`desktop/src/shared` (node env, `include: ["tests/unit/**/*.test.ts"]`) | P1 plan lines 525–548; `tests/vitest.config.ts:1-15` |
| Root tsconfig | Today `compilerOptions.paths` has **only** `"@/*"`; P1.T1 adds `"@desktop-shared/*"`. The P2/P1b plans' tests import `@desktop/...` and `@shared/...` → those two path mappings must also exist for `pnpm typecheck` to pass. P6.T1 adds them (idempotent, and it is the first phase whose tests import main-process modules heavily) | `tsconfig.json:26-30`; P1 plan line 1366; P2 plan lines 26, 320, 1006, 1028 |
| Octokit | `octokit@5.0.5` (pnpm `node_modules/.pnpm/octokit@5.0.5`). Exactly one consumer today: `POST /api/github` (commits) + `src/lib/github-sync.ts`. Constructor takes an injectable fetch: `RequestRequestOptions { fetch?: Fetch }` | `package.json:50`; `src/app/api/github/route.ts:1,45`; `@octokit/types@17.0.0/dist-types/RequestRequestOptions.d.ts:5-9` |
| Octokit methods | `checks.listForRef` and `repos.getCombinedStatusForRef` exist; `issues` block has `create` / `createComment` / `listForRepo` / `update`; `pulls` block exists (`list`). Check-run schema: `status` enum, `conclusion` enum (`success\|failure\|neutral\|cancelled\|skipped\|timed_out\|action_required\|null`), `name`, `html_url`, `head_sha`. Issue item: `number, state, state_reason, title, body, labels, pull_request?, closed_at, updated_at, html_url`. Pull-request: `number, state, title, html_url, updated_at, merged, draft?, head.sha` | `@octokit/plugin-rest-endpoint-methods/…/method-types.d.ts:3171,10994,6088,8985`; `@octokit/openapi-types@27.0.0/types.d.ts:23401,14074,27314` |
| GitHub store + sync | `GithubSettings { pat, owner, repo, branch, lastSyncedAt }`; `syncGithubCommits()` writes `commits` rows, `links` rows (`sourceType:"commit"` → `targetType:"task"/"spec"`, `linkType:"implements"`) and a `devLogs` row per commit; spec refs parsed from `RFC-\d+` | `src/lib/stores/github.ts:9-33`; `src/lib/github-sync.ts:36-135` |
| Dexie tables | `commits: "id, projectId, sha, date"`, `links: "id, projectId, sourceId, targetId, linkType, [sourceType+sourceId], [targetType+targetId]"`, `tasks: "id, projectId, status, …"`; current version is **12** (11 = embeddings/P3, 12 = activity/P5) | `src/lib/db/index.ts:95-96,106,108-109,206`; P5 plan lines 922–929 |
| Task row | `taskSchema` has no `externalRef`; `tasksRepo.create()` runs `taskSchema.parse(...)` → zod **strips** unknown keys, so a new field must be declared in the schema. `tasksRepo.update()` writes raw patches (no parse) | `src/lib/db/schema.ts:226-243`; `src/lib/db/repos/tasks.ts:35-48` |
| Commit row | `commitSchema { id, projectId, sha, message, author, date, files, additions, deletions, aiSummary, linkedSpecIds, linkedTaskIds, createdAt }`, `commitsRepo.create/listByProject/get/update` — a local commit fits this table unchanged | `src/lib/db/schema.ts:361-376`; `src/lib/db/repos/commits.ts:28-55` |
| Entity fabric (P5) | `entityHref({kind,id})`, `KIND_META` (commit → `/dashboard`, **no param**), `isEntityKind`, `entityUri`; `openEntity(ref)` → dock; `EntityChip`; `computeBacklinks(links, ref)`; `linksRepo`; activity tracker already tracks the `commits` table (`{ kind: "commit", name: firstLine(r.message) }`); `EntityChip` takes `{ entity: EntityRef; className?: string }` and its file is created by P5 (`src/components/entities/entity-chip.tsx`); `linksRepo`'s real methods were re-read today: `listByProject(projectId)`, `listBySource(type,id)`, `listByTarget(type,id)`, `create({projectId, sourceType, sourceId, targetType, targetId, linkType, label?})`, `remove(id)` | P5 plan lines 153–243, 586–597, 643–686, 1797–1824, 859–871; P5 plan line 36 + 643–686 (EntityChip props); `src/lib/db/repos/links.ts:6,11,20,24,43` |
| Nav / dock | `PAGE_PATHS = [...new Set(ALL_NAV_ITEMS.map(i => i.href))]`; dock panels resolve through `PAGE_COMPONENTS` (one `next/dynamic` entry per route); nav groups end with a "System" group (`Sync Panel /sync`, `Project Watcher /watcher`, `Semantic Search /search`, `Plugins /plugins`, `Settings /settings`) | `src/lib/dock/registry.ts:22-24`; `src/components/dock/panel-loader.tsx:25-114`; `src/lib/nav.ts:142-167` |
| Feature-matrix guard (P0) | Test 1 compares `Object.keys(MATRIX)` with a recursive scan of `src/app/(workspace)/**/page.tsx`; test 2 is `expectShrinkingAllowlist(empty, Object.keys(MATRIX))` whose helper fails on **fresh or stale** entries → a new route must be added to the JSON with an **empty** feature list; a *feature* string added before its Playwright spec turns the suite red (that is why P9 owns features) | P0 plan lines 145–230, 57–63 |
| Project / root plumbing | Views read the project via `useActiveProjectId()` / `useActiveProject()`; `linkedProjectsRepo` stores `{ id, projectId, name, rootPath }` — the folder list the git panel should default to | `src/lib/hooks/use-project.ts:8-14`; `src/lib/db/repos/linkedProjects.ts:10-48`; `src/lib/db/schema.ts:673-683` |
| Existing git surfaces | **None in `src/`**: the only `execFile` is the approved shell route, and `/api/python/git` proxies a Python path that P3 deletes. Nothing to reuse, nothing to duplicate | `src/app/api/fs/shell/route.ts:1,58`; `src/app/api/python/git/route.ts` exists; master §2 F3 |
| git on this machine | Two installs: bundled git-bash `git 2.53.0.windows.3` (`/mingw64/bin/git`) and native Git for Windows 2.45.1 at `C:\Program Files\Git\cmd\git.exe` (exists; `%LOCALAPPDATA%\Programs\Git\cmd\git.exe` does **not**). Both handle `diff --no-index -- /dev/null <file>` identically (exit 1) | ran `git --version`, `ls` of both paths, native `diff --no-index` on `nat.txt` |
| git output formats | All fixtures below are **real bytes captured from git 2.53.0** in throwaway repos; see "Fixture provenance" | commands + `od -c` dumps listed in Findings F6 |
| Env / API reality | `execFile("git", args, {env:{GIT_TERMINAL_PROMPT:"0", LC_ALL:"C", …}})` round-trips a UTF-8 commit message (Arabic + emoji) byte-exact; `-z` output carries raw UTF-8 paths with spaces; ENOENT → `err.code: "ENOENT"`; timeout → `error.killed === true`, `code === null`, `signal: "SIGTERM"` | `node verify-node-git.js` output (see Findings F7) |
| Context engine | `DEFAULT_BUDGET = 28_000`; sections are pushed in priority order by `push()` (drops what does not fit); the project header is pushed first, memories second, specs third → a Repository line inserted at `src/lib/ai/context.ts:268` can never be dropped | `src/lib/ai/context.ts:87,247-267,269-276` |
| UI kit | `button`, `badge`, `input`, `textarea`, `scroll-area`, `dialog`, `tabs`, `confirm-dialog`, `empty-state`, `tooltip` all exist under `src/components/ui/` | `ls src/components/ui/` |
| e2e harness | Playwright runs against `pnpm start` (production build, `baseURL http://localhost:3000`), so browser e2e has **no** `window.masarflow` | `tests/playwright.config.ts` (webServer block); master §1 |

**Fixture provenance (P6.T2–T4 fixtures are copied verbatim from these runs):** throwaway repos under `%TMP%` (`fx1`…`fx6`, `fx-utf8`) created with `git init`; `git status --porcelain=v2 --branch -z`, `git diff --cached|--unified=0|3 --no-color`, `git diff --numstat -z`, `git log --format=…%x1f…%x1e`, `git for-each-ref --format=……%00……`, `git check-ref-format --branch`, `git remote get-url origin`, plus the Node/`execFile` probe were all executed and dumped with `od -c`/`repr()` before this file was written. The MasarFlow repository itself was only read, never written.

## Findings that shape this phase

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | Main-process git must be argv-only and root-scoped: `isRootAllowed(root, readRootsFile(rootsFile))` is the only gate; the renderer never gets a shell. | P2 plan 863–872, 1030–1047 | Every service op takes `root`, re-reads roots.json **per call** (no cache) so revoking access is immediate; refusals are `root-not-allowed`, not throws. |
| F2 | Porcelain v2 (`--branch -z`) headers are NUL-terminated too, and paths are **repo-root-relative even from a subdirectory**; rename records carry `<path>\0<origPath>\0`; unmerged records carry 7 tokens before the path; detached head prints `# branch.head (detached)`. | ran all four cases (see Findings F6 fixtures) | The status parser splits on `\0` and never on `\n`; it must not assume `-z` only affects records. |
| F3 | `git diff --no-color` on a path containing a space appends a **tab** before the newline on `---`/`+++` lines (`+++ b/ملف فيه مسافة.txt\t`); `core.quotepath=false` keeps raw UTF-8; default quotepath C-escapes into `"a/\331…"`. | `od -c` of the staged diff of `ملف فيه مسافة.txt` | Diff parser strips a trailing `\t…` suffix and implements `unquoteGitPath`; the service always passes `-c core.quotepath=false`. |
| F4 | `git diff` exits **1** when it found differences — that is success, not failure. `git remote get-url origin` exits **2** with `error: No such remote 'origin'`; `git switch <missing>` exits 128 with `fatal: invalid reference: …`; non-repo is `fatal: not a git repository (or any of the parent directories): .git` (128); `git check-ref-format --branch 'a..b'` → `fatal: 'a..b' is not a valid branch name` (128) while `feat/x` exits 0. | ran each command, captured exit codes | `classifyGitFailure(raw, acceptedExitCodes)` takes per-command accepted codes (`[0]` for mutations, `[0,1]` for diff); error copy is driven by a typed code, not by regex-in-the-UI. |
| F5 | `git` warns on stderr about LF→CRLF on an exit-0 command (happens on every status/diff here). | `warning: in the working copy of 'alpha.txt', LF will be replaced by CRLF…` with `exit=0` | Stderr is **diagnostics**, never failure; only a non-accepted exit code or a spawn error fails a call. |
| F6 | `%x1f`/`%x1e` work in `git log --format`, but `for-each-ref` prints `%x1f` literally — `%00` is the working separator there; `%(HEAD)` is `*` on the current branch and a single **space** otherwise. | `for_each_ref_x1f.txt` = `main%x1f…`, `ref_sep00.txt` = `main\0ef0c80f\n`, `for_each_ref_full.bin` = `feature/x\0…\0 \0main\n` | Log parser uses `%x1f/%x1e`; branch parser uses `%00`. |
| F7 | `execFile` pitfalls verified in the real Node runtime: ENOENT gives `err.code === "ENOENT"` (no numeric code); a timeout gives `killed === true`, `code === null`, `signal === "SIGTERM"`; `LC_ALL=C` + `-m <arabic/emoji>` round-trips exactly. | `node verify-node-git.js` (scratch) | `timeoutMs` must be classified from `killed`, not from the exit code; the runner must not shell-quote anything. |
| F8 | The P5 registry maps `commit` → `/dashboard` with **no** selection param and its test pins `entityHref({kind:"commit",…}) === "/dashboard"`. | P5 plan lines 191, 82–83 | P6 does **not** re-point `commit` at `/git` (that would rewrite a P5 test and P7/P9 assumptions); commit detail lives inside the Git page, task chips on commit rows are the cross-page link. Deferred: see Q-P6-2. |
| F9 | `tasksRepo.create` zod-parses and strips unknown keys; `commits/link/devLogs` repos are the existing commit-linking path used by `github-sync.ts`. | F-table rows "Task row", "GitHub store + sync" | `externalRef` must be declared in `taskSchema` (no index, no Dexie bump); local commit linking reuses `commitsRepo` + `linksRepo` (`linkType: "implements"`) + a `devLogs` row exactly like the GitHub sync. |
| F10 | Activity tracking already covers the `commits` table (`TRACKED.commits`), so writing a commit row produces an activity entry with **no** manual call. | P5 plan lines 859–871 | P6 must NOT write a second activity row for the same commit (no duplicate "Created commit" noise). |
| F11 | A `/git` route must be added to `tests/e2e/feature-matrix.json` **and** to nav + panel-loader in the same commit as the page, or P0's guard test 1 fails (route scan). Feature strings stay empty until P9. | P0 plan 187–215 | T9 does all four edits together and re-runs the guard; the P9 handoff lists the feature titles. |
| F12 | Browser-mode e2e (`pnpm start` + Playwright) has no `window.masarflow`, and the packaged-desktop e2e harness only arrives in P9 (`pnpm e2e:desktop`). | master §3 item 2; `tests/playwright.config.ts` | P6 verifies the UI with (a) unit tests on every pure module, (b) the P0 guard tests, (c) a named **manual** desktop checklist (T19) — no new Playwright spec that would need a production build now. |

## Decisions (and what is deliberately out of scope)

- **D-P6-1 — git lives in main, never in a Next route.** A route would expose `execFile` over HTTP behind the loopback token; main-process IPC needs no network surface at all, and roots.json is already there. `src/app/api/**` gains only the two GitHub routes.
- **D-P6-2 — No hunk-level staging in 0.2 (YAGNI).** Whole-file stage/unstage covers the panel's job; partial staging needs `git apply --cached` patch surgery plus a line-selection UI, and the owner can use the terminal panel (P8) meanwhile. Written as R-P6-1 with the follow-up shape.
- **D-P6-3 — Dexie stays at version 12.** `task.externalRef` is a plain (non-indexed) field; issue⇄task lookups go through `listByProject` (a project has tens of tasks), so no index and no schema bump. Master §6's "v13 only if a new table is truly needed" resolves to *not needed*.
- **D-P6-4 — No network mutations from the panel** (no `fetch`/`pull`/`push`/PR merge). Push needs credential/askpass UX and a decision about the user's ssh-agent; P6 shows the remote URL and the ahead/behind counts only. Q-P6-1 tracks it.
- **D-P6-5 — Results, not exceptions.** Every git IPC method returns `GitResult<T>` (`{ok:true,data}` / `{ok:false,code,message}`) so the renderer renders failure states without try/catch and unit tests assert codes, not messages.
- **D-P6-6 — GitHub keeps riding the existing Octokit + PAT plumbing.** Two thin routes (`/api/github/issues`, `/api/github/pulls`) call one injectable client module; the PAT is whatever P2 put in `useGithub`/the keychain. Nothing in P2 is re-planned.
- **D-P6-7 — One read-only chat tool (`git_status`) plus one context line.** Chat may *see* the repository; chat may not stage/commit in 0.2 (a write tool would bypass the panel's confirm UX). Q-P6-3.

## File map (all new unless marked)

```
desktop/src/shared/git.ts              types shared by main + renderer (pure)
desktop/src/main/git/run.ts            argv builder, failure classification, version parse (pure)
desktop/src/main/git/exec.ts           the real execFile adapter (only file that touches child_process)
desktop/src/main/git/parse-status.ts   porcelain v2 -> GitRepoStatus (pure)
desktop/src/main/git/parse-refs.ts     log / branches / remotes / single-line parsing (pure)
desktop/src/main/git/parse-diff.ts     numstat -z + unified diff -> GitDiffFile[] (pure)
desktop/src/main/git/service.ts        createGitService({exec, roots, platform}) -> typed ops
src/lib/git/client.ts                  getDesktop()?.git wrapper + error copy (pure)
src/lib/git/format.ts                  labels, relative dates, validation, summaries (pure)
src/lib/git/use-git-repo.ts            hook: root selection + status/diff/log state
src/lib/git/link-commit.ts             local commit -> commits row + links + devlog
src/lib/github/issue-sync.ts           pure issue⇄task planner + executor
src/lib/github/remote.ts               pure: origin URL -> {owner, repo, htmlUrl} (github.com only)
src/lib/server/github/client.ts        Octokit with injected fetch (node-testable)
src/lib/ai/git-context.ts              pure: repo brief for the chat context
src/lib/utils/text.ts                  firstLine helper (new; src/lib/utils/ has no text.ts today)
src/app/(workspace)/git/page.tsx
src/components/git/git-view.tsx
src/components/git/git-status-panel.tsx
src/components/git/git-diff-view.tsx
src/components/git/git-commit-box.tsx
src/components/git/git-branch-menu.tsx
src/components/git/git-log-list.tsx
src/components/git/link-task-dialog.tsx
src/components/git/github-section.tsx
src/app/api/github/issues/route.ts
src/app/api/github/pulls/route.ts
tests/unit/desktop/git-run.test.ts, git-status.test.ts, git-refs.test.ts, git-diff.test.ts, git-service.test.ts
tests/unit/desktop/ipc-contract.test.ts
tests/unit/lib/git/client.test.ts, format.test.ts, link-commit.test.ts, use-git-repo.test.ts, git-state.test.ts
tests/unit/lib/github/issue-sync.test.ts, client.test.ts, remote.test.ts
tests/unit/app/api/github/routes.test.ts
tests/unit/lib/ai/git-context.test.ts
MODIFIED: tsconfig.json (+2 path maps), desktop/src/shared/channels.ts, desktop/src/shared/api.ts,
          desktop/src/preload/index.ts, desktop/src/main/ipc/index.ts,
          src/lib/db/schema.ts (task.externalRef), src/lib/db/repos/tasks.ts (normalize),
          src/lib/nav.ts, src/components/dock/panel-loader.tsx, tests/e2e/feature-matrix.json,
          src/lib/ai/context.ts, src/lib/ai/workspace-tool-defs.ts, src/lib/ai/tools.ts,
          tests/unit/lib/ai/context.test.ts + workspace-tool-defs.test.ts (appended cases)
NOT TOUCHED: src/app/api/github/route.ts (commits), src/lib/github-sync.ts, src/lib/stores/github.ts,
          src/app/api/python/** (P3 deletes), desktop/src/renderer/** (P1 retires it)
```

---

## P6.T1 — Shared git types, argv builder, failure classification (TDD, ≈8 min)

**Prerequisite (once, idempotent):** root `tsconfig.json` `compilerOptions.paths` must resolve the two aliases P1.T1 left out, because from P6 on the unit tests import main-process modules that themselves import `@shared/*`:

```json
    "paths": {
      "@/*": ["./src/*"],
      "@desktop-shared/*": ["./desktop/src/shared/*"],
      "@desktop/*": ["./desktop/src/main/*"],
      "@shared/*": ["./desktop/src/shared/*"]
    }
```

If P1.T1/P2 already added the last two, change nothing. Check with `grep -n "@desktop/\*" tsconfig.json`.

**Failing test — create `tests/unit/desktop/git-run.test.ts`:**

```ts
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
    expect(args[5]).toBe("commit");
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
```

Run: `pnpm test -- tests/unit/desktop/git-run.test.ts`
Expected: **FAIL** — `Failed to resolve import "@desktop/git/run"`.

**Create `desktop/src/shared/git.ts`:**

```ts
/**
 * Git types shared by the main process (producer) and the renderer (consumer).
 * Pure TypeScript — no Electron, no node:child_process, no React (imported by
 * both `@shared/git` in the Electron build and `@desktop-shared/git` in tests
 * and in the Next app).
 */

export type GitStatusLetter =
  | "." | "M" | "T" | "A" | "D" | "R" | "C" | "U" | "?";

export interface GitFileChange {
  /** Repo-root-relative path (forward slashes, raw UTF-8). */
  path: string;
  /** Previous path for a rename/copy, else null. */
  origPath: string | null;
  /** One-letter index (staged) status; "." = unchanged. */
  index: GitStatusLetter;
  /** One-letter worktree (unstaged) status; "." = unchanged. */
  worktree: GitStatusLetter;
  /** Unmerged (conflict) entry, from a `u` record. */
  conflicted: boolean;
}

export interface GitRepoStatus {
  /** Current branch name, or "HEAD" when detached (matches `git rev-parse --abbrev-ref HEAD`). */
  head: string;
  detached: boolean;
  /** Full HEAD commit id, or the all-zero id before the first commit. */
  oid: string;
  /** e.g. "origin/main", or null when the branch has no upstream. */
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: GitFileChange[];
}

export interface GitBranchInfo {
  name: string;
  oid: string;
  head: boolean;
  upstream: string;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  /** ISO-8601 author date as git prints it (%aI), e.g. "2026-10-16T23:46:00+03:00". */
  date: string;
  committer: string;
  /** Space-separated parent ids. */
  parents: string[];
  subject: string;
  body: string;
}

export interface GitDiffHunk {
  /** The raw "@@ -a,b +c,d @@ section" line. */
  header: string;
  /** Body lines including their leading ' ', '+', '-' or '\'. */
  lines: string[];
}

export interface GitDiffFile {
  path: string;
  origPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "binary";
  binary: boolean;
  additions: number;
  deletions: number;
  /** True when the old side is /dev/null (new file, incl. untracked via --no-index). */
  isNew: boolean;
  hunks: GitDiffHunk[];
}

export interface GitNumstatEntry {
  path: string;
  origPath: string | null;
  additions: number;
  deletions: number;
  binary: boolean;
}

export type GitFailureCode =
  | "git-missing"
  | "not-a-repo"
  | "root-not-allowed"
  | "permission-denied"
  | "index-locked"
  | "nothing-to-commit"
  | "invalid-input"
  | "no-remote"
  | "detached-head"
  | "timeout"
  | "unknown";

export interface GitOk<T> {
  ok: true;
  data: T;
}

export interface GitErr {
  ok: false;
  code: GitFailureCode;
  /** Last non-empty stderr line, trimmed to 300 chars — for the "details" line, not for the headline. */
  message: string;
}

export type GitResult<T> = GitOk<T> | GitErr;
```

**Create `desktop/src/main/git/run.ts`:**

```ts
import type { GitFailureCode } from "@shared/git";

/**
 * Pure half of the git runner: argv construction, version parsing, binary
 * discovery, failure classification. The only file that spawns processes is
 * ./exec.ts, which keeps every test here deterministic (no git needed).
 *
 * Verified on this machine: git 2.53.0.windows.3 (git-bash bundle) and native
 * Git for Windows 2.45.1 both accept the prelude below and print identical
 * porcelain v2 / numstat -z / unified diff output.
 */

export const GIT_TIMEOUT_MS = 60_000;
export const GIT_MAX_OUTPUT = 8 * 1024 * 1024;

/** Commands where exit code 1 means "differences found" — a normal result. */
export const DIFF_EXIT_CODES: readonly number[] = [0, 1];

export interface GitInvocation {
  binary: string;
  /** Full argv after the prelude. */
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export interface GitRawRun {
  /** Process exit code, or null when the process could not start / was killed. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Node errno when the spawn itself failed ("ENOENT", "EACCES", …). */
  errno?: string;
}

export type GitExec = (inv: GitInvocation) => Promise<GitRawRun>;

/**
 * `core.quotepath=false` keeps UTF-8 paths raw (`-z` output is raw either way);
 * `i18n.logOutputEncoding=UTF-8` keeps log bodies stable; no pager/color is
 * needed because there is no TTY.
 */
export function buildGitArgs(args: string[]): string[] {
  return [
    "-c", "core.quotepath=false",
    "-c", "i18n.logOutputEncoding=UTF-8",
    ...args,
  ];
}

export interface GitVersion {
  version: string;
  raw: string;
}

/** "git version 2.53.0.windows.3" -> { version: "2.53.0" }. */
export function parseGitVersion(stdout: string): GitVersion | null {
  const line = stdout.trim().split("\n")[0]?.trim() ?? "";
  const m = /^git version (\d+\.\d+(?:\.\d+)?)/.exec(line);
  return m ? { version: m[1], raw: line } : null;
}

/** Well-known install locations, tried in order after PATH. */
export const WIN_GIT_FALLBACKS: readonly string[] = [
  "C:\\Program Files\\Git\\cmd\\git.exe",
  "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
];

/**
 * Ordered candidate list for the git binary. `MASARFLOW_GIT_PATH` is a strict
 * override (portable installs, and how the failure matrix reproduces
 * "git-missing"): when it is set nothing else is tried. Otherwise PATH first,
 * then the well-known Windows install locations that actually exist on disk.
 */
export function candidateGitBinaries(
  env: { MASARFLOW_GIT_PATH?: string },
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): string[] {
  const override = env.MASARFLOW_GIT_PATH?.trim();
  if (override) return [override];
  const out: string[] = ["git"];
  if (platform === "win32") {
    for (const p of WIN_GIT_FALLBACKS) if (exists(p)) out.push(p);
  }
  return out;
}

const RULES: Array<{ code: GitFailureCode; re: RegExp }> = [
  { code: "not-a-repo", re: /not a git repository/i },
  { code: "index-locked", re: /index\.lock|Another git process/i },
  { code: "nothing-to-commit", re: /nothing to commit|no changes added to commit/i },
  { code: "no-remote", re: /No such remote|does not appear to be a git repository/i },
  {
    code: "invalid-input",
    re: /invalid reference|not a valid branch name|did not match any file|unknown revision|ambiguous argument|Pathspec/i,
  },
  { code: "permission-denied", re: /permission denied|access is denied|unable to create file/i },
];

/** Last non-empty stderr line, clipped — the diagnostic the UI shows under the friendly copy. */
export function lastStderrLine(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.length > 300 ? `${last.slice(0, 299)}…` : last;
}

/**
 * Typed failure for a finished run, or null when the run counts as success.
 * `accepted` defaults to [0]; diff commands pass DIFF_EXIT_CODES.
 */
export function classifyGitFailure(
  raw: GitRawRun,
  accepted: readonly number[] = [0],
): GitFailureCode | null {
  if (raw.errno === "ENOENT") return "git-missing";
  if (raw.errno === "EACCES" || raw.errno === "EPERM") return "permission-denied";
  if (raw.timedOut) return "timeout";
  if (raw.code === null) return "unknown";
  if (accepted.includes(raw.code)) return null;
  if (raw.errno) return "unknown";
  for (const rule of RULES) if (rule.re.test(raw.stderr)) return rule.code;
  return "unknown";
}
```

Run: `pnpm test -- tests/unit/desktop/git-run.test.ts`
Expected: **PASS** (`Tests  10 passed`). `pnpm typecheck` → exit 0.
Commit: `feat(git): argv-only git invocation, binary discovery and typed failure codes`

---

## P6.T2 — Status parser: porcelain v2 with `-z` (TDD, ≈10 min)

**Failing test — create `tests/unit/desktop/git-status.test.ts`** (fixtures are the exact bytes captured from git 2.53.0; `\u0000` is the record separator git prints in `-z` mode):

```ts
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
```

Run: `pnpm test -- tests/unit/desktop/git-status.test.ts`
Expected: **FAIL** — cannot resolve `@desktop/git/parse-status`.

**Create `desktop/src/main/git/parse-status.ts`:**

```ts
import type { GitFileChange, GitRepoStatus, GitStatusLetter } from "@shared/git";

/**
 * `git status --porcelain=v2 --branch -z` parser. Pure.
 *
 * Verified against git 2.53.0 output:
 *  - in -z mode every record (headers included) ends with NUL, not LF;
 *  - `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`;
 *  - `2 <XY> <sub> … <X><score> <path>\0<origPath>`;
 *  - `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`;
 *  - `? <path>` untracked, `! <path>` ignored;
 *  - `# branch.head (detached)` in a detached HEAD, `# branch.upstream <name>`,
 *    `# branch.ab +<ahead> -<behind>`, `# branch.oid (initial)` before the first commit.
 * Paths are repo-root-relative even when git runs in a subdirectory, so the
 * service always runs with cwd = the repository root.
 */

const ZERO_OID = "0000000000000000000000000000000000000000";

function letter(ch: string | undefined): GitStatusLetter {
  return (ch && ch.length === 1 ? (ch as GitStatusLetter) : ".");
}

export function parseStatusPorcelainV2(raw: string): GitRepoStatus {
  const status: GitRepoStatus = {
    head: "",
    detached: false,
    oid: "",
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  const records = raw.split("\u0000").filter((r) => r.length > 0);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.startsWith("# branch.oid ")) {
      const oid = rec.slice("# branch.oid ".length).trim();
      status.oid = oid === "(initial)" ? "" : oid;
      continue;
    }
    if (rec.startsWith("# branch.head ")) {
      const head = rec.slice("# branch.head ".length).trim();
      status.detached = head === "(detached)";
      status.head = status.detached ? "HEAD" : head;
      continue;
    }
    if (rec.startsWith("# branch.upstream ")) {
      status.upstream = rec.slice("# branch.upstream ".length).trim();
      continue;
    }
    if (rec.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(rec);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
      continue;
    }
    if (rec.startsWith("# ")) continue;

    const kind = rec[0];
    if (kind === "?") {
      status.untracked.push(rec.slice(2));
      continue;
    }
    if (kind === "!") continue;

    const fields = rec.split(" ");
    if (kind === "1" && fields.length >= 9) {
      const xy = fields[1];
      const path = fields.slice(8).join(" ");
      const change: GitFileChange = {
        path,
        origPath: null,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: false,
      };
      if (change.index !== "." && change.index !== "?") status.staged.push(change);
      if (change.worktree !== "." ) status.unstaged.push({ ...change });
      continue;
    }
    if (kind === "2" && fields.length >= 10) {
      const xy = fields[1];
      const path = fields.slice(9).join(" ");
      // In -z mode the original path is the NEXT NUL-separated token.
      const origPath = records[i + 1] ?? null;
      if (origPath !== null) i++;
      const change: GitFileChange = {
        path,
        origPath,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: false,
      };
      if (change.index !== "." && change.index !== "?") status.staged.push(change);
      if (change.worktree !== ".") status.unstaged.push({ ...change });
      continue;
    }
    if (kind === "u" && fields.length >= 11) {
      const xy = fields[1];
      status.conflicted.push({
        path: fields.slice(10).join(" "),
        origPath: null,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: true,
      });
      continue;
    }
  }
  return status;
}

/** True when the worktree is clean (no staged, unstaged, untracked or conflicted files). */
export function isClean(status: GitRepoStatus): boolean {
  return (
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicted.length === 0
  );
}

/** True when HEAD is the all-zero id — a repository with no commits yet. */
export function isEmptyRepo(status: GitRepoStatus): boolean {
  return status.oid === "" || status.oid === ZERO_OID;
}
```

Run: `pnpm test -- tests/unit/desktop/git-status.test.ts`
Expected: **PASS** (`Tests  7 passed`).
Commit: `feat(git): pure porcelain-v2 status parser (+ clean/empty helpers)`

---

## P6.T3 — Log, branch and remote parsers (TDD, ≈8 min)

**Failing test — create `tests/unit/desktop/git-refs.test.ts`** (separators verified: `%x1f` = unit, `%x1e` = record in `git log`; `%00` works in `for-each-ref` while `%x1f` does not; `%(HEAD)` is `*` or a single space):

```ts
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
    const raw =
      "feature/x\u001b" +
      "";
    const real = "feature/x\u00001e6c3a5ed700df90995254673b3ca7fc8ff75b4a\u0000\u0000main\n" +
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
```

Run: `pnpm test -- tests/unit/desktop/git-refs.test.ts`
Expected: **FAIL** — cannot resolve `@desktop/git/parse-refs`.

**Create `desktop/src/main/git/parse-refs.ts`:**

```ts
import type { GitBranchInfo, GitCommitInfo } from "@shared/git";

/**
 * Pure parsers for `git log`, `git for-each-ref` and `git remote get-url`.
 * Separator choices are verified, not assumed:
 *  - `git log --format=…%x1f…%x1e` honours %x1f/%x1e;
 *  - `git for-each-ref --format=…%00…` honours %00, while `%x1f` is printed
 *    literally by for-each-ref (so %00 is used there);
 *  - `%(HEAD)` yields "*" for the current branch and a single space otherwise.
 */

const UNIT = "\u001f";
const RECORD = "\u001e";

export const LOG_FORMAT = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%P%x1f%s%x1f%b%x1e";
export const BRANCH_FORMAT = "%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)";

export function parseCommitLog(raw: string): GitCommitInfo[] {
  const out: GitCommitInfo[] = [];
  for (const chunk of raw.split(RECORD)) {
    const text = chunk.replace(/^\r?\n/, "");
    if (!text.trim()) continue;
    const parts = text.split(UNIT);
    if (parts.length < 9) continue;
    out.push({
      sha: parts[0],
      shortSha: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      committer: parts[5],
      parents: parts[6].trim() ? parts[6].trim().split(" ") : [],
      subject: parts[7],
      // The body is last: re-join so a stray unit separator inside a body
      // cannot shift the fields before it.
      body: parts.slice(8).join(UNIT).replace(/\r?\n$/, ""),
    });
  }
  return out;
}

export function parseBranchList(raw: string): GitBranchInfo[] {
  const out: GitBranchInfo[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, oid, head, upstream] = line.split("\u0000");
    if (!name) continue;
    out.push({
      name,
      oid: oid ?? "",
      head: (head ?? "").trim() === "*",
      upstream: upstream ?? "",
    });
  }
  return out;
}

/** Single-line command output, or null when blank. */
export function parseSingleLine(raw: string): string | null {
  const first = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return first ? first : null;
}

/** `git remote get-url origin` -> url, or null when the remote does not exist. */
export function parseRemoteUrl(raw: string): string | null {
  if (/No such remote/.test(raw)) return null;
  return parseSingleLine(raw);
}

/** True when the text looks like git's "not a repository" refusal. */
export function isNotARepoError(text: string): boolean {
  return /not a git repository/i.test(text);
}
```

Run: `pnpm test -- tests/unit/desktop/git-refs.test.ts`
Expected: **PASS** (`Tests  8 passed`).
Commit: `feat(git): log, branch and remote parsers`

---

## P6.T4 — Diff parser: numstat `-z` + unified diff (TDD, ≈12 min)

**Failing test — create `tests/unit/desktop/git-diff.test.ts`** (every string below is real git output; note the trailing TAB git appends to `+++` when the path contains a space):

```ts
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
    expect(unquoteGitPath('"a/\\331\\205.txt"')).toBe("a/\331\205.txt".replace("\331\205", ""));
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
```

Run: `pnpm test -- tests/unit/desktop/git-diff.test.ts`
Expected: **FAIL** — cannot resolve `@desktop/git/parse-diff`.

**Create `desktop/src/main/git/parse-diff.ts`:**

```ts
import type { GitDiffFile, GitNumstatEntry } from "@shared/git";

/**
 * Diff parsers. Pure; every input shape below was captured from git 2.53.0
 * (see the plan's fixture provenance) before this file was written:
 *  - `git diff --numstat -z`: "<add>\t<del>\t<path>\0", renames as
 *    "<add>\t<del>\t\0<old>\0<new>\0", binaries as "-\t-\t<path>\0";
 *  - unified diff: "diff --git a/x b/y", "new file mode", "deleted file mode",
 *    "similarity index", "rename from/rename to", "index", "--- /dev/null",
 *    "+++ b/<path>" (a TAB and a timestamp may follow the path),
 *    "Binary files a/x and b/x differ", "@@ … @@", "\ No newline at end of file".
 */

/** Count +/- lines of a parsed file (used when numstat has no entry). */
export function countDiffLines(file: GitDiffFile): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
  }
  return { additions, deletions };
}

/** git appends "\t<timestamp>" to ---/+++ when the path needs it; drop it. */
export function stripTabSuffix(line: string): string {
  const tab = line.indexOf("\t");
  return (tab === -1 ? line : line.slice(0, tab)).trimEnd();
}

/** Decode git's C-style quoted path form ("a/\331\205.txt" with quotepath on). */
export function unquoteGitPath(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('"') || !text.endsWith('"')) return text;
  const inner = text.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\") {
      const next = inner[i + 1];
      if (next === undefined) break;
      if (/[0-7]/.test(next)) {
        const oct = inner.slice(i + 1, i + 4);
        const m = /^[0-7]{1,3}/.exec(oct);
        if (m) {
          bytes.push(parseInt(m[0], 8));
          i += m[0].length;
          continue;
        }
      }
      const map: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, "\\": 92, a: 7, b: 8, f: 12, v: 11 };
      bytes.push(map[next] ?? next.charCodeAt(0));
      i++;
      continue;
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

function stripPrefix(p: string): string {
  return /^[ab]\//.test(p) ? p.slice(2) : p;
}

export function parseNumstatZ(raw: string): GitNumstatEntry[] {
  const tokens = raw.split("\u0000");
  const out: GitNumstatEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const parts = token.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : Number(parts[0]);
    const deletions = parts[1] === "-" ? 0 : Number(parts[1]);
    const binary = parts[0] === "-" || parts[1] === "-";
    if (parts[2] === "") {
      // rename: <add>\t<del>\t\0<old>\0<new>\0
      const origPath = tokens[i + 1] || null;
      const path = tokens[i + 2] || "";
      i += 2;
      if (!path) continue;
      out.push({ path: unquoteGitPath(path), origPath: origPath ? unquoteGitPath(origPath) : null, additions, deletions, binary });
      continue;
    }
    out.push({ path: unquoteGitPath(parts.slice(2).join("\t")), origPath: null, additions, deletions, binary });
  }
  return out;
}

/** Path from a `diff --git a/<x> b/<y>` header, best effort (spaces are ambiguous). */
function pathFromDiffLine(line: string): string | null {
  const rest = line.slice("diff --git ".length);
  const quoted = /^"a\/(.*)" "b\/(.*)"$/.exec(rest);
  if (quoted) return unquoteGitPath(`"b/${quoted[2]}"`);
  const m = /^a\/(.+) b\/(.+)$/.exec(rest);
  return m ? m[2] : null;
}

export function parseUnifiedDiff(raw: string): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  let current: GitDiffFile | null = null;
  const push = (): void => {
    if (current) files.push(current);
    current = null;
  };

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      push();
      const path = pathFromDiffLine(line);
      current = {
        path: path ? stripPrefix(path) : "",
        origPath: null,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        isNew: false,
        hunks: [],
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) {
      current.status = "added";
      current.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.origPath = stripPrefix(unquoteGitPath(line.slice("rename from ".length)));
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = stripPrefix(unquoteGitPath(line.slice("rename to ".length)));
      continue;
    }
    if (line.startsWith("copy from ") || line.startsWith("copy to ")) {
      current.status = "copied";
      const value = stripPrefix(unquoteGitPath(line.slice(line.indexOf(" ") + 1)));
      if (line.startsWith("copy from ")) current.origPath = value;
      else current.path = value;
      continue;
    }
    if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      current.binary = true;
      current.status = "binary";
      continue;
    }
    if (line.startsWith("--- ")) {
      const value = stripTabSuffix(line.slice(4));
      if (value === "/dev/null") current.isNew = true;
      else current.origPath = current.origPath ?? stripPrefix(unquoteGitPath(value));
      continue;
    }
    if (line.startsWith("+++ ")) {
      const value = stripPrefix(unquoteGitPath(stripTabSuffix(line.slice(4))));
      if (value !== "/dev/null") current.path = value;
      continue;
    }
    if (line.startsWith("@@")) {
      current.hunks.push({ header: line.trimEnd(), lines: [] });
      continue;
    }
    const hunk = current.hunks[current.hunks.length - 1];
    if (hunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\") || line === "")) {
      if (line !== "") hunk.lines.push(line);
      continue;
    }
  }
  push();
  return files.filter((f) => f.path !== "");
}

/** Attach numstat counts (and binary flags) to parsed files, by path. */
export function mergeDiffStats(files: GitDiffFile[], numstat: GitNumstatEntry[]): GitDiffFile[] {
  const byPath = new Map(numstat.map((n) => [n.path, n]));
  return files.map((file) => {
    const stat = byPath.get(file.path);
    if (!stat) {
      const counted = countDiffLines(file);
      return { ...file, additions: counted.additions, deletions: counted.deletions };
    }
    return {
      ...file,
      origPath: file.origPath ?? stat.origPath,
      additions: stat.additions,
      deletions: stat.deletions,
      binary: file.binary || stat.binary,
      status: file.status === "modified" && stat.binary ? "binary" : file.status,
    };
  });
}
```

Run: `pnpm test -- tests/unit/desktop/git-diff.test.ts`
Expected: **PASS** (`Tests  12 passed`). If the `unquoteGitPath` case fails, print the expectation with `node -e "console.log(Buffer.from([0o331,0o205]).toString('utf8'))"`, not from memory.
Commit: `feat(git): diff parsers (numstat -z, unified diff, renames, binary, quoting)`

---

## P6.T5 — The git service: typed operations over the runner (TDD, ≈12 min)

**Failing test — create `tests/unit/desktop/git-service.test.ts`** (no git process is spawned: the fake `exec` records argv and answers from a queue):

```ts
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
    expect(calls[0].args.slice(3)).toEqual(["diff", "--no-color", "--unified=3", "--", "a.txt"]);
    expect(calls[1].args.slice(3)).toEqual(["diff", "--numstat", "-z", "--", "a.txt"]);
    expect(res.ok && res.data[0]).toMatchObject({ path: "a.txt", additions: 2, deletions: 1 });
  });
  it("uses --cached for the staged side and --no-index for untracked files", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }, { stdout: "" }, { code: 1, stdout: "" }]);
    await svc(exec).diff(ROOT, { staged: true, path: "a.txt" });
    await svc(exec).diff(ROOT, { untracked: true, path: "new.txt" });
    expect(calls[0].args.slice(3)).toEqual(["diff", "--cached", "--no-color", "--unified=3", "--", "a.txt"]);
    expect(calls[2].args.slice(3)).toEqual([
      "diff", "--no-index", "--no-color", "--unified=3", "--", "/dev/null", "new.txt",
    ]);
    expect(calls[2].args.slice(3)).not.toContain("--cached");
  });
});

describe("mutations", () => {
  it("stage passes paths after -- and rejects an empty list", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    const service = svc(exec);
    expect(await service.stage(ROOT, [])).toMatchObject({ ok: false, code: "invalid-input" });
    await service.stage(ROOT, ["a.txt", "src/one.ts"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(3)).toEqual(["add", "--", "a.txt", "src/one.ts"]);
  });
  it("unstage uses restore --staged", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    await svc(exec).unstage(ROOT, ["a.txt"]);
    expect(calls[0].args.slice(3)).toEqual(["restore", "--staged", "--", "a.txt"]);
  });
  it("commit passes the message as one argument and returns the new sha", async () => {
    const { calls, exec } = fakeExec([{ stdout: "abc123\n" }]);
    const res = await svc(exec).commit(ROOT, { message: "feat: x\n\nbody" });
    expect(calls[0].args.slice(3)).toEqual(["commit", "-m", "feat: x\n\nbody"]);
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
    expect(calls[0].args.slice(3)).toEqual(["check-ref-format", "--branch", "feat/good-name"]);
    expect(calls[1].args.slice(3)).toEqual(["switch", "-c", "feat/good-name"]);
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
    expect(calls[0].args.slice(3)).toEqual(["init"]);
    expect(res.ok).toBe(true);
  });
});

describe("log / branches / remote", () => {
  it("caps the log limit and always passes the format", async () => {
    const { calls, exec } = fakeExec([{ stdout: "" }]);
    await svc(exec).log(ROOT, { limit: 500 });
    const args = calls[0].args.slice(3);
    expect(args.slice(0, 3)).toEqual(["log", "--max-count=200", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%P%x1f%s%x1f%b%x1e"]);
    expect(args.slice(3)).toEqual(["--no-color", "--"]);
  });
  it("lists branches through for-each-ref with %00 separators", async () => {
    const { calls, exec } = fakeExec([{ stdout: "main\u0000abc\u0000*\u0000\n" }]);
    const res = await svc(exec).branches(ROOT);
    expect(calls[0].args.slice(3)).toEqual([
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
```

Run: `pnpm test -- tests/unit/desktop/git-service.test.ts`
Expected: **FAIL** — cannot resolve `@desktop/git/service`.

**Create `desktop/src/main/git/service.ts`:**

```ts
import type { GitBranchInfo, GitCommitInfo, GitDiffFile, GitFailureCode, GitRepoStatus, GitResult } from "@shared/git";
import { isRootAllowed } from "@shared/roots";
import {
  DIFF_EXIT_CODES,
  GIT_TIMEOUT_MS,
  buildGitArgs,
  classifyGitFailure,
  lastStderrLine,
  parseGitVersion,
  type GitExec,
} from "./run";
import { parseStatusPorcelainV2 } from "./parse-status";
import { BRANCH_FORMAT, LOG_FORMAT, parseBranchList, parseCommitLog, parseRemoteUrl } from "./parse-refs";
import { mergeDiffStats, parseNumstatZ, parseUnifiedDiff } from "./parse-diff";

/**
 * The git service. Every method takes a repository root that must be inside a
 * folder the user registered through the native picker (roots.json, re-read on
 * every call so revoking access is immediate). Nothing here throws: failures
 * come back as typed codes (D-P6-5) and never as exceptions across IPC.
 */

export interface GitServiceDeps {
  exec: GitExec;
  /** Current allow-list read from roots.json at call time. */
  roots: () => string[];
  platform?: NodeJS.Platform;
  binary?: string;
  timeoutMs?: number;
}

export interface GitDiffOptions {
  /** Diff the index instead of the worktree. */
  staged?: boolean;
  /** Repo-root-relative path to limit the diff to. */
  path?: string;
  /** Diff an untracked file against /dev/null (--no-index). */
  untracked?: boolean;
}

/** Serializes callbacks (one git mutation at a time → no .git/index.lock races). */
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

const MAX_LOG = 200;

export function createGitService(deps: GitServiceDeps) {
  const platform = deps.platform ?? process.platform;
  const binary = deps.binary ?? "git";
  const timeoutMs = deps.timeoutMs ?? GIT_TIMEOUT_MS;
  const withLock = createMutex();

  const err = (code: GitFailureCode, message: string): GitResult<never> => ({ ok: false, code, message });

  function assertAllowed(root: string): GitResult<never> | null {
    if (!root) return err("root-not-allowed", "No folder selected");
    if (!isRootAllowed(root, deps.roots(), platform)) {
      return err("root-not-allowed", `${root} is not a linked folder`);
    }
    return null;
  }

  async function run(
    root: string,
    args: string[],
    accepted: readonly number[] = [0],
  ): Promise<{ raw: Awaited<ReturnType<GitExec>>; failure: GitFailureCode | null }> {
    const raw = await deps.exec({
      binary,
      args: buildGitArgs(args),
      cwd: root,
      timeoutMs,
    });
    return { raw, failure: classifyGitFailure(raw, accepted) };
  }

  /** Shared body: validate root → run → classify → parse. */
  async function op<T>(
    root: string,
    args: string[],
    parse: (stdout: string) => T,
    accepted: readonly number[] = [0],
  ): Promise<GitResult<T>> {
    const denied = assertAllowed(root);
    if (denied) return denied;
    const { raw, failure } = await run(root, args, accepted);
    if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
    return { ok: true, data: parse(raw.stdout) };
  }

  async function mutate(root: string, args: string[]): Promise<GitResult<null>> {
    const denied = assertAllowed(root);
    if (denied) return denied;
    return withLock(async () => {
      const { raw, failure } = await run(root, args);
      if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
      return { ok: true, data: null };
    });
  }

  return {
    /** Probe the binary once per panel mount. */
    async available(): Promise<GitResult<{ version: string; raw: string; binary: string }>> {
      const raw = await deps.exec({ binary, args: ["--version"], cwd: deps.roots()[0] ?? process.cwd(), timeoutMs: 10_000 });
      const failure = classifyGitFailure(raw);
      if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
      const version = parseGitVersion(raw.stdout);
      if (!version) return err("unknown", `Unrecognised git version output: ${raw.stdout.trim().slice(0, 120)}`);
      return { ok: true, data: { version: version.version, raw: version.raw, binary } };
    },

    status(root: string): Promise<GitResult<GitRepoStatus>> {
      return op(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"], parseStatusPorcelainV2);
    },

    async diff(root: string, options: GitDiffOptions = {}): Promise<GitResult<GitDiffFile[]>> {
      const { staged = false, path, untracked = false } = options;
      const scope = path ? ["--", path] : ["--"];
      const accepted = DIFF_EXIT_CODES;
      const textArgs = untracked
        ? ["diff", "--no-index", "--no-color", "--unified=3", "--", "/dev/null", path ?? ""]
        : [...(staged ? ["diff", "--cached"] : ["diff"]), "--no-color", "--unified=3", ...scope];
      const statArgs = untracked
        ? null
        : [...(staged ? ["diff", "--cached"] : ["diff"]), "--numstat", "-z", ...scope];

      const denied = assertAllowed(root);
      if (denied) return denied;
      const text = await run(root, textArgs, accepted);
      if (text.failure) return err(text.failure, lastStderrLine(text.raw.stderr) || text.failure);
      const files = parseUnifiedDiff(text.raw.stdout);
      if (!statArgs) {
        return { ok: true, data: mergeDiffStats(files, []) };
      }
      const stat = await run(root, statArgs, accepted);
      if (stat.failure) return err(stat.failure, lastStderrLine(stat.raw.stderr) || stat.failure);
      return { ok: true, data: mergeDiffStats(files, parseNumstatZ(stat.raw.stdout)) };
    },

    stage(root: string, paths: string[]): Promise<GitResult<null>> {
      if (!paths.length) return Promise.resolve(err("invalid-input", "No files selected"));
      return mutate(root, ["add", "--", ...paths]);
    },

    unstage(root: string, paths: string[]): Promise<GitResult<null>> {
      if (!paths.length) return Promise.resolve(err("invalid-input", "No files selected"));
      return mutate(root, ["restore", "--staged", "--", ...paths]);
    },

    commit(root: string, options: { message: string }): Promise<GitResult<{ sha: string }>> {
      const message = options.message ?? "";
      if (!message.trim()) return Promise.resolve(err("invalid-input", "Commit message is empty"));
      const denied = assertAllowed(root);
      if (denied) return Promise.resolve(denied);
      return withLock(async () => {
        const { raw, failure } = await run(root, ["commit", "-m", message]);
        if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
        const sha = raw.stdout.match(/[0-9a-f]{40}/)?.[0] ?? "";
        return { ok: true, data: { sha } };
      });
    },

    log(root: string, options: { limit?: number; path?: string } = {}): Promise<GitResult<GitCommitInfo[]>> {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_LOG);
      const args = ["log", `--max-count=${limit}`, `--format=${LOG_FORMAT}`, "--no-color", "--"];
      if (options.path) args.push(options.path);
      return op(root, args, parseCommitLog);
    },

    branches(root: string): Promise<GitResult<GitBranchInfo[]>> {
      return op(root, ["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads"], parseBranchList);
    },

    switchBranch(root: string, name: string): Promise<GitResult<null>> {
      if (!name.trim()) return Promise.resolve(err("invalid-input", "Branch name is empty"));
      return mutate(root, ["switch", name]);
    },

    async createBranch(root: string, name: string, checkout = true): Promise<GitResult<null>> {
      if (!name.trim()) return Promise.resolve(err("invalid-input", "Branch name is empty"));
      const denied = assertAllowed(root);
      if (denied) return denied;
      // git's own validator first — it is the only authority on valid refs.
      const check = await run(root, ["check-ref-format", "--branch", name]);
      if (check.failure) return err(check.failure, lastStderrLine(check.raw.stderr) || check.failure);
      return mutate(root, checkout ? ["switch", "-c", name] : ["branch", name]);
    },

    init(root: string): Promise<GitResult<null>> {
      return mutate(root, ["init"]);
    },

    async remote(root: string): Promise<GitResult<{ url: string } | null>> {
      const denied = assertAllowed(root);
      if (denied) return denied;
      const { raw } = await run(root, ["remote", "get-url", "origin"], [0, 2]);
      const url = parseRemoteUrl(raw.stdout || raw.stderr);
      return { ok: true, data: url ? { url } : null };
    },
  };
}

export type GitService = ReturnType<typeof createGitService>;
```

Run: `pnpm test -- tests/unit/desktop/git-service.test.ts`
Expected: **PASS** (`Tests  20 passed`). `pnpm typecheck` → exit 0.
Commit: `feat(git): main-process git service (status/diff/stage/commit/branch/log/remote)`

> Note for the implementer: `git diff --no-index` returns exit code 1 for "differences found" — that is why `diff()` passes `DIFF_EXIT_CODES`. Never "fix" that to `[0]`.

---

## P6.T6 — IPC surface: channels, preload, handlers, contract test (TDD, ≈10 min)

**Failing test — create `tests/unit/desktop/ipc-contract.test.ts`** (imports the pure channels file, reads the two Electron-only files as text — no Electron runtime needed):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { REPO_ROOT } from "../_helpers/fs-scan";

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
```

Run: `pnpm test -- tests/unit/desktop/ipc-contract.test.ts`
Expected: **FAIL** — `expect(value_('gitAvailable')).toBeTruthy()` receives `undefined`.

**1. `desktop/src/shared/channels.ts`** — append inside `CH` (before the closing `} as const;`):

```ts
  gitAvailable: "git:available",
  gitStatus: "git:status",
  gitDiff: "git:diff",
  gitStage: "git:stage",
  gitUnstage: "git:unstage",
  gitCommit: "git:commit",
  gitLog: "git:log",
  gitBranches: "git:branches",
  gitSwitchBranch: "git:switch-branch",
  gitCreateBranch: "git:create-branch",
  gitInit: "git:init",
  gitRemote: "git:remote",
```

**2. `desktop/src/shared/api.ts`** — add inside `MasarflowApi`:

```ts
  git: {
    available(): Promise<GitResult<{ version: string; raw: string; binary: string }>>;
    status(root: string): Promise<GitResult<GitRepoStatus>>;
    diff(root: string, options?: { staged?: boolean; path?: string; untracked?: boolean }): Promise<GitResult<GitDiffFile[]>>;
    stage(root: string, paths: string[]): Promise<GitResult<null>>;
    unstage(root: string, paths: string[]): Promise<GitResult<null>>;
    commit(root: string, options: { message: string }): Promise<GitResult<{ sha: string }>>;
    log(root: string, options?: { limit?: number; path?: string }): Promise<GitResult<GitCommitInfo[]>>;
    branches(root: string): Promise<GitResult<GitBranchInfo[]>>;
    switchBranch(root: string, name: string): Promise<GitResult<null>>;
    createBranch(root: string, name: string, checkout?: boolean): Promise<GitResult<null>>;
    init(root: string): Promise<GitResult<null>>;
    remote(root: string): Promise<GitResult<{ url: string } | null>>;
  };
```

with the type import at the top: `import type { GitBranchInfo, GitCommitInfo, GitDiffFile, GitRepoStatus, GitResult } from "./git";` (same folder — `desktop/src/shared/api.ts` and `desktop/src/shared/git.ts`).

**3. `desktop/src/preload/index.ts`** — inside `const api: MasarflowApi = { … }` add:

```ts
  git: {
    available: () => ipcRenderer.invoke(CH.gitAvailable),
    status: (root) => ipcRenderer.invoke(CH.gitStatus, root),
    diff: (root, options) => ipcRenderer.invoke(CH.gitDiff, root, options),
    stage: (root, paths) => ipcRenderer.invoke(CH.gitStage, root, paths),
    unstage: (root, paths) => ipcRenderer.invoke(CH.gitUnstage, root, paths),
    commit: (root, options) => ipcRenderer.invoke(CH.gitCommit, root, options),
    log: (root, options) => ipcRenderer.invoke(CH.gitLog, root, options),
    branches: (root) => ipcRenderer.invoke(CH.gitBranches, root),
    switchBranch: (root, name) => ipcRenderer.invoke(CH.gitSwitchBranch, root, name),
    createBranch: (root, name, checkout) => ipcRenderer.invoke(CH.gitCreateBranch, root, name, checkout),
    init: (root) => ipcRenderer.invoke(CH.gitInit, root),
    remote: (root) => ipcRenderer.invoke(CH.gitRemote, root),
  },
```

**4. `desktop/src/main/ipc/index.ts`** — append inside `registerIpc`, after the existing handlers:

```ts
  /* ── Git (P6) — main-process only, registered roots only ─────────────── */
  const rootsFile = (): string => join(app.getPath("userData"), "roots.json");
  const git = createGitService({
    exec: createExecGit(),
    roots: () => readRootsFile(rootsFile()),
  });
  const asPath = (v: unknown): string => (typeof v === "string" ? v : "");
  const asPaths = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
  type DiffLogOpts = { staged?: boolean; path?: string; untracked?: boolean; limit?: number };
  const asOpts = (v: unknown): DiffLogOpts => (typeof v === "object" && v !== null ? (v as DiffLogOpts) : {});

  ipcMain.handle(CH.gitAvailable, () => git.available());
  ipcMain.handle(CH.gitStatus, (_e, root: unknown) => git.status(asPath(root)));
  ipcMain.handle(CH.gitDiff, (_e, root: unknown, opts: unknown) => git.diff(asPath(root), asOpts(opts)));
  ipcMain.handle(CH.gitStage, (_e, root: unknown, paths: unknown) => git.stage(asPath(root), asPaths(paths)));
  ipcMain.handle(CH.gitUnstage, (_e, root: unknown, paths: unknown) => git.unstage(asPath(root), asPaths(paths)));
  ipcMain.handle(CH.gitCommit, (_e, root: unknown, opts: unknown) =>
    git.commit(asPath(root), { message: String((opts as { message?: unknown })?.message ?? "") }),
  );
  ipcMain.handle(CH.gitLog, (_e, root: unknown, opts: unknown) => git.log(asPath(root), asOpts(opts)));
  ipcMain.handle(CH.gitBranches, (_e, root: unknown) => git.branches(asPath(root)));
  ipcMain.handle(CH.gitSwitchBranch, (_e, root: unknown, name: unknown) => git.switchBranch(asPath(root), String(name ?? "")));
  ipcMain.handle(CH.gitCreateBranch, (_e, root: unknown, name: unknown, checkout: unknown) =>
    git.createBranch(asPath(root), String(name ?? ""), checkout !== false),
  );
  ipcMain.handle(CH.gitInit, (_e, root: unknown) => git.init(asPath(root)));
  ipcMain.handle(CH.gitRemote, (_e, root: unknown) => git.remote(asPath(root)));
```

plus imports at the top of that file:

```ts
import { createExecGit } from "../git/exec";
import { createGitService } from "../git/service";
import { readRootsFile } from "../security/roots";
```

**Create `desktop/src/main/git/exec.ts`:**

```ts
import { execFile } from "node:child_process";
import { GIT_MAX_OUTPUT, type GitExec, type GitRawRun } from "./run";

/**
 * The only file in P6 that spawns a process. `execFile` with an argv array —
 * never a shell string — so a path or commit message can never be interpreted
 * as a command. Environment notes (all verified with the real Node runtime):
 *  - GIT_TERMINAL_PROMPT=0 → no credential prompt can ever block a call;
 *  - LC_ALL=C → stable English messages for the failure classifier
 *    (a UTF-8 commit message still round-trips byte-exact — measured);
 *  - options.killed is the timeout signal; code stays null in that case.
 */
export function createExecGit(defaultBinary = "git"): GitExec {
  return (inv) =>
    new Promise<GitRawRun>((resolve) => {
      execFile(
        inv.binary || defaultBinary,
        inv.args,
        {
          cwd: inv.cwd,
          timeout: inv.timeoutMs,
          maxBuffer: GIT_MAX_OUTPUT,
          windowsHide: true,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_OPTIONAL_LOCKS: "0",
            LC_ALL: "C",
          },
        },
        (error, stdout, stderr) => {
          const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
          const code = err ? (typeof err.code === "number" ? err.code : null) : 0;
          resolve({
            code,
            stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
            stderr: typeof stderr === "string" ? stderr : String(stderr ?? ""),
            timedOut: Boolean(err?.killed) || err?.code === "ETIMEDOUT",
            errno: typeof err?.code === "string" ? err.code : undefined,
          });
        },
      );
    });
}
```

Run: `pnpm test -- tests/unit/desktop/ipc-contract.test.ts`
Expected: **PASS** (`Tests  6 passed`). Then `pnpm desktop:typecheck && pnpm typecheck` → exit 0.
Commit: `feat(desktop): git IPC surface (12 channels, preload + typed handlers) with a contract test`

---

## P6.T7 — Renderer bridge wrapper + failure copy (TDD, ≈6 min)

**Failing test — create `tests/unit/lib/git/client.test.ts`:**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { GIT_DESKTOP_REQUIRED, gitBridge, gitFailureCopy } from "@/lib/git/client";
import type { GitFailureCode } from "@desktop-shared/git";

afterEach(() => vi.unstubAllGlobals());

const CODES: GitFailureCode[] = [
  "git-missing", "not-a-repo", "root-not-allowed", "permission-denied",
  "index-locked", "nothing-to-commit", "invalid-input", "no-remote",
  "detached-head", "timeout", "unknown",
];

describe("gitBridge", () => {
  it("is null in a browser tab (no window.masarflow)", () => {
    vi.stubGlobal("window", {});
    expect(gitBridge()).toBeNull();
  });
  it("returns the desktop git surface when the preload exposed it", () => {
    const git = { status: vi.fn() };
    vi.stubGlobal("window", { masarflow: { git } });
    expect(gitBridge()).toBe(git);
  });
  it("returns null when the preload exists without a git surface (older desktop build)", () => {
    vi.stubGlobal("window", { masarflow: {} });
    expect(gitBridge()).toBeNull();
  });
});

describe("gitFailureCopy", () => {
  it("has copy for every failure code", () => {
    for (const code of CODES) {
      const copy = gitFailureCopy(code);
      expect(copy.length, code).toBeGreaterThan(10);
    }
  });
  it("names the missing-desktop case explicitly", () => {
    expect(GIT_DESKTOP_REQUIRED).toContain("desktop");
  });
  it("appends the raw git diagnostics when present", () => {
    expect(gitFailureCopy("unknown", "fatal: boom")).toContain("fatal: boom");
    expect(gitFailureCopy("unknown", "")).not.toContain("Details");
  });
});
```

Run: `pnpm test -- tests/unit/lib/git/client.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/git/client`.

**Create `src/lib/git/client.ts`:**

```ts
import { getDesktop } from "@/lib/desktop/bridge";
import type { MasarflowApi } from "@desktop-shared/api";
import type { GitFailureCode } from "@desktop-shared/git";

/**
 * Thin renderer-side wrapper around the preload git surface.
 *
 * The browser build has no `window.masarflow` at all (Playwright's webServer
 * runs `pnpm start`), so every git UI must handle `null` — that is the
 * "desktop required" panel, not an error state.
 */

export type GitBridge = NonNullable<MasarflowApi["git"]>;

export const GIT_DESKTOP_REQUIRED =
  "Git runs inside the MasarFlow desktop app. Start it with `pnpm desktop:dev` (or install the packaged build) — the browser preview cannot run git.";

/** The git surface of the desktop bridge, or null in a browser tab. */
export function gitBridge(): GitBridge | null {
  const desktop = getDesktop() as (MasarflowApi & { git?: GitBridge }) | null;
  return desktop?.git ?? null;
}

/** User-facing copy per failure code. Typed as a full Record so a new code cannot be forgotten. */
export const GIT_FAILURE_COPY: Record<GitFailureCode, string> = {
  "git-missing":
    "Git was not found. Install Git for Windows, then reopen MasarFlow. (A portable build can be pointed at with MASARFLOW_GIT_PATH.)",
  "not-a-repo": "This folder is not a git repository yet.",
  "root-not-allowed": "That folder is not one of this project's linked folders — add it from Linked Projects first.",
  "permission-denied": "Windows denied access to files in this folder. Close whatever is holding them (editor, indexer) and retry.",
  "index-locked": "Another git process is writing to this repository. Wait a second and retry.",
  "nothing-to-commit": "Nothing is staged. Tick the files you want in this commit first.",
  "invalid-input": "Git rejected that name or path.",
  "no-remote": "This repository has no 'origin' remote.",
  "detached-head": "HEAD is detached. Switch to a branch before committing.",
  timeout: "Git did not finish within a minute and was stopped.",
  unknown: "Git failed.",
};

/** Headline copy plus (optionally) the raw git line as a details suffix. */
export function gitFailureCopy(code: GitFailureCode, detail?: string): string {
  const base = GIT_FAILURE_COPY[code] ?? GIT_FAILURE_COPY.unknown;
  const trimmed = (detail ?? "").trim();
  return trimmed ? `${base} Details: ${trimmed}` : base;
}
```

Run: `pnpm test -- tests/unit/lib/git/client.test.ts`
Expected: **PASS** (`Tests  6 passed`).
Commit: `feat(git): renderer git bridge wrapper and typed failure copy`

---

## P6.T8 — Pure UI helpers: labels, dates, validation, root pick (TDD, ≈10 min)

**Failing test — create `tests/unit/lib/git/format.test.ts`:**

```ts
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
```

Run: `pnpm test -- tests/unit/lib/git/format.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/git/format`.

**Create `src/lib/git/format.ts`:**

```ts
import type { GitDiffFile, GitFileChange, GitRepoStatus, GitStatusLetter } from "@desktop-shared/git";

/**
 * Pure presentation helpers for the git panel. No React, no Dexie, no Electron
 * — everything here is unit-tested without a DOM (see format.test.ts).
 */

export interface StatusBadge {
  short: string;
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
}

const LABELS: Record<GitStatusLetter, StatusBadge> = {
  ".": { short: "", label: "Unchanged", tone: "muted" },
  M: { short: "M", label: "Modified", tone: "warn" },
  T: { short: "T", label: "Type changed", tone: "warn" },
  A: { short: "A", label: "Added", tone: "ok" },
  D: { short: "D", label: "Deleted", tone: "danger" },
  R: { short: "R", label: "Renamed", tone: "warn" },
  C: { short: "C", label: "Copied", tone: "muted" },
  U: { short: "U", label: "Conflict", tone: "danger" },
  "?": { short: "?", label: "Untracked", tone: "muted" },
};

export function statusLabel(letter: GitStatusLetter): StatusBadge {
  return LABELS[letter] ?? LABELS["."];
}

export interface ChangeGroups {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: GitFileChange[];
}

export function groupChanges(status: GitRepoStatus): ChangeGroups {
  return {
    staged: status.staged,
    unstaged: status.unstaged,
    untracked: status.untracked,
    conflicted: status.conflicted,
  };
}

/** "1 staged · 1 modified · 2 untracked", or "Clean". */
export function summarizeCounts(status: GitRepoStatus): string {
  if (
    status.staged.length === 0 && status.unstaged.length === 0 &&
    status.untracked.length === 0 && status.conflicted.length === 0
  ) {
    return "Clean";
  }
  const parts: string[] = [];
  if (status.conflicted.length) parts.push(`${status.conflicted.length} conflicted`);
  if (status.staged.length) parts.push(`${status.staged.length} staged`);
  if (status.unstaged.length) parts.push(`${status.unstaged.length} modified`);
  if (status.untracked.length) parts.push(`${status.untracked.length} untracked`);
  return parts.join(" · ");
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Accepts epoch ms or an ISO string (%aI). Falls back to a plain date, then "". */
export function relativeDate(input: string | number, nowMs: number = Date.now()): string {
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return "";
  const diff = nowMs - ms;
  if (diff < 0) return new Date(ms).toISOString().slice(0, 10);
  if (diff < 45_000) return "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days <= 14) return `${days} d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Blocking (empty) or advisory (over-long subject) message problems. */
export function commitProblem(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return "Write a commit message first.";
  const subject = trimmed.split(/\r?\n/)[0];
  if (subject.length > 72) {
    return `The subject is ${subject.length} characters — keep the first line under 50 characters and put the rest in the body.`;
  }
  return null;
}

/**
 * Client-side mirror of git's ref rules for instant feedback. The authoritative
 * check is `git check-ref-format --branch` in the main process (P6.T5) — if the
 * two ever disagree, git wins and its refusal is what the user sees.
 */
export function branchNameProblem(name: string): string | null {
  const value = name.trim();
  if (!value) return "Enter a branch name.";
  if (value === "@") return "'@' is a reserved name.";
  if (value.startsWith("-")) return "A branch name cannot start with '-'.";
  if (value.startsWith("/") || value.endsWith("/")) return "A branch name cannot start or end with '/'.";
  if (value.endsWith(".lock")) return "A branch name cannot end with '.lock'.";
  const bad = /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(value);
  if (bad) return "Branch names cannot contain spaces or any of ~ ^ : ? * [ \\ or control characters.";
  if (value.includes("..")) return "A branch name cannot contain '..'.";
  if (value.includes("@{")) return "A branch name cannot contain '@{'.";
  if (/\/\//.test(value) || /\/\./.test(value) || /\.\.$/.test(value)) {
    return "A branch name cannot contain '//', '/.', or end with '.'.";
  }
  return null;
}

const normPath = (p: string): string =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const isInside = (root: string, allowed: string[]): boolean => {
  const r = normPath(root);
  return allowed.some((a) => {
    const n = normPath(a);
    return n.length > 0 && (r === n || r.startsWith(`${n}/`));
  });
};

/**
 * Which repository root the panel should preselect: the remembered one when it
 * is still allowed, else the first linked folder that is inside an allowed
 * root, else the first allowed root. Advisory only — main re-checks every call.
 */
export function pickDefaultRoot(
  candidates: string[],
  allowed: string[],
  lastUsed: string | null,
): string | null {
  if (lastUsed && isInside(lastUsed, allowed)) return lastUsed;
  const linked = candidates.find((c) => isInside(c, allowed));
  if (linked) return linked;
  return allowed.length ? allowed[0] : null;
}

/** Colour class category for one line of a unified diff hunk. */
export function diffLineTone(line: string): "added" | "removed" | "context" | "meta" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) return "meta";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  if (line.startsWith("\\")) return "meta";
  return "context";
}

/** "68 files changed, 1200 insertions(+), 30 deletions(-)" — clickable in the log. */
export function diffStatSummary(files: GitDiffFile[]): string {
  if (!files.length) return "No changes";
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  return `${files.length} file${files.length === 1 ? "" : "s"} · +${additions} −${deletions}`;
}
```

Run: `pnpm test -- tests/unit/lib/git/format.test.ts`
Expected: **PASS** (`Tests  15 passed`).
Commit: `feat(git): pure panel helpers (labels, groups, dates, validation, root pick)`

---

## P6.T9 — The `/git` route: page, nav group, dock panel, feature-matrix (≈8 min)

Everything below lands in one commit, because P0's guard test 1 compares `src/app/(workspace)/**` with the matrix JSON: a page without a matrix entry (or a matrix entry without a page) fails immediately.

**1. Create `src/app/(workspace)/git/page.tsx`** (mirrors `…/tasks/page.tsx`):

```tsx
"use client";

import { Suspense } from "react";
import { GitView } from "@/components/git/git-view";

export default function GitPage() {
  return (
    <Suspense fallback={null}>
      <GitView />
    </Suspense>
  );
}
```

**2. Create `src/components/git/git-view.tsx`** — the shell that (a) proves the desktop bridge exists and (b) hosts the panels the next tasks fill in:

```tsx
"use client";

import { RefreshCw, GitBranch, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GIT_DESKTOP_REQUIRED, gitBridge } from "@/lib/git/client";
import { useGitRepo } from "@/lib/git/use-git-repo";
import { GitStatusPanel } from "@/components/git/git-status-panel";

export function GitView() {
  const bridge = gitBridge();
  const repo = useGitRepo();

  if (!bridge) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        {/* EmptyState takes a component reference for `icon`, not an element
            (src/components/ui/empty-state.tsx:6). */}
        <EmptyState
          icon={MonitorSmartphone}
          title="Git needs the desktop app"
          description={GIT_DESKTOP_REQUIRED}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Git</h1>
        <span className="text-sm text-muted-foreground">
          {repo.root ?? "No repository selected"}
          {repo.branch ? ` · ${repo.branch}` : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => void repo.refresh()}
          disabled={repo.loading}
        >
          <RefreshCw className={repo.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </header>
      <GitStatusPanel repo={repo} />
    </div>
  );
}
```

**3. `src/lib/nav.ts`** — add `GitBranch` to the lucide import list, then add this item as the **first** entry of the System group (before "Sync Panel"):

```ts
      {
        label: "Git",
        href: "/git",
        icon: GitBranch,
        keywords: ["commits", "diff", "branches", "stage", "repository"],
      },
```

(`GitBranch` exists in the installed lucide-react — verified in `node_modules/lucide-react/dist/esm/icons/git-branch.mjs`. The "github" keyword stays on Sync Panel, which owns issue/PR sync.)

**4. `src/components/dock/panel-loader.tsx`** — add to `PAGE_COMPONENTS` (keep alphabetical order as in the file):

```tsx
  "/git": dynamic(() => import("@/app/(workspace)/git/page"), {
    ssr: false,
    loading,
  }),
```

**5. `tests/e2e/feature-matrix.json`** — insert between `"/files": [],` and `"/knowledge": [],`:

```json
  "/git": [],
```

Features stay empty on purpose: the guard test 3 resolves `<route>: <feature>` against Playwright specs, and those specs are written in P9 (see Handoffs).

Run: `pnpm test -- tests/unit/e2e/feature-matrix.test.ts`
Expected: **PASS** (`Tests  3 passed`).
Then: `pnpm typecheck` → exit 0; `pnpm test -- tests/unit/e2e/` → `Tests  3 passed` (guard only; nothing else from P9 exists yet).
Manual: `pnpm dev` → open `http://localhost:3000/git` → the "Git needs the desktop app" panel renders (no bridge in the browser), and the sidebar shows **Git** under System.
Commit: `feat(git): /git route, System nav entry, dock panel and feature-matrix row (features owned by P9)`

---

## P6.T10 — `useGitRepo` hook + status panel with stage/unstage (TDD for the pure parts, ≈15 min)

**Failing test — create `tests/unit/lib/git/use-git-repo.test.ts`** for the hook's pure reducer (the hook itself is React glue verified manually):

```ts
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
```

Run: `pnpm test -- tests/unit/lib/git/use-git-repo.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/git/use-git-repo`.

**Create `src/lib/git/use-git-repo.ts`:**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linkedProjectsRepo } from "@/lib/db/repos/linkedProjects";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { gitBridge } from "@/lib/git/client";
import { pickDefaultRoot } from "@/lib/git/format";
import type { GitFailureCode, GitRepoStatus, GitResult } from "@desktop-shared/git";

/**
 * Root selection + repository state for the git panel.
 *
 * Roots come from roots.json through the desktop bridge (the allow-list main
 * enforces); linked projects supply the preferred default. `applyResult` is the
 * pure reducer, exported for tests.
 */

const LAST_ROOT_KEY = "masarflow.git.lastRoot";

export interface GitRepoError {
  code: GitFailureCode;
  detail: string;
  op: string;
}

export interface GitRepoState {
  root: string | null;
  /** From status.head (a branch name, or "HEAD" when detached). */
  branch: string | null;
  detached: boolean;
  loading: boolean;
  error: GitRepoError | null;
  status: GitRepoStatus | null;
}

export function initialGitRepoState(): GitRepoState {
  return { root: null, branch: null, detached: false, loading: true, error: null, status: null };
}

type Key = "status";

/** Pure reducer: a failed result keeps the last good data and records the code. */
export function applyResult(
  state: GitRepoState,
  result: GitResult<unknown>,
  op: Key,
): GitRepoState {
  if (result.ok) {
    const patch =
      op === "status" && result.data && typeof result.data === "object"
        ? (result.data as GitRepoStatus)
        : null;
    return {
      ...state,
      ...(patch ? { status: patch, branch: patch.head || null, detached: patch.detached } : {}),
      error: null,
    };
  }
  return { ...state, error: { code: result.code, detail: result.message, op } };
}

export function useGitRepo() {
  const projectId = useActiveProjectId();
  const bridge = useMemo(() => gitBridge(), []);
  const [state, setState] = useState<GitRepoState>(initialGitRepoState);
  const [roots, setRoots] = useState<string[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!bridge || !state.root) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const result = await bridge.status(state.root);
    if (!mounted.current) return;
    setState((s) => ({ ...applyResult(s, result, "status"), loading: false }));
  }, [bridge, state.root]);

  /* Choose a root once the allow-list and the project's linked folders are known. */
  useEffect(() => {
    if (!bridge || !projectId) return;
    let cancelled = false;
    void (async () => {
      const [listed, linked] = await Promise.all([
        bridge.roots?.list?.() ?? Promise.resolve([]),
        linkedProjectsRepo.listByProject(projectId),
      ]);
      if (cancelled || !mounted.current) return;
      const allowed = Array.isArray(listed) ? listed.map((r) => r.path) : [];
      const stored = typeof window === "undefined" ? null : window.localStorage.getItem(LAST_ROOT_KEY);
      const next = pickDefaultRoot(linked.map((l) => l.rootPath), allowed, stored);
      setRoots(allowed);
      setState((s) => ({ ...s, root: s.root ?? next, loading: next !== null }));
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectRoot = useCallback((root: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(LAST_ROOT_KEY, root);
    setState((s) => ({ ...s, root, status: null, error: null, loading: true }));
  }, []);

  const pickRoot = useCallback(async () => {
    if (!bridge) return;
    const picked = await bridge.dialog?.chooseFolder?.(state.root ?? undefined);
    if (typeof picked === "string" && picked) selectRoot(picked);
  }, [bridge, selectRoot, state.root]);

  /** Run a mutation then re-read the status (stage/unstage/commit/branch all end here). */
  const mutate = useCallback(
    async (fn: () => Promise<GitResult<unknown>>, op: string): Promise<GitResult<unknown>> => {
      const result = await fn();
      if (!mounted.current) return result;
      setState((s) => applyResult(s, result, "status"));
      await refresh();
      return result;
    },
    [refresh],
  );

  const loadDiff = useCallback(
    async (options: { path: string; staged?: boolean; untracked?: boolean }) => {
      if (!bridge || !state.root) return null;
      const result = await bridge.diff(state.root, options);
      if (!mounted.current) return null;
      setState((s) => (result.ok ? { ...s, error: null } : applyResult(s, result, "status")));
      return result.ok ? result.data : null;
    },
    [bridge, state.root],
  );

  return { ...state, roots, refresh, selectRoot, pickRoot, mutate, loadDiff, bridge, projectId };
}

export type GitRepo = ReturnType<typeof useGitRepo>;
```

`roots.list()` returns `{ name, path }` entries (P2's `CH.rootsList`): the code above maps `.path`, which is the documented shape from P2.T4 — if P2 shipped `string[]` instead, change the map to identity (assert with `typeof listed[0] === "string"`); the contract test in T6 does not cover it, so check `desktop/src/shared/api.ts` for the declared return type before editing.

**Create `src/components/git/git-status-panel.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { FileQuestion, FilePlus2, GitCommitHorizontal, Plus, Minus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { gitFailureCopy } from "@/lib/git/client";
import { groupChanges, statusLabel, summarizeCounts } from "@/lib/git/format";
import type { GitFileChange } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";
import { GitDiffView } from "@/components/git/git-diff-view";
import { GitCommitBox } from "@/components/git/git-commit-box";
import { GitBranchMenu } from "@/components/git/git-branch-menu";
import { GitLogList } from "@/components/git/git-log-list";
import { GithubSection } from "@/components/git/github-section";

const tone: Record<string, string> = {
  warn: "border-amber-500/50 text-amber-600",
  danger: "border-red-500/50 text-red-600",
  ok: "border-emerald-500/50 text-emerald-600",
  muted: "border-border text-muted-foreground",
};

export function GitStatusPanel({ repo }: { repo: GitRepo }) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean; untracked?: boolean } | null>(null);
  const status = repo.status;

  const stage = async (paths: string[]) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.stage(repo.root!, paths), "stage");
  };
  const unstage = async (paths: string[]) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.unstage(repo.root!, paths), "unstage");
  };

  if (repo.error?.code === "not-a-repo") {
    return (
      <div className="flex flex-col items-start gap-2 rounded border border-border p-4">
        <p className="text-sm text-muted-foreground">
          {repo.root} is not a git repository yet.
        </p>
        <Button
          size="sm"
          onClick={() => repo.mutate(() => repo.bridge!.init(repo.root!), "init")}
        >
          <GitCommitHorizontal className="h-4 w-4" /> Create a repository here
        </Button>
      </div>
    );
  }

  if (!repo.root) {
    return (
      <div className="flex flex-col items-start gap-3 rounded border border-border p-4">
        <p className="text-sm text-muted-foreground">
          No linked folder is available for git. Link a folder to this project, or pick one now
          (it is added to the app's allow-list).
        </p>
        <Button size="sm" onClick={() => void repo.pickRoot()}>
          <FolderOpen className="h-4 w-4" /> Choose a folder…
        </Button>
      </div>
    );
  }

  if (!status) {
    return <p className="p-4 text-sm text-muted-foreground">Reading repository…</p>;
  }

  const groups = groupChanges(status);

  const row = (change: GitFileChange, staged: boolean) => {
    const badge = statusLabel(staged ? change.index : change.worktree);
    return (
      <li key={`${staged ? "s" : "u"}:${change.path}`} className="flex items-center gap-2 py-0.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setSelected({ path: change.path, staged })}
        >
          <Badge variant="outline" className={tone[badge.tone]}>{badge.short || "·"}</Badge>
          <span className="truncate font-mono text-xs">{change.path}</span>
          {change.origPath ? (
            <span className="truncate text-xs text-muted-foreground">← {change.origPath}</span>
          ) : null}
        </button>
        {staged ? (
          <Button size="sm" variant="ghost" title="Unstage" onClick={() => void unstage([change.path])}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" title="Stage" onClick={() => void stage([change.path])}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex min-h-0 flex-col gap-3 rounded border border-border p-3">
        <div className="flex items-center gap-2">
          <GitBranchPlaceholder repo={repo} />
          <span className="text-xs text-muted-foreground">{summarizeCounts(status)}</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => void repo.pickRoot()}
          >
            <FolderOpen className="h-3.5 w-3.5" /> Folder
          </Button>
        </div>
        {repo.error ? (
          <p className="rounded border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">
            {gitFailureCopy(repo.error.code, repo.error.detail)}
          </p>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">
          {groups.conflicted.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase text-red-600">Conflicts</h3>
              <ul>{groups.conflicted.map((c) => row(c, false))}</ul>
            </section>
          ) : null}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Staged ({groups.staged.length})
              </h3>
              {groups.staged.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void unstage(groups.staged.map((c) => c.path))}
                >
                  Unstage all
                </Button>
              ) : null}
            </div>
            <ul>{groups.staged.map((c) => row(c, true))}</ul>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Changes ({groups.unstaged.length})
              </h3>
              {groups.unstaged.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void stage(groups.unstaged.map((c) => c.path))}
                >
                  Stage all
                </Button>
              ) : null}
            </div>
            <ul>{groups.unstaged.map((c) => row(c, false))}</ul>
          </section>
          {groups.untracked.length ? (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <FileQuestion className="h-3 w-3" /> Untracked ({groups.untracked.length})
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void stage(groups.untracked)}
                >
                  <FilePlus2 className="h-3 w-3" /> Stage all
                </Button>
              </div>
              <ul>
                {groups.untracked.map((path) => (
                  <li key={`u:${path}`} className="flex items-center gap-2 py-0.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-xs"
                      onClick={() => setSelected({ path, staged: false, untracked: true })}
                    >
                      {path}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Stage"
                      onClick={() => void stage([path])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {summarizeCounts(repo.status) === "Clean" ? (
            <p className="py-2 text-xs text-muted-foreground">Working tree clean.</p>
          ) : null}
        </ScrollArea>
        <GitCommitBox repo={repo} stagedCount={groups.staged.length} />
      </div>

      <div className="flex min-h-0 flex-col gap-3 rounded border border-border p-3">
        {selected ? (
          <GitDiffView
            repo={repo}
            target={selected}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <GitLogList repo={repo} />
            <GithubSection repo={repo} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Small wrapper so the branch menu stays in its own file (T12). */
function GitBranchPlaceholder({ repo }: { repo: GitRepo }) {
  return <GitBranchMenu repo={repo} />;
}
```

> Implementer note: `git-status-panel.tsx` imports `GitDiffView`, `GitCommitBox`, `GitBranchMenu`, `GitLogList` and `GithubSection` — those files are created in T11/T12/T17. Create **empty typed stubs** for the ones that do not exist yet in the same commit as T10 so `pnpm typecheck` stays green, then replace each stub body in its own task:

```tsx
export function GitCommitBox(_props: { repo: GitRepo; stagedCount: number }) { return null; }
```

Manual (desktop, after T11/T12/T17 land — order the manual pass at the end of the phase): run `pnpm desktop:dev`, link a folder in a scratch repository, tick a file, stage/unstage it, and confirm the badge letters match `git status` in the terminal panel.

Run: `pnpm test -- tests/unit/lib/git/use-git-repo.test.ts` → **PASS** (`Tests  3 passed`); `pnpm test -- tests/unit/lib/git/` → all green; `pnpm typecheck` → exit 0.
Commit: `feat(git): git panel shell with root selection, status groups and stage/unstage`

---

## P6.T11 — Diff viewer + commit box (≈10 min)

**Create `src/components/git/git-diff-view.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffLineTone, statusLabel } from "@/lib/git/format";
import type { GitDiffFile } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

const lineClass: Record<ReturnType<typeof diffLineTone>, string> = {
  added: "bg-emerald-500/10 text-emerald-700",
  removed: "bg-red-500/10 text-red-700",
  context: "",
  meta: "bg-muted/50 text-muted-foreground",
};

function DiffFile({ file }: { file: GitDiffFile }) {
  const badge = statusLabel(
    file.status === "added" ? "A" : file.status === "deleted" ? "D"
      : file.status === "renamed" ? "R" : file.status === "copied" ? "C" : "M",
  );
  return (
    <section className="mb-4">
      <header className="flex items-center gap-2 border-b border-border pb-1">
        <Badge variant="outline">{badge.label}</Badge>
        <span className="truncate font-mono text-xs">{file.path}</span>
        {file.origPath ? <span className="text-xs text-muted-foreground">← {file.origPath}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {file.binary ? "binary" : `+${file.additions} −${file.deletions}`}
        </span>
      </header>
      {file.binary ? (
        <p className="py-2 text-xs text-muted-foreground">Binary file — no textual diff.</p>
      ) : (
        <pre className="overflow-x-auto text-xs leading-5">
          <code>
            {file.hunks.map((hunk) => (
              <span key={hunk.header}>
                <span className={`block px-1 ${lineClass.meta}`}>{hunk.header}</span>
                {hunk.lines.map((line, i) => (
                  <span key={`${hunk.header}:${i}`} className={`block px-1 ${lineClass[diffLineTone(line)]}`}>
                    {line}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      )}
    </section>
  );
}

export function GitDiffView({
  repo,
  target,
  onClose,
}: {
  repo: GitRepo;
  target: { path: string; staged: boolean; untracked?: boolean };
  onClose: () => void;
}) {
  const [files, setFiles] = useState<GitDiffFile[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setFailed(null);
    void (async () => {
      if (!repo.bridge || !repo.root) return;
      const result = await repo.bridge.diff(repo.root, {
        path: target.path,
        staged: target.staged,
        untracked: target.untracked === true,
      });
      if (cancelled) return;
      if (result.ok) setFiles(result.data);
      else setFailed(result.message || result.code);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.root, target.path, target.staged, target.untracked, repo.branch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border pb-2">
        <span className="truncate font-mono text-xs">{target.path}</span>
        <Badge variant="outline">{target.staged ? "Staged" : "Working tree"}</Badge>
        {target.untracked ? <Badge variant="outline">Untracked</Badge> : null}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1 pt-2">
        {failed ? <p className="text-xs text-red-600">{failed}</p> : null}
        {!failed && files === null ? (
          <p className="text-xs text-muted-foreground">Loading diff…</p>
        ) : null}
        {files && files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No textual changes to show.</p>
        ) : null}
        {files?.map((file) => <DiffFile key={`${file.path}:${file.status}`} file={file} />)}
      </ScrollArea>
    </div>
  );
}
```

**Create `src/components/git/git-commit-box.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { GitCommitHorizontal, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { gitFailureCopy } from "@/lib/git/client";
import { commitProblem, shortSha } from "@/lib/git/format";
import { recordLocalCommit } from "@/lib/git/link-commit";
import type { GitRepo } from "@/lib/git/use-git-repo";

export function GitCommitBox({ repo, stagedCount }: { repo: GitRepo; stagedCount: number }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ sha: string; commitId: string } | null>(null);

  const submit = async () => {
    const invalid = commitProblem(message);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (!repo.bridge || !repo.root) return;
    setProblem(null);
    setBusy(true);
    try {
      const result = await repo.mutate(() => repo.bridge!.commit(repo.root!, { message }), "commit");
      if (!result.ok) {
        setProblem(gitFailureCopy(result.code, result.message));
        return;
      }
      // Mirror the commit into Dexie so the task/commit graph sees it (P5 fabric).
      const mirror = await recordLocalCommit({
        projectId: repo.projectId,
        root: repo.root,
        sha: result.data.sha,
        message,
      });
      setCommitted({ sha: result.data.sha, commitId: mirror.commit.id });
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="feat(scope): summary&#10;&#10;Why, not what."
        rows={3}
        className="font-mono text-xs"
      />
      {problem ? <p className="text-xs text-red-600">{problem}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || stagedCount === 0} onClick={() => void submit()}>
          <GitCommitHorizontal className="h-4 w-4" />
          {busy ? "Committing…" : `Commit ${stagedCount} file${stagedCount === 1 ? "" : "s"}`}
        </Button>
        {stagedCount === 0 ? (
          <span className="text-xs text-muted-foreground">Stage something first.</span>
        ) : null}
        {committed ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3" />
            committed {shortSha(committed.sha)} — link it to a task from the log
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

(`recordLocalCommit` is created in T13; in T10's stub round it is simply not called. If T13 has not landed yet, keep `submit()` ending at `setCommitted({ sha: result.data.sha, commitId: "" })` and replace that line in T13.)

Run: `pnpm typecheck` → exit 0.
Manual (desktop): stage a file, write a message, commit; `git log --oneline -1` in the terminal panel shows the same subject and the panel refreshes with a clean tree.
Commit: `feat(git): unified-diff viewer and commit composer`

---

## P6.T12 — Branch menu, create-branch, and the commit log (≈12 min)

**Create `src/components/git/git-branch-menu.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GitBranch as GitBranchIcon } from "lucide-react";
import { branchNameProblem, summarizeCounts } from "@/lib/git/format";
import { gitFailureCopy } from "@/lib/git/client";
import type { GitBranchInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

export function GitBranchMenu({ repo }: { repo: GitRepo }) {
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo.bridge || !repo.root) return;
    const result = await repo.bridge.branches(repo.root);
    if (result.ok) setBranches(result.data);
  }, [repo.bridge, repo.root]);

  useEffect(() => {
    void load();
  }, [load, repo.branch]);

  const switchTo = (target: string) => {
    const dirty = (repo.status?.unstaged.length ?? 0) > 0;
    if (dirty) {
      setConfirm(target);
      return;
    }
    void doSwitch(target);
  };

  const doSwitch = async (target: string) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.switchBranch(repo.root!, target), "switch");
    setOpen(false);
    setConfirm(null);
    await repo.refresh();
  };

  const create = async () => {
    const invalid = branchNameProblem(name);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (!repo.bridge || !repo.root) return;
    const result = await repo.mutate(
      () => repo.bridge!.createBranch(repo.root!, name.trim(), true),
      "create-branch",
    );
    if (!result.ok) {
      setProblem(gitFailureCopy(result.code, result.message));
      return;
    }
    setProblem(null);
    setName("");
    setOpen(false);
    await load();
    await repo.refresh();
  };

  const dirtyCount = (repo.status?.unstaged.length ?? 0) + (repo.status?.untracked.length ?? 0);

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        <GitBranch className="h-3.5 w-3.5" />
        {repo.detached ? "detached HEAD" : (repo.branch ?? "no branch")}
      </Button>
      {repo.detached ? <Badge variant="outline" className="ml-2">detached</Badge> : null}
      {open ? (
        <div className="absolute z-20 mt-1 w-72 rounded border border-border bg-background p-2 shadow-lg">
          <p className="px-1 pb-1 text-xs text-muted-foreground">{summarizeCounts(repo.status!)}</p>
          <ul className="max-h-56 overflow-y-auto">
            {branches.map((branch) => (
              <li key={branch.name}>
                <button
                  type="button"
                  disabled={branch.head}
                  onClick={() => switchTo(branch.name)}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent disabled:opacity-60"
                >
                  {branch.head ? <Check className="h-3 w-3" /> : <span className="w-3" />}
                  <span className="truncate font-mono">{branch.name}</span>
                  {branch.upstream ? (
                    <span className="ml-auto truncate text-muted-foreground">{branch.upstream}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feat/new-branch"
              className="h-7 font-mono text-xs"
            />
            <Button size="sm" onClick={() => void create()} disabled={!name.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {problem ? <p className="pt-1 text-xs text-red-600">{problem}</p> : null}
          {repo.status?.upstream ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {repo.status.upstream} · {repo.status.ahead} ahead · {repo.status.behind} behind
            </p>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">No upstream configured.</p>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={`Switch to ${confirm ?? ""}?`}
        description={`${dirtyCount} uncommitted change${dirtyCount === 1 ? "" : "s"} will follow you onto that branch.`}
        confirmLabel="Switch anyway"
        destructive={false}
        onConfirm={() => confirm && void doSwitch(confirm)}
      />
    </div>
  );
}
```

(`ConfirmDialog`'s verified signature is `{ open, onOpenChange, title, description?, confirmLabel?, destructive?, onConfirm }` — `src/components/ui/confirm-dialog.tsx:9-17`; there is no `onCancel`. `destructive={false}` keeps the confirm button primary instead of red, because switching with uncommitted changes is normal, not dangerous.)

**Create `src/components/git/git-log-list.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { History, GitCommitHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { relativeDate, shortSha } from "@/lib/git/format";
import type { GitCommitInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";
import { LinkTaskDialog } from "@/components/git/link-task-dialog";

export function GitLogList({ repo }: { repo: GitRepo }) {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linking, setLinking] = useState<GitCommitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo.bridge || !repo.root) return;
    const result = await repo.bridge.log(repo.root, { limit: 50 });
    if (result.ok) {
      setCommits(result.data);
      setError(null);
    } else {
      setError(result.message || result.code);
    }
  }, [repo.bridge, repo.root]);

  useEffect(() => {
    void load();
  }, [load, repo.branch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border pb-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">History</h2>
        <span className="text-xs text-muted-foreground">{commits.length} of the last 50</span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {error ? <p className="py-2 text-xs text-red-600">{error}</p> : null}
        <ul>
          {commits.map((commit) => (
            <li key={commit.sha} className="border-b border-border/60 py-1.5">
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                onClick={() => setExpanded(expanded === commit.sha ? null : commit.sha)}
              >
                <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{commit.subject}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    <span className="font-mono">{shortSha(commit.sha)}</span> · {commit.author} ·{" "}
                    {relativeDate(commit.date)}
                  </span>
                </span>
                {commit.parents.length > 1 ? <Badge variant="outline">merge</Badge> : null}
              </button>
              {expanded === commit.sha ? (
                <div className="mt-2 space-y-2 pl-6">
                  {commit.body ? (
                    <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{commit.body}</pre>
                  ) : null}
                  <p className="font-mono text-[11px] text-muted-foreground">{commit.sha}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary underline-offset-2 hover:underline"
                      onClick={() => setLinking(commit)}
                    >
                      Link to task…
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {!commits.length && !error ? (
          <p className="py-2 text-xs text-muted-foreground">No commits yet.</p>
        ) : null}
      </ScrollArea>

      <LinkTaskDialog
        repo={repo}
        commit={linking}
        onClose={() => setLinking(null)}
        onLinked={async () => {
          await repo.refresh();
        }}
      />
    </div>
  );
}
```

Run: `pnpm typecheck` → exit 0.
Manual (desktop): create `feat/panel-check` from the branch menu, switch back to `main`, and confirm the badge/upstream line matches `git for-each-ref` output in the terminal. On a dirty tree, switching must ask for confirmation first.
Commit: `feat(git): branch menu with create/switch and commit log with detail`

---

## P6.T13 — Commit ⇄ task linking through the P5 fabric (TDD, ≈14 min)

**Failing test — create `tests/unit/lib/git/link-commit.test.ts`** (fake-indexeddb, the same harness the other DB tests use; `tests/unit/_helpers/db.ts` is created by P0.T4 — use its `freshDb()` helper):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../../_helpers/db";
import { db } from "@/lib/db";
import { linkCommitToTask, recordLocalCommit } from "@/lib/git/link-commit";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { linksRepo } from "@/lib/db/repos/links";
import { commitsRepo } from "@/lib/db/repos/commits";
import { devLogsRepo } from "@/lib/db/repos/devLogs";

const projectId = "p1";

async function seedTask(title: string) {
  return tasksRepo.create({ projectId, title, description: "", status: "todo", priority: "medium" });
}

describe("recordLocalCommit", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });

  it("mirrors a local commit into the commits table with the parsed date", async () => {
    const { commit, created } = await recordLocalCommit({
      projectId,
      root: "C:\\proj",
      sha: "ef0c80f18579bb4ce75cb62be767f81501595310",
      message: "feat(git): panel\n\nbody line",
      author: "Dev Example",
      date: "2026-10-16T23:46:58+03:00",
      files: ["a.txt"],
      additions: 3,
      deletions: 1,
    });
    expect(created).toBe(true);
    expect(commit.date).toBe(Date.parse("2026-10-16T23:46:58+03:00"));
    expect(commit.message).toBe("feat(git): panel\n\nbody line");
    expect(await commitsRepo.listByProject(projectId)).toHaveLength(1);
  });

  it("is idempotent per sha: a second call updates instead of duplicating", async () => {
    const input = {
      projectId, root: "C:\\proj",
      sha: "649b5328e4c0fd2aa29cccfa112b0d7ef1fdda28",
      message: "feat: first", author: "Dev", date: "2026-10-16T20:00:00Z",
      files: [], additions: 0, deletions: 0,
    };
    const first = await recordLocalCommit(input);
    const second = await recordLocalCommit({ ...input, message: "feat: first (amended)" });
    expect(second.created).toBe(false);
    expect(second.commit.id).toBe(first.commit.id);
    expect((await commitsRepo.listByProject(projectId))).toHaveLength(1);
    expect(second.commit.message).toBe("feat: first (amended)");
  });

  it("writes one devlog entry, not one per call", async () => {
    const input = {
      projectId, root: "C:\\proj", sha: "a".repeat(40),
      message: "feat: x", author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    };
    await recordLocalCommit(input);
    await recordLocalCommit(input);
    expect(await devLogsRepo.listByProject(projectId)).toHaveLength(1);
  });
});

describe("linkCommitToTask", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });

  it("creates an implements link, updates the task side of the commit and de-duplicates", async () => {
    const task = await seedTask("Ship the git panel");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "b".repeat(40), message: "feat: y",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });

    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });

    const links = await linksRepo.listByProject(projectId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceType: "commit", sourceId: commit.id,
      targetType: "task", targetId: task.id,
      linkType: "implements",
    });
    const stored = await commitsRepo.get(commit.id);
    expect(stored?.linkedTaskIds).toEqual([task.id]);
  });

  it("keeps several tasks on one commit", async () => {
    const a = await seedTask("A");
    const b = await seedTask("B");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "c".repeat(40), message: "feat: z",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: a.id });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: b.id });
    expect((await commitsRepo.get(commit.id))?.linkedTaskIds.sort()).toEqual([a.id, b.id].sort());
  });
});

describe("db.links stays usable for backlinks (P5 computeBacklinks)", () => {
  beforeEach(async () => {
    await freshDb(["commits", "links", "devLogs", "tasks"]);
  });
  it("a task's incoming links include the commit", async () => {
    const task = await seedTask("T");
    const { commit } = await recordLocalCommit({
      projectId, root: "C:\\proj", sha: "d".repeat(40), message: "feat: w",
      author: "Dev", date: "2026-10-16T20:00:00Z", files: [], additions: 0, deletions: 0,
    });
    await linkCommitToTask({ projectId, commitId: commit.id, taskId: task.id });
    const backlinks = await linksRepo.listByTarget("task", task.id);
    expect(backlinks.map((l) => l.sourceId)).toEqual([commit.id]);
    expect(await db.links.count()).toBe(1);
  });
});
```

Run: `pnpm test -- tests/unit/lib/git/link-commit.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/git/link-commit`.

**Create `src/lib/git/link-commit.ts`:**

```ts
import { commitsRepo } from "@/lib/db/repos/commits";
import { devLogsRepo } from "@/lib/db/repos/devLogs";
import { linksRepo } from "@/lib/db/repos/links";
import { tasksRepo } from "@/lib/db/repos/tasks";
import type { Commit, Link } from "@/lib/db/schema";
import { firstLine } from "@/lib/utils/text";

/**
 * Local-commit ⇄ task linking, on the P5 entity fabric:
 *  - the commit becomes a normal `commits` row (kind "commit" already exists in
 *    entityKindSchema and the activity tracker already covers that table, so the
 *    activity entry costs nothing extra here — writing a second one would
 *    duplicate it, F10);
 *  - the relationship is a `links` row (commit --implements--> task), which is
 *    exactly what github-sync.ts writes for GitHub commits, so the graph, the
 *    backlinks panel and the chips all light up with no new tables;
 *  - `commit.linkedTaskIds` is kept in sync for the dashboard commits panel,
 *    which reads that field directly.
 */

export interface RecordLocalCommitInput {
  projectId: string | null;
  root: string;
  sha: string;
  message: string;
  author?: string;
  /** ISO-8601 (git %aI) or epoch ms. */
  date?: string | number;
  files?: string[];
  additions?: number;
  deletions?: number;
}

export interface RecordLocalCommitResult {
  commit: Commit;
  /** false when a row with that sha already existed (amend / re-record). */
  created: boolean;
}

const toMs = (input: string | number | undefined): number => {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const ms = Date.parse(input);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
};

export async function recordLocalCommit(
  input: RecordLocalCommitInput,
): Promise<RecordLocalCommitResult> {
  const projectId = input.projectId ?? "";
  if (!projectId) throw new Error("recordLocalCommit needs a projectId");
  const existing = (await commitsRepo.listByProject(projectId)).find((c) => c.sha === input.sha);
  const date = toMs(input.date);

  if (existing) {
    await commitsRepo.update(existing.id, {
      message: input.message,
      author: input.author ?? existing.author,
      date,
      files: input.files ?? existing.files,
      additions: input.additions ?? existing.additions,
      deletions: input.deletions ?? existing.deletions,
    });
    const updated = await commitsRepo.get(existing.id);
    return { commit: updated ?? existing, created: false };
  }

  const commit = await commitsRepo.create({
    projectId,
    sha: input.sha,
    message: input.message,
    author: input.author ?? "",
    date,
    files: input.files ?? [],
    additions: input.additions ?? 0,
    deletions: input.deletions ?? 0,
  });

  await devLogsRepo.create({
    projectId,
    type: "commit",
    title: firstLine(input.message) || input.sha.slice(0, 7),
    body: input.message,
    refType: "commit",
    refId: commit.id,
  });

  return { commit, created: true };
}

export interface LinkCommitInput {
  projectId: string;
  commitId: string;
  taskId: string;
  /** Optional free-text note stored on the link row. */
  label?: string;
}

/** Idempotent: the same (commit, task) pair yields at most one link row. */
export async function linkCommitToTask(input: LinkCommitInput): Promise<Link> {
  const existing = (await linksRepo.listBySource("commit", input.commitId)).find(
    (l) => l.targetType === "task" && l.targetId === input.taskId,
  );
  const link =
    existing ??
    (await linksRepo.create({
      projectId: input.projectId,
      sourceType: "commit",
      sourceId: input.commitId,
      targetType: "task",
      targetId: input.taskId,
      linkType: "implements",
      label: input.label ?? "",
    }));

  const commit = await commitsRepo.get(input.commitId);
  if (commit && !commit.linkedTaskIds.includes(input.taskId)) {
    await commitsRepo.update(input.commitId, {
      linkedTaskIds: [...commit.linkedTaskIds, input.taskId],
    });
  }
  return link;
}

/** Remove the link row and the mirrored id on the commit. */
export async function unlinkCommitFromTask(input: {
  commitId: string;
  taskId: string;
}): Promise<void> {
  const links = await linksRepo.listBySource("commit", input.commitId);
  for (const link of links) {
    if (link.targetType === "task" && link.targetId === input.taskId) {
      await linksRepo.remove(link.id);
    }
  }
  const commit = await commitsRepo.get(input.commitId);
  if (commit) {
    await commitsRepo.update(input.commitId, {
      linkedTaskIds: commit.linkedTaskIds.filter((id) => id !== input.taskId),
    });
  }
}

/** Tasks suggested for a commit message: same-project tasks whose title words appear in it. */
export async function suggestTasksForMessage(
  projectId: string | null,
  message: string,
): Promise<string[]> {
  if (!projectId) return [];
  const haystack = message.toLowerCase();
  const tasks = await tasksRepo.listByProject(projectId);
  return tasks
    .filter((task) => {
      const words = task.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return words.length > 0 && words.every((w) => haystack.includes(w));
    })
    .map((task) => task.id);
}
```

**`firstLine` is a new shared helper — verified missing today** (`src/lib/utils/` holds only `cn.ts`, `ids.ts`, `markdown.ts`, `search.ts`; `rg -n "firstLine" src/` finds nothing). Create `src/lib/utils/text.ts` with exactly this in the same commit (P5's activity tracker defines its own private `firstLine`; do not import from there — a two-line shared helper is the right home and P5's copy can migrate later):

```ts
/** First non-empty line of a message, trimmed — titles for logs and chips. */
export function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}
```

**Create `src/components/git/link-task-dialog.tsx`:**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EntityChip } from "@/components/entities/entity-chip";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { linkCommitToTask, recordLocalCommit, suggestTasksForMessage, unlinkCommitFromTask } from "@/lib/git/link-commit";
import { shortSha } from "@/lib/git/format";
import type { Task } from "@/lib/db/schema";
import type { GitCommitInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

/**
 * "Link commit to task". The commit row is created here if it is not in Dexie
 * yet (a commit made before this panel existed, or one pulled from GitHub), so
 * the action works from the log for any commit, not only ones made in the app.
 */
export function LinkTaskDialog({
  repo,
  commit,
  onClose,
  onLinked,
}: {
  repo: GitRepo;
  commit: GitCommitInfo | null;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [linkedCommitId, setLinkedCommitId] = useState<string | null>(null);
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    if (!commit || !repo.projectId) return;
    let cancelled = false;
    void (async () => {
      const [rows, ids] = await Promise.all([
        tasksRepo.listByProject(repo.projectId),
        suggestTasksForMessage(repo.projectId, commit.body ? `${commit.subject}\n${commit.body}` : commit.subject),
      ]);
      if (!cancelled) {
        setTasks(rows);
        setSuggested(ids);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commit, repo.projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks.slice(0, 50);
    return tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 50);
  }, [tasks, query]);

  if (!commit) return null;

  const ensureCommitRow = async (): Promise<string | null> => {
    if (linkedCommitId) return linkedCommitId;
    const { commit: row } = await recordLocalCommit({
      projectId: repo.projectId,
      root: repo.root ?? "",
      sha: commit.sha,
      message: commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject,
      author: commit.author,
      date: commit.date,
    });
    setLinkedCommitId(row.id);
    setLinkedTaskIds(row.linkedTaskIds);
    return row.id;
  };

  const link = async (taskId: string) => {
    const commitId = await ensureCommitRow();
    if (!commitId || !repo.projectId) return;
    await linkCommitToTask({ projectId: repo.projectId, commitId, taskId });
    setLinkedTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
    await onLinked();
  };

  const unlink = async (taskId: string) => {
    const commitId = await ensureCommitRow();
    if (!commitId) return;
    await unlinkCommitFromTask({ commitId, taskId });
    setLinkedTaskIds((ids) => ids.filter((id) => id !== taskId));
    await onLinked();
  };

  return (
    <div className="rounded border border-border p-3">
      <header className="flex items-center gap-2 pb-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Link commit</span>
        <span className="font-mono text-xs text-muted-foreground">{shortSha(commit.sha)}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="flex items-center gap-2 pb-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tasks…"
          className="h-7 text-xs"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {filtered.map((task) => {
          const isLinked = linkedTaskIds.includes(task.id);
          return (
            <li key={task.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
              {suggested.includes(task.id) && !isLinked ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                  suggested
                </Badge>
              ) : null}
              {isLinked ? (
                <>
                  <EntityChip entity={{ kind: "task", id: task.id }} />
                  <Button size="sm" variant="ghost" onClick={() => void unlink(task.id)}>
                    Unlink
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void link(task.id)}>
                  Link
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!filtered.length ? <p className="text-xs text-muted-foreground">No matching tasks.</p> : null}
    </div>
  );
}
```

Run: `pnpm test -- tests/unit/lib/git/link-commit.test.ts`
Expected: **PASS** (`Tests  6 passed`). Then `pnpm test -- tests/unit/lib/git/` → all green, `pnpm typecheck` → exit 0.
Commit: `feat(git): mirror local commits into Dexie and link them to tasks via the P5 links graph`

---

## P6.T14 — GitHub client with an injectable fetch (TDD, ≈12 min)

Reused, not rebuilt: `octokit@5.0.5` + the PAT plumbing P2 moved into safeStorage (`useGithub` still carries `owner/repo/branch`; the token is read the same way `/api/github` already receives it), and `src/app/api/github/route.ts` keeps serving the **commits** path untouched.

Verified before writing this task:
- `@octokit/request@10.0.13` calls `fetch(requestOptions.url, { method, headers, body })` where fetch is `requestOptions.request?.fetch || globalThis.fetch` — so `new Octokit({ request: { fetch: stub } })` is a real injection point (`node_modules/.pnpm/@octokit+request@10.0.13/…/dist-bundle/index.js:34-52`).
- `Fetch` is typed `any` in `@octokit/types@17.0.0` (`dist-types/Fetch.d.ts:4`), so the stub needs no casts.
- Methods: `octokit.rest.issues.listForRepo/create/update/createComment`, `octokit.rest.pulls.list`, `octokit.rest.checks.listForRef` (`@octokit/plugin-rest-endpoint-methods@…/method-types.d.ts:6088,6192,6214,6547,6731,8985,3171`).

**Failing test — create `tests/unit/lib/github/client.test.ts`** (no network: the stub fetch answers from recorded fixture JSON):

```ts
import { describe, it, expect } from "vitest";
import {
  createGithubClient,
  normalizeIssue,
  normalizePull,
  summarizeChecks,
  type GithubCheck,
} from "@/lib/server/github/client";

/* Fixture shapes: one non-PR issue and one PR-as-issue (GitHub's issues
 * endpoint returns both), plus a check-run page. Field names follow the
 * installed @octokit/openapi-types schemas. */
const ISSUE = {
  number: 42, title: "Panel flickers on resize", state: "open", state_reason: null,
  body: "Steps to reproduce …", labels: [{ name: "bug" }, { name: "ui" }],
  html_url: "https://github.com/trookish/MasarFlow/issues/42",
  updated_at: "2026-10-16T20:00:00Z",
};
const PR_AS_ISSUE = {
  number: 43, title: "feat: git panel", state: "open",
  body: "", labels: [],
  html_url: "https://github.com/trookish/MasarFlow/pull/43",
  updated_at: "2026-10-16T21:00:00Z",
  pull_request: { url: "https://api.github.com/repos/trookish/MasarFlow/pulls/43" },
};
const PULL = {
  number: 43, title: "feat: git panel", state: "open", draft: false, merged: false,
  html_url: "https://github.com/trookish/MasarFlow/pull/43",
  updated_at: "2026-10-16T21:00:00Z",
  head: { ref: "feat/git-panel", sha: "abcdef1234567890abcdef1234567890abcdef12" },
};
const CHECKS = {
  total_count: 2,
  check_runs: [
    { name: "build", status: "completed", conclusion: "success", html_url: "https://github.com/x/1" },
    { name: "lint", status: "completed", conclusion: "failure", html_url: "https://github.com/x/2" },
  ],
};

function stubFetch(payloads: unknown[]) {
  const calls: string[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const body = payloads.shift() ?? {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, impl };
}

describe("normalizeIssue", () => {
  it("reads a plain issue", () => {
    expect(normalizeIssue(ISSUE)).toEqual({
      number: 42,
      title: "Panel flickers on resize",
      body: "Steps to reproduce …",
      state: "open",
      labels: ["bug", "ui"],
      htmlUrl: "https://github.com/trookish/MasarFlow/issues/42",
      updatedAt: "2026-10-16T20:00:00Z",
      isPullRequest: false,
    });
  });
  it("flags the pull-request flavour the issues endpoint also returns", () => {
    expect(normalizeIssue(PR_AS_ISSUE).isPullRequest).toBe(true);
  });
  it("survives missing optional fields", () => {
    expect(normalizeIssue({ number: 1, title: "t", state: "closed" })).toMatchObject({
      body: "", labels: [], isPullRequest: false, updatedAt: "",
    });
  });
});

describe("summarizeChecks", () => {
  const check = (status: string, conclusion: string | null): GithubCheck => ({
    name: "c", status, conclusion, htmlUrl: "",
  });
  it("has no checks", () => expect(summarizeChecks([])).toBe("none"));
  it("counts anything unfinished as pending", () => {
    expect(summarizeChecks([check("queued", null), check("completed", "success")])).toBe("pending");
  });
  it("counts success and skipped as success", () => {
    expect(summarizeChecks([check("completed", "success"), check("completed", "skipped")])).toBe("success");
    expect(summarizeChecks([check("completed", "neutral")])).toBe("success");
  });
  it("lets a failure win", () => {
    expect(summarizeChecks([check("completed", "success"), check("completed", "failure")])).toBe("failure");
    expect(summarizeChecks([check("completed", "cancelled")])).toBe("failure");
  });
});

describe("normalizePull", () => {
  it("carries head sha and the CI summary", () => {
    const pull = normalizePull(PULL, CHECKS.check_runs.map((c) => ({ ...c, conclusion: c.conclusion, status: c.status, htmlUrl: c.html_url })));
    expect(pull).toMatchObject({
      number: 43, state: "open", draft: false, merged: false,
      headSha: "abcdef1234567890abcdef1234567890abcdef12", ci: "failure",
    });
    expect(pull.checks.map((c) => c.name)).toEqual(["build", "lint"]);
  });
  it("reads a merged pull closed", () => {
    expect(normalizePull({ ...PULL, state: "closed", merged: true }, []).state).toBe("closed");
  });
});

describe("createGithubClient", () => {
  it("lists issues from the repo endpoint and hides pull requests behind a count", async () => {
    const { calls, impl } = stubFetch([[ISSUE, PR_AS_ISSUE]]);
    const client = createGithubClient({ token: "t", owner: "trookish", repo: "MasarFlow", fetchImpl: impl });
    const result = await client.listIssues({ state: "open" });
    expect(calls[0]).toContain("https://api.github.com/repos/trookish/MasarFlow/issues");
    expect(result.issues.map((i) => i.number)).toEqual([42]);
    expect(result.pullCount).toBe(1);
  });

  it("creates an issue and returns its number", async () => {
    const { calls, impl } = stubFetch([{ number: 99, title: "New", state: "open", html_url: "u", updated_at: "d" }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    const created = await client.createIssue({ title: "New", body: "b", labels: ["bug"] });
    expect(calls[0]).toMatch(/^POST https:\/\/api\.github\.com\/repos\/o\/r\/issues$/);
    expect(created.number).toBe(99);
  });

  it("closes an issue and optionally comments", async () => {
    const { calls, impl } = stubFetch([{ number: 7, state: "closed" }, { id: 1 }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    await client.closeIssue(7, "Closed by commit abc1234.");
    expect(calls[0]).toMatch(/^PATCH https:\/\/api\.github\.com\/repos\/o\/r\/issues\/7$/);
    expect(calls[1]).toMatch(/^POST https:\/\/api\.github\.com\/repos\/o\/r\/issues\/7\/comments$/);
  });

  it("attaches check runs to the first N pulls only", async () => {
    const pulls = [PULL, { ...PULL, number: 44, head: { ...PULL.head, sha: "1".repeat(40) } }];
    const { calls, impl } = stubFetch([pulls, CHECKS, { total_count: 0, check_runs: [] }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    const result = await client.listPulls({ state: "open", checkLimit: 2 });
    expect(result.map((p) => p.number)).toEqual([43, 44]);
    expect(result[0].ci).toBe("failure");
    expect(result[1].ci).toBe("none");
    expect(calls.filter((c) => c.includes("/check-runs"))).toHaveLength(2);
  });

  it("maps a 401 to a friendly error the caller can show", async () => {
    const impl = async (): Promise<Response> =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    const client = createGithubClient({ token: "bad", owner: "o", repo: "r", fetchImpl: impl });
    await expect(client.listIssues({})).rejects.toThrow(/401/);
  });
});
```

Run: `pnpm test -- tests/unit/lib/github/client.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/server/github/client`.

**Create `src/lib/server/github/client.ts`:**

```ts
import { Octokit } from "octokit";

/**
 * GitHub REST access for issues, pull requests and CI — one injectable client.
 *
 * Lives next to the other server helpers because it is called from route
 * handlers only (the PAT stays on this machine; the routes are behind P2's
 * launch-token guard in src/proxy.ts). Every method takes `fetchImpl` so the
 * unit tests never touch the network, and the fixtures in the test file are
 * minimal versions of the shapes `@octokit/openapi-types` documents.
 */

export type CiSummary = "success" | "failure" | "pending" | "none";

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  htmlUrl: string;
  updatedAt: string;
  /** GitHub's issues endpoint also returns pull requests — flagged, then filtered by callers. */
  isPullRequest: boolean;
}

export interface GithubCheck {
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
}

export interface GithubPull {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  htmlUrl: string;
  updatedAt: string;
  headSha: string;
  checks: GithubCheck[];
  ci: CiSummary;
}

export interface GithubClientOptions {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}

/** Conclusions that need a human. `cancelled` counts as failure on purpose: it needs a rerun. */
const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "action_required", "startup_failure", "cancelled"]);
const SUCCESS_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

export function summarizeChecks(checks: GithubCheck[]): CiSummary {
  if (!checks.length) return "none";
  if (checks.some((c) => FAILURE_CONCLUSIONS.has(c.conclusion ?? ""))) return "failure";
  if (checks.some((c) => c.conclusion === null || !SUCCESS_CONCLUSIONS.has(c.conclusion))) return "pending";
  return "success";
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;

export function normalizeIssue(raw: Raw): GithubIssue {
  const labels = Array.isArray(raw.labels)
    ? (raw.labels as unknown[])
        .map((l) => (typeof l === "string" ? l : str((l as Raw)?.name)))
        .filter(Boolean)
    : [];
  return {
    number: num(raw.number),
    title: str(raw.title),
    body: str(raw.body),
    state: raw.state === "closed" ? "closed" : "open",
    labels,
    htmlUrl: str(raw.html_url),
    updatedAt: str(raw.updated_at),
    isPullRequest: raw.pull_request !== undefined && raw.pull_request !== null,
  };
}

export function normalizeCheckRun(raw: Raw): GithubCheck {
  return {
    name: str(raw.name),
    status: str(raw.status),
    conclusion: typeof raw.conclusion === "string" ? raw.conclusion : null,
    htmlUrl: str(raw.html_url),
  };
}

export function normalizePull(raw: Raw, checks: GithubCheck[]): GithubPull {
  const head = (raw.head ?? {}) as Raw;
  return {
    number: num(raw.number),
    title: str(raw.title),
    state: raw.state === "closed" ? "closed" : "open",
    draft: bool(raw.draft),
    merged: bool(raw.merged),
    htmlUrl: str(raw.html_url),
    updatedAt: str(raw.updated_at),
    headSha: str(head.sha),
    checks,
    ci: summarizeChecks(checks),
  };
}

/** Turns an Octokit failure into a message the panel can show verbatim. */
export function githubErrorMessage(error: unknown, owner: string, repo: string): string {
  const err = error as { status?: number; message?: string };
  if (err.status === 401) return "GitHub rejected the token (401). Check the personal access token in Settings.";
  if (err.status === 403) return "GitHub refused the request (403) — the token may lack 'issues' or 'pull requests' scope, or the rate limit is exhausted.";
  if (err.status === 404) return `Repository ${owner}/${repo} not found (404). Check owner/name and token scope.`;
  return err.message ?? "GitHub request failed";
}

export function createGithubClient(options: GithubClientOptions) {
  const { token, owner, repo } = options;
  const octokit = new Octokit({
    auth: token,
    ...(options.fetchImpl ? { request: { fetch: options.fetchImpl } } : {}),
  });

  return {
    /** Non-PR issues, newest activity first. */
    async listIssues(
      args: { state?: "open" | "closed" | "all"; labels?: string; perPage?: number } = {},
    ): Promise<{ issues: GithubIssue[]; pullCount: number }> {
      const res = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: args.state ?? "open",
        ...(args.labels ? { labels: args.labels } : {}),
        per_page: Math.min(Math.max(args.perPage ?? 30, 1), 100),
        sort: "updated",
        direction: "desc",
      });
      const all = (res.data as unknown as Raw[]).map(normalizeIssue);
      return {
        issues: all.filter((i) => !i.isPullRequest),
        pullCount: all.filter((i) => i.isPullRequest).length,
      };
    },

    async createIssue(args: { title: string; body?: string; labels?: string[] }): Promise<GithubIssue> {
      const res = await octokit.rest.issues.create({
        owner,
        repo,
        title: args.title,
        body: args.body ?? "",
        ...(args.labels?.length ? { labels: args.labels } : {}),
      });
      return normalizeIssue(res.data as unknown as Raw);
    },

    async closeIssue(number: number, comment?: string): Promise<GithubIssue> {
      const res = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: number,
        state: "closed",
      });
      if (comment?.trim()) {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body: comment });
      }
      return normalizeIssue(res.data as unknown as Raw);
    },

    /** Pulls with CI status. `checkLimit` caps the extra API calls (rate limits). */
    async listPulls(
      args: { state?: "open" | "closed" | "all"; perPage?: number; checkLimit?: number } = {},
    ): Promise<GithubPull[]> {
      const res = await octokit.rest.pulls.list({
        owner,
        repo,
        state: args.state ?? "open",
        per_page: Math.min(Math.max(args.perPage ?? 20, 1), 100),
        sort: "updated",
        direction: "desc",
      });
      const raws = res.data as unknown as Raw[];
      const limit = Math.min(args.checkLimit ?? 10, raws.length);
      const checksByIndex: GithubCheck[][] = [];
      for (let i = 0; i < limit; i++) {
        const sha = str(((raws[i].head ?? {}) as Raw).sha);
        if (!sha) {
          checksByIndex[i] = [];
          continue;
        }
        try {
          const checks = await octokit.rest.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
          checksByIndex[i] = ((checks.data as unknown as Raw).check_runs as Raw[] ?? []).map(normalizeCheckRun);
        } catch {
          checksByIndex[i] = [];
        }
      }
      return raws.map((raw, i) => normalizePull(raw, checksByIndex[i] ?? []));
    },
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
```

Run: `pnpm test -- tests/unit/lib/github/client.test.ts`
Expected: **PASS** (`Tests  14 passed`). If the "maps a 401" case fails on the message, print the thrown error (`catch (e) { console.log(e) }`) — Octokit's `RequestError` puts the status on `.status`; do not guess.
Commit: `feat(github): injectable Octokit client for issues, pull requests and check runs`

---

## P6.T15 — Two GitHub routes (TDD, ≈10 min)

**No guard code in these routes:** `src/proxy.ts` (P2.T2) already rejects every request without the launch token / allowed origin when `MASARFLOW_TOKEN` is set, and passes everything through in browser dev. `src/lib/server/request-guard.ts` exports `TOKEN_HEADER`, `checkRequest`, `guardConfigFromEnv` — do not duplicate that logic here.

**Failing test — create `tests/unit/app/api/github/routes.test.ts`:**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { POST as issuesPost } from "@/app/api/github/issues/route";
import { POST as pullsPost } from "@/app/api/github/pulls/route";

afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown): Request =>
  new Request("http://127.0.0.1:3000/api/github/issues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function stub(payloads: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify(payloads.shift() ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

describe("POST /api/github/issues", () => {
  it("rejects a body without a token", async () => {
    const res = await issuesPost(post({ owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/token/i);
  });
  it("rejects an unknown action", async () => {
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "nope" }));
    expect(res.status).toBe(400);
  });
  it("lists issues", async () => {
    const calls = stub([{ total_count: 0, items: [] }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issues: [], pullCount: 0 });
    expect(calls[0]).toContain("/repos/o/r/issues");
  });
  it("creates an issue", async () => {
    const calls = stub([{ number: 5, title: "T", state: "open", html_url: "u", updated_at: "d" }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "create", title: "T", body: "B" }));
    expect((await res.json()).issue.number).toBe(5);
    expect(calls[0]).toMatch(/^POST /);
  });
  it("closes an issue", async () => {
    const calls = stub([{ number: 5, state: "closed" }]);
    const res = await issuesPost(post({ pat: "t", owner: "o", repo: "r", action: "close", number: 5 }));
    expect((await res.json()).issue.state).toBe("closed");
    expect(calls[0]).toMatch(/^PATCH .*\/issues\/5$/);
  });
  it("maps a 401 to a friendly message with the same status", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401, headers: { "content-type": "application/json" },
      }));
    const res = await issuesPost(post({ pat: "bad", owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("401");
  });
});

describe("POST /api/github/pulls", () => {
  it("lists pulls with their CI summary", async () => {
    stub([
      [{ number: 43, title: "P", state: "open", head: { sha: "a".repeat(40) }, html_url: "u", updated_at: "d" }],
      { total_count: 0, check_runs: [] },
    ]);
    const res = await pullsPost(post({ pat: "t", owner: "o", repo: "r", action: "list", state: "open" }));
    const json = await res.json();
    expect(json.pulls).toHaveLength(1);
    expect(json.pulls[0].ci).toBe("none");
  });
  it("requires a token", async () => {
    const res = await pullsPost(post({ owner: "o", repo: "r", action: "list" }));
    expect(res.status).toBe(400);
  });
});
```

Run: `pnpm test -- tests/unit/app/api/github/routes.test.ts`
Expected: **FAIL** — cannot resolve `@/app/api/github/issues/route`.

**Create `src/app/api/github/issues/route.ts`:**

```ts
import { createGithubClient, githubErrorMessage } from "@/lib/server/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues proxy (POST only, like /api/github). The request body carries the PAT
 * the renderer already holds — the same local-only pattern as the commits
 * route — and P2's launch-token guard in src/proxy.ts protects the endpoint in
 * the packaged app.
 */

interface IssuesRequest {
  pat: string;
  owner: string;
  repo: string;
  action: "list" | "create" | "close";
  state?: "open" | "closed" | "all";
  labels?: string;
  perPage?: number;
  number?: number;
  title?: string;
  body?: string;
  comment?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: IssuesRequest;
  try {
    body = (await req.json()) as IssuesRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pat, owner, repo, action } = body;
  if (!pat) return Response.json({ error: "Missing personal access token" }, { status: 400 });
  if (!owner || !repo) return Response.json({ error: "Missing repository owner/name" }, { status: 400 });
  if (action !== "list" && action !== "create" && action !== "close") {
    return Response.json({ error: `Unknown action '${String(action)}'` }, { status: 400 });
  }

  const client = createGithubClient({ token: pat, owner, repo });
  try {
    if (action === "list") {
      const result = await client.listIssues({ state: body.state, labels: body.labels, perPage: body.perPage });
      return Response.json(result);
    }
    if (action === "create") {
      if (!body.title?.trim()) return Response.json({ error: "Missing issue title" }, { status: 400 });
      const issue = await client.createIssue({ title: body.title, body: body.body, labels: body.labels ? [body.labels] : undefined });
      return Response.json({ issue });
    }
    if (!body.number) return Response.json({ error: "Missing issue number" }, { status: 400 });
    const issue = await client.closeIssue(body.number, body.comment);
    return Response.json({ issue });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return Response.json({ error: githubErrorMessage(e, owner, repo) }, { status });
  }
}
```

**Create `src/app/api/github/pulls/route.ts`:**

```ts
import { createGithubClient, githubErrorMessage } from "@/lib/server/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull requests + latest check-run status for each (POST only, PAT in the body). */

interface PullsRequest {
  pat: string;
  owner: string;
  repo: string;
  action: "list";
  state?: "open" | "closed" | "all";
  perPage?: number;
  checkLimit?: number;
}

export async function POST(req: Request): Promise<Response> {
  let body: PullsRequest;
  try {
    body = (await req.json()) as PullsRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pat, owner, repo, action } = body;
  if (!pat) return Response.json({ error: "Missing personal access token" }, { status: 400 });
  if (!owner || !repo) return Response.json({ error: "Missing repository owner/name" }, { status: 400 });
  if (action !== "list") return Response.json({ error: `Unknown action '${String(action)}'` }, { status: 400 });

  try {
    const client = createGithubClient({ token: pat, owner, repo });
    const pulls = await client.listPulls({ state: body.state, perPage: body.perPage, checkLimit: body.checkLimit });
    return Response.json({ pulls });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return Response.json({ error: githubErrorMessage(e, owner, repo) }, { status });
  }
}
```

Run: `pnpm test -- tests/unit/app/api/github/routes.test.ts`
Expected: **PASS** (`Tests  8 passed`).
Commit: `feat(api): /api/github/issues and /api/github/pulls routes (issues, PRs, CI status)`

---

## P6.T16 — Issue ⇄ task sync on a non-indexed `task.externalRef` (TDD, ≈15 min)

**No Dexie version bump (D-P6-3).** `externalRef` is a plain field: lookups go through `tasksRepo.listByProject()` (a project has tens of tasks), so the store schema and `db.version(12)` stay untouched.

**Failing test — create `tests/unit/lib/github/issue-sync.test.ts`:**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../../_helpers/db";
import { tasksRepo } from "@/lib/db/repos/tasks";
import {
  ISSUE_TASK_TAG,
  applyIssueTaskSync,
  makeExternalRef,
  parseExternalRef,
  planIssueTaskSync,
} from "@/lib/github/issue-sync";
import type { GithubIssue } from "@/lib/server/github/client";

const projectId = "p1";
/** The repository identity every sync is compared against — never inferred from the refs. */
const repo = { owner: "trookish", repo: "MasarFlow" };

const issue = (over: Partial<GithubIssue> = {}): GithubIssue => ({
  number: 7, title: "Panel flickers", body: "steps", state: "open",
  labels: ["bug"], htmlUrl: "https://github.com/o/r/issues/7",
  updatedAt: "2026-10-16T20:00:00Z", isPullRequest: false, ...over,
});

describe("externalRef helpers", () => {
  it("round-trips", () => {
    const ref = makeExternalRef({ owner: "trookish", repo: "MasarFlow", number: 42 });
    expect(ref).toBe("github:trookish/MasarFlow#42");
    expect(parseExternalRef(ref)).toEqual({ owner: "trookish", repo: "MasarFlow", number: 42 });
  });
  it("rejects anything else", () => {
    for (const bad of ["", "jira:ABC-1", "github:o/r", "github:o/r#x"]) {
      expect(parseExternalRef(bad), bad).toBeNull();
    }
  });
});

describe("planIssueTaskSync", () => {
  it("creates a task for an open issue with no task yet", () => {
    const plan = planIssueTaskSync([], [issue()], repo);
    expect(plan.createTasks).toHaveLength(1);
    expect(plan.createTasks[0]).toMatchObject({
      externalRef: "github:trookish/MasarFlow#7",
      title: "Panel flickers",
      labels: ["bug"],
    });
    expect(plan.closeTasks).toEqual([]);
  });
  it("leaves an already-linked task alone", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:trookish/MasarFlow#7" }],
      [issue()],
      repo,
    );
    expect(plan.createTasks).toEqual([]);
    expect(plan.closeTasks).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });
  it("ignores refs that belong to a different repository", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:other/repo#7" }],
      [issue()],
      repo,
    );
    expect(plan.createTasks).toHaveLength(1);
    expect(plan.orphanRefs).toEqual([]);
  });
  it("marks a task done when its issue is closed", () => {
    const plan = planIssueTaskSync(
      [{ id: "t1", externalRef: "github:trookish/MasarFlow#7" }],
      [issue({ state: "closed" })],
      repo,
    );
    expect(plan.closeTasks).toEqual([{ taskId: "t1", number: 7 }]);
  });
  it("reports refs whose issue was not in this page, without touching the task", () => {
    const plan = planIssueTaskSync([{ id: "t1", externalRef: "github:trookish/MasarFlow#999" }], [issue()], repo);
    expect(plan.orphanRefs).toEqual(["github:trookish/MasarFlow#999"]);
    expect(plan.closeTasks).toEqual([]);
  });
});

describe("applyIssueTaskSync", () => {
  beforeEach(async () => {
    await freshDb(["tasks", "links", "commits", "devLogs"]);
  });

  it("creates missing tasks, tags them, stores the ref and closes done ones", async () => {
    const existing = await tasksRepo.create({
      projectId, title: "Closed issue task", status: "todo",
      externalRef: "github:trookish/MasarFlow#8",
    });
    const plan = planIssueTaskSync(
      [{ id: existing.id, externalRef: existing.externalRef }],
      [issue(), issue({ number: 8, title: "Closed issue task", state: "closed" })],
      repo,
    );
    const result = await applyIssueTaskSync(projectId, plan, repo);

    expect(result.created).toBe(1);
    expect(result.closed).toBe(1);
    const tasks = await tasksRepo.listByProject(projectId);
    const created = tasks.find((t) => t.externalRef === "github:trookish/MasarFlow#7");
    expect(created).toMatchObject({ title: "Panel flickers", status: "backlog" });
    expect(created?.tags).toContain(ISSUE_TASK_TAG);
    expect(tasks.find((t) => t.id === existing.id)?.status).toBe("done");
  });

  it("is idempotent — a second run creates nothing", async () => {
    const first = await applyIssueTaskSync(projectId, planIssueTaskSync([], [issue()], repo), repo);
    const second = await applyIssueTaskSync(
      projectId,
      planIssueTaskSync(await tasksRepo.listByProject(projectId), [issue()], repo),
      repo,
    );
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(await tasksRepo.listByProject(projectId)).toHaveLength(1);
  });
});
```

Run: `pnpm test -- tests/unit/lib/github/issue-sync.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/github/issue-sync`.

**1. Edit `src/lib/db/schema.ts`** — in `taskSchema` (line 226-242) insert after `tags`:

```ts
  /** External tracker reference, e.g. "github:owner/repo#42". Non-indexed on purpose. */
  externalRef: z.string().default(""),
```

**2. Create `src/lib/github/issue-sync.ts`:**

```ts
import { tasksRepo } from "@/lib/db/repos/tasks";
import type { Task } from "@/lib/db/schema";
import type { GithubIssue } from "@/lib/server/github/client";

/**
 * Two-way issue ⇄ task sync.
 *
 * Pulling is safe and idempotent: an open issue with no task creates one, a
 * closed issue marks its task done, and a task whose issue is absent from the
 * fetched page is only *reported* (never deleted — losing local work to a
 * paginated API response would be unforgivable).
 *
 * Pushing is deliberately manual: closing a GitHub issue is a per-row button in
 * the panel, never a side effect of a local status change.
 */

export const ISSUE_TASK_TAG = "github";

export interface ExternalIssueRef {
  owner: string;
  repo: string;
  number: number;
}

/** "github:owner/repo#42" — stable, human-readable, and greppable in the DB. */
export function makeExternalRef(ref: ExternalIssueRef): string {
  return `github:${ref.owner}/${ref.repo}#${ref.number}`;
}

const REF_RE = /^github:([^/\s#]+)\/([^/\s#]+)#(\d+)$/;

export function parseExternalRef(value: string): ExternalIssueRef | null {
  const m = REF_RE.exec((value ?? "").trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export interface IssueSyncPlan {
  createTasks: Array<{ issue: GithubIssue; title: string; externalRef: string; labels: string[] }>;
  closeTasks: Array<{ taskId: string; number: number }>;
  unchanged: number;
  /** Task refs whose issue was not in the fetched page — informational only. */
  orphanRefs: string[];
}

/**
 * Pure: decide what a sync would do. `repo` is passed in (never guessed from
 * the task refs) so the comparison is against one known repository.
 */
export interface SyncRepo {
  owner: string;
  repo: string;
}

export function planIssueTaskSync(
  tasks: Array<Pick<Task, "id" | "externalRef">>,
  issues: GithubIssue[],
  repo: SyncRepo,
): IssueSyncPlan {
  const byNumber = new Map<number, Pick<Task, "id" | "externalRef">>();
  for (const task of tasks) {
    const parsed = parseExternalRef(task.externalRef ?? "");
    if (parsed && parsed.owner === repo.owner && parsed.repo === repo.repo) {
      byNumber.set(parsed.number, task);
    }
  }

  const plan: IssueSyncPlan = { createTasks: [], closeTasks: [], unchanged: 0, orphanRefs: [] };
  const seen = new Set<number>();

  for (const issue of issues) {
    if (issue.isPullRequest) continue;
    const task = byNumber.get(issue.number);
    if (!task) {
      plan.createTasks.push({
        issue,
        title: issue.title,
        externalRef: makeExternalRef({ ...repo, number: issue.number }),
        labels: issue.labels,
      });
      continue;
    }
    seen.add(issue.number);
    if (issue.state === "closed") plan.closeTasks.push({ taskId: task.id, number: issue.number });
    else plan.unchanged++;
  }

  for (const [number, task] of byNumber) {
    if (!seen.has(number)) plan.orphanRefs.push(task.externalRef ?? `#${number}`);
  }
  return plan;
}
```

**Continue `src/lib/github/issue-sync.ts` with the executor:**

```ts
export interface IssueSyncResult {
  created: number;
  closed: number;
  unchanged: number;
  orphanRefs: string[];
}

/** Executes a plan against Dexie. Safe to run twice. */
export async function applyIssueTaskSync(
  projectId: string,
  plan: IssueSyncPlan,
  repo: SyncRepo,
): Promise<IssueSyncResult> {
  let created = 0;
  let closed = 0;

  for (const item of plan.createTasks) {
    const tags = Array.from(new Set([...item.labels, ISSUE_TASK_TAG]));
    await tasksRepo.create({
      projectId,
      title: item.title,
      description: item.issue.body,
      status: "backlog",
      priority: "medium",
      tags,
      externalRef: item.externalRef,
    });
    created++;
  }

  for (const item of plan.closeTasks) {
    await tasksRepo.update(item.taskId, { status: "done", progress: 100 });
    closed++;
  }

  return { created, closed, unchanged: plan.unchanged, orphanRefs: plan.orphanRefs };
}

/** Tasks already linked to the given repository (for the panel's counters). */
export async function listIssueLinkedTasks(projectId: string, repo: SyncRepo): Promise<Task[]> {
  const tasks = await tasksRepo.listByProject(projectId);
  return tasks.filter((task) => {
    const parsed = parseExternalRef(task.externalRef ?? "");
    return Boolean(parsed && parsed.owner === repo.owner && parsed.repo === repo.repo);
  });
}
```

The module's public surface is now: `ISSUE_TASK_TAG`, `makeExternalRef`, `parseExternalRef`, `planIssueTaskSync`, `applyIssueTaskSync`, `listIssueLinkedTasks`, plus the `ExternalIssueRef`/`SyncRepo`/`IssueSyncPlan`/`IssueSyncResult` types the panel imports.

Run: `pnpm test -- tests/unit/lib/github/issue-sync.test.ts`
Expected: **PASS** (`Tests  9 passed`); `pnpm test -- tests/unit/lib/db/` → all green (the schema change is additive and `tasksRepo.create` now keeps `externalRef`).
Commit: `feat(github): issue⇄task sync on task.externalRef (no Dexie bump)`

---

## P6.T17 — GitHub section in the git panel (TDD for the pure part, ≈15 min)

**Failing test — create `tests/unit/lib/github/remote.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { parseGithubRemote } from "@/lib/github/remote";

describe("parseGithubRemote", () => {
  it("reads https, ssh and git@ forms of a GitHub remote", () => {
    expect(parseGithubRemote("https://github.com/trookish/MasarFlow.git")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("https://github.com/trookish/MasarFlow")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("git@github.com:trookish/MasarFlow.git")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("ssh://git@github.com/trookish/MasarFlow.git")?.repo).toBe("MasarFlow");
  });
  it("returns null for other hosts and junk", () => {
    for (const bad of ["https://gitlab.com/o/r.git", "git@bitbucket.org:o/r.git", "", "not a url"]) {
      expect(parseGithubRemote(bad), bad).toBeNull();
    }
  });
});
```

Run: `pnpm test -- tests/unit/lib/github/remote.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/github/remote`.

**Create `src/lib/github/remote.ts`:**

```ts
import type { SyncRepo } from "@/lib/github/issue-sync";

/**
 * Derive owner/repo from an `origin` remote URL so the panel can prefill the
 * GitHub section. Pure and host-strict: only github.com maps, anything else
 * returns null (the UI then asks the user to type owner/repo, or to add a
 * remote — the MasarFlow working tree itself has no remote today).
 */

export interface GithubRemote extends SyncRepo {
  htmlUrl: string;
}

export function parseGithubRemote(url: string): GithubRemote | null {
  const value = (url ?? "").trim().replace(/\.git$/, "");
  if (!value) return null;

  const https = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/.exec(value);
  const ssh = /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+)$/.exec(value);
  const scp = /^git@github\.com:([^/\s]+)\/([^/\s]+)$/.exec(value);
  const match = https ?? ssh ?? scp;
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo, htmlUrl: `https://github.com/${owner}/${repo}` };
}
```

**Create `src/components/git/github-section.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, CloudOff, ExternalLink, GitPullRequest, Plus, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGithub, isGithubConfigured } from "@/lib/stores/github";
import { parseGithubRemote } from "@/lib/github/remote";
import { applyIssueTaskSync, listIssueLinkedTasks, planIssueTaskSync, type SyncRepo } from "@/lib/github/issue-sync";
import type { GithubIssue, GithubPull } from "@/lib/server/github/client";
import type { GitRepo } from "@/lib/git/use-git-repo";

const ciTone: Record<string, string> = {
  success: "border-emerald-500/50 text-emerald-600",
  failure: "border-red-500/50 text-red-600",
  pending: "border-amber-500/50 text-amber-600",
  none: "border-border text-muted-foreground",
};

export function GithubSection({ repo }: { repo: GitRepo }) {
  const github = useGithub();
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<GithubIssue[]>([]);
  const [pulls, setPulls] = useState<GithubPull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [synced, setSynced] = useState<string | null>(null);

  const remote = useMemo(() => (remoteUrl ? parseGithubRemote(remoteUrl) : null), [remoteUrl]);
  const target: SyncRepo | null = useMemo(
    () => (remote ?? (github.owner && github.repo ? { owner: github.owner, repo: github.repo } : null)),
    [remote, github.owner, github.repo],
  );

  useEffect(() => {
    void (async () => {
      if (!repo.bridge || !repo.root) return;
      const result = await repo.bridge.remote(repo.root);
      if (result.ok) setRemoteUrl(result.data?.url ?? null);
    })();
  }, [repo.bridge, repo.root, repo.branch]);

  const call = useCallback(
    async (path: "issues" | "pulls", body: Record<string, unknown>) => {
      const res = await fetch(`/api/github/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pat: github.pat, owner: target?.owner, repo: target?.repo, ...body }),
      });
      const json = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `GitHub request failed (${res.status})`);
      return json;
    },
    [github.pat, target],
  );

  const load = useCallback(async () => {
    if (!isGithubConfigured(github) || !target) return;
    setBusy(true);
    setError(null);
    try {
      const issuesJson = (await call("issues", { action: "list", state: "open" })) as unknown as { issues: GithubIssue[] };
      const pullsJson = (await call("pulls", { action: "list", state: "open", checkLimit: 10 })) as unknown as { pulls: GithubPull[] };
      setIssues(issuesJson.issues ?? []);
      setPulls(pullsJson.pulls ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [call, github, target]);

  const syncTasks = async () => {
    if (!repo.projectId || !target) return;
    setBusy(true);
    setError(null);
    try {
      const tasks = await listIssueLinkedTasks(repo.projectId, target);
      const plan = planIssueTaskSync(tasks, issues, target);
      const result = await applyIssueTaskSync(repo.projectId, plan, target);
      setSynced(
        `tasks: +${result.created} created, ${result.closed} closed, ${result.unchanged} unchanged` +
          (result.orphanRefs.length ? `, ${result.orphanRefs.length} issue(s) not in this page` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async () => {
    if (!draftTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await call("issues", { action: "create", title: draftTitle, body: draftBody });
      setDraftTitle("");
      setDraftBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const closeIssue = async (number: number) => {
    setBusy(true);
    setError(null);
    try {
      await call("issues", { action: "close", number, comment: "Closed from MasarFlow." });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isGithubConfigured(github)) {
    return (
      <div className="flex items-center gap-2 rounded border border-border p-3 text-xs text-muted-foreground">
        <CloudOff className="h-4 w-4" />
        GitHub is not configured. Add a token, owner and repository in Settings.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 border-t border-border pt-3">
      <header className="flex flex-wrap items-center gap-2">
        <GitPullRequest className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">GitHub</h2>
        {target ? (
          <span className="text-xs text-muted-foreground">
            {target.owner}/{target.repo}
            {remote ? "" : " (from Settings — no origin remote)"}
          </span>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Load
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !issues.length} onClick={() => void syncTasks()}>
          <CloudDownload className="h-3.5 w-3.5" /> Sync to tasks
        </Button>
      </header>

      {error ? (
        <p className="rounded border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">{error}</p>
      ) : null}
      {synced ? <p className="text-xs text-muted-foreground">{synced}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Open issues ({issues.length})</h3>
          <ScrollArea className="min-h-0 flex-1">
            <ul>
              {issues.map((issue) => (
                <li key={issue.number} className="flex items-start gap-2 border-b border-border/60 py-1">
                  <span className="min-w-0 flex-1">
                    <a
                      href={issue.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-xs hover:underline"
                    >
                      <span className="font-mono text-muted-foreground">#{issue.number}</span>
                      {issue.title}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <span className="flex gap-1 pt-0.5">
                      {issue.labels.map((label) => (
                        <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                      ))}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" title="Close on GitHub" disabled={busy} onClick={() => void closeIssue(issue.number)}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {!issues.length ? <p className="py-1 text-xs text-muted-foreground">No open issues.</p> : null}
            </ul>
          </ScrollArea>
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="New issue title" className="h-7 text-xs" />
            <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder="Describe the issue…" rows={2} className="text-xs" />
            <Button size="sm" disabled={busy || !draftTitle.trim()} onClick={() => void createIssue()}>
              <Plus className="h-3.5 w-3.5" /> Create issue
            </Button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Open pull requests ({pulls.length})</h3>
          <ScrollArea className="min-h-0 flex-1">
            <ul>
              {pulls.map((pull) => (
                <li key={pull.number} className="flex items-center gap-2 border-b border-border/60 py-1">
                  <a
                    href={pull.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-xs hover:underline"
                  >
                    <span className="font-mono text-muted-foreground">#{pull.number}</span> {pull.title}
                  </a>
                  {pull.draft ? <Badge variant="outline" className="text-[10px]">draft</Badge> : null}
                  <Badge variant="outline" className={`text-[10px] ${ciTone[pull.ci]}`}>CI {pull.ci}</Badge>
                </li>
              ))}
              {!pulls.length ? <p className="py-1 text-xs text-muted-foreground">No open pull requests.</p> : null}
            </ul>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
```

Run: `pnpm test -- tests/unit/lib/github/remote.test.ts` → **PASS** (`Tests  2 passed`); `pnpm typecheck` → exit 0.
Manual (desktop, with a real PAT in Settings and the MasarFlow repo configured): Load lists the repo's open issues and PRs with CI chips; "Sync to tasks" creates tasks tagged `github` with `externalRef` set; creating an issue on GitHub appears after Load; closing an issue from the panel closes it on GitHub (refresh the browser tab to confirm); with no origin remote, the header says "(from Settings — no origin remote)".
Commit: `feat(github): issues/PR/CI panel section with issue⇄task sync`

---

## P6.T18 — Chat awareness: a Repository context line and a read-only `git_status` tool (TDD, ≈12 min)

**Failing test 1 — create `tests/unit/lib/ai/git-context.test.ts`:**

```ts
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
    const line = formatRepoLine(brief({ staged: 0, modified: 0, untracked: 0 }));
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
```

Run: `pnpm test -- tests/unit/lib/ai/git-context.test.ts`
Expected: **FAIL** — cannot resolve `@/lib/ai/git-context`.

**Create `src/lib/ai/git-context.ts`:**

```ts
import type { GitRepoStatus } from "@desktop-shared/git";

/**
 * One line of repository truth for the chat context. Pure: it formats a brief
 * the caller already assembled, so it is testable without Electron and without
 * IndexedDB. The chat may read the repository; it may not write to it (D-P6-7).
 */

export interface RepoBrief {
  root: string;
  head: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
  remoteUrl: string | null;
  lastCommit: { shortSha: string; subject: string; date: string } | null;
}

export function briefFromStatus(
  root: string,
  status: GitRepoStatus,
  remoteUrl: string | null,
  lastCommit: RepoBrief["lastCommit"],
): RepoBrief {
  return {
    root,
    head: status.head,
    detached: status.detached,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged.length,
    modified: status.unstaged.length,
    untracked: status.untracked.length,
    conflicted: status.conflicted.length,
    remoteUrl,
    lastCommit,
  };
}

export function formatRepoLine(brief: RepoBrief): string {
  const where = brief.detached ? "detached HEAD" : `on ${brief.head || "an unnamed branch"}`;
  const parts: string[] = [`${brief.root} ${where}`];

  if (brief.upstream) {
    if (brief.ahead === 0 && brief.behind === 0 && brief.remoteUrl) {
      parts.push(`up to date with ${brief.upstream}`);
    } else {
      const divergence = [
        brief.ahead ? `${brief.ahead} ahead` : "",
        brief.behind ? `${brief.behind} behind` : "",
      ].filter(Boolean);
      parts.push(divergence.length ? `${divergence.join(", ")} of ${brief.upstream}` : `tracking ${brief.upstream}`);
    }
  } else if (brief.detached) {
    parts.push("no branch checked out");
  } else if (!brief.remoteUrl) {
    parts.push("no origin remote");
  } else {
    parts.push("no upstream branch");
  }

  const dirty = [
    brief.conflicted ? `${brief.conflicted} conflicted` : "",
    brief.staged ? `${brief.staged} staged` : "",
    brief.modified ? `${brief.modified} modified` : "",
    brief.untracked ? `${brief.untracked} untracked` : "",
  ].filter(Boolean);
  parts.push(dirty.length ? dirty.join(", ") : "working tree clean");

  parts.push(
    brief.lastCommit
      ? `last commit ${brief.lastCommit.shortSha} "${brief.lastCommit.subject}" (${brief.lastCommit.date})`
      : "no commits yet",
  );
  return parts.join(" — ");
}
```

**Failing test 2 — append to `tests/unit/lib/ai/context.test.ts`** (the file already has the local `snapshot()` helper):

```ts
describe("formatWorkspaceContext — repository", () => {
  it("prints the Repository section when a repo line is present", () => {
    const text = formatWorkspaceContext(snapshot({ repo: "C:/proj on main — working tree clean — last commit abc1234 \"init\"" }));
    expect(text).toContain("### Repository");
    expect(text).toContain("C:/proj on main");
  });
  it("omits the section when there is no repository", () => {
    expect(formatWorkspaceContext(snapshot({ repo: null }))).not.toContain("### Repository");
    expect(formatWorkspaceContext(snapshot())).not.toContain("### Repository");
  });
});
```

Run: `pnpm test -- tests/unit/lib/ai/context.test.ts`
Expected: **FAIL** — `repo` is not a property of the snapshot type (typecheck) / the section is missing.

**Edit `src/lib/ai/context.ts`:**
1. In `WorkspaceSnapshot` (after the `commits` field, before the closing brace) add:

```ts
  /**
   * One-line repository brief (P6). Optional: it comes from the desktop bridge
   * and is absent in the browser, so existing snapshots stay valid.
   */
  repo?: string | null;
```

2. In `formatWorkspaceContext`, immediately after the project header block (before the memories section, `src/lib/ai/context.ts:269`):

```ts
  // ── Repository (git) ──────────────────────────────────────────────────────
  // Pushed right after the project header: the budget drops from the bottom,
  // so a repository line can never be squeezed out.
  if (snapshot.repo) {
    push(`\n### Repository\n${snapshot.repo}\n`);
  }
```

3. In `fetchWorkspaceSnapshot` (line 93), before `return`, fill the brief — best-effort, never throwing (the browser has no bridge):

```ts
  // Repository brief (desktop only). Wrapped because the snapshot must never
  // fail just because git is unavailable.
  try {
    const bridge = gitBridge();
    const linked = await linkedProjectsRepo.listByProject(projectId);
    const root = linked[0]?.rootPath;
    if (bridge && root) {
      const status = await bridge.status(root);
      if (status.ok) {
        const remote = await bridge.remote(root);
        const log = await bridge.log(root, { limit: 1 });
        snapshot.repo = formatRepoLine(
          briefFromStatus(
            root,
            status.data,
            remote.ok ? (remote.data?.url ?? null) : null,
            log.ok && log.data[0]
              ? { shortSha: log.data[0].shortSha, subject: log.data[0].subject, date: log.data[0].date }
              : null,
          ),
        );
      }
    }
  } catch {
    /* browser, no bridge, or git problems — the context simply omits the line */
  }
```

with imports `import { gitBridge } from "@/lib/git/client";`, `import { linkedProjectsRepo } from "@/lib/db/repos/linkedProjects";`, `import { briefFromStatus, formatRepoLine } from "@/lib/ai/git-context";`. If `fetchWorkspaceSnapshot` builds the snapshot as a single object literal rather than via a `snapshot` variable, add a `const snapshot: WorkspaceSnapshot = {...}` binding first (mechanical, keep the field list identical).

**Failing test 3 — append to `tests/unit/lib/ai/workspace-tool-defs.test.ts`:**

```ts
describe("git_status", () => {
  it("is a read-only tool with an optional root and a described purpose", () => {
    const def = WORKSPACE_TOOLS.find((t) => t.name === "git_status");
    expect(def).toBeDefined();
    expect(def!.description).toContain("repository");
    const params = def!.parameters as { type: string; properties: Record<string, unknown>; required?: string[] };
    expect(params.type).toBe("object");
    expect(params.properties).toHaveProperty("root");
    expect(params.required ?? []).not.toContain("root");
  });
});
```

Run: `pnpm test -- tests/unit/lib/ai/workspace-tool-defs.test.ts`
Expected: **FAIL** — `def` is undefined.

**Edit `src/lib/ai/workspace-tool-defs.ts`** — append to `WORKSPACE_TOOLS` (before the closing `];` of the array):

```ts
  {
    name: "git_status",
    description:
      "Read the state of the project's git repository: branch, upstream divergence, staged/modified/untracked/conflicted file counts and the latest commit. Use it before proposing commits or describing what changed. Read-only — it cannot stage, commit or switch branches.",
    parameters: {
      type: "object",
      properties: {
        root: str(
          "Repository folder path. Omit to use the project's first linked folder.",
        ),
      },
    },
  },
```

**Edit `src/lib/ai/tools.ts`** — add a case to the `switch (call.name)` in `executeWorkspaceTool` (reads only; never mutates):

```ts
      case "git_status": {
        const bridge = gitBridge();
        if (!bridge) {
          return fail("Git status is only available in the MasarFlow desktop app.");
        }
        const requested = s("root");
        const linked = await linkedProjectsRepo.listByProject(projectId);
        const root = requested ?? linked[0]?.rootPath;
        if (!root) return fail("No linked folder to read a repository from. Link a folder to this project first.");

        const status = await bridge.status(root);
        if (!status.ok) return fail(`git failed (${status.code}): ${status.message}`);
        const [remote, log] = await Promise.all([
          bridge.remote(root),
          bridge.log(root, { limit: 10 }),
        ]);
        return JSON.stringify(
          {
            root,
            head: status.data.head,
            detached: status.data.detached,
            upstream: status.data.upstream,
            ahead: status.data.ahead,
            behind: status.data.behind,
            staged: status.data.staged.map((c) => ({ path: c.path, status: c.index })),
            modified: status.data.unstaged.map((c) => ({ path: c.path, status: c.worktree })),
            untracked: status.data.untracked,
            conflicted: status.data.conflicted.map((c) => c.path),
            remoteUrl: remote.ok ? (remote.data?.url ?? null) : null,
            recentCommits: log.ok
              ? log.data.map((c) => ({ sha: c.shortSha, subject: c.subject, author: c.author, date: c.date }))
              : [],
          },
          null,
          2,
        );
      }
```

with imports at the top of `src/lib/ai/tools.ts`: `import { gitBridge } from "@/lib/git/client";`, `import { linkedProjectsRepo } from "@/lib/db/repos/linkedProjects";` (dedupe with existing imports — the file already imports several repos).

Then check the undo wrapper: `src/lib/ai/undo.ts`'s `executeWorkspaceToolWithUndo` decides what to snapshot for undo — read it first (`src/lib/ai/undo.ts:1-60`); if its tool list is an explicit allow-list of mutating tools, `git_status` needs no entry (read tools fall through to `executeWorkspaceTool`). Add an entry only if the list is a *block* list.

Run: `pnpm test -- tests/unit/lib/ai/` → all green (context + tool-defs + toolgen, which asserts `files.length === WORKSPACE_TOOLS.length` and so covers the new def automatically). `pnpm typecheck` → exit 0.
Commit: `feat(ai): repository line in the chat context and a read-only git_status tool`

---

## P6.T19 — Renderer failure-mode coverage (TDD, ≈10 min)

The five states the phase scope names — not a repo, git missing, permission denied, detached HEAD, no remote — get one copy table and one reproducing command each.

**Failing test — create `tests/unit/lib/git/git-state.test.ts`:**

```ts
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
    expect(describeGitState({ kind: "no-desktop" }).title).toMatch(/desktop/i);
    expect(describeGitState({ kind: "detached" }).action).toBe("create-branch");
  });
  it("keeps git's raw diagnostics as the detail line", () => {
    const state = describeGitState({ kind: "failure", code: "unknown", detail: "fatal: boom" });
    expect(state.detail).toBe("fatal: boom");
  });
});
```

Run: `pnpm test -- tests/unit/lib/git/git-state.test.ts`
Expected: **FAIL** — `describeGitState` is not exported.

**Edit `src/lib/git/format.ts`** — append:

```ts
export type GitStateAction = "init" | "retry" | "install" | "create-branch" | "open-linked-projects" | null;

export type GitPanelState =
  | { kind: "no-desktop" }
  | { kind: "detached" }
  | { kind: "failure"; code: GitFailureCode; detail?: string };

export interface GitStateCopy {
  title: string;
  body: string;
  action: GitStateAction;
  detail?: string;
}

/**
 * One place that turns any non-happy git state into copy plus (at most) one
 * recovery action, so the panel never shows a raw todo of failure strings.
 */
export function describeGitState(state: GitPanelState): GitStateCopy {
  if (state.kind === "no-desktop") {
    return {
      title: "Git needs the desktop app",
      body: GIT_DESKTOP_REQUIRED,
      action: null,
    };
  }
  if (state.kind === "detached") {
    return {
      title: "Detached HEAD",
      body: "No branch is checked out, so a commit here would be easy to lose. Create a branch from the current commit and continue there.",
      action: "create-branch",
    };
  }
  const detail = state.detail?.trim() || undefined;
  switch (state.code) {
    case "git-missing":
      return {
        title: "Git was not found",
        body: "MasarFlow runs git itself but could not start it. Install Git for Windows and reopen the app, or point MASARFLOW_GIT_PATH at a portable git.exe.",
        action: "install",
        detail,
      };
    case "not-a-repo":
      return {
        title: "Not a git repository",
        body: "This folder has no .git yet. Create a repository to start tracking changes here — nothing else in the app is affected.",
        action: "init",
        detail,
      };
    case "root-not-allowed":
      return {
        title: "Folder not linked",
        body: "Git only runs inside folders you added to this app. Link this folder in Linked Projects, then retry.",
        action: "open-linked-projects",
        detail,
      };
    case "permission-denied":
      return {
        title: "Windows denied access",
        body: "Another program is holding files in this folder (an editor, an indexer, a terminal). Close it and retry.",
        action: "retry",
        detail,
      };
    case "index-locked":
      return {
        title: "Repository is busy",
        body: "A git process is writing to this repository right now. Wait a moment and retry.",
        action: "retry",
        detail,
      };
    case "nothing-to-commit":
      return {
        title: "Nothing to commit",
        body: "Nothing is staged. Tick the files you want in this commit, then commit again.",
        action: null,
        detail,
      };
    case "invalid-input":
      return {
        title: "Git rejected that input",
        body: "The branch name or path is not valid for git. Fix it and retry.",
        action: null,
        detail,
      };
    case "no-remote":
      return {
        title: "No origin remote",
        body: "This repository has no 'origin' remote, so there is nothing to fetch or compare against. Local commits still work.",
        action: null,
        detail,
      };
    case "detached-head":
      return {
        title: "Detached HEAD",
        body: "Create or switch to a branch before committing.",
        action: "create-branch",
        detail,
      };
    case "timeout":
      return {
        title: "Git timed out",
        body: "The command did not finish within a minute and was stopped. Large repositories can be slow on first read — retry.",
        action: "retry",
        detail,
      };
    default:
      return {
        title: "Git failed",
        body: "The command did not succeed. The raw output below usually names the file or ref that caused it.",
        action: "retry",
        detail,
      };
  }
}
```

Import `GitFailureCode` and `GIT_DESKTOP_REQUIRED` at the top of `format.ts` (`import { GIT_DESKTOP_REQUIRED } from "@/lib/git/client";` — client.ts imports nothing from format.ts, so there is no cycle; confirm with `rg -n "from \"@/lib/git/format\"" src/lib/git/client.ts` returning nothing).

**Edit `src/components/git/git-view.tsx`** to use it in both places (replacing the inline copy from T9):

```tsx
  const notice = describeGitState({
    kind: repo.detached ? "detached" : "failure",
    code: repo.error?.code ?? "unknown",
    detail: repo.error?.detail,
  });
```

and render `{notice.title}` / `{notice.body}` with a single action button that switches on `notice.action` (`init` → `repo.mutate(() => repo.bridge!.init(repo.root!), "init")` — the same call git-status-panel makes, so the status refreshes; `retry` → `repo.refresh()`, `create-branch` → focus the branch input, `install` → `window.open("https://git-scm.com/download/win")`, `open-linked-projects` → reuse the linker: read the exports of `src/components/chat/linked-projects-dialog.tsx` first — if it exports an opener (a hook or a component function) call that; if it does not, emit `window.dispatchEvent(new CustomEvent("masarflow:open-linked-projects"))` and have the dialog listen for it (a five-line change in that file, and it keeps the panel free of routing assumptions). `init`, `retry` and `install` need nothing new).

Run: `pnpm test -- tests/unit/lib/git/git-state.test.ts` → **PASS** (`Tests  4 passed`); `pnpm test -- tests/unit/lib/git/` → all green; `pnpm typecheck` → exit 0.
Commit: `feat(git): one copy table and recovery action per failure state`

**Manual failure matrix (desktop, `pnpm desktop:dev`, in a scratch folder — never in this repo):**

| State | Reproduce exactly | Expected panel behaviour |
|---|---|---|
| Not a repo | `mkdir "$TMPDIR/fx-norepo" && cd "$TMPDIR/fx-norepo"` (no `git init`), link that folder, open Git | "Not a git repository" + "Create a repository here" → after clicking, `git status` works |
| Git missing | `MASARFLOW_GIT_PATH=C:/nope/git.exe pnpm desktop:dev` | "Git was not found" + install action; no stack trace, no spinner hang |
| Permission denied | start the app, then in the scratch repo: `touch .git/index.lock` and pick a file → Stage | "Repository is busy" (index.lock branch) with a Retry button; deleting the lock and retrying succeeds |
| Detached HEAD | `cd "$TMPDIR/fx1" && git switch --detach HEAD` then open Git | Header shows "detached HEAD", `.detached` badge, copy suggests creating a branch; committing is offered only after creating one |
| No remote | `git remote remove origin` in the scratch repo (or use this repo, which has no remote) | "No origin remote" is informational only; history/staging still work; GitHub section says "(from Settings — no origin remote)" |
| Git not a repo but folders linked | link the folder, then `rm -rf .git` while the panel is open, hit Refresh | The same "Not a git repository" state returns; no crash |

---

## P6 gate

Run in order from `C:/Users/trookish/Dev/Web-Projects/MasarFlow` on `release/v0.2.0`:

1. `pnpm test -- tests/unit/desktop/` → **PASS**: `git-run` (10), `git-status` (7), `git-refs` (8), `git-diff` (12), `git-service` (20), `ipc-contract` (6).
2. `pnpm test -- tests/unit/lib/git/` → **PASS**: `client` (6), `format` (15), `use-git-repo` (3), `link-commit` (6), `git-state` (4).
3. `pnpm test -- tests/unit/lib/github/` → **PASS**: `client` (14), `issue-sync` (9), `remote` (2).
4. `pnpm test -- tests/unit/app/api/github/routes.test.ts` → **PASS** (8 passed).
5. `pnpm test -- tests/unit/lib/ai/` → **PASS** (context incl. 2 new repository cases; tool-defs incl. the `git_status` guard case; toolgen).
6. `pnpm test -- tests/unit/e2e/feature-matrix.test.ts` → **PASS** (3 passed) with `"/git": []` present.
7. `pnpm test` (full unit suite) → **PASS**, no new failures versus the P5 baseline; record the count in the phase PR.
8. `pnpm typecheck` → exit 0. `pnpm lint` → exit 0.
9. `pnpm desktop:typecheck` → exit 0; `pnpm desktop:build` → exit 0 (main-process git modules compile against `@shared/*`).
10. `rg -n "execFile|spawn" src/ --glob '!**/*.test.ts'` → only `src/app/api/fs/shell/route.ts` and the pre-existing shell rows; **no new** process execution in the renderer or in Next routes.
11. `rg -n "git" src/app/api --glob '*.ts' -l` → `github/route.ts`, `github/issues/route.ts`, `github/pulls/route.ts` only (no `/api/git` route exists; `src/app/api/python/git/route.ts` is deleted by P3 — if it still exists, P3 has not landed).
12. `git status --porcelain=v2 --branch` in this repo → clean tree on `release/v0.2.0`; all P6 commits present (`git log --oneline -14`).
13. Manual desktop pass (P6.T19 matrix + T11/T12/T17 manual steps) recorded in the phase PR with the git version used (`git version 2.53.0.windows.3` on this machine, Git for Windows 2.45.1 at `C:\Program Files\Git\cmd\git.exe`).
14. `pnpm test -- tests/unit/desktop/ipc-contract.test.ts` → **PASS** (6 passed) — the channel/preload/main wiring is verified end to end in CI, not by eye.

## Risks / open questions

- **R-P6-1 (hunk staging, deferred).** Whole-file stage/unstage only. Partial staging would need `git apply --cached` with a hand-built patch plus a line-selection UI; the shape if it is ever wanted: `service.applyPatch(root, patch)` over `git apply --cached --unidiff-zero -` with the patch fed on **stdin** (which needs `execFile` with `input`, not argv) — that is a real behavioural change to `exec.ts`, so it belongs in its own phase, not as a "small addition" here.
- **R-P6-2 (CRLF noise).** This repo emits `warning: in the working copy of 'x', LF will be replaced by CRLF` on **every** status/diff. P6 treats stderr as diagnostics (F5), so the panel stays quiet, but a user who opens the terminal panel sees it. If it becomes annoying, the fix is a `.gitattributes`/`core.autocrlf` decision by the owner — not a UI patch.
- **R-P6-3 (two `@octokit/openapi-types` copies).** 27.0.0 and 28.0.0 are both installed (transitively, via the two `@octokit/plugin-paginate-rest` majors). The client normalizes every response at runtime (`normalizeIssue`/`normalizePull`/`normalizeCheckRun`) instead of trusting either version's types — keep it that way; a future Octokit bump must go through those three functions.
- **R-P6-4 (`for-each-ref` separator trap).** `%x1f` is printed **literally** by `for-each-ref` (verified) while it works in `git log`. The plan uses `%00` there and a test asserts the format strings; do not "unify" them.
- **R-P6-5 (GitHub rate limits).** `listPulls` makes one extra `checks.listForRef` call per PR (capped at 10 by default, `checkLimit`). Unauthenticated-rate or low-scope tokens will 403/429 — `githubErrorMessage` maps 403 but a 429 shows Octokit's message. Acceptable for now; note it in the panel copy if users hit it.
- **R-P6-6 (positional API risk).** `git apply`/`git restore` behaviour on Git for Windows 2.45.1 versus the 2.53.0 this machine measured git output against: the parsers consume only `-z` and `--format` output, which is stable across both, and both installs were exercised for `status`/`diff --no-index`. A repo with `core.autocrlf=input` or a non-UTF-8 `i18n.commitEncoding` could still surprise the log parser (F6) — the fixture tests would catch a format change on the machine that runs them.
- **Q-P6-1 (fetch/pull/push).** Deliberately out of scope (D-P6-4): it needs credential UX (ssh-agent, GCM, token-in-URL), and a wrong default is worse than no button. Ask the owner before adding it; the panel currently surfaces divergence counts only.
- **Q-P6-2 (commit deep-link).** `entityHref({kind:"commit"})` is `/dashboard` with **no** param and P5's test pins that (F8). Making a commit chip open the Git page at that commit means changing the P5 registry contract (add `?sha=`), which touches P5's tests and the URL parser in `src/lib/entities/url.ts`. Deferred deliberately — decide in P7 when the entity URLs are reviewed as a set.
- **Q-P6-3 (chat writing to git).** D-P6-7 keeps the tool read-only. If the owner wants "commit my work" from chat, it should go through the same confirm dialog as the commit box rather than a straight tool call.
- **Q-P6-4 (`task.externalRef` display).** The field is stored but the task views (P4-owned `tasks-view.tsx`) do not render it yet; the panel's own rows and the chips do. Rendering it on the task card is a one-liner in whichever phase next touches `tasks-view.tsx` — do not edit it from P6 to avoid a cross-phase file collision.

## Handoffs

**P7/P9 — Playwright feature titles P9 must add to `tests/e2e/feature-matrix.json` (P9 owns e2e, and the guard test fails the moment a feature string exists without its spec — that is why P6 adds the route with an empty feature list, F11/F12):**

- `/git`: `status groups render staged and unstaged files` · `stage and unstage a file` · `commit box rejects an empty message` · `commit log lists commits with detail` · `branch menu creates a branch` · `desktop-required notice without the bridge` · `GitHub section shows the not-configured notice`
- `/tasks`: `task card shows its GitHub issue link` · `linked commit appears on the task`
- `/dashboard`: `commit panel shows a locally recorded commit`
- `/chat`: `git_status tool result renders in the transcript` · `repository line appears in the context preview`

**P8 (terminal/desktop shell):** the git panel assumes the terminal panel exists for the manual passes; nothing in P6 depends on P8 code.

**P3/P4:** `src/app/api/python/git/route.ts` is P3's to delete; P6 adds no route under `/api/git`, so nothing conflicts. Backup/dirty-tracking (P4) see the new `commits`/`devLogs`/`links` rows automatically because P6 writes through the existing repos.

**P5:** P6 consumes `linksRepo`, `EntityChip`, `openEntity`, `entityKindSchema` and the activity tracker unchanged, and adds no entity kind. If P5's `KIND_META` ever gains a per-kind param for `commit`, revisit Q-P6-2.

**P2:** `roots.json` / `dialog.chooseFolder` / `secrets` are consumed as-is; P6 adds no new secret key (`github:pat` is the only one).

