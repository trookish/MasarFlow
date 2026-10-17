# Wave 4 / Stream C — P2.T9, P2.T10, P4.T1, P4.T2: security proof + backup format/import

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`. Implement, committing each:
- **P2.T9**: black-box security check against the built server.
- **P2.T10**: prove the renderer's real Origin and Host pass the guard in the packaged app. Also prove denial: a request to the packaged app's loopback port WITHOUT the token gets 401/403.
- **P4.T1**: backup file format and export. TDD.
- **P4.T2**: import, with validation, replace and merge. TDD.

Do NOT do P2.T7/T8 (secrets wiring in the renderer collides with the chat work in Stream B) or P4.T3+.

P2.T1–T6 are committed: `src/lib/server/request-guard.ts`, `src/proxy.ts`, `src/lib/server/roots.ts`, `desktop/src/main/security/{csp,permissions,roots}.ts`, `desktop/src/main/secrets.ts`. Read the real exports.

Environment warning: a shell may carry `MASARFLOW_TOKEN`/`PORT`. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal first, and make any test you write hermetic (`vi.stubEnv`).

For `src/lib/db/index.ts`: you may only ADD exports needed by backup (for example, a table list). Do not reorder or change versions. Stream B is editing `src/lib/db/schema.ts` (thread fields), so read it, don't edit it.

Gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0; P2.T9's check script output shows every expected denial; P2.T10's packaged proof output is reported verbatim. If you build the packaged app, coordinate by building near the end. If it fails on a sibling's mid-edit file, wait 2 minutes and retry once.

Concurrent siblings: Stream A (`layout.tsx`, search, settings-view, context.ts, tools.ts, scripts, package.json, smoke script); Stream B (`src/components/chat/**`, `src/lib/ai/**` providers, `schema.ts`, `src/app/api/models/**`). If you need a `package.json` script, report it rather than editing (Stream A owns `package.json`), and run your script with `node <path>` directly.
