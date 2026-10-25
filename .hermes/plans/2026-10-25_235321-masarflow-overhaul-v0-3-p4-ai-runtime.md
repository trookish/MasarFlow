# Phase 4 — AI runtime: one turn service, real limits, undo everywhere

**Goal:** Chat, Agents and Workflow all run through one `runAgentTurn` service with the same approvals, undo, context budget and tool set selection; settings that look live are live; history and retention are bounded; the orphaned Python service is gone.
**Branch:** `overhaul/v0.3`. **Depends on:** P2 `runCommand(..., "ai", …)` (tools write through commands). **Dexie:** may use `version(15)` only for a retention index; otherwise none.
**Master:** §2 rows A1–A8; decisions D5, D6.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| `src/lib/ai/agent/` holds `controller, provider, registry, history, context, compat, logger, types` | `ls` 2026-10-25 |
| `contextLimit` is optional on agent options; `history.ts:51` skips trimming when it is absent; controller forwards `opts.contextLimit` (`controller.ts:87`) | `rg contextLimit` |
| `agentConfigFromSettings` is exported from `src/lib/stores/agent-settings.ts:101` | `rg` (no production caller per audit — re-check with `rg -n agentConfigFromSettings src --glob '!*.test.*'`) |
| `buildLegacyMessages` at `src/lib/ai/chat-backends.ts:55` | `rg` |
| `buildStepPrompt` at `src/lib/ai/workflow.ts:59` | `rg` |
| Tool modules: `tools.ts` 46 KB, `workspace-tool-defs.ts` 25 KB, `fs-tools.ts` 9 KB, `undo.ts` 6 KB | `ls -s` |
| `python-service/` exists | `ls` |

Audit-sourced, re-read before editing: three send paths `chat-view.tsx:859`, `agents-view.tsx:225`, `workflow-view.tsx:310`; 61 workspace + 5 fs tools sent every request (`chat-view.tsx:866`); `buildLegacyMessages` drops tool and image-only turns (`chat-backends.ts:55-63`); no retention on `agentSteps`, `chatMessages`, `aiUndo`.

## File map

New: `src/lib/ai/turn/{run-agent-turn,toolsets,budget,retention}.ts`, `src/lib/hooks/use-agent-turn.ts`, `src/components/ai/model-picker.tsx`, `src/components/ai/approval-card.tsx`, `tests/unit/lib/ai/turn/*.test.ts`.
Modified: `src/components/chat/chat-view.tsx`, `src/components/agents/agents-view.tsx`, `src/components/workflow/workflow-view.tsx` (each loses its loop), `src/lib/ai/chat-backends.ts`, `src/lib/ai/workflow.ts`, `src/lib/ai/tools.ts` + `workspace-tool-defs.ts` (tools call commands), `src/lib/stores/agent-settings.ts`, `docs/architecture.md`.
Deleted: `python-service/` (T8).

## Tasks

**T1 — `runAgentTurn`.** Signature `runAgentTurn({surface: "chat"|"agent"|"workflow", threadId, input, toolset, modelRef, signal, onEvent})`. It loads settings via `agentConfigFromSettings` (fixes A3), resolves `contextLimit` from the model catalog entry (`modelMeta` in `src/lib/ai/catalog.ts:75`; fallback 32k) (fixes A2), builds history, runs `AgentController`, routes tool calls through approval policy and `undo.ts` for every surface (fixes A1's missing undo/approval). Tests with a fake provider: a 200-message thread is trimmed under the limit; a mutating tool call on surface `agent` produces an approval event and an undo record → `PASS (3 passed)`.

**T2 — Faithful history.** Rewrite `buildLegacyMessages` to keep `tool_call`/`tool_result` pairs and image-only user turns (as image parts). Tests: round-trip a thread with two tool calls and an image-only turn → the provider payload contains all 5 messages in order → `PASS (2 passed)`.

**T3 — Toolsets.** `toolsets.ts` defines ≈10 coarse tools (`search_workspace`, `read_entity`, `create_entity`, `update_entity`, `link_entities`, `list_tasks`, `update_task_status`, `read_file`, `search_files`, `write_file`) with a `kind` discriminator replacing per-entity tools; fs tools are included only when the project has a linked root. Keep the old 66 names as aliases for one release in the executor so stored threads replay. Test: no-root project → 0 fs tools; schema payload < 12 KB (measure `JSON.stringify` length) → `PASS (2 passed)`.

**T4 — Bounded workflows.** `buildStepPrompt` includes the goal, the previous step's output in full, and a ≤1,500-token summary of earlier steps (summary produced by the turn itself and stored on the step). Workflow runs persist step status; reopening the view resumes `pending` steps. Tests: 10-step run prompt length stays under budget; resume continues at step 4 → `PASS (2 passed)`.

**T5 — Surfaces use `useAgentTurn`.** Replace the three loops with `useAgentTurn`. Extract `ModelPicker` and `ApprovalCard` from `chat-view.tsx` (2,695 lines) so the three views share them. `chat-view.tsx` target < 900 lines. Packaged specs: `agents: mutating tool requires approval`, `workflow: resume after reload` + feature-matrix entries.

**T6 — Retention.** `retention.ts`: keep the last 200 `agentSteps` per run with full payloads, truncate tool results older than 30 days to 2 KB, keep `aiUndo` 30 days, never delete chat messages without user action (add "Clear thread history" command). Run on app start and daily from the replica runner's scheduler (P3 `runner.ts`). If a `[createdAt]` index is missing on these tables, add it in `version(15)`. Tests with fake clock → `PASS (3 passed)`.

**T7 — Search honesty.** Semantic search shows "Semantic index building (n of m)" while the embedder is loading and labels Fuse results "Keyword results" (fixes A9 copy; P6 owns the Library search surface — land the label logic in `src/lib/ai/embeddings/status.ts` (new) and let P6 render it).

**T8 — Remove `python-service/`.** Delete the directory in one commit; update `README.md`, `docs/architecture.md`, `docs/development.md` to describe the in-browser ONNX embedder (`src/lib/ai/embeddings/worker.ts`). `rg -n python-service .` (excluding `.hermes`, `CHANGELOG.md`) → 0.

## Gate

1. `pnpm test && pnpm lint && pnpm typecheck` → exit 0.
2. `rg -n "streamChat\(|controller\.run\(" src/components` → only inside `src/lib/hooks/use-agent-turn.ts` callers (exact symbol names: confirm in T1 by reading `controller.ts`).
3. `pnpm e2e:desktop` green including the two new specs and the existing chat specs (stub provider).

## Risks / open questions

- Old threads stored with per-entity tool names → aliases in T3 for 0.3, removed in 0.4.
- Coarse tools may reduce model accuracy → keep per-kind JSON schemas inside `create_entity` via `oneOf`; measure with the stub-free smoke list in `docs/development.md` before cutting aliases.

## Handoffs

P6 Ask surface + inspector "Ask about this" use `useAgentTurn({surface: "chat", toolset: "workspace"})`, `ModelPicker`, `ApprovalCard`.
