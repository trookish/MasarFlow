# Wave 5 / Stream B — P2.T7–T8: renderer secrets API, AI connection keys, GitHub PAT and Obsidian key bindings

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`, tasks **P2.T7** and **P2.T8**.

Already committed, and you must read the real exports first:
- `desktop/src/main/secrets.ts` (main-process store, P2.T6) with its channels in `desktop/src/shared/{channels,api}.ts` and `desktop/src/preload/index.ts`
- the AI connection model: `src/lib/db/schema.ts` `AiConnection` and `src/lib/db/repos/chat.ts`
- `src/components/chat/connections-dialog.tsx` (P1b.T7)
- the backup exporter `src/lib/db/backup.ts`, which already blanks `apiKey`

Requirements beyond the plan:
- In browser mode (no `window.masarflow`), behaviour must stay exactly as today: keys stay in IndexedDB. Only desktop mode moves them to the main-process store.
- An existing key stored in IndexedDB must be migrated once into the secret store and then blanked in IndexedDB. Add a test for that migration.
- Never log, echo or snapshot a key. Tests use obvious fakes like `"sk-TEST"`.

You OWN: `src/lib/secrets.ts`, `src/lib/secrets-binding.ts`, `src/lib/db/repos/chat.ts`, `src/lib/db/repos/chat-secrets.ts`, `src/lib/stores/github.ts`, `src/lib/stores/obsidian.ts`, `src/components/shell/secrets-bootstrap.tsx`, `src/app/(workspace)/layout.tsx`, `scripts/security-check.mjs`, and the matching tests. Read `src/components/chat/connections-dialog.tsx` but do not edit it. If it must change, keep the change minimal and list it in the report.

TDD each task: test → run FAIL → implement → run PASS:
`pnpm exec vitest run --config tests/vitest.config.ts <files>`.

Exit gate (report real output):
- your tests pass; `pnpm typecheck`, `pnpm desktop:typecheck`, `pnpm lint` exit 0.
- near the end: `pnpm desktop:dist:dir && pnpm smoke:desktop && pnpm security:check` print `SMOKE_OK` and `SECURITY_CHECK_OK`.

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream A (`settings-view.tsx`, `page-settings.ts`, `src/lib/ai/{catalog,context,tools,workspace-tool-defs}.ts`, `src/lib/ai/agent/**`, OpenCode deletion, `tests/e2e/**`); Stream C (`src/lib/entities/**`, `src/lib/hooks/use-url-selection.ts`, `src/components/{agents,sprints,devlogs}/**`). Do not touch their files. If a build fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.
