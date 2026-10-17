# Wave 3 / Stream A — P3.T1–T6: in-app embeddings and semantic search (pure + TDD)

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p2-p3-p4-security-runtime-data.md`, `# PHASE 3`, tasks **P3.T1 through P3.T6** (stop before P3.T7). Also read `.hermes/spikes/S3.md` in full and override 7 in the P0/P1 plan section "P0 findings that OVERRIDE the P1 code below". S3 measured the real transformers 4.3.1 behaviour. Where the plan's embedder code (P3.T4) differs from S3, S3 wins:
- `env.backends.onnx.wasm.wasmPaths` must be a **string** same-origin path.
- Prefer the wasm-only ORT entry with `device: "wasm"`.
- Models are served from `/models/` (`public/models/`, fetched by `scripts/fetch-embedding-model.mjs`, already present on disk).
- The bundler must resolve `onnxruntime-web/webgpu` and `onnxruntime-common` to one module instance. In a Next worker this is normally automatic. If the build complains, report the error rather than hacking around it.

TDD every task: write test → run (FAIL) → implement → run (PASS) →
`pnpm exec vitest run --config tests/vitest.config.ts <your test files>`.
The embedder core's unit tests must use a fake pipeline (no real model in node tests), as the plan describes.

You OWN `src/lib/db/index.ts` and `src/lib/db/schema.ts` for this wave (P3.T1 adds Dexie v11 `embeddings`). Nobody else edits them now.

After P3.T6: `pnpm typecheck` exit 0; `pnpm test` exit 0 (report counts).

Commit after each task with the plan's message, using the pathspec form from the shared context.

Concurrent siblings in the same tree: Stream B (`src/lib/ai/providers/**`, `src/lib/ai/chat-backends.ts`, `src/lib/ai/catalog.ts`, tests under `tests/unit/lib/ai/providers/`); Stream C (`src/lib/server/**`, `src/proxy.ts`, `desktop/**`, `tests/unit/lib/server/**`, `tests/unit/desktop/**`). Do not touch their files.
