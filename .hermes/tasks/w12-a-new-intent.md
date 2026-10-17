# Wave 12 / Stream A — Dashboard "New task"/"New spec" must create exactly one item; Pulse seed step keys

## Rules
- Read `.hermes/tasks/00-shared-context.md` first. Builds go only through `node.exe .hermes/tools/build-snapshot.mjs a`. Wait for `BUILD_SNAPSHOT_OK`, export the printed `MASARFLOW_E2E_APP_DIR`, then run `pnpm e2e:desktop tests/e2e/desktop/<spec>.ts`. Always use `node.exe`, never `node`. Run `unset MASARFLOW_TOKEN PORT MASARFLOW_VERSION` before tests.
- Never put probe specs under `tests/`; use `$LOCALAPPDATA/Temp/msf-probe-a/`. Don't commit `tests/e2e/feature-matrix.json` or `tests/unit/e2e/feature-matrix.test.ts`.
- Commit each item, with explicit pathspecs, as soon as it passes. Never push. Stop every app you start. `pnpm typecheck` and `pnpm exec eslint <files>` must be clean before your report.

## 1. The duplicate-create bug (real, seen in the packaged journey run)
`reports/p9/first-run-journey.md` (lines ~51–56): one click on the dashboard's "New task" created **three** tasks under load. The current guard (`src/components/tasks/tasks-view.tsx` ~63–76, and the same in `src/components/specs/specs-view.tsx` ~69–100) fires an effect on `wantsNew = pathname === "/tasks" && searchParams.get("new") === "1"`. `router.replace` is async, so the effect fires again whenever `wantsNew` goes true → false → true. That happens, for example, when the dock replays a panel's stale URL snapshot, or when the replace hasn't landed yet and the component re-mounts.

Required design:
- Make each click a unique intent. The dashboard (`src/components/dashboard/dashboard-view.tsx` ~355/362) pushes `?new=<nonce>`, for example `crypto.randomUUID()` or `Date.now().toString(36)`.
- The views consume each nonce **at most once**, using a module-level `Set` of consumed nonces (it survives a remount), and mark it consumed **synchronously, before** the async create.
- Factor this into one small hook, e.g. `src/lib/hooks/use-create-intent.ts`, so specs and tasks share it.
- A second real click (a new nonce) on an already-open panel must still create a second item.
- Keep the route scoping, so `/specs?new=x` never creates a task.

TDD:
- Write a unit test first (vitest + React Testing Library if the repo already uses it for hooks; check `tests/unit` for precedent). Cover: the same nonce rendered/remounted 3× creates once; a new nonce creates again; a wrong route creates nothing. Show it failing on the current logic, then passing.
- Update `tests/e2e/desktop/planning.spec.ts` `/dashboard: New spec and New task open the create flow` to also assert that the task/spec **count grew by exactly 1** (read IndexedDB via the harness helpers the spec already uses).
- Rebuild, run `planning.spec.ts` to 8/8, and commit.
- Also update the journey spec comment at `tests/e2e/desktop/journey.spec.ts:99` if it now describes a fixed bug. Don't change the journey's flow.

## 2. Pulse/seed step-key typo
Stream A already fixed one occurrence in `src/lib/db/demo-seed.ts`. Workflow run entries keyed `"spec"` are not a pipeline step key (the steps are clarify/research/requirements/…), so the run shows the wrong progress. Stream A left two more, in the Echo Forge (~line 2320) and Plugin API (~line 2951) fixtures.
- Find the step-key list in source (`rg -n "requirements" src/lib`) and confirm it.
- Fix those entries.
- Add a unit test asserting that every seeded workflow-run step key is a real step key, across all seed fixtures. It must fail before your fix.
- Commit.

## Report
Commit SHAs, real pass counts (unit and packaged), and anything left over.
