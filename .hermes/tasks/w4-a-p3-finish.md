# Wave 4 / Stream A — P3.T7–T9: local index everywhere, remove Python from the product

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`, `# PHASE 3`, tasks **P3.T7, P3.T8, P3.T9**. P3.T1–T6 are committed: `src/lib/ai/embeddings/{chunking,vector,embedder-core,client,worker,indexer,search}.ts` and the façade `src/lib/ai/embedding-sync.ts`. Read them first and use their real exports.

Key outcome: the packaged app currently stops at `PythonRequiredScreen` (a hard Python boot gate). After P3.T8 the workspace must open with no Python at all.

Extra requirement (from the P3.T4 report): `public/ort/` is 83 MB because `scripts/copy-ort.mjs` copies all four ORT factories. Check which files the running app actually requests: P3.T4 proved only `ort-wasm-simd-threaded.asyncify.{mjs,wasm}`. Narrow the copy regex to those, re-run `pnpm assets:embeddings`, and report the new size. Do not add a webpack alias. Next 16 builds with Turbopack.

You OWN for this wave: `src/app/(workspace)/layout.tsx`, `src/components/search/**`, `src/components/settings/settings-view.tsx`, `src/lib/ai/context.ts`, `src/lib/ai/tools.ts`, `scripts/start.mjs`, `scripts/copy-ort.mjs`, `package.json` scripts, `python-service/` references, `tests/e2e/**` (new specs only).

TDD where the plan has tests: `pnpm exec vitest run --config tests/vitest.config.ts <files>`.

Exit gate (report real output):
- `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
- `git grep -n "/api/python" -- src` prints nothing.
- `pnpm desktop:dist:dir && pnpm smoke:desktop` prints `SMOKE_OK`. Then prove the boot gate is gone. Run the packaged app in smoke mode, or extend `scripts/smoke-desktop.mjs` to also report `document.body.innerText.includes("Python")`, so that the dashboard shell renders (for example, the topbar exists) and no "Python required" text appears. Committing that smoke extension is welcome.
- The e2e proof the plan names in P3.T9: run it and report the pass count.

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream B (`src/components/chat/**`, `src/lib/ai/providers/**`, `src/lib/ai/chat-backends.ts`, `src/lib/db/schema.ts`, `src/app/api/models/**`); Stream C (`src/lib/backup/**` or whatever P4.T1–T2 create, `src/lib/db/index.ts` exports for backup, `tests/unit/lib/backup/**`, security check scripts). Do not touch their files. If a build fails on a sibling's mid-edit file, wait 2 minutes and retry once, then report.
