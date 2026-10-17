# Wave 3 / Stream B — P1b.T1–T3, T5, T6: AI provider core (pure + TDD)

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p1b-ai-providers.md`. Implement in order:
- **P1b.T1** fallback runner (`src/lib/ai/providers/fallback.ts`)
- **P1b.T2** `provider:model` refs + `/model` parser
- **P1b.T3** reasoning effort
- **P1b.T5** narrow `ChatBackend` to `"api" | "ollama"`. If narrowing the type breaks `chat-view.tsx`, `page-settings.ts` or other OpenCode call sites in typecheck, do NOT edit those files. Instead keep `"opencode"` in the union for now, marked `/** @deprecated removed in P1b.T10 */`, keep the label change, and report it. Those files are edited in a later wave.
- **P1b.T6** custom OpenAI-compatible provider (`src/lib/ai/providers/custom.ts`) and `providerForConnection` delegating to it. Read the real `AiProvider`/`AiModel`/`Catalog` types in `src/lib/ai/catalog.ts` first. The compiler wins over the plan's literal.

SKIP P1b.T4 (it edits `src/lib/db/schema.ts`, which Stream A owns this wave).

TDD each: test → run FAIL → implement → run PASS:
`pnpm exec vitest run --config tests/vitest.config.ts tests/unit/lib/ai/providers <other test files you touch>`.
After the last task: `pnpm typecheck` exit 0.

Commit after each task with the plan's message, pathspec form.

Concurrent siblings: Stream A (`src/lib/db/**`, `src/lib/search/**`, `src/lib/ai/embed*`, worker files, `tests/unit/lib/db/**`, `tests/unit/lib/search/**`); Stream C (`src/lib/server/**`, `src/proxy.ts`, `desktop/**`). Do not touch their files.
