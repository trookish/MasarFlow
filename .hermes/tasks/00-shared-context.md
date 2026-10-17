# Shared context for every MasarFlow v0.2.0.0 subagent

Read this first, then your own task file.

## Repo and environment
- Repo: `C:/Users/trookish/Dev/Web-Projects/MasarFlow`, branch `release/v0.2.0`. Do NOT switch branches, create worktrees, stash, reset, rebase or push. Other agents share this working tree.
- Windows 11. The `terminal` tool runs **git-bash**: POSIX syntax. Native tools (git, node, pnpm) need `C:/Users/...` forward-slash paths, not `/c/Users/...`. Scratch files go in `C:/Users/trookish/AppData/Local/Temp` (or the repo-local path your task names), never bare `/tmp` for a native tool.
- The terminal tool rejects very large compound commands (heredocs, long multi-pipe one-liners). Keep each terminal call to one command plus at most one pipe. Write files with the file-writing tool, not heredocs.
- Node 24, pnpm workspace (`pnpm-workspace.yaml`: root `.` + `desktop`). Use `pnpm add -w` for root deps.
- Next.js here is a newer version than your training data. Before writing Next-specific code read the relevant doc under `node_modules/next/dist/docs/`.
- Unit tests: `pnpm exec vitest run --config tests/vitest.config.ts <files>` (node environment, no DOM). Run ONLY your own test files while working; siblings may be mid-TDD. Full suite (`pnpm test`) only when your task says so.
- Typecheck: `pnpm typecheck` (web) and `pnpm desktop:typecheck` (desktop).

## Plans
- Master plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-master.md` (decisions D1–D12, conventions).
- Your task file names the exact plan section (file + line range) to implement. Implement it as written. Where the plan's code does not compile against the real repo, the real repo wins: adapt minimally and report the deviation.

## Rules
- Do not commit unless your task file says to, and then commit ONLY your paths with the pathspec form `git add <paths>` then `git commit -m "<msg>" -- <paths>` (plain `git commit` takes the whole shared index, including other agents' staged files). Never `git add -A`, `git add .`, or `git commit -a`. Check `git show --stat HEAD` afterwards.
- Never read, print or copy secrets (`.env*`, API keys, tokens). If one appears, write `[REDACTED]`.
- Do not kill processes you did not start. Stop every server/process you start before you finish.
- No fabricated output: if something fails, report the real error.

## Report format (your final answer)
1. Result: DONE / DONE_WITH_DEVIATIONS / BLOCKED / NO-GO.
2. Files created/modified/deleted (paths).
3. Commands run that prove the result, with their real key output lines (test counts, HTTP codes, JSON).
4. Deviations from the plan and why.
5. Gaps you know of (things not tested, assumptions).
