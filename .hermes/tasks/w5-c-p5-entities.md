# Wave 5 / Stream C — P5.T1, T3, T4: entity registry, URL selection, deep links

Read `.hermes/tasks/00-shared-context.md` first. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` in your terminal before anything else.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p5-fabric-chat-awareness.md`. Implement **P5.T1** (entity registry), **P5.T3** (URL selection helpers and hook), and **P5.T4** (deep links for sprints, agents, dev logs).

SKIP P5.T2 and P5.T5 onward. They edit `src/lib/ai/workspace-tool-defs.ts` and `src/lib/db/schema.ts`, which other streams own this wave. If T1/T3/T4 type-depend on T2's widened `EntityKind`, write against the CURRENT `EntityKind` and leave a `// P5.T2 widens this` note. Do not edit `schema.ts`. Report what was deferred.

Check the plan's assumptions against the repo before coding. Read the views you touch (`src/components/{agents,sprints,devlogs}/*-view.tsx`) and the existing routing helpers. This is Next 16, so read `node_modules/next/dist/docs/` for `useSearchParams`/`useRouter` before writing the hook.

You OWN: `src/lib/entities/**`, `src/lib/hooks/use-url-selection.ts`, `src/components/agents/agents-view.tsx`, `src/components/sprints/sprints-view.tsx`, `src/components/devlogs/devlogs-view.tsx`, `tests/unit/lib/entities/**`.
Shared helper `tests/unit/_helpers/fs-scan.ts`: add only, never change existing exports, and re-read it right before editing, since Stream A may also add to it.

TDD each task: test → run FAIL → implement → run PASS:
`pnpm exec vitest run --config tests/vitest.config.ts tests/unit/lib/entities`.

Exit gate: your tests pass; `pnpm typecheck` and `pnpm lint` exit 0.

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream A (`settings-view.tsx`, `page-settings.ts`, `src/lib/ai/**` except providers, OpenCode deletion, `tests/e2e/**`); Stream B (`src/lib/secrets*.ts`, `src/lib/db/repos/chat*.ts`, `src/lib/stores/{github,obsidian}.ts`, `layout.tsx`, `secrets-bootstrap.tsx`). Do not touch their files.
