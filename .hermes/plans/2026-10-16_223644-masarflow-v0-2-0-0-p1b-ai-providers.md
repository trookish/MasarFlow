# MasarFlow v0.2.0.0 — Phase P1b (replaces the OpenCode phase): Hermes-style AI providers

> **For Hermes:** this phase REPLACES the old "P1b — OpenCode & bridge orchestration". Read the master plan first. Run after P1; it is independent of P2–P4 except where noted (P2.T7 moves API keys to the keychain; do P1b first or rebase). TDD: failing test → run → implement → run → commit. Never push.
> Decision (user, 2026-10-17): **drop OpenCode entirely.** Chat connects to models the way Hermes does: a provider registry, per-provider credentials, a `provider:model` picker, an ordered fallback chain, reasoning effort, custom OpenAI-compatible endpoints, and the `/model` quick switch. No external agent process, no bridge, no SSE relay.

**Findings this phase is built on (verified 2026-10-17):**
- The direct path already exists and is complete enough to become the only path: `chat-view.tsx` `backend: "api" | "ollama"` runs `runWorkspaceChat` → `AgentController` → `ProxyProvider` → `POST /api/chat` (`src/app/api/chat/route.ts`, Anthropic + OpenAI wire formats, tool-less retry, timeouts).
- That path already carries **55 workspace tools** (`WORKSPACE_TOOLS`, run in the renderer against Dexie, with undo via `executeWorkspaceToolWithUndo`) **and filesystem/shell tools with approval cards** (`FS_TOOLS` / `executeFsTool` in `src/lib/ai/fs-tools.ts`, `chat-view.tsx:1461-1487`). So nothing OpenCode provided is unreplaced except its file-snapshot undo (see Risks).
- Provider/model data comes from models.dev through `src/lib/ai/catalog.ts` (`fetchCatalog`, `FALLBACK_CATALOG`, `providerForConnection`, capability helpers). Saved connections live in Dexie `aiConnections` (`aiConnectionSchema`, `aiConnectionsRepo`).
- OpenCode footprint to delete: `src/lib/opencode/` (13 files), `src/app/api/opencode/` (19 route files), `src/lib/ai/opencode-client.ts`, `scripts/install-opencode-tools.mjs`, `scripts/opencode-verify.mjs`, 10 unit-test files + 2 e2e specs, ~126 references in `chat-view.tsx`, 24 entries in `desktop/src/main/env.ts`, `defaultBackend: "opencode"` in `src/lib/stores/page-settings.ts` and `settings-view.tsx`, the "OpenCode Zen" entry in `catalog.ts`, thread fields `opencodeSessionId` / `opencodeDirectory`.

**Phase gate (P1b gate):** `pnpm test`, `pnpm typecheck`, `pnpm lint` green; `git grep -il opencode -- src desktop/src scripts package.json tests` prints only the allowed lines in P1b.T14; a new chat with a saved connection answers; a forced 429 on the primary connection transparently continues on the fallback.

---

## P1b.T1 — Error classification + fallback runner (pure, TDD, ≈6 min)

**Failing test `tests/unit/lib/ai/providers/fallback.test.ts`:**

```ts
import { describe, it, expect, vi } from "vitest";
import { classifyFailure, runWithFallback, type FallbackTarget } from "@/lib/ai/providers/fallback";

const A: FallbackTarget = { connectionId: "a", modelId: "m1" };
const B: FallbackTarget = { connectionId: "b", modelId: "m2" };

describe("classifyFailure", () => {
  it.each([
    ["429 rate limit", "retryable"],
    ["Rate limited — wait a moment", "retryable"],
    ["502 bad gateway", "retryable"],
    ["fetch failed", "retryable"],
    ["took longer than 120s", "retryable"],
    ["402 insufficient credits", "switch"],
    ["401 invalid api key", "switch"],
    ["404 model not found", "switch"],
    ["maximum context length exceeded", "fatal"],
    ["400 bad request", "fatal"],
    ["Aborted", "fatal"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyFailure(new Error(msg))).toBe(kind);
  });
});

describe("runWithFallback", () => {
  it("returns the first success and reports no switch", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const onSwitch = vi.fn();
    expect(await runWithFallback([A, B], attempt, { onSwitch })).toEqual({ value: "ok", used: A });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onSwitch).not.toHaveBeenCalled();
  });
  it("retries a retryable failure once on the same target, then moves on", async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce("from-b");
    const onSwitch = vi.fn();
    const r = await runWithFallback([A, B], attempt, { onSwitch, retryDelayMs: 0 });
    expect(r).toEqual({ value: "from-b", used: B });
    expect(attempt.mock.calls.map((c) => c[0].connectionId)).toEqual(["a", "a", "b"]);
    expect(onSwitch).toHaveBeenCalledWith(A, B, expect.stringMatching(/429/));
  });
  it("switches immediately on auth/credit/missing-model errors", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("401 invalid api key")).mockResolvedValueOnce("b");
    const r = await runWithFallback([A, B], attempt, { retryDelayMs: 0 });
    expect(r.used).toEqual(B);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
  it("never falls back on fatal errors (context overflow, abort)", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("maximum context length exceeded"));
    await expect(runWithFallback([A, B], attempt, { retryDelayMs: 0 })).rejects.toThrow(/context/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  it("throws the LAST error when every target fails", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("401 a")).mockRejectedValueOnce(new Error("401 b"));
    await expect(runWithFallback([A, B], attempt, { retryDelayMs: 0 })).rejects.toThrow("401 b");
  });
  it("rejects an empty chain", async () => {
    await expect(runWithFallback([], vi.fn())).rejects.toThrow(/no model/i);
  });
});
```
Run: `pnpm vitest run tests/unit/lib/ai/providers/fallback.test.ts --config tests/vitest.config.ts` → **FAIL** (module not found). Create `src/lib/ai/providers/fallback.ts`:

```ts
/** One place a turn can be sent: a saved connection + a model id. */
export interface FallbackTarget {
  connectionId: string;
  modelId: string;
}

export type FailureKind = "retryable" | "switch" | "fatal";

/**
 * retryable — transient (rate limit, 5xx, network, timeout): retry once, then move on.
 * switch    — this target can never work right now (bad key, no credit, unknown model): move on now.
 * fatal     — the request itself is wrong or the user cancelled: falling back would only repeat it.
 */
export function classifyFailure(err: unknown): FailureKind {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/abort|cancel/.test(msg)) return "fatal";
  if (/context|too long|maximum.*tokens|token limit/.test(msg)) return "fatal";
  if (/401|unauthorized|invalid api key|incorrect api key|authentication|403|forbidden/.test(msg)) return "switch";
  if (/402|insufficient|balance|credits|payment|out of credit/.test(msg)) return "switch";
  if (/404|not found|no such model|does not exist/.test(msg)) return "switch";
  if (/429|rate limit|too many requests|quota|5\d\d|overloaded|internal|fetch failed|network|econnrefused|enotfound|socket|timeout|timed out|took longer|stopped responding|could not reach/.test(msg)) {
    return "retryable";
  }
  return "fatal";
}

export interface FallbackOptions {
  retryDelayMs?: number;
  onSwitch?: (from: FallbackTarget, to: FallbackTarget, reason: string) => void;
}

/** Try `chain` in order. Resolves with the value and the target that produced it. */
export async function runWithFallback<T>(
  chain: FallbackTarget[],
  attempt: (target: FallbackTarget) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<{ value: T; used: FallbackTarget }> {
  if (chain.length === 0) throw new Error("No model is configured for this chat.");
  const delay = opts.retryDelayMs ?? 1500;
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const target = chain[i];
    for (let tries = 0; tries < 2; tries++) {
      try {
        return { value: await attempt(target), used: target };
      } catch (err) {
        lastErr = err;
        const kind = classifyFailure(err);
        if (kind === "fatal") throw err;
        if (kind === "retryable" && tries === 0) {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }
    const next = chain[i + 1];
    if (next) opts.onSwitch?.(target, next, lastErr instanceof Error ? lastErr.message : String(lastErr));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
```
Run the test → **PASS** (all 17). Commit: `feat(ai): fallback chain runner with failure classification`.

> Caller contract: `attempt` must not have streamed partial text to the UI before failing, OR the caller resets its accumulator in `onSwitch`. `chat-view.tsx` does the latter (T8).

## P1b.T2 — `provider:model` references and the `/model` command (pure, TDD, ≈6 min)

**Failing test `tests/unit/lib/ai/providers/model-ref.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { formatModelRef, parseModelRef, parseSlashModel, resolveModelRef } from "@/lib/ai/providers/model-ref";

describe("model refs", () => {
  it("formats and parses provider:model, keeping colons inside the model id", () => {
    expect(formatModelRef("anthropic", "claude-sonnet-4-5")).toBe("anthropic:claude-sonnet-4-5");
    expect(parseModelRef("openrouter:meta/llama-3:free")).toEqual({ providerId: "openrouter", modelId: "meta/llama-3:free" });
    expect(parseModelRef("gpt-5")).toEqual({ providerId: "", modelId: "gpt-5" });
  });
  it("recognises /model and /model <ref>", () => {
    expect(parseSlashModel("/model")).toEqual({ ref: "" });
    expect(parseSlashModel("/model  anthropic:claude-haiku-4-5 ")).toEqual({ ref: "anthropic:claude-haiku-4-5" });
    expect(parseSlashModel("hello /model x")).toBeNull();
    expect(parseSlashModel("/models")).toBeNull();
  });
  it("resolves against saved connections", () => {
    const conns = [
      { id: "c1", providerId: "anthropic", label: "Work" },
      { id: "c2", providerId: "openai", label: "Personal" },
    ];
    expect(resolveModelRef("openai:gpt-5", conns)).toEqual({ connectionId: "c2", modelId: "gpt-5" });
    expect(resolveModelRef("Work:claude-haiku-4-5", conns)).toEqual({ connectionId: "c1", modelId: "claude-haiku-4-5" });
    expect(resolveModelRef("nope:x", conns)).toBeNull();
    expect(resolveModelRef("gpt-5", conns)).toBeNull();
  });
});
```
Run → FAIL. Create `src/lib/ai/providers/model-ref.ts`:

```ts
export function formatModelRef(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Split on the FIRST colon only — model ids such as `llama-3:free` contain colons. */
export function parseModelRef(ref: string): { providerId: string; modelId: string } {
  const i = ref.indexOf(":");
  if (i < 0) return { providerId: "", modelId: ref.trim() };
  return { providerId: ref.slice(0, i).trim(), modelId: ref.slice(i + 1).trim() };
}

export function parseSlashModel(input: string): { ref: string } | null {
  const m = /^\/model(?:\s+(.*))?$/.exec(input.trim());
  return m ? { ref: (m[1] ?? "").trim() } : null;
}

/** Match `<provider id or connection label>:<model>` to a saved connection (first match wins). */
export function resolveModelRef(
  ref: string,
  connections: { id: string; providerId: string; label: string }[],
): { connectionId: string; modelId: string } | null {
  const { providerId, modelId } = parseModelRef(ref);
  if (!providerId || !modelId) return null;
  const want = providerId.toLowerCase();
  const conn =
    connections.find((c) => c.label.toLowerCase() === want) ??
    connections.find((c) => c.providerId.toLowerCase() === want);
  return conn ? { connectionId: conn.id, modelId } : null;
}
```
Run → PASS. Commit: `feat(ai): provider:model refs and /model parser`.

## P1b.T3 — Reasoning effort (pure, TDD, ≈4 min)

Hermes exposes effort levels instead of raw token budgets. Existing code passes `reasoning: { enabled, budget }` (`chat-view.tsx:1490`).

**Failing test `tests/unit/lib/ai/providers/effort.test.ts`:**
```ts
import { describe, it, expect } from "vitest";
import { effortToReasoning, EFFORT_LEVELS } from "@/lib/ai/providers/effort";

describe("effortToReasoning", () => {
  it("is off for 'off' or when the model cannot reason", () => {
    expect(effortToReasoning("off", true)).toBeUndefined();
    expect(effortToReasoning("high", false)).toBeUndefined();
  });
  it("maps levels to increasing budgets", () => {
    const b = (e: "low" | "medium" | "high") => effortToReasoning(e, true)!.budget!;
    expect(b("low")).toBeLessThan(b("medium"));
    expect(b("medium")).toBeLessThan(b("high"));
    expect(effortToReasoning("medium", true)!.enabled).toBe(true);
  });
  it("lists the levels in UI order", () => {
    expect(EFFORT_LEVELS).toEqual(["off", "low", "medium", "high"]);
  });
});
```
Run → FAIL. Create `src/lib/ai/providers/effort.ts`:
```ts
export const EFFORT_LEVELS = ["off", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

const BUDGETS = { low: 2000, medium: 8000, high: 24000 } as const;

export function effortToReasoning(
  effort: Effort,
  modelCanReason: boolean,
): { enabled: boolean; budget?: number } | undefined {
  if (effort === "off" || !modelCanReason) return undefined;
  return { enabled: true, budget: BUDGETS[effort] };
}
```
Run → PASS. Commit: `feat(ai): reasoning effort levels`.

## P1b.T4 — Thread + settings schema without OpenCode (TDD, ≈7 min)

No Dexie version bump (none of these fields are indexed).

**Failing test `tests/unit/lib/db/schema-backend.test.ts`:**
```ts
import { describe, it, expect } from "vitest";
import { chatThreadSchema } from "@/lib/db/schema";

const base = { id: "t", projectId: "p", createdAt: 1, updatedAt: 1 };

describe("chatThreadSchema backend", () => {
  it("defaults to api", () => {
    expect(chatThreadSchema.parse(base).backend).toBe("api");
  });
  it("maps legacy opencode threads to api", () => {
    expect(chatThreadSchema.parse({ ...base, backend: "opencode" }).backend).toBe("api");
  });
  it("keeps ollama", () => {
    expect(chatThreadSchema.parse({ ...base, backend: "ollama" }).backend).toBe("ollama");
  });
  it("carries effort and fallbacks with safe defaults", () => {
    const t = chatThreadSchema.parse(base);
    expect(t.effort).toBe("off");
    expect(t.fallbacks).toEqual([]);
  });
  it("migrates the old reasoningEnabled flag to effort medium", () => {
    expect(chatThreadSchema.parse({ ...base, reasoningEnabled: true }).effort).toBe("medium");
  });
  it("drops the removed opencode session fields", () => {
    const t = chatThreadSchema.parse({ ...base, opencodeSessionId: "x", opencodeDirectory: "y" }) as Record<string, unknown>;
    expect("opencodeSessionId" in t).toBe(false);
    expect("opencodeDirectory" in t).toBe(false);
  });
});
```
Run → FAIL. Edit `src/lib/db/schema.ts` `chatThreadSchema` (line ≈ 520, search `export const chatThreadSchema`):
1. Replace the `backend:` line and its comment with:
```ts
  /**
   * api    — a saved AI connection through /api/chat (Agent Loop, default);
   * ollama — the local Ollama server (no API key).
   * Legacy "opencode" threads map to "api". Not indexed.
   */
  backend: z.preprocess((v) => (v === "opencode" ? "api" : v), z.enum(["api", "ollama"]).default("api")),
```
2. Delete the `opencodeSessionId`, `opencodeDirectory` fields and their comments. Keep `providerId`; retitle its comment to `Provider id of the selected connection (e.g. "anthropic"). Not indexed.`
3. After `reasoningEnabled`, add:
```ts
  /** Reasoning effort (Hermes-style). Migrated from `reasoningEnabled`. Not indexed. */
  effort: z.enum(["off", "low", "medium", "high"]).default("off"),
  /** Ordered fallback targets tried when the primary connection fails. Not indexed. */
  fallbacks: z.array(z.object({ connectionId: z.string(), modelId: z.string() })).default([]),
```
4. Make `effort` honour the legacy flag by wrapping the whole object: change `export const chatThreadSchema = z.object({…});` to `export const chatThreadSchema = z.preprocess((raw) => { const r = raw as Record<string, unknown>; return r && r.effort === undefined && r.reasoningEnabled === true ? { ...r, effort: "medium" } : raw; }, z.object({…}));` — then re-run `pnpm typecheck`; if `chatThreadSchema.shape` / `.extend` is used elsewhere (`git grep -n "chatThreadSchema\." src`), keep the plain object as `chatThreadObject` and export `chatThreadSchema = z.preprocess(…, chatThreadObject)`.
Run: `pnpm vitest run tests/unit/lib/db --config tests/vitest.config.ts` → PASS; `pnpm typecheck` shows errors ONLY in files that still mention `opencode*` (fixed in T9–T13). Commit: `feat(db): chat threads without OpenCode, add effort and fallbacks`.

## P1b.T5 — Narrow backend type and labels (TDD, ≈3 min)

Edit `tests/unit/lib/ai/chat-backends.test.ts` (create if absent) to assert `BACKEND_LABELS` equals `{ api: "API", ollama: "Local (Ollama)" }` → run → FAIL. In `src/lib/ai/chat-backends.ts` set `export type ChatBackend = "api" | "ollama";` and remove the `opencode` key from `BACKEND_LABELS`; update the file header comment ("Shared plumbing for the chat backends"). Run → PASS. Commit: `refactor(ai): ChatBackend is api | ollama`.

## P1b.T6 — Custom OpenAI-compatible provider (TDD, ≈8 min)

Hermes lets any OpenAI-compatible endpoint be added. `aiConnectionSchema` already has `baseUrl`; only the catalog resolution is missing.

**Failing test `tests/unit/lib/ai/providers/custom.test.ts`:**
```ts
import { describe, it, expect } from "vitest";
import { CUSTOM_PROVIDER_ID, customProvider, resolveConnectionProvider } from "@/lib/ai/providers/custom";
import { FALLBACK_CATALOG } from "@/lib/ai/catalog";

describe("custom provider", () => {
  it("builds an OpenAI-format provider from a connection's base URL", () => {
    const p = customProvider({ id: "c9", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" }, ["qwen3-coder"]);
    expect(p.id).toBe(CUSTOM_PROVIDER_ID);
    expect(p.api).toBe("http://127.0.0.1:1234/v1");
    expect(Object.keys(p.models)).toEqual(["qwen3-coder"]);
  });
  it("resolves catalog providers by id and custom ones from the connection", () => {
    const known = resolveConnectionProvider(FALLBACK_CATALOG, { id: "c1", label: "A", providerId: "anthropic", baseUrl: "" });
    expect(known?.id).toBe("anthropic");
    const custom = resolveConnectionProvider(FALLBACK_CATALOG, { id: "c2", label: "X", providerId: CUSTOM_PROVIDER_ID, baseUrl: "http://h/v1" });
    expect(custom?.api).toBe("http://h/v1");
    expect(resolveConnectionProvider(FALLBACK_CATALOG, { id: "c3", label: "Y", providerId: CUSTOM_PROVIDER_ID, baseUrl: "" })).toBeNull();
  });
});
```
Run → FAIL. Before writing, read the `AiProvider` / `AiModel` interfaces at the top of `src/lib/ai/catalog.ts` (lines 1–50) and make the object literal below satisfy them exactly (the compiler is the judge; add any required fields with neutral values). Create `src/lib/ai/providers/custom.ts`:
```ts
import type { AiProvider, Catalog } from "@/lib/ai/catalog";

export const CUSTOM_PROVIDER_ID = "custom";

export function customProvider(
  conn: { id: string; label: string; baseUrl: string },
  modelIds: string[] = [],
): AiProvider {
  const models: AiProvider["models"] = {};
  for (const id of modelIds) {
    models[id] = { id, name: id, tool_call: true } as AiProvider["models"][string];
  }
  return {
    id: CUSTOM_PROVIDER_ID,
    name: conn.label || "Custom endpoint",
    api: conn.baseUrl.replace(/\/+$/, ""),
    npm: "@ai-sdk/openai-compatible",
    env: [],
    models,
  } as AiProvider;
}

/** Catalog provider for a saved connection; custom endpoints are built from the connection itself. */
export function resolveConnectionProvider(
  catalog: Catalog,
  conn: { id: string; label: string; providerId: string; baseUrl: string } | null | undefined,
  modelIds: string[] = [],
): AiProvider | null {
  if (!conn) return null;
  if (conn.providerId === CUSTOM_PROVIDER_ID) {
    return conn.baseUrl.trim() ? customProvider(conn, modelIds) : null;
  }
  return catalog[conn.providerId] ?? null;
}
```
Run → PASS. Then in `src/lib/ai/chat-backends.ts` make `providerForConnection` delegate: change its parameter to `connection: { id: string; label: string; providerId: string; baseUrl: string } | null | undefined` and `return resolveConnectionProvider(catalog, connection)`. Update call sites flagged by `pnpm typecheck` (all pass a full `AiConnection`). Commit: `feat(ai): custom OpenAI-compatible endpoints`.

## P1b.T7 — Connection dialog: custom endpoint, test button, model discovery (≈12 min)

File: `src/components/chat/connections-dialog.tsx` (read it first; it already lists catalog providers, takes API key/base URL).
1. Add a "Custom (OpenAI-compatible)" entry to the provider list that sets `providerId: CUSTOM_PROVIDER_ID` and shows a required **Base URL** field; for catalog providers keep the base URL optional.
2. Add `src/lib/ai/providers/test-connection.ts`:
```ts
import { streamChat } from "@/lib/ai/chat-client";
import type { AiProvider } from "@/lib/ai/catalog";
import { friendlyChatError } from "@/lib/ai/errors";

/** One 8-token round trip. Resolves `{ ok: true }` or `{ ok: false, error }` (already user-friendly). */
export async function testConnection(args: {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    let got = false;
    await streamChat({
      ...args,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      onDelta: () => { got = true; },
      signal: ac.signal,
    });
    return got ? { ok: true } : { ok: false, error: "The provider answered but returned no text." };
  } catch (e) {
    return { ok: false, error: friendlyChatError(e instanceof Error ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}
```
   Unit test `tests/unit/lib/ai/providers/test-connection.test.ts` with `vi.mock("@/lib/ai/chat-client")`: (a) `streamChat` calls `onDelta("ok")` → `{ ok: true }`; (b) it throws `new Error("401 invalid api key")` → `ok:false` and message starts with `Authentication failed`. Run → FAIL → create file → PASS.
3. In the dialog add a **Test** button per connection row calling `testConnection` with `modelsForProvider(provider)[0]` (custom: the model id typed in a "Model id" field) and show the green/red result inline.
4. For `ollama` and custom endpoints, discover models with `GET {baseUrl}/models` (OpenAI shape `{data:[{id}]}`) through the existing `src/app/api/ollama/models/route.ts` pattern — do NOT call a user URL from the browser directly (CORS); add `src/app/api/models/discover/route.ts` (`POST {baseUrl, apiKey}` → `{ models: string[] }`, 8 s timeout, only `http:`/`https:`), test with `tests/unit/app/api/models/discover.test.ts` (mock `fetch`; assert it forwards `Authorization: Bearer …`, rejects `file:` URLs with 400, returns ids sorted).
Verify: `pnpm vitest run tests/unit/lib/ai/providers tests/unit/app/api/models --config tests/vitest.config.ts` → all green. Commit: `feat(chat): custom endpoint, connection test, model discovery`.

## P1b.T8 — Fallback + effort in the chat turn (≈12 min)

File: `src/components/chat/chat-view.tsx`, function that runs a non-OpenCode turn (`runWorkspaceChat({` at ≈ line 1454; connection resolved at ≈ 1388–1410).
1. Build the chain: `[{connectionId: t.connectionId, modelId: t.modelId}, ...t.fallbacks]` (for `ollama` threads the chain has one entry).
2. Wrap the `runWorkspaceChat` call in `runWithFallback(chain, async (target) => { …resolve connection/provider/apiKey/baseUrl for target…; return runWorkspaceChat({…}) }, { onSwitch })`. Resolve each target's connection with `connections.find`, `providerForConnection(catalog, conn)`, and `await getSecret(...)`-equivalent used today for `apiKey`.
3. `onSwitch(from, to, reason)`: set `acc = ""` (discard partial text), push a visible notice line `Switched to <label>:<model> — <reason>` into the message (reuse the existing `notice` event rendering) and persist `connectionId`/`modelId` of the winning target ONLY when the user confirms via a "Keep using this model" button on that notice (do not silently rewrite the thread).
4. Replace `t.reasoningEnabled && modelSupportsReasoning(...) ? { enabled: true, budget: 8000 } : undefined` with `effortToReasoning(t.effort, modelSupportsReasoning(provider, modelId))`.
5. Replace the reasoning on/off toggle in the header with a 4-step effort selector (`EFFORT_LEVELS`) writing `effort` via `chatThreadsRepo.update`.
6. Settings → AI: an ordered "Fallback models" list (add/remove/reorder, entries picked from saved connections + models) stored in `usePageSettings` as `chat.fallbacks: {connectionId; modelId}[]` (default `[]`; add to `PAGE_SETTINGS_DEFAULTS` and its type); new threads copy it into `thread.fallbacks`.
Verify: `pnpm typecheck`; `pnpm vitest run tests/unit/components/chat --config tests/vitest.config.ts` (existing chat tests must still pass); add `tests/unit/components/chat/fallback-notice.test.tsx` only if a notice component is extracted. Manual proof is in T15. Commit: `feat(chat): fallback chain and reasoning effort in the turn loop`.

## P1b.T9 — `/model` quick switch and unified picker (≈10 min)

1. In `send()` (`chat-view.tsx:1593`), before any network work: `const slash = parseSlashModel(input); if (slash) { … }`. Empty `ref` → open the model picker. Non-empty → `resolveModelRef(slash.ref, connections)`; on success `chatThreadsRepo.update(thread.id, { connectionId, modelId, providerId })`, clear the input, and show an inline confirmation `Now using <ref>`; on failure show `No saved connection matches "<provider>". Add one in Connections.` Never send `/model …` to the model.
2. Replace the three-part OpenCode picker block (`OpenCode provider / model pickers`, ≈ line 3488) with one searchable **connection → model** picker built on `modelsForProvider`, `searchModels`, `defaultModelId`, tool/vision/reasoning badges from `modelSupportsTools/Images/Reasoning` (these helpers already exist in `catalog.ts`). A model without tool support shows a wrench-slash badge and agentic mode warns (this replaces the `toolcall` check at ≈ line 1611).
3. Component test `tests/unit/components/chat/model-picker.test.tsx`: renders two connections, typing `haiku` filters to matching models, selecting calls `onSelect({connectionId, modelId})`.
Commit: `feat(chat): /model command and unified model picker`.

## P1b.T10 — Remove OpenCode from `chat-view.tsx` (≈25 min, four passes, typecheck between each)

Work top-to-bottom; after each pass run `pnpm typecheck` and commit. Anchors are line numbers in the file as of 2026-10-17 — search for the quoted text if they have drifted.
- **Pass A — imports/state:** drop `fetchOpenCodeModels`, `OpenCodeModelsPayload`, `OpenCodeFrontendEvent`, `opencodeHealthy`, `models` state (≈ 79, 224, 301), the bridge-session state (≈ 362), the SSE subscription effect (≈ 399–486), and the stuck-turn recovery that polls the OpenCode session (≈ 487). Commit `refactor(chat): remove OpenCode state and SSE`.
- **Pass B — thread creation / backend switch:** `backend` default becomes `thread?.backend ?? "api"` (≈ 414); delete the `backendForNew === "opencode"` branches (≈ 590, 645, 704) so new threads pick a saved connection or Ollama; delete the "Backend switch (OpenCode / API / Local Ollama)" control (≈ 2756) → a two-way API/Ollama switch. Commit `refactor(chat): thread creation without OpenCode`.
- **Pass C — turn runner:** delete the OpenCode approval flow (≈ 741–921), the `Run one assistant turn through the OpenCode backend` function (≈ 938–1330, including `opencodeMessageId` bookkeeping at 991/1209/1222/1238/1259), the `if (backend === "opencode")` block in `send()` (≈ 1598–1680), `abortChatTurn(thread?.opencodeSessionId)` (≈ 1790), and the per-message undo that calls the OpenCode snapshot revert (≈ 1769, 2048). KEEP the legacy approval card — it is the one used by `FS_TOOLS` (`setLegacyApproval`). Commit `refactor(chat): remove OpenCode turn runner`.
- **Pass D — JSX:** delete the unavailable banner/empty-state variants keyed on `opencodeHealthy` (≈ 1809, 1860, 1900, 1915, 1988, 2247), the `Approval card for OpenCode permission requests` (≈ 2349) if it is not the one rendering `legacyApproval`, the `Question dialog (opencode question tool)` (≈ 2424), and the text "Providers are configured in OpenCode — run `opencode auth`" (≈ 3537) → replace with an empty state that opens Connections. Commit `refactor(chat): remove OpenCode UI`.
Verify (must print nothing): `git grep -in "opencode" -- src/components/chat/chat-view.tsx`. Then `pnpm vitest run tests/unit/components --config tests/vitest.config.ts` green.

## P1b.T11 — Settings, store, context text (≈6 min)

1. `src/lib/stores/page-settings.ts:52`: `defaultBackend: "api" | "ollama";` and `:148` → `"api"`. Add a persisted-state migration in the store's `merge`/`version` (follow the pattern already used there; if none, add in `merge`): `if (persisted.chat?.defaultBackend === "opencode") persisted.chat.defaultBackend = "api"`. Test in `tests/unit/lib/stores/page-settings.test.ts`: hydrating `{chat:{defaultBackend:"opencode"}}` yields `"api"`.
2. `src/components/settings/settings-view.tsx:1278-1283`: options become API / Local (Ollama); description: `Which backend new chats start on: a saved API connection or local Ollama. Switchable per chat.`
3. `src/lib/ai/context.ts:473-503` and `src/lib/ai/agent/context.ts:25-37`: replace OpenCode wording with the real runtime ("filesystem tools executed by MasarFlow against the linked project root, with approval for writes and shell"). Keep the `"workspace" | "filesystem" | "hybrid"` mode names only if a test pins them; otherwise collapse to `hybrid` (workspace + fs tools). Update `tests/unit/lib/ai/context.test.ts` / `agent` context tests to the new wording.
4. `src/lib/ai/workspace-tool-defs.ts:7-18` and `src/lib/ai/tools.ts:50`: drop OpenCode from the comments. If `tests/unit/lib/ai/workspace-tool-defs.test.ts` asserts parity with the generated OpenCode tool files, delete that assertion block only.
Commit: `refactor(ai): settings and context text without OpenCode`.

## P1b.T12 — Delete the OpenCode code (≈8 min)

Run these deletions with `git rm -r` (one command each; keep commands short):
```
git rm -r src/lib/opencode src/app/api/opencode tests/unit/lib/opencode tests/unit/app/api/opencode
git rm src/lib/ai/opencode-client.ts scripts/install-opencode-tools.mjs scripts/opencode-verify.mjs tests/unit/lib/ai/toolgen.test.ts
git rm tests/e2e/chat-agentic.spec.ts tests/e2e/chat-mentions.spec.ts
```
Then:
1. `package.json`: delete the `"tools:install"` script.
2. `desktop/src/main/env.ts`: delete every `OPENCODE_*` entry (24 lines). `desktop/src/main/setup.ts:18`: delete the OpenCode comment.
3. `scripts/start.mjs` (798 lines): P3.T9 already replaces it with a thin wrapper — if P3 is not merged yet, delete `installOpencodeTools`, `resolveOpencodeBin`, `OPENCODE_PORT`, the opencode spawn and the `opencode` key in `writePortsFile`.
4. `src/lib/ai/catalog.ts`: delete the `opencode` provider block (≈ lines 283–300, "OpenCode Zen") from `FALLBACK_CATALOG`. `tests/unit/lib/ai/catalog.test.ts` (if it names it) → update.
5. `tests/e2e/chat-agentic.spec.ts` / `chat-mentions.spec.ts` covered behaviour the new e2e replaces: re-create them in P9 against a mocked `/api/chat` (see P9 note) — do not port now.
6. `tests/e2e/feature-matrix.json`: remove any entry whose route starts `/api/opencode`; rows for chat stay.
Verify: `pnpm typecheck && pnpm lint && pnpm test` all green. `git grep -il opencode -- src desktop/src scripts package.json tests` must print ONLY: `tests/` e2e fixtures that mention the word in prose (none expected) — if anything else prints, fix it. Commit: `chore: remove OpenCode integration`.

## P1b.T13 — Security + plan references (≈5 min)

- P2's request guard no longer needs a bridge exemption: in `…-p1b-p2-p3-p4-…md` P2.T1 `BRIDGE_PATHS` becomes `[]` and the three bridge tests are deleted (this plan set was already patched; if you are executing P2 from an older copy, apply the same change). Add the stronger test in `tests/unit/lib/server/request-guard.test.ts`: `/api/opencode/ws-call` WITHOUT a token → 401 (the path no longer exists and must not be special).
- `/api/chat` and `/api/models/discover` accept user-supplied base URLs: add to P2's SSRF note — only `http:`/`https:`; no redirects to `file:`; document in `SECURITY.md` (P10) that custom endpoints can point at localhost by design.

## P1b.T14 — Allowed leftovers + guard test (≈4 min)

Add `tests/unit/repo/no-opencode.test.ts` (uses `tests/unit/_helpers/fs-scan.ts` if present, else `node:fs` recursion over `src`, `desktop/src`, `scripts`):
```ts
import { describe, it, expect } from "vitest";
import { scanFiles } from "../_helpers/fs-scan";

describe("OpenCode is gone", () => {
  it("no source file references it", () => {
    const hits = scanFiles(["src", "desktop/src", "scripts"], /opencode/i).filter((h) => !h.file.endsWith("legacy-note.md"));
    expect(hits).toEqual([]);
  });
});
```
(Read `tests/unit/_helpers/fs-scan.ts` for the real export name/shape and adapt the call; if it does not exist create a 15-line recursive walker in that file.) Only allowed mention: the user-facing migration notice `"OpenCode chats now use your saved API connections."` in `src/lib/db/migrations/…` if you add one — if you do, whitelist exactly that file path.
Run → PASS. Commit: `test: forbid OpenCode references`.

## P1b.T15 — End-to-end proof (≈10 min)

Create `tests/e2e/chat-providers.spec.ts` (Playwright, browser mode; follow `tests/e2e/smoke.spec.ts` conventions):
1. `page.route("**/api/chat", …)` mock: connection "Primary" returns `429` body `{error:"429 rate limit"}` twice; connection "Backup" returns an SSE/stream the same way `tests/e2e` chat specs already mock (copy the helper from the deleted `chat-agentic.spec.ts` via `git show HEAD~N:tests/e2e/chat-agentic.spec.ts`).
2. Seed two `aiConnections` + a thread with `fallbacks:[Backup]`; send "hi"; assert the notice `Switched to Backup` and the assistant reply text are visible.
3. Type `/model Backup:fast-model` → assert `Now using Backup:fast-model` and that no `/api/chat` request was made for that message.
Run: `pnpm exec playwright test tests/e2e/chat-providers.spec.ts --config tests/playwright.config.ts` → 3 passed. Commit: `test(e2e): provider fallback and /model`.

## Self-review checklist (executor ticks before moving on)
- [ ] `git grep -il opencode -- src desktop/src scripts package.json` prints nothing
- [ ] A thread created before this change (backend `"opencode"`) opens, shows "API", and prompts for a connection if none is saved
- [ ] API keys still resolve through the P2.T7 secrets API (no new plaintext storage)
- [ ] Killing network mid-turn shows the friendly error and the Retry button, not a spinner
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` green

## Risks / open questions
- **File-snapshot undo is lost.** OpenCode could revert file edits per message. The direct path has approval cards for `fs_write`/`shell_run` and Dexie-level undo for workspace-tool changes, but not file undo. *Mitigation default:* P6's git panel (diff + discard) is the file undo; chat shows "Review in Git" after an `fs_write`. Q-P1b-1: add a small per-message file snapshot ledger (`fs_write` already knows the old content)? *Default: no, ship P6 diff/discard.*
- **Subscription-login providers** (Hermes supports OAuth for some vendors) are out: API key / local / custom endpoint only in 0.2.0.0. Q-P1b-2.
- **Multi-key pooling per provider** (Hermes credential pool) is out; two connections for the same provider plus the fallback chain gives the same result manually.
- **Tool support varies by model.** Unknown models default to "tools on" (existing behaviour); `/api/chat` already retries without tools on rejection.
- **models.dev fetch is optional** (offline → `FALLBACK_CATALOG`); keep the fallback list current for the top providers.
