# Echo-Strip Hardening — Unicode Support & Divergence Safety

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix two verified bugs in the new (uncommitted) chat echo-stripper — non-Latin (Arabic) messages are never stripped, and after a divergence the stripper eats characters from later deltas — then verify the whole unit suite, lint, and typecheck.

**Architecture:** All changes are confined to one pure module, `src/lib/chat/echo-strip.ts`, plus its unit test. The streaming integration in `chat-view.tsx` (both send paths) and the system-prompt line in `context.ts` are already in the working tree and correct — no integration work is needed. Each fix is TDD: failing test first, minimal change, green, commit.

**Tech Stack:** TypeScript (strict, target ES2017), Vitest 4 (`tests/vitest.config.ts`, node environment), pnpm. No new dependencies.

---

## Current context (verified, not assumed)

The working tree contains an uncommitted feature: some models restate the user's message before answering, and a new stripper removes that leading echo from streamed replies.

| File | State |
|---|---|
| `src/lib/chat/echo-strip.ts` | NEW — stateful stripper (`strip`/`reset`), 84 lines |
| `tests/unit/lib/chat/echo-strip.test.ts` | NEW — 10 tests, **all passing** |
| `src/components/chat/chat-view.tsx` | MODIFIED — stripper wired into **both** send paths (OpenCode path at ~line 998, direct path at ~line 1322); `echoStripper.reset()` on the `resumed` event (line 1125). Complete. |
| `src/lib/ai/context.ts` | MODIFIED — one line added to `buildAssistantSystemPrompt`: "Answer directly: never repeat, restate, or echo the user's message back…" (line 622) |
| `tests/unit/lib/ai/context.test.ts` | MODIFIED — new test asserting that prompt line. Passing. |

Baseline check run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts tests/unit/lib/ai/context.test.ts --config tests/vitest.config.ts` → **2 files, 18 tests passed**.

### Bug evidence (from running the real module with `node --experimental-strip-types`)

| Probe | Input → Output | Expected | Verdict |
|---|---|---|---|
| Latin echo | `strip("What can you see? hello")` | `"hello"` | ✅ works |
| Arabic echo | `createEchoStripper("ماذا ترى الآن؟").strip("ماذا ترى الآن؟ أرى مساحة العمل.")` | `"أرى مساحة العمل."` | ❌ returned the **full echo unchanged** |
| Divergence, next delta | `strip("What can you fix?")` → `"fix?"`, then `strip("seen any bugs?")` | `"seen any bugs?"` | ❌ returned `"n any bugs?"` — lost `"see"` |

**Root cause A:** `norm()` strips non-echo chars with `replace(/[^\w\s]/g, "")`. `\w` is ASCII-only, so Arabic text normalizes to `""` and the stripper no-ops. Worse, fixing only `norm()` is catastrophic: the matching loop's `if (!/[\w]/.test(c)) { i++; continue; }` *drops* every non-`\w` delta char as punctuation, so Arabic deltas would be silently swallowed. Both char classes must become unicode-aware together.

**Root cause B:** A mismatch breaks the matching loop but leaves `pos` mid-target. The *next* delta re-enters matching from the stale `pos` and silently consumes leading characters that happen to continue the target remainder (`"seen any bugs?"` continues `"…you see?"`). Divergence must permanently disarm the stripper.

**Runtime compatibility (verified):** `tsc --strict --target es2017` accepts `\p{L}`/`\p{N}` with the `u` flag (TS 5.9, probe passed with exit 0). Runtime support: Chrome 64+/Edge 79+/Firefox 78+/Safari 11.1+, Node ≥ 10 — Electron and Next 16 are fine.

---

## Files likely to change

- Modify: `src/lib/chat/echo-strip.ts`
- Modify: `tests/unit/lib/chat/echo-strip.test.ts`

Nothing else. Do not touch `chat-view.tsx` or `context.ts`.

---

### Task 0: Commit the working baseline

**Objective:** Snapshot the already-green feature before hardening, so each fix is a clean, revertable commit.

**Step 1: Confirm the two affected test files pass**

Run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts tests/unit/lib/ai/context.test.ts --config tests/vitest.config.ts`
Expected: `Test Files  2 passed (2)`, `Tests  18 passed (18)`

**Step 2: Commit**

```bash
git add src/lib/chat/echo-strip.ts tests/unit/lib/chat/echo-strip.test.ts \
  src/components/chat/chat-view.tsx src/lib/ai/context.ts tests/unit/lib/ai/context.test.ts
git commit -m "feat: strip echoed user message from streamed chat replies"
```

> If the user prefers to commit themselves, skip Task 0 and keep the fixes as separate working-tree changes.

---

### Task 1: Unicode-aware matching (Arabic + all scripts)

**Objective:** The stripper must engage for non-Latin user messages instead of no-oping.

**Files:**
- Modify: `src/lib/chat/echo-strip.ts` (`norm` + matching loop char classes)
- Test: `tests/unit/lib/chat/echo-strip.test.ts`

**Step 1: Write failing tests**

Append inside the existing `describe("createEchoStripper", …)` block:

```ts
it("strips an echo in a non-Latin script (Arabic)", () => {
  const s = createEchoStripper("ماذا ترى الآن؟");
  expect(s.strip("ماذا ترى الآن؟ أرى مساحة العمل.")).toBe("أرى مساحة العمل.");
});

it("strips an Arabic echo across chunk boundaries", () => {
  const s = createEchoStripper("ماذا ترى الآن؟");
  expect(s.strip("ماذا ترى")).toBe("");
  expect(s.strip(" الآن؟ الجواب:")).toBe("الجواب:");
  expect(s.strip("والتفاصيل")).toBe("والتفاصيل");
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts --config tests/vitest.config.ts`
Expected: FAIL — the two new tests get the full echo back (e.g. `"ماذا ترى الآن؟ أرى مساحة العمل."` instead of `"أرى مساحة العمل."`). The 10 existing tests still pass.

**Step 3: Implement** — rewrite `src/lib/chat/echo-strip.ts` in full with this content (Task 3's `dead` flag is intentionally NOT included yet; this task is norm + char classes only):

```ts
/**
 * Some models restate the user's message before answering (e.g. they open a
 * reply to "What can you see?" with "What can you see? …"). That echo is
 * noise in the chat. `createEchoStripper` builds a stateful stripper that
 * removes a leading verbatim copy of the user's message from a streaming
 * reply, tolerating case, punctuation, and whitespace differences, and chunk
 * boundaries (a delta can end mid-word). Once the echo is fully consumed (or
 * provably diverged), all later text passes through untouched. `reset()`
 * re-arms it for a fresh stream (e.g. a resume replaying a snapshot).
 */

export interface EchoStripper {
  strip: (delta: string) => string;
  reset: () => void;
}

/** Lowercase, collapse whitespace, drop punctuation — for echo comparison. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    // Letters and digits from every script (Arabic, CJK, Cyrillic, …) are
    // echo content; only punctuation and symbols are dropped. ASCII-only \w
    // would normalize a whole Arabic message to "" and disable the stripper.
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Chars skipped after the echo completes: whitespace + echo punctuation. */
const BOUNDARY_SKIP = /[\s.,!?;:…'"`)\]}>؟،؛]/;

export function createEchoStripper(userText: string): EchoStripper {
  const target = norm(userText);
  let pos = 0;

  return {
    strip: (delta: string) => {
      if (!target) return delta;
      let out = "";
      let i = 0;

      // Matching phase: consume the echo, skipping whitespace on both sides
      // and any punctuation the model may add or drop ("what can you see"
      // matches "What can you see?" and "whatcanyousee").
      while (i < delta.length && pos < target.length) {
        const c = delta[i];
        if (/\s/.test(c)) {
          i++;
          continue;
        }
        if (/\s/.test(target[pos])) {
          pos++;
          continue;
        }
        if (!/[\p{L}\p{N}]/u.test(c)) {
          i++;
          continue;
        }
        if (c.toLowerCase() === target[pos]) {
          pos++;
          i++;
          continue;
        }
        break;
      }

      // Boundary phase: the echo is consumed. Skip whitespace and the echo's
      // trailing punctuation (the "?" in "What can you see?") so the answer
      // starts clean; anything else is real content.
      while (i < delta.length && pos >= target.length) {
        if (BOUNDARY_SKIP.test(delta[i])) {
          i++;
          continue;
        }
        break;
      }

      if (pos >= target.length && i < delta.length) {
        out += delta.slice(i);
      } else if (pos < target.length) {
        // Diverged mid-echo — keep everything from the mismatch onward.
        out += delta.slice(i);
      }
      return out;
    },
    reset: () => {
      pos = 0;
    },
  };
}
```

Three changes vs. the current file: (1) `norm` drops `[^\p{L}\p{N}\s]` instead of `[^\w\s]`; (2) the matching loop's word-char test is `/[\p{L}\p{N}]/u` instead of `/[\w]/`; (3) `BOUNDARY_SKIP` gains the Arabic punctuation `؟ ، ؛` so a trailing `؟` is skipped like `?`.

**Step 4: Run to verify pass**

Run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts --config tests/vitest.config.ts`
Expected: PASS — all 12 tests green.

**Step 5: Commit**

```bash
git add src/lib/chat/echo-strip.ts tests/unit/lib/chat/echo-strip.test.ts
git commit -m "fix: echo stripper supports non-Latin scripts (unicode property classes)"
```

---

### Task 2: Permanent disarm on divergence

**Objective:** After the echo provably diverges, later deltas must never be touched (fixes the `"seen any bugs?" → "n any bugs?"` data loss).

**Files:**
- Modify: `src/lib/chat/echo-strip.ts` (add `dead` flag)
- Test: `tests/unit/lib/chat/echo-strip.test.ts`

**Step 1: Write failing tests**

Append inside the `describe` block:

```ts
it("never touches later deltas once the echo diverges", () => {
  const s = createEchoStripper("What can you see?");
  expect(s.strip("What can you fix?")).toBe("fix?");
  expect(s.strip("seen any bugs?")).toBe("seen any bugs?");
});

it("disarms permanently when a partial echo diverges", () => {
  const s = createEchoStripper("What can you see?");
  expect(s.strip("What can yo")).toBe("");
  expect(s.strip("u help")).toBe("help"); // "u " still matched as echo, then divergence
  expect(s.strip(" me please")).toBe(" me please"); // disarmed — untouched
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts --config tests/vitest.config.ts`
Expected: FAIL — first new test gets `"n any bugs?"` (expected `"seen any bugs?"`); second gets `" me please"` mangled (e.g. `"e please"`).

**Step 3: Implement** — three edits to `src/lib/chat/echo-strip.ts`:

Edit 1 — declare the flag next to `pos`:

```ts
export function createEchoStripper(userText: string): EchoStripper {
  const target = norm(userText);
  let pos = 0;
  // Set the first time matching provably diverges. From then on the echo
  // either never existed or is already over — every later delta is real
  // content and must pass through untouched (otherwise a later delta whose
  // start happens to continue the stale target loses characters).
  let dead = false;
```

Edit 2 — return untouched once dead:

```ts
    strip: (delta: string) => {
      if (!target || dead) return delta;
```

Edit 3 — set it at the mismatch, and clear it in `reset`:

```ts
        if (c.toLowerCase() === target[pos]) {
          pos++;
          i++;
          continue;
        }
        dead = true;
        break;
```

```ts
    reset: () => {
      pos = 0;
      dead = false;
    },
```

Note: the divergence call itself still returns the remainder (`"fix?"`) exactly as before — `dead` only affects *subsequent* calls, so the existing "stops stripping once the echo diverges" test keeps passing unchanged.

**Step 4: Run to verify pass**

Run: `pnpm vitest run tests/unit/lib/chat/echo-strip.test.ts --config tests/vitest.config.ts`
Expected: PASS — all 14 tests green.

**Step 5: Commit**

```bash
git add src/lib/chat/echo-strip.ts tests/unit/lib/chat/echo-strip.test.ts
git commit -m "fix: echo stripper disarms permanently after divergence"
```

---

### Task 3: Full verification sweep

**Objective:** Prove the hardening broke nothing anywhere in the repo.

**Step 1:** `pnpm test` — Expected: every test file passes (unit suite includes `tests/unit/lib/chat/echo-strip.test.ts`, `tests/unit/lib/ai/context.test.ts`, chat route/streaming tests, etc.).

**Step 2:** `pnpm lint` — Expected: exit 0, no findings.

**Step 3:** `pnpm typecheck` — Expected: exit 0. (This also validates that the `\p{…}` regexes compile under the project's real `tsconfig.json`, target ES2017.)

**Step 4 (optional, before merge):** `pnpm build` — Expected: production build succeeds.

**Step 5 (optional, manual):** `pnpm dev` → open `/chat`, ask a question against an echo-prone model; confirm the reply starts with the answer, and test an Arabic question (`ماذا ترى الآن؟`) for correct stripping.

---

## Tests / validation summary

- Unit: `pnpm test` (vitest, node env, `tests/unit/**`) — the only automated gate this change needs; the module is pure and dependency-free.
- Type: `pnpm typecheck` — validates the ES2017-target regex syntax.
- Lint: `pnpm lint`.
- Manual smoke (optional): dev-server chat with an echo-prone model, English + Arabic.

## Risks, tradeoffs, open questions

- **Paraphrased echoes won't strip** — permanent disarm trades a little stripping power for zero data loss. A model that paraphrases the question ("You're asking what I can see…") was never stripped before either; behavior is unchanged, not worse.
- **False-positive echo** — if a user asks "reply with exactly: <X>", the reply's leading `<X>` will be eaten when it matches the message. Pre-existing tradeoff in the design; the divergence disarm bounds the damage to the echo-length prefix. A length/position guard is deliberately not added (YAGNI) — revisit if it bites in practice.
- **Unicode property escapes** — compile fine at target ES2017 (verified); runtime floor Chrome 64 / Node 10. MasarFlow runs in Electron + Next 16, so no constraint.
- **Prompt-line coverage gap (open question)** — the "Answer directly…" system line only reaches agentic turns (`buildAgentSystemPrompt` → `buildAssistantSystemPrompt`); plain non-agentic chat sends no system prompt at all, relying on the stripper alone. Decided YAGNI for now; if echo noise reappears in plain chat, add the line to that path's prompt too.
- **`reset()` clears `dead`** — intentional: a `resumed` snapshot replay must be able to strip again from a clean slate (matches the existing reset contract).
