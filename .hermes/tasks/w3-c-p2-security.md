# Wave 3 / Stream C — P2.T1–T6: request guard, roots, Electron hardening, secret store

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`, `# PHASE 2`, tasks **P2.T1 through P2.T6** (stop before P2.T7). Note from the plan header: the guard has **no exempt paths**. The OpenCode bridge is gone.

The P1 desktop shell is committed. Read these before editing and use their real exports:
- `desktop/src/main/index.ts`, `desktop/src/main/ipc/index.ts`, `desktop/src/main/windows/main-window.ts`
- `desktop/src/main/backend/{token,ports,server,protocol,protocol-url}.ts`, `desktop/src/main/security/url-policy.ts`
- `desktop/src/shared/{security,channels,api}.ts`, `desktop/src/preload/index.ts`
- `src/app/api/health/route.ts`

In Next 16 the middleware file is `src/proxy.ts`. Read `node_modules/next/dist/docs/` for "proxy" before P2.T2.

You OWN the shared desktop files for this wave (`desktop/src/main/index.ts`, `ipc/index.ts`, `shared/api.ts`, `shared/channels.ts`, `preload/index.ts`). Nobody else edits them now.

TDD every task: test → run FAIL → implement → run PASS:
`pnpm exec vitest run --config tests/vitest.config.ts <your test files>`.

Gate after P2.T6:
- `pnpm typecheck`, `pnpm desktop:typecheck`, `pnpm lint` all exit 0.
- `pnpm desktop:dist:dir && pnpm smoke:desktop` must still print `SMOKE_OK`. The guard now requires the launch token, and the scheme proxy adds it, so the packaged app must still load. If it does not, fix it before finishing. A green unit suite with a broken packaged app is a failure.

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream A (`src/lib/db/**`, search/embedding files) and Stream B (`src/lib/ai/providers/**`, `src/lib/ai/chat-backends.ts`, `src/lib/ai/catalog.ts`). Do not touch their files. Run `pnpm build`/`desktop:dist:dir` near the end only. If the build fails on a sibling's file that is mid-edit, wait 2 minutes and retry once, then report.
