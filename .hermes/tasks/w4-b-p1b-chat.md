# Wave 4 / Stream B — P1b.T4, T7, T8, T9, T10: schema, connections, fallback in the turn, /model, OpenCode out of chat-view

Read `.hermes/tasks/00-shared-context.md` first.

Plan: `.hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-p1b-ai-providers.md`. Committed already: `src/lib/ai/providers/{fallback,model-ref,effort,custom}.ts` and the narrowed `ChatBackend` in `src/lib/ai/chat-backends.ts`. Read them first.

Implement in order, committing each:
- **P1b.T4**: thread schema without OpenCode, plus `effort` and `fallbacks`. `src/lib/db/schema.ts` is yours now; P3.T1 added an `embeddings` schema there, so leave it alone.
- **P1b.T7**: connection dialog with custom endpoint, test button and model discovery (`src/app/api/models/discover/route.ts`). The new API route sits behind the P2 guard (`src/proxy.ts`), and your route test calls the handler directly, so nothing more is needed. Only `http:`/`https:` base URLs are accepted.
- **P1b.T8**: fallback and effort in the chat turn. **Skip step 6** (the Settings → AI fallback list in `settings-view.tsx`; Stream A owns that file this wave). Do still add `chat.fallbacks` to `page-settings.ts` and copy it into new threads.
- **P1b.T9**: `/model` and the unified picker.
- **P1b.T10**: remove OpenCode from `chat-view.tsx` in its four passes, typechecking and committing after each pass. The legacy approval card (`legacyApproval` / `setLegacyApproval`) for `FS_TOOLS` must survive.

Do NOT do T11–T15 (later wave).

Line numbers in the plan are from 2026-10-17 and may have drifted; search for the quoted text. TDD where the plan gives tests:
`pnpm exec vitest run --config tests/vitest.config.ts <files>`.

Gate at the end:
- `git grep -in opencode -- src/components/chat/chat-view.tsx` prints nothing.
- `pnpm typecheck` exits 0.
- `pnpm exec vitest run --config tests/vitest.config.ts tests/unit/lib/ai tests/unit/components tests/unit/lib/db` passes.
- `pnpm lint` reports 0 errors.

Other files still referencing OpenCode (`src/lib/opencode/**`, `src/app/api/opencode/**`, `page-settings.ts` defaultBackend, etc.) are T11/T12's job. Leave them compiling.

Concurrent siblings: Stream A owns `src/app/(workspace)/layout.tsx`, `src/components/search/**`, `settings-view.tsx`, `src/lib/ai/context.ts`, `src/lib/ai/tools.ts`, scripts and package.json. Stream C does backup/import modules and security checks. Do not touch their files.
