# Shared context for every MasarFlow v0.3 overhaul subagent

Read this first, then your own brief (`.hermes/tasks/v3-w<N>-<letter>-*.md`), then the phase plan it names.

## Repo and environment
- Repo `C:/Users/trookish/Dev/Web-Projects/MasarFlow`, branch **`overhaul/v0.3`**. Do NOT switch branches, create worktrees, stash, reset, rebase, amend or push. Up to three sibling agents share this working tree and git index right now.
- First command of every terminal session: `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` (siblings' jobs leak them; the request guard turns on when `MASARFLOW_TOKEN` is set).
- Windows 11; the `terminal` tool is **git-bash** (POSIX syntax). Native tools (git, node, pnpm) need `C:/Users/...` forward-slash paths. Use `node.exe`, never bare `node` (a winpty alias that silently no-ops in piped/background shells). Scratch files: `C:/Users/trookish/AppData/Local/hermes/cache/scratch/<your-letter>/` — never inside the repo, never bare `/tmp`.
- The terminal rejects large compound commands (heredocs, long pipes). One command + at most one pipe per call; write files with the file tools. Search with `rg` / the search tool, never `grep -r`.
- Node 24, pnpm workspace (`.` + `desktop`, `nodeLinker: hoisted` — never change it). Do NOT add dependencies; if you truly need one, stop and report.
- Next 16 (newer than your training data): read the relevant doc in `node_modules/next/dist/docs/` before Next-specific code. Turbopack build: no `webpack:` key. Request middleware is `src/proxy.ts`. A view using `useSearchParams` must render under `<Suspense>` in its `page.tsx`.
- Lint error rule `react-hooks/set-state-in-effect`: derive state during render, not in an effect.
- Unit tests: `pnpm exec vitest run --config tests/vitest.config.ts <your files>` (node env, NO DOM). Run only your own files while working; run the full `pnpm test` once at the end — a failure in a file you did not touch is a sibling's in-flight work: report it, do not fix it. Tests reading `process.env` must use `vi.stubEnv` in `beforeEach`.
- Typecheck `pnpm typecheck`; desktop `pnpm desktop:typecheck`; lint `pnpm lint` (0 errors AND 0 warnings expected). After route deletions stale `.next/**/types` can break typecheck: run `pnpm exec next typegen` and retry.
- Packaged e2e (the real target per AGENTS.md): NEVER run `pnpm desktop:dist:dir` or `pnpm build:app` directly. Build through the lock+snapshot tool, then point Playwright at your private copy:
  1. `node.exe .hermes/tools/build-snapshot.mjs <your-letter>` (≈8–12 min, waits for the lock; check its last line says OK and note the `export MASARFLOW_E2E_APP_DIR=...` it prints)
  2. `MASARFLOW_E2E_APP_DIR=<that path> pnpm exec playwright test --config tests/playwright.desktop.config.ts <your spec files>`
  Batch app changes before each rebuild (each build costs ~10 min of your budget). Helpers live in `tests/e2e/desktop/_harness.ts`. A full `pnpm e2e:desktop` rewrites `reports/p9/**` files: never stage those.
- Never start a dev server on port 3000; if you need one, use port `31<NN>` from your brief and stop it (by the PID you recorded) before finishing. Never kill a process you did not start.

## Approved decisions (owner accepted the plan defaults on 2026-10-26)
- Six surfaces Today / Capture / Work / Library / Ask / System; Standard layout (sidebar + main + inspector) is the default; the dock survives as opt-in **Studio layout**.
- `python-service/` is deleted. UI copy says "Features" instead of "Plugins". 0.3 ships unsigned.
- Every data mutation goes through `src/lib/domain/commands/*` (P2). Dexie versions: P2 owns 13, P3 owns 14, P4 owns 15.
- Copy is formal and professional (no casual interjections, no emoji). Every section gets a short explanatory tooltip/description.

## Plans
- Master: `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-master.md`. Phase plans: same prefix with `-p0-…` to `-p7-…`.
- Implement your brief's tasks as the plan describes. Where the plan contradicts the real repo (a path, a line number, a signature, a test that cannot pass as written), the real code and compiler win: adapt minimally and list every change in your report. Lines marked "audit-sourced" must be re-read before you edit.

## Commits (critical)
- Commit EACH task the moment its tests pass: `git add <paths>` then `git commit -m "<type>(v0.3/P<n>.T<m>): <summary>" -- <paths>` — the pathspec form. A bare `git commit` sweeps siblings' staged files. Never `git add -A`, `git add .`, a bare directory, or `commit -a`. After every commit run `git show --stat HEAD` and confirm only your files are listed; if not, do not reset — note it in the report.
- Touch only files in your ownership row (your brief). Need a file another stream owns? Put the exact change in your report under "Needs from others" and continue. Re-read any file immediately before editing it.
- `AGENTS.md`, `.env*` and secrets are off limits. Never print a key or token.

## Report format (your final answer)
1. Result: DONE / DONE_WITH_DEVIATIONS / PARTIAL (list remaining tasks) / BLOCKED.
2. Commits (sha + subject) and files per commit.
3. Proof: exact commands with their real output lines (test counts, exit codes, Playwright `ok N … › title` lines).
4. Deviations from the plan and why.
5. Needs from others (exact lines for files you do not own, feature-matrix titles to add).
6. Gaps you know of (untested paths, assumptions).
