# MasarFlow v0.2.0.0 — P5: Cross-page fabric + chat awareness

> **For Hermes:** execute with `subagent-driven-development`, one task at a time. Read the master plan (`…-master.md`) §1, §4 (D7, D8) and §6 first.
> **Depends on:** P3 (local embeddings: `retrieveRagChunks`, Dexie v11) and P4 (`src/lib/db/dirty.ts`). **Branch:** `release/v0.2.0`.

**Goal:** Every page speaks one entity language (`EntityRef` → route → dock), every write is recorded, and the chat is told — on every turn — what the user has open, what is linked to what, what changed recently, and can open/inspect things itself.

**Architecture:** One pure registry (`src/lib/entities/registry.ts`) maps `{kind,id}` ⇄ URL. `openEntity()` goes through the existing dock store. "What the user is looking at" is **derived from the dock state** (no per-page wiring). Dexie hooks feed an `activity` table. The context engine (`src/lib/ai/context.ts`) gains a *Currently open* section, snapshot v2 sections and all-kind RAG; four new workspace tools expose the same data to the model.

## Findings that shape this phase (verified 2026-10-16 by reading code or running it)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| A1 | `entityKindSchema` has 8 kinds; standards, sprints, devlogs, canvases, agents, chat threads cannot be linked or referenced. Tool defs duplicate the enum inline (2×, `create_link`). | `src/lib/db/schema.ts:88`, `src/lib/ai/workspace-tool-defs.ts` | T2 widens schema + defs together; a parity test keeps them in sync |
| A2 | Deep-link params exist for only 8 kinds: `note task spec system doc standard canvas thread`. **No** `sprint`, `devlog`, `agent` param. | grep of `searchParams.get` | T4 adds them |
| A3 | **Four** hand-written copies of "entity → route": `entityHref` in `src/components/sync/sync-view.tsx:96`, `refHref` in `src/components/devlogs/devlogs-view.tsx:60`, `routes` in `src/components/brain/knowledge-graph.tsx:364`, and 8 literal `href:` template strings in `src/lib/utils/search.ts:74-144` (dev-log search hits go to a bare `/devlogs`) | grep | T6b replaces three, T6c the fourth (DRY) |
| A4 | **Wikilinks in the markdown preview are broken.** react-markdown 10.1.0's default `urlTransform` blanks every non-http(s)/mailto protocol, so `href="wikilink:Foo"` arrives as `""` and `href.startsWith("wikilink:")` (`src/components/brain/markdown-preview.tsx:181`) is never true. Same for the `img` branch at line 130. | **Ran** `renderToStaticMarkup` with react-markdown: default → `data-href=""`; with `urlTransform={u=>u}` → `wikilink:Foo` | T6a fixes it; `entity:` links need the same fix anyway |
| A5 | The dock keeps a per-panel **query snapshot**; `applyUrlFocus(state, "/x")` with an *empty* query deliberately leaves the snapshot alone (pinned by test "does not touch params when the URL has no query", `tests/unit/lib/dock/dock-core.test.ts:166`). So `router.replace("/standards")` to "deselect" gets reverted by `use-dock-sync` to the stale snapshot. | `src/lib/dock/dock-core.ts:134-138`, `src/lib/hooks/use-dock-sync.ts` | Pages must clear a selection with an **explicit empty value** (`?sprint=`). T3 encodes this once in `useUrlSelection` |
| A6 | Hidden dock panels stay mounted (keep-alive) but `useSearchParams` always returns the *focused* panel's URL. A URL-driven selection would therefore read `null` while the panel is hidden and unmount its editor (losing drafts). | `src/components/dock/panel-content.tsx`, `use-dock-sync.ts` | `useUrlSelection` keeps the last value while another page is focused (T3, pure `selectionFor`) |
| A7 | Context sections are pushed in priority order under a character budget (`push()` drops what does not fit) — anything pushed late can vanish. `WorkspaceSnapshot` is built by the test helper `snapshot()` in `tests/unit/lib/ai/context.test.ts`. | `src/lib/ai/context.ts:247-254` | "Currently open" is pushed **first**; new snapshot fields are **optional** so existing tests keep compiling |
| A8 | Vitest only includes `tests/unit/**/*.test.ts` (node env, no jsdom, **no `.tsx` tests**). | `tests/vitest.config.ts` | All logic lives in `.ts` modules with tests; `.tsx` is thin and verified by `pnpm typecheck` + the guard tests below |
| A9 | `executeWorkspaceTool` never throws, returns a JSON string; helpers `s() n() arr()` parse args; every case is inside one `switch` ending in `default: return fail("Unknown tool")`. The Agent Loop receives `WORKSPACE_TOOLS` directly (tests use `WORKSPACE_TOOLS.length`, not a literal). | `src/lib/ai/tools.ts:120-150, 1266`, `tests/unit/lib/ai/toolgen.test.ts:16` | New tools = defs entry + one `case` each; nothing else to register |
| A10 | Commits and memories are shown on `/dashboard` (`dashboard-view.tsx`); the knowledge graph and global search already send them there | `knowledge-graph.tsx:369`, `search.ts:114` | registry maps `commit` and `memory` to `/dashboard` — behaviour preserved |

**Decision (YAGNI):** no separate event bus. Dexie `useLiveQuery` already re-renders every page when any table changes; the single automation rule we need (T13) hooks Dexie directly. Master §4 D7 is amended accordingly.

## File map (all new unless marked)

```
src/lib/entities/registry.ts        pure: kinds, href, refFromUrl, entity: uris
src/lib/entities/url.ts             pure: withSelection / readSelection / selectionFor
src/lib/entities/resolve.ts         titleOfEntity(ref) via Dexie
src/lib/entities/open.ts            openEntity(ref) -> dock store
src/lib/entities/backlinks.ts       pure computeBacklinks
src/lib/hooks/use-url-selection.ts  hook (A5/A6)
src/components/entities/entity-chip.tsx
src/components/entities/backlinks-section.tsx
src/lib/utils/markdown-url.ts       pure urlTransform (A4)
src/lib/activity/describe.ts        pure: row -> activity draft, throttle
src/lib/activity/track.ts           Dexie hooks + queue + automation rule
src/lib/db/repos/activity.ts
src/lib/hooks/use-activity-tracking.ts
src/lib/ai/active-context.ts        pure: dock state -> ActiveContext -> text
MODIFIED: src/lib/db/schema.ts, src/lib/db/index.ts, src/lib/db/dirty.ts, src/lib/db/repos/index.ts,
          src/lib/ai/workspace-tool-defs.ts, src/lib/ai/tools.ts, src/lib/ai/context.ts,
          src/components/brain/markdown-preview.tsx, src/lib/utils/search.ts, src/lib/db/backup.ts (P4), src/lib/db/demo-seed.ts,
          sprints-view, agents-view, devlogs-view,
          sync-view, knowledge-graph, 4 editors (backlinks), chat-view (send-to),
          src/app/(workspace)/layout.tsx
```

---

## P5.T1 — Entity registry (pure, TDD, ≈6 min)

**Failing test — create `tests/unit/lib/entities/registry.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import {
  ENTITY_KINDS,
  KIND_META,
  entityHref,
  entityUri,
  isEntityKind,
  parseEntityUri,
  refFromUrl,
} from "@/lib/entities/registry";
import { PAGE_PATHS } from "@/lib/dock/registry";

describe("entityHref", () => {
  it("selects the entity on the page that shows it", () => {
    expect(entityHref({ kind: "note", id: "n1" })).toBe("/brain?note=n1");
    expect(entityHref({ kind: "canvas", id: "c1" })).toBe("/brain/canvas?canvas=c1");
    expect(entityHref({ kind: "system", id: "s1" })).toBe("/architecture?system=s1");
    expect(entityHref({ kind: "thread", id: "t1" })).toBe("/chat?thread=t1");
  });
  it("encodes ids", () => {
    expect(entityHref({ kind: "task", id: "a b&c" })).toBe("/tasks?task=a%20b%26c");
  });
  it("kinds without a selection param open their page bare", () => {
    expect(entityHref({ kind: "commit", id: "x" })).toBe("/dashboard");
    expect(entityHref({ kind: "memory", id: "x" })).toBe("/dashboard");
    expect(entityHref({ kind: "archNode", id: "x" })).toBe("/architecture");
  });
});

describe("refFromUrl", () => {
  it("round-trips every kind that has a param", () => {
    for (const kind of ENTITY_KINDS) {
      if (!KIND_META[kind].param) continue;
      const [path, query = ""] = entityHref({ kind, id: "id 1" }).split("?");
      expect(refFromUrl(path, query)).toEqual({ kind, id: "id 1" });
    }
  });
  it("returns null when nothing is selected", () => {
    expect(refFromUrl("/tasks", "")).toBeNull();
    expect(refFromUrl("/tasks", "task=")).toBeNull(); // explicit-empty = cleared (see A5)
    expect(refFromUrl("/dashboard", "task=abc")).toBeNull(); // param on the wrong page
  });
});

describe("entity uris", () => {
  it("round-trips", () => {
    const ref = { kind: "spec", id: "a/b c" } as const;
    expect(entityUri(ref)).toBe("entity:spec/a%2Fb%20c");
    expect(parseEntityUri(entityUri(ref))).toEqual(ref);
  });
  it("rejects unknown kinds and malformed input", () => {
    expect(parseEntityUri("entity:bogus/1")).toBeNull();
    expect(parseEntityUri("https://x.dev")).toBeNull();
    expect(parseEntityUri("entity:note/%E0%A4%A")).toBeNull();
  });
  it("isEntityKind narrows", () => {
    expect(isEntityKind("note")).toBe(true);
    expect(isEntityKind("nope")).toBe(false);
  });
});

describe("registry integrity", () => {
  it("every route is a real dock page", () => {
    for (const kind of ENTITY_KINDS) {
      expect(PAGE_PATHS, kind).toContain(KIND_META[kind].route);
    }
  });
  it("no two kinds claim the same route + param", () => {
    const seen = new Set<string>();
    for (const kind of ENTITY_KINDS) {
      const { route, param } = KIND_META[kind];
      if (!param) continue;
      const key = `${route}?${param}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});
```

Run: `pnpm test -- tests/unit/lib/entities/registry.test.ts`
Expected: **FAIL** — `Failed to resolve import "@/lib/entities/registry"`.

**Create `src/lib/entities/registry.ts`:**

```ts
/**
 * The one place that knows how an entity maps to a page. Pure TypeScript:
 * no React, no Dexie, no Next — safe in node tests and server code.
 *
 * Order of ENTITY_KINDS must equal `entityKindSchema.options` (guarded by
 * tests/unit/lib/entities/kinds-parity.test.ts).
 */

export const ENTITY_KINDS = [
  "note",
  "spec",
  "task",
  "system",
  "commit",
  "memory",
  "doc",
  "archNode",
  "standard",
  "sprint",
  "devlog",
  "canvas",
  "agent",
  "thread",
] as const;

export type EntityKindId = (typeof ENTITY_KINDS)[number];

export interface EntityRef {
  kind: EntityKindId;
  id: string;
}

export interface KindMeta {
  /** Human label, singular. */
  label: string;
  /** The page that shows this kind (must be a dock page). */
  route: string;
  /** Query param that selects one entity on that page; null = page has none. */
  param: string | null;
}

export const KIND_META: Record<EntityKindId, KindMeta> = {
  note: { label: "Note", route: "/brain", param: "note" },
  spec: { label: "Spec", route: "/specs", param: "spec" },
  task: { label: "Task", route: "/tasks", param: "task" },
  system: { label: "System", route: "/architecture", param: "system" },
  commit: { label: "Commit", route: "/dashboard", param: null },
  memory: { label: "Memory", route: "/dashboard", param: null },
  doc: { label: "Doc", route: "/docs", param: "doc" },
  archNode: { label: "Architecture node", route: "/architecture", param: null },
  standard: { label: "Standard", route: "/standards", param: "standard" },
  sprint: { label: "Sprint", route: "/sprints", param: "sprint" },
  devlog: { label: "Dev log", route: "/devlogs", param: "devlog" },
  canvas: { label: "Canvas", route: "/brain/canvas", param: "canvas" },
  agent: { label: "Agent", route: "/agents", param: "agent" },
  thread: { label: "Chat", route: "/chat", param: "thread" },
};

export function isEntityKind(value: unknown): value is EntityKindId {
  return typeof value === "string" && (ENTITY_KINDS as readonly string[]).includes(value);
}

/** URL (path + query) that shows `ref`. */
export function entityHref(ref: EntityRef): string {
  const meta = KIND_META[ref.kind];
  return meta.param
    ? `${meta.route}?${meta.param}=${encodeURIComponent(ref.id)}`
    : meta.route;
}

/**
 * Inverse of entityHref: which entity does (path, query) select?
 * An empty value (`task=`) means "cleared" and yields null.
 */
export function refFromUrl(path: string, query: string): EntityRef | null {
  const params = new URLSearchParams(query);
  for (const kind of ENTITY_KINDS) {
    const meta = KIND_META[kind];
    if (!meta.param || meta.route !== path) continue;
    const id = params.get(meta.param);
    if (id) return { kind, id };
  }
  return null;
}

/** `entity:note/<id>` — the link scheme used inside markdown (chat replies, notes). */
export function entityUri(ref: EntityRef): string {
  return `entity:${ref.kind}/${encodeURIComponent(ref.id)}`;
}

export function parseEntityUri(uri: string): EntityRef | null {
  const m = /^entity:([A-Za-z]+)\/(.+)$/.exec(uri);
  if (!m || !isEntityKind(m[1])) return null;
  try {
    return { kind: m[1], id: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}
```

Run → PASS (`Tests  9 passed`). `pnpm typecheck` clean.
Commit: `feat(entities): pure entity registry (kind -> route, href, uri)`

## P5.T2 — Widen `EntityKind` + keep tool enums in sync (TDD, ≈6 min)

**Failing test — create `tests/unit/lib/entities/kinds-parity.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { entityKindSchema } from "@/lib/db/schema";
import { ENTITY_KINDS } from "@/lib/entities/registry";
import { WORKSPACE_TOOLS } from "@/lib/ai/workspace-tool-defs";

function enumOf(tool: string, prop: string): string[] {
  const def = WORKSPACE_TOOLS.find((t) => t.name === tool);
  const props = (def!.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
  return props[prop].enum!;
}

describe("entity kinds stay in sync", () => {
  it("registry == zod schema (same order)", () => {
    expect([...ENTITY_KINDS]).toEqual([...entityKindSchema.options]);
  });
  it("create_link accepts every kind", () => {
    expect(enumOf("create_link", "sourceType")).toEqual([...entityKindSchema.options]);
    expect(enumOf("create_link", "targetType")).toEqual([...entityKindSchema.options]);
  });
});
```

Run: `pnpm test -- tests/unit/lib/entities/kinds-parity.test.ts` → **FAIL** (`expected [8 kinds] to deeply equal [14 kinds]`).

**Edit `src/lib/db/schema.ts`** — replace the `entityKindSchema` body:

```ts
export const entityKindSchema = z.enum([
  "note",
  "spec",
  "task",
  "system",
  "commit",
  "memory",
  "doc",
  "archNode",
  "standard",
  "sprint",
  "devlog",
  "canvas",
  "agent",
  "thread",
]);
```

**Edit `src/lib/ai/workspace-tool-defs.ts`:** directly above `export const WORKSPACE_TOOLS` add (this module must stay import-free, so the list is duplicated on purpose — the test above guards it):

```ts
const ENTITY_KIND_VALUES = [
  "note", "spec", "task", "system", "commit", "memory", "doc", "archNode",
  "standard", "sprint", "devlog", "canvas", "agent", "thread",
] as const;
```

In `create_link`, replace the two inline 8-element arrays with `ENTITY_KIND_VALUES` (`enumOf(ENTITY_KIND_VALUES, "Source entity kind.")` and `"Target entity kind."`).

Run: `pnpm test -- tests/unit/lib/entities` → PASS. Then `pnpm typecheck` — if any `Record<EntityKind, …>` elsewhere is now non-exhaustive the compiler names it; add the missing keys (known `Partial<Record<EntityKind,…>>` in `sync-view.tsx:91` needs nothing). Then full `pnpm test` → green.
Commit: `feat(db): link/reference 6 more entity kinds (standard sprint devlog canvas agent thread)`

## P5.T3 — URL selection helpers + hook (pure part TDD, ≈8 min)

**Failing test — create `tests/unit/lib/entities/url.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { readSelection, selectionFor, withSelection } from "@/lib/entities/url";
import { applyUrlFocus } from "@/lib/dock/dock-core";
import { defaultProjectState } from "@/lib/dock/presets";

describe("withSelection / readSelection", () => {
  it("sets the param and preserves others", () => {
    expect(withSelection("", "task", "t1")).toBe("task=t1");
    expect(withSelection("a=1&task=old", "task", "t2")).toBe("a=1&task=t2");
  });
  it("clearing writes an explicit empty value, never removes the key", () => {
    expect(withSelection("task=t1", "task", null)).toBe("task=");
  });
  it("reads empty as no selection", () => {
    expect(readSelection("task=t1", "task")).toBe("t1");
    expect(readSelection("task=", "task")).toBeNull();
    expect(readSelection("", "task")).toBeNull();
  });
});

describe("selectionFor (hidden panels keep their last selection — finding A6)", () => {
  it("uses the URL while the page is focused", () => {
    expect(selectionFor("/sprints", "/sprints", "sprint=s1", "sprint", "old")).toBe("s1");
    expect(selectionFor("/sprints", "/sprints", "sprint=", "sprint", "old")).toBeNull();
  });
  it("keeps the last value while another page is focused", () => {
    expect(selectionFor("/tasks", "/sprints", "task=t1", "sprint", "s1")).toBe("s1");
  });
});

describe("dock contract this relies on (finding A5)", () => {
  it("an explicit empty param overwrites a stored snapshot; a bare path does not", () => {
    let s = defaultProjectState();
    s = applyUrlFocus(s, "/sprints?sprint=s1");
    expect(s.workspaces[s.activeWorkspace].params["/sprints"]).toBe("sprint=s1");
    const bare = applyUrlFocus(s, "/sprints");
    expect(bare.workspaces[bare.activeWorkspace].params["/sprints"]).toBe("sprint=s1");
    const cleared = applyUrlFocus(s, "/sprints?sprint=");
    expect(cleared.workspaces[cleared.activeWorkspace].params["/sprints"]).toBe("sprint=");
  });
});
```

Run → **FAIL** (`Failed to resolve import "@/lib/entities/url"`).

**Create `src/lib/entities/url.ts`:**

```ts
/** Pure helpers for URL-driven selection (?task=…, ?sprint=…). */

/** New search string selecting `id` for `param`. `null` writes an EXPLICIT empty value:
 * the dock keeps a per-panel snapshot and only an explicit value overrides it. */
export function withSelection(search: string, param: string, id: string | null): string {
  const next = new URLSearchParams(search);
  next.set(param, id ?? "");
  return next.toString();
}

export function readSelection(search: string, param: string): string | null {
  return new URLSearchParams(search).get(param) || null;
}

/**
 * The selection a (possibly hidden) page should show. `pathname` is the URL of the
 * FOCUSED panel; when it is not this page's `path`, keep `kept` (the last known value).
 */
export function selectionFor(
  pathname: string,
  path: string,
  search: string,
  param: string,
  kept: string | null,
): string | null {
  return pathname === path ? readSelection(search, param) : kept;
}
```

Run → PASS (`Tests 6 passed`).

**Create `src/lib/hooks/use-url-selection.ts`** (thin glue — verified by typecheck + T4's guard):

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readSelection, selectionFor, withSelection } from "@/lib/entities/url";

/**
 * Selection stored in the URL so it can be deep-linked and opened by openEntity().
 * `path` is THIS page's route (e.g. "/sprints"); it is explicit because under the
 * dock `usePathname()` is always the focused panel's path, not ours.
 */
export function useUrlSelection(
  path: string,
  param: string,
): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const onThisPage = pathname === path;
  const live = onThisPage ? readSelection(search, param) : null;
  const [kept, setKept] = useState<string | null>(live);
  useEffect(() => {
    if (onThisPage) setKept(live);
  }, [onThisPage, live]);

  const select = useCallback(
    (id: string | null) => {
      const base = onThisPage ? search : "";
      router.replace(`${path}?${withSelection(base, param, id)}`, { scroll: false });
      setKept(id);
    },
    [router, path, param, search, onThisPage],
  );

  return [selectionFor(pathname, path, search, param, kept), select];
}
```

Run `pnpm typecheck` → clean. Commit: `feat(entities): URL selection helpers + useUrlSelection (dock-safe)`

## P5.T4 — Deep links for sprints, agents, dev logs (guard-first, ≈8 min)

**Failing guard — create `tests/unit/lib/entities/deep-links.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { ENTITY_KINDS, KIND_META } from "@/lib/entities/registry";
import { readSources } from "../../_helpers/fs-scan";

const views = readSources().filter((s) => s.path.startsWith("src/components/"));

describe("every deep-link param is actually read by a view", () => {
  for (const kind of ENTITY_KINDS) {
    const { param } = KIND_META[kind];
    if (!param) continue;
    it(`${kind}: a view reads "${param}"`, () => {
      const viaGet = (t: string) => t.includes(`get("${param}")`);
      const viaHook = (t: string) =>
        new RegExp(`useUrlSelection\\(\\s*"[^"]+",\\s*"${param}"\\s*\\)`).test(t);
      expect(views.some((v) => viaGet(v.text) || viaHook(v.text))).toBe(true);
    });
  }
});
```

(`tests/unit/_helpers/fs-scan.ts` was created in P0.T2.) Run → **FAIL** for `sprint`, `agent`, `devlog` (3 failures).

**Edit `src/components/sprints/sprints-view.tsx`:** add `import { useUrlSelection } from "@/lib/hooks/use-url-selection";` and replace line 68

`const [selectedId, setSelectedId] = useState<string | null>(null);`
with
`const [selectedId, setSelectedId] = useUrlSelection("/sprints", "sprint");`

(`setSelectedId(null)` at line ~93 keeps working: it clears via the explicit-empty rule. `useState` stays imported — it is used further down.)

**Edit `src/components/agents/agents-view.tsx`:** same import; replace line 57 with
`const [selectedId, setSelectedId] = useUrlSelection("/agents", "agent");`

**Edit `src/components/devlogs/devlogs-view.tsx`** (no selection exists; add a highlight): import `useUrlSelection` and `cn` (already imported? check — add `import { cn } from "@/lib/utils/cn";` if not), inside the main component add

```tsx
const [focusId] = useUrlSelection("/devlogs", "devlog");
useEffect(() => {
  if (!focusId) return;
  document.getElementById(`devlog-${focusId}`)?.scrollIntoView({ block: "center" });
}, [focusId, logs.length]);
```

(`logs` = whatever array the component passes to `groupLogs(...)`; use that name. Add `useEffect` to the `react` import.) On the element that renders ONE log row set `id={`devlog-${log.id}`}` and add `log.id === focusId && "ring-1 ring-primary"` to its `cn(...)`.

Run `pnpm test -- tests/unit/lib/entities/deep-links.test.ts` → PASS (`8 passed`). `pnpm typecheck` clean. `pnpm lint` → 0 errors.
Commit: `feat(pages): deep links for sprints, agents, dev logs`

## P5.T5 — `titleOfEntity` + `openEntity` (TDD, ≈7 min)

**Failing test — create `tests/unit/lib/entities/resolve-open.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notesRepo, tasksRepo } from "@/lib/db/repos";
import { titleOfEntity } from "@/lib/entities/resolve";
import { openEntity } from "@/lib/entities/open";
import { useDockStore } from "@/lib/stores/dock";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { collectPages } from "@/lib/dock/tree";
import { pageIdOf } from "@/lib/dock/types";

beforeEach(async () => {
  await db.delete();
  await db.open();
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
  useDockStore.getState().setProject("p1");
});

describe("titleOfEntity", () => {
  it("returns the display title, or null when the entity is gone", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "Auth design", body: "" });
    const task = await tasksRepo.create({ projectId: "p1", title: "Fix login" });
    expect(await titleOfEntity({ kind: "note", id: note.id })).toBe("Auth design");
    expect(await titleOfEntity({ kind: "task", id: task.id })).toBe("Fix login");
    expect(await titleOfEntity({ kind: "task", id: "missing" })).toBeNull();
  });
});

describe("openEntity", () => {
  const state = () => useDockStore.getState().getProject()!;
  it("focuses the page that shows it, entity selected", () => {
    openEntity({ kind: "task", id: "t1" });
    expect(urlOfFocused(state())).toBe("/tasks?task=t1");
  });
  it("re-targets an already-open page instead of duplicating it", () => {
    openEntity({ kind: "task", id: "t1" });
    openEntity({ kind: "task", id: "t2" });
    expect(urlOfFocused(state())).toBe("/tasks?task=t2");
    const s = state();
    const pages = collectPages(s.workspaces[s.activeWorkspace].tree).map(pageIdOf);
    expect(pages.filter((p) => p === "/tasks")).toHaveLength(1);
  });
  it("kinds without a param open the page bare", () => {
    openEntity({ kind: "commit", id: "c1" });
    expect(urlOfFocused(state())).toBe("/dashboard");
  });
});
```

Run → **FAIL** (cannot resolve `@/lib/entities/resolve`).

**Create `src/lib/entities/resolve.ts`:**

```ts
import { db } from "@/lib/db";
import type { EntityKindId, EntityRef } from "./registry";

const clip = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const TITLE: { [K in EntityKindId]: (id: string) => Promise<string | undefined> } = {
  note: async (id) => (await db.notes.get(id))?.title,
  spec: async (id) => (await db.specs.get(id))?.title,
  task: async (id) => (await db.tasks.get(id))?.title,
  system: async (id) => (await db.systems.get(id))?.name,
  commit: async (id) => {
    const c = await db.commits.get(id);
    return c ? clip(c.message.split("\n")[0]) : undefined;
  },
  memory: async (id) => {
    const m = await db.memories.get(id);
    return m ? clip(m.content) : undefined;
  },
  doc: async (id) => (await db.docs.get(id))?.title,
  archNode: async (id) => (await db.archNodes.get(id))?.label,
  standard: async (id) => (await db.standards.get(id))?.title,
  sprint: async (id) => (await db.sprints.get(id))?.name,
  devlog: async (id) => (await db.devLogs.get(id))?.title,
  canvas: async (id) => (await db.canvases.get(id))?.name,
  agent: async (id) => (await db.agents.get(id))?.name,
  thread: async (id) => (await db.chatThreads.get(id))?.title,
};

/** Display title of an entity, or null when it no longer exists. */
export async function titleOfEntity(ref: EntityRef): Promise<string | null> {
  return (await TITLE[ref.kind](ref.id)) ?? null;
}
```

**Create `src/lib/entities/open.ts`:**

```ts
import { useDockStore } from "@/lib/stores/dock";
import { entityHref, type EntityRef } from "./registry";

/** Show an entity: focus-or-open its page in the dock with the entity selected.
 * The URL <-> dock sync (use-dock-sync) mirrors the new focus into the address bar. */
export function openEntity(ref: EntityRef): void {
  useDockStore.getState().open(entityHref(ref));
}
```

Run → PASS (`Tests 4 passed`). `pnpm typecheck` clean (if `db.archNodes`/`db.canvases` property names differ, the compiler shows the real names — the table list is in `src/lib/db/index.ts`).
Commit: `feat(entities): titleOfEntity + openEntity`

## P5.T6a — Fix markdown URL transform (wikilinks + `entity:`; TDD, ≈6 min)

**Failing test — create `tests/unit/lib/utils/markdown-url.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { markdownUrlTransform } from "@/lib/utils/markdown-url";

describe("markdownUrlTransform", () => {
  it("keeps app schemes that react-markdown would blank", () => {
    expect(markdownUrlTransform("wikilink:Foo")).toBe("wikilink:Foo");
    expect(markdownUrlTransform("entity:task/abc")).toBe("entity:task/abc");
  });
  it("still sanitizes dangerous schemes", () => {
    expect(markdownUrlTransform("javascript:alert(1)")).toBe("");
    expect(markdownUrlTransform("data:text/html;base64,AAAA")).toBe("");
  });
  it("passes normal links through", () => {
    expect(markdownUrlTransform("https://masarflow.dev")).toBe("https://masarflow.dev");
    expect(markdownUrlTransform("/tasks?task=1")).toBe("/tasks?task=1");
  });
});
```

Run → **FAIL** (unresolved import). **Create `src/lib/utils/markdown-url.ts`:**

```ts
import { defaultUrlTransform } from "react-markdown";

const APP_SCHEMES = /^(wikilink|entity):/i;

/** react-markdown blanks every non-http(s)/mailto URL; MasarFlow's own schemes must survive. */
export function markdownUrlTransform(url: string): string {
  return APP_SCHEMES.test(url) ? url : defaultUrlTransform(url);
}
```

Run → PASS (3 passed).

## P5.T6b — `EntityChip` + render `entity:` links + replace duplicates (≈10 min)

**Create `src/components/entities/entity-chip.tsx`:**

```tsx
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { KIND_META, type EntityRef } from "@/lib/entities/registry";
import { titleOfEntity } from "@/lib/entities/resolve";
import { openEntity } from "@/lib/entities/open";
import { cn } from "@/lib/utils/cn";

/** Clickable reference to any entity. Title is live; a deleted entity renders struck-through. */
export function EntityChip({
  entity,
  className,
}: {
  entity: EntityRef;
  className?: string;
}) {
  const title = useLiveQuery(
    () => titleOfEntity(entity),
    [entity.kind, entity.id],
  );
  const meta = KIND_META[entity.kind];
  const missing = title === null;
  return (
    <button
      type="button"
      title={missing ? `${meta.label} no longer exists` : `Open ${meta.label}`}
      disabled={missing}
      onClick={() => openEntity(entity)}
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 align-baseline text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <span className="text-muted-foreground">{meta.label}</span>
      <span className={cn("truncate", missing && "line-through")}>
        {title === undefined ? "…" : (title ?? entity.id)}
      </span>
    </button>
  );
}
```

**Edit `src/components/brain/markdown-preview.tsx`:**
1. Imports: `import { markdownUrlTransform } from "@/lib/utils/markdown-url";`, `import { parseEntityUri } from "@/lib/entities/registry";`, `import { EntityChip } from "@/components/entities/entity-chip";`.
2. On `<ReactMarkdown` (line ~94) add the prop `urlTransform={markdownUrlTransform}` next to `remarkPlugins`. **This is the wikilink fix (A4).**
3. In the `a({ href, children, ...props })` renderer, insert **before** the `wikilink:` check:

```tsx
if (typeof href === "string" && href.startsWith("entity:")) {
  const ref = parseEntityUri(href);
  if (ref) return <EntityChip entity={ref} />;
}
```

**Replace the three duplicates (A3)** — behaviour is preserved except that previously link-less kinds now open their page:

- `src/components/sync/sync-view.tsx` — delete the local `function entityHref(type, id)` (lines 96–100) and add `import { entityHref } from "@/lib/entities/registry";`. At its single call site (line ≈1031) use
  ```tsx
  const href =
    file.entityType && file.entityId
      ? entityHref({ kind: file.entityType, id: file.entityId })
      : null;
  ```
- `src/components/devlogs/devlogs-view.tsx` — replace the body of `refHref` (lines 60–≈80, the `switch`) so the name and call sites stay unchanged:
  ```ts
  function refHref(refType: EntityKind | null, refId: string | null): string | null {
    return refType && refId ? entityHref({ kind: refType, id: refId }) : null;
  }
  ```
  and add the registry import. (`EntityKind` stays imported; the icon map above it still uses it.)
- `src/components/brain/knowledge-graph.tsx` — replace the whole local `openEntity` (lines 363–372: the `routes` table plus `router.push(routes[category])`) with
  ```ts
  function openNode(category: EntityCategory, refId: string) {
    openEntity({ kind: category, id: refId });
  }
  ```
  add `import { openEntity } from "@/lib/entities/open";`, rename the call sites (`grep -n "openEntity(" src/components/brain/knowledge-graph.tsx` — every hit except the one inside `openNode` becomes `openNode(`). `router` was only used on line 371, so delete `const router = useRouter();` (line 107) and drop `useRouter` from the `next/navigation` import (keep `useSearchParams`) — otherwise lint fails on an unused variable. `EntityCategory` (note, spec, task, system, commit) is a subset of the registry kinds, so it type-checks directly.

Verify: `pnpm typecheck` clean; `pnpm lint` 0 errors; `pnpm test` green. Then run the dev server once and check by hand (this is the only manual step in P5): `pnpm dev`, open a note containing `[[Another note]]` in **preview** mode, click the link → the target note opens. Before this task it did nothing (A4).
Commit: `fix(brain): wikilinks/entity links survive react-markdown url sanitizing; EntityChip; dedupe entity routing`

## P5.T6c — Global search deep-links through the registry (TDD, ≈5 min)

`src/lib/utils/search.ts` builds eight `href` strings by hand and sends dev-log hits to a bare `/devlogs`. After T4 a dev log can be targeted, so search should land on it.

**Failing test — create `tests/unit/lib/utils/search-hrefs.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { devLogsRepo, notesRepo, tasksRepo } from "@/lib/db/repos";
import { buildSearchItems } from "@/lib/utils/search";
import { entityHref } from "@/lib/entities/registry";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("buildSearchItems hrefs", () => {
  it("come from the entity registry, including dev logs", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "N", body: "b" });
    const task = await tasksRepo.create({ projectId: "p1", title: "T" });
    const log = await devLogsRepo.create({ projectId: "p1", title: "L" });
    const items = await buildSearchItems("p1");
    const hrefOf = (kind: string, id: string) => items.find((i) => i.kind === kind && i.id === id)?.href;
    expect(hrefOf("note", note.id)).toBe(entityHref({ kind: "note", id: note.id }));
    expect(hrefOf("task", task.id)).toBe(entityHref({ kind: "task", id: task.id }));
    expect(hrefOf("devlog", log.id)).toBe(`/devlogs?devlog=${log.id}`);
  });
});
```

Run `pnpm test -- tests/unit/lib/utils/search-hrefs.test.ts` → **FAIL** (`expected '/devlogs' to be '/devlogs?devlog=…'`).

**Edit `src/lib/utils/search.ts`:** add `import { entityHref } from "@/lib/entities/registry";` under the `stripMarkdown` import, then replace each literal (line numbers as of v0.1.5.1):

| line | old | new |
|---|---|---|
| 74 | ``href: `/brain?note=${n.id}`,`` | `href: entityHref({ kind: "note", id: n.id }),` |
| 84 | ``href: `/specs?spec=${s.id}`,`` | `href: entityHref({ kind: "spec", id: s.id }),` |
| 94 | ``href: `/tasks?task=${t.id}`,`` | `href: entityHref({ kind: "task", id: t.id }),` |
| 104 | ``href: `/standards?standard=${s.id}`,`` | `href: entityHref({ kind: "standard", id: s.id }),` |
| 114 | ``href: `/dashboard`,`` | `href: entityHref({ kind: "memory", id: m.id }),` |
| 124 | ``href: `/devlogs`,`` | `href: entityHref({ kind: "devlog", id: d.id }),` |
| 134 | ``href: `/docs?doc=${d.id}`,`` | `href: entityHref({ kind: "doc", id: d.id }),` |
| 144 | ``href: `/architecture?system=${s.id}`,`` | `href: entityHref({ kind: "system", id: s.id }),` |

(The loop variable names are the ones already in scope on each line — `m` for memories, `d` for the dev-log and doc loops. If the compiler objects to a name, use the one the surrounding `id:` field uses.)

Run → PASS; `pnpm test` (the existing search / command-palette tests must stay green) and `pnpm typecheck`.
Commit: `refactor(search): hrefs come from the entity registry; dev-log hits deep-link`

---

## P5.T7 — Activity log: schema, Dexie v12, repo, pure describer (TDD, ≈10 min)

**Failing test — create `tests/unit/lib/activity/describe.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { describeChange, makeThrottle } from "@/lib/activity/describe";

describe("describeChange", () => {
  it("describes a created task", () => {
    expect(
      describeChange("tasks", "created", { id: "t1", projectId: "p1", title: "Fix login" }),
    ).toEqual({
      projectId: "p1",
      entityKind: "task",
      entityId: "t1",
      op: "created",
      summary: 'Created task "Fix login"',
    });
  });
  it("includes the new status when a task moves", () => {
    const d = describeChange(
      "tasks",
      "updated",
      { id: "t1", projectId: "p1", title: "Fix login" },
      { status: "done" },
    );
    expect(d?.summary).toBe('Updated task "Fix login" → done');
  });
  it("uses the right title field per table", () => {
    expect(describeChange("sprints", "deleted", { id: "s", projectId: "p", name: "Sprint 4" })?.summary).toBe(
      'Deleted sprint "Sprint 4"',
    );
    expect(describeChange("commits", "created", { id: "c", projectId: "p", message: "fix: x\n\nbody" })?.summary).toBe(
      'Created commit "fix: x"',
    );
  });
  it("ignores untracked tables and rows without a project", () => {
    expect(describeChange("canvasNodes", "created", { id: "n", projectId: "p" })).toBeNull();
    expect(describeChange("tasks", "created", { id: "t", title: "x" })).toBeNull();
  });
});

describe("makeThrottle", () => {
  it("lets the first update through, then drops repeats inside the window", () => {
    let now = 1000;
    const allow = makeThrottle(60_000, () => now);
    expect(allow("note:n1:updated")).toBe(true);
    now += 10_000;
    expect(allow("note:n1:updated")).toBe(false);
    expect(allow("note:n2:updated")).toBe(true);
    now += 60_000;
    expect(allow("note:n1:updated")).toBe(true);
  });
});
```

Run → **FAIL** (unresolved import). **Create `src/lib/activity/describe.ts`:**

```ts
import type { EntityKindId } from "@/lib/entities/registry";

export type ActivityOp = "created" | "updated" | "deleted";

export interface ActivityDraft {
  projectId: string;
  entityKind: EntityKindId;
  entityId: string;
  op: ActivityOp;
  summary: string;
}

type Row = Record<string, unknown>;

const firstLine = (v: unknown): string => String(v ?? "").split("\n")[0].slice(0, 80);

/** Dexie table -> entity kind + how to name a row. Tables not listed are not tracked. */
const TRACKED: Record<string, { kind: EntityKindId; name: (r: Row) => string }> = {
  notes: { kind: "note", name: (r) => firstLine(r.title) },
  specs: { kind: "spec", name: (r) => firstLine(r.title) },
  tasks: { kind: "task", name: (r) => firstLine(r.title) },
  docs: { kind: "doc", name: (r) => firstLine(r.title) },
  standards: { kind: "standard", name: (r) => firstLine(r.title) },
  sprints: { kind: "sprint", name: (r) => firstLine(r.name) },
  systems: { kind: "system", name: (r) => firstLine(r.name) },
  canvases: { kind: "canvas", name: (r) => firstLine(r.name) },
  chatThreads: { kind: "thread", name: (r) => firstLine(r.title) },
  memories: { kind: "memory", name: (r) => firstLine(r.content) },
  commits: { kind: "commit", name: (r) => firstLine(r.message) },
};

export const TRACKED_TABLES: readonly string[] = Object.keys(TRACKED);

export function describeChange(
  table: string,
  op: ActivityOp,
  row: Row,
  changes?: Row,
): ActivityDraft | null {
  const meta = TRACKED[table];
  const projectId = row.projectId;
  const id = row.id;
  if (!meta || typeof projectId !== "string" || !projectId || typeof id !== "string") return null;
  const verb = op === "created" ? "Created" : op === "updated" ? "Updated" : "Deleted";
  let summary = `${verb} ${meta.kind} "${meta.name(row)}"`;
  if (op === "updated" && typeof changes?.status === "string") summary += ` → ${changes.status}`;
  return { projectId, entityKind: meta.kind, entityId: id, op, summary };
}

/** `allow(key)` is true at most once per `windowMs` per key (autosave coalescing). */
export function makeThrottle(windowMs: number, clock: () => number = Date.now) {
  const last = new Map<string, number>();
  return (key: string): boolean => {
    const t = clock();
    const prev = last.get(key);
    if (prev !== undefined && t - prev < windowMs) return false;
    last.set(key, t);
    return true;
  };
}
```

Run → PASS (6 passed).

**Schema.** In `src/lib/db/schema.ts` append:

```ts
/** Append-only record of what changed in a project (feeds chat awareness and the Today view). */
export const activitySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  entityKind: entityKindSchema,
  entityId: z.string(),
  op: z.enum(["created", "updated", "deleted"]),
  summary: z.string(),
  createdAt: z.number(),
});
export type Activity = z.infer<typeof activitySchema>;
```

**`src/lib/db/index.ts`:** add `Activity` to the type imports; add `activity!: EntityTable<Activity, "id">;` next to `embeddings!`; after the `version(11)` block (P3) append:

```ts
    // v12: activity log (additive).
    this.version(12).stores({
      activity: "id, projectId, [projectId+createdAt], [projectId+entityKind+entityId]",
    });
```

**Create `src/lib/db/repos/activity.ts`:**

```ts
import { db } from "@/lib/db";
import { activitySchema, type Activity } from "@/lib/db/schema";
import type { ActivityDraft } from "@/lib/activity/describe";
import { uuid, now } from "@/lib/utils/ids";

export const MAX_ACTIVITY_PER_PROJECT = 2000;
let lastTs = 0;

export const activityRepo = {
  async listRecent(projectId: string, limit = 20): Promise<Activity[]> {
    return db.activity
      .where("[projectId+createdAt]")
      .between([projectId, 0], [projectId, Infinity])
      .reverse()
      .limit(limit)
      .toArray();
  },
  async listForEntity(projectId: string, kind: string, id: string): Promise<Activity[]> {
    const rows = await db.activity
      .where("[projectId+entityKind+entityId]")
      .equals([projectId, kind, id])
      .toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
  /** createdAt is strictly increasing across calls, so "newest first" never ties. */
  async addMany(drafts: ActivityDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    const base = Math.max(now(), lastTs + 1);
    lastTs = base + drafts.length - 1;
    await db.activity.bulkAdd(
      drafts.map((d, i) => activitySchema.parse({ ...d, id: uuid(), createdAt: base + i })),
    );
  },
  /** Keep only the newest `keep` rows of a project. */
  async prune(projectId: string, keep = MAX_ACTIVITY_PER_PROJECT): Promise<number> {
    const total = await db.activity.where("projectId").equals(projectId).count();
    if (total <= keep) return 0;
    const old = await db.activity
      .where("[projectId+createdAt]")
      .between([projectId, 0], [projectId, Infinity])
      .limit(total - keep)
      .primaryKeys();
    await db.activity.bulkDelete(old);
    return old.length;
  },
};
```

Export it: in `src/lib/db/repos/index.ts` add `export { activityRepo } from "./activity";`.

**`src/lib/db/dirty.ts` (P4):** add `"activity"` to the `IGNORED` set (`new Set(["embeddings", "watchEvents", "parsedContents", "activity"])`) — the activity log is derived, it must not trigger backups. (It *is* included in exports; that is fine and cheap.)

**Test the repo — create `tests/unit/lib/db/repos/activity.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activityRepo } from "@/lib/db/repos";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const draft = (n: number, projectId = "p1") => ({
  projectId,
  entityKind: "task" as const,
  entityId: `t${n}`,
  op: "created" as const,
  summary: `Created task "T${n}"`,
});

describe("activityRepo", () => {
  it("lists newest first, scoped by project", async () => {
    await activityRepo.addMany([draft(1), draft(2), draft(3), draft(9, "other")]);
    const rows = await activityRepo.listRecent("p1", 2);
    expect(rows.map((r) => r.entityId)).toEqual(["t3", "t2"]);
  });
  it("prune keeps the newest N", async () => {
    await activityRepo.addMany([draft(1), draft(2), draft(3), draft(4)]);
    expect(await activityRepo.prune("p1", 2)).toBe(2);
    expect((await activityRepo.listRecent("p1", 10)).map((r) => r.entityId)).toEqual(["t4", "t3"]);
  });
  it("finds activity for one entity", async () => {
    await activityRepo.addMany([draft(1), draft(2)]);
    expect(await activityRepo.listForEntity("p1", "task", "t2")).toHaveLength(1);
  });
});
```

Run `pnpm test -- tests/unit/lib/db/repos/activity.test.ts tests/unit/lib/activity` → PASS. Then `pnpm test` (the backup/dirty tests from P4 must still pass; the P4 import test may enumerate tables — if it asserts an exact table list, add `activity`).
Commit: `feat(db): v12 activity table, repo, change describer`

## P5.T8 — Activity tracker + automation rule (TDD, ≈10 min)

Dexie hooks must not touch other tables inside the hook's transaction, so the tracker only **queues** drafts and flushes them on a short timer. (P4's `src/lib/db/dirty.ts` is a separate subscriber: it only counts writes, while activity needs row contents. Do not merge them.)

**Failing test — create `tests/unit/lib/activity/track.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activityRepo, devLogsRepo, tasksRepo, notesRepo } from "@/lib/db/repos";
import { installActivityTracking, flushActivity, withoutActivity } from "@/lib/activity/track";

let off: () => void;
beforeEach(async () => {
  await db.delete();
  await db.open();
  off?.();
  off = installActivityTracking(db);
});

describe("activity tracking", () => {
  it("records create / update / delete of tracked entities", async () => {
    const task = await tasksRepo.create({ projectId: "p1", title: "Fix login" });
    await tasksRepo.update(task.id, { status: "in_progress" });
    await tasksRepo.remove(task.id);
    await flushActivity();
    const rows = (await activityRepo.listRecent("p1", 10)).map((r) => r.summary).reverse();
    expect(rows).toEqual([
      'Created task "Fix login"',
      'Updated task "Fix login" → in_progress',
      'Deleted task "Fix login"',
    ]);
  });

  it("does not record untracked tables or the activity table itself", async () => {
    await devLogsRepo.create({ projectId: "p1", title: "manual log" });
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
  });

  it("coalesces rapid note autosaves into one 'updated' row", async () => {
    const note = await notesRepo.create({ projectId: "p1", title: "N", body: "" });
    for (let i = 0; i < 5; i++) await notesRepo.update(note.id, { body: `v${i}` });
    await flushActivity();
    const updates = (await activityRepo.listRecent("p1", 20)).filter((r) => r.op === "updated");
    expect(updates).toHaveLength(1);
  });

  it("stops recording after uninstall", async () => {
    off();
    await tasksRepo.create({ projectId: "p1", title: "silent" });
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
  });
});

describe("bulk writes", () => {
  it("withoutActivity suppresses recording, then recording resumes", async () => {
    await withoutActivity(() => tasksRepo.create({ projectId: "p1", title: "seeded" }));
    await flushActivity();
    expect(await db.activity.count()).toBe(0);
    await tasksRepo.create({ projectId: "p1", title: "real" });
    await flushActivity();
    expect(await db.activity.count()).toBe(1);
  });
});

describe("automation: finishing a task writes a dev-log entry", () => {
  it("creates exactly one 'task' dev log when status becomes done", async () => {
    const task = await tasksRepo.create({ projectId: "p1", title: "Ship v1" });
    await tasksRepo.update(task.id, { status: "done" });
    await flushActivity();
    const logs = await devLogsRepo.listByProject("p1");
    expect(logs.map((l) => [l.type, l.title, l.refType, l.refId])).toEqual([
      ["task", 'Completed task "Ship v1"', "task", task.id],
    ]);
    await tasksRepo.update(task.id, { progress: 100 }); // already done: no duplicate
    await flushActivity();
    expect(await devLogsRepo.listByProject("p1")).toHaveLength(1);
  });
});
```

Run → **FAIL** (unresolved import). **Create `src/lib/activity/track.ts`:**

```ts
import type { MasarFlowDB } from "@/lib/db";
import { activityRepo } from "@/lib/db/repos/activity";
import { devLogsRepo } from "@/lib/db/repos/devLogs";
import {
  TRACKED_TABLES,
  describeChange,
  makeThrottle,
  type ActivityDraft,
  type ActivityOp,
} from "./describe";

const FLUSH_MS = 50;
const NOTE_COALESCE_MS = 60_000;

interface Pending {
  activity: ActivityDraft[];
  devLogs: Array<{ projectId: string; title: string; refId: string }>;
}

let pending: Pending = { activity: [], devLogs: [] };
let suspended = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

async function drain(): Promise<void> {
  const batch = pending;
  pending = { activity: [], devLogs: [] };
  if (batch.activity.length) {
    await activityRepo.addMany(batch.activity);
    for (const projectId of new Set(batch.activity.map((a) => a.projectId))) {
      await activityRepo.prune(projectId);
    }
  }
  for (const log of batch.devLogs) {
    await devLogsRepo.create({
      projectId: log.projectId,
      type: "task",
      title: log.title,
      refType: "task",
      refId: log.refId,
    });
  }
}

/** Run `fn` with recording off. Bulk imports and demo seeding are not user activity. */
export async function withoutActivity<T>(fn: () => Promise<T>): Promise<T> {
  suspended++;
  try {
    return await fn();
  } finally {
    suspended--;
  }
}

/** Write everything queued so far. Tests await this; production relies on the timer. */
export function flushActivity(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = inFlight.then(drain).catch((err) => {
    console.warn("[activity] flush failed", err);
  });
  return inFlight;
}

function schedule(): void {
  if (!timer) timer = setTimeout(() => void flushActivity(), FLUSH_MS);
}

/** Subscribe to Dexie table hooks. Returns an unsubscribe function. */
export function installActivityTracking(db: MasarFlowDB): () => void {
  const allow = makeThrottle(NOTE_COALESCE_MS);
  const offs: Array<() => void> = [];

  const record = (
    table: string,
    op: ActivityOp,
    row: Record<string, unknown>,
    changes?: Record<string, unknown>,
  ): void => {
    if (suspended > 0) return;
    const d = describeChange(table, op, row, changes);
    if (!d) return;
    // Autosave churn: collapse repeated plain updates of the same entity.
    if (op === "updated" && typeof changes?.status !== "string") {
      if (!allow(`${d.entityKind}:${d.entityId}:updated`)) return;
    }
    pending.activity.push(d);
    // Automation rule: a task that just became done gets one dev-log entry.
    if (table === "tasks" && op === "updated" && changes?.status === "done" && row.status !== "done") {
      pending.devLogs.push({
        projectId: d.projectId,
        title: `Completed task "${String(row.title)}"`,
        refId: d.entityId,
      });
    }
    schedule();
  };

  for (const name of TRACKED_TABLES) {
    const table = db.table(name);
    const onCreate = (_k: unknown, obj: Record<string, unknown>): void => record(name, "created", obj);
    const onUpdate = (mods: Record<string, unknown>, _k: unknown, obj: Record<string, unknown>): void =>
      record(name, "updated", obj, mods);
    const onDelete = (_k: unknown, obj: Record<string, unknown>): void => record(name, "deleted", obj);
    table.hook("creating", onCreate);
    table.hook("updating", onUpdate);
    table.hook("deleting", onDelete);
    offs.push(() => {
      table.hook("creating").unsubscribe(onCreate);
      table.hook("updating").unsubscribe(onUpdate);
      table.hook("deleting").unsubscribe(onDelete);
    });
  }
  return () => offs.forEach((f) => f());
}
```

Run → PASS (6 passed). If `table.hook(...)` typings complain about parameter types, the compiler prints the exact signature — adapt the three handler signatures only; keep logic. (Dexie `updating` hook receives `(modifications, primKey, obj, trans)`; `obj` is the **old** row — that is why `row.status !== "done"` detects the transition.)

**Keep bulk writes out of the log.** Two existing code paths write hundreds of rows through the same tables and would otherwise flood "Recent activity" with fake "Created …" lines:

- `src/lib/db/demo-seed.ts:69` — replace the body of `seedDemoProject` with
  ```ts
  export async function seedDemoProject(): Promise<string> {
    return withoutActivity(async () => {
      const webId = await seedPulseDemo();
      await seedLumenDemo();
      await seedDraftDeckDemo();
      return webId;
    });
  }
  ```
  and add `import { withoutActivity } from "@/lib/activity/track";`.
- `src/lib/db/backup.ts` (created in P4.T2) — in `importBackup`, change `await db.transaction("rw", db.tables, async () => {` … `});` to `await withoutActivity(() => db.transaction("rw", db.tables, async () => { … }));` (same body), and add the same import.

Run `pnpm test -- tests/unit/lib/db` → still green (those tests install no tracker, so the wrapper is a no-op there).

**Create `src/lib/hooks/use-activity-tracking.ts`:**

```ts
"use client";

import { useEffect } from "react";
import { db } from "@/lib/db";
import { installActivityTracking } from "@/lib/activity/track";

/** Mount once in the workspace shell. Cleanup makes StrictMode double-mount safe. */
export function useActivityTracking(): void {
  useEffect(() => installActivityTracking(db), []);
}
```

**Edit `src/app/(workspace)/layout.tsx`:** import the hook and call `useActivityTracking();` on the line after `useDockSync();` (find it with `grep -n "useDockSync()" "src/app/(workspace)/layout.tsx"`; P1/P3/P4 may have moved it).

Run `pnpm typecheck && pnpm test` → green.
Commit: `feat(activity): Dexie-hook activity log, task-done dev-log automation, bulk-write guard`

## P5.T9 — Active context from the dock (pure, TDD, ≈8 min)

**Failing test — create `tests/unit/lib/ai/active-context.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { applyUrlFocus } from "@/lib/dock/dock-core";
import { defaultProjectState } from "@/lib/dock/presets";
import { deriveActiveContext, formatActiveContext } from "@/lib/ai/active-context";

function stateWith(...urls: string[]) {
  let s = defaultProjectState();
  for (const u of urls) s = applyUrlFocus(s, u);
  return s;
}

describe("deriveActiveContext", () => {
  it("is null without a project dock", () => {
    expect(deriveActiveContext(null)).toBeNull();
  });
  it("reports the focused panel and the entity it shows", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    expect(ctx.focusedUrl).toBe("/tasks?task=t1");
    const focused = ctx.panels.find((p) => p.focused)!;
    expect(focused.path).toBe("/tasks");
    expect(focused.ref).toEqual({ kind: "task", id: "t1" });
  });
  it("lists every open panel once, focused first", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    expect(ctx.panels[0].focused).toBe(true);
    const paths = ctx.panels.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/brain");
    expect(ctx.panels.find((p) => p.path === "/brain")!.ref).toEqual({ kind: "note", id: "n1" });
  });
  it("a cleared selection yields no ref", () => {
    const ctx = deriveActiveContext(stateWith("/tasks?task=t1", "/tasks?task="))!;
    expect(ctx.panels.find((p) => p.path === "/tasks")!.ref).toBeNull();
  });
});

describe("formatActiveContext", () => {
  it("names the focused entity and the other open panels", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    const titles = new Map([["task:t1", "Fix login"], ["note:n1", "Auth design"]]);
    const text = formatActiveContext(ctx, titles);
    expect(text).toContain("## Currently open");
    expect(text).toContain('Focused: Task Boards — Task "Fix login" (id t1)');
    expect(text).toContain('Note "Auth design" (id n1)');
  });
  it("falls back to the bare page when no entity is selected", () => {
    const ctx = deriveActiveContext(stateWith("/dashboard"))!;
    expect(formatActiveContext(ctx, new Map())).toContain("Focused: Dashboard");
  });
});
```

Run → **FAIL** (unresolved import). **Create `src/lib/ai/active-context.ts`:**

```ts
/** "What is the user looking at?" — derived purely from the dock state; no page wiring. */

import { collectPages } from "@/lib/dock/tree";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { pageIdOf, type ProjectDockState } from "@/lib/dock/types";
import { getPageDef } from "@/lib/dock/registry";
import { KIND_META, refFromUrl, type EntityRef } from "@/lib/entities/registry";

export interface OpenPanel {
  path: string;
  label: string;
  ref: EntityRef | null;
  focused: boolean;
  floating: boolean;
}

export interface ActiveContext {
  focusedUrl: string;
  panels: OpenPanel[];
}

export function deriveActiveContext(state: ProjectDockState | null): ActiveContext | null {
  const ws = state?.workspaces[state.activeWorkspace];
  if (!state || !ws) return null;
  const focusedUrl = urlOfFocused(state);
  const focusedPath = pageIdOf(focusedUrl);
  const docked = new Set(collectPages(ws.tree).map(pageIdOf));
  const floating = new Set(state.floaters.flatMap((f) => f.panelIds.map(pageIdOf)));
  const panels: OpenPanel[] = [...new Set([...docked, ...floating])].map((path) => ({
    path,
    label: getPageDef(path)?.label ?? path,
    ref: refFromUrl(path, ws.params[path] ?? ""),
    focused: path === focusedPath,
    floating: !docked.has(path),
  }));
  panels.sort((a, b) => Number(b.focused) - Number(a.focused));
  return { focusedUrl, panels };
}

export const titleKey = (ref: EntityRef): string => `${ref.kind}:${ref.id}`;

function describePanel(p: OpenPanel, titles: Map<string, string>): string {
  const where = p.floating ? `${p.label} (floating)` : p.label;
  if (!p.ref) return where;
  const title = titles.get(titleKey(p.ref));
  const what = title ? `${KIND_META[p.ref.kind].label} "${title}"` : KIND_META[p.ref.kind].label;
  return `${where} — ${what} (id ${p.ref.id})`;
}

/** Markdown for the system prompt. Empty string when nothing is known. */
export function formatActiveContext(ctx: ActiveContext, titles: Map<string, string>): string {
  const focused = ctx.panels.find((p) => p.focused);
  const others = ctx.panels.filter((p) => !p.focused);
  const lines = ["## Currently open"];
  if (focused) lines.push(`Focused: ${describePanel(focused, titles)}`);
  if (others.length) {
    lines.push("Also open:");
    for (const p of others) lines.push(`- ${describePanel(p, titles)}`);
  }
  lines.push(
    '"This", "it", "the current task" etc. refer to the focused entity unless the user says otherwise.',
  );
  return lines.join("\n") + "\n";
}
```

Run → PASS (6 passed). If `getPageDef("/tasks")` label differs from `Task Boards`, use the label printed by the failing assertion (it comes from `src/lib/nav.ts`; the nav item is "Task Boards").
Commit: `feat(ai): derive "currently open" context from the dock`

## P5.T10 — Snapshot v2 + all-kind RAG in the context engine (TDD, ≈12 min)

**Failing test — create `tests/unit/lib/ai/context-v2.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import {
  formatWorkspaceContext,
  type WorkspaceSnapshot,
} from "@/lib/ai/context";
import {
  projectSchema,
  taskSchema,
  noteSchema,
  linkSchema,
  canvasSchema,
  activitySchema,
} from "@/lib/db/schema";

function snapshot(over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    project: projectSchema.parse({ id: "p1", name: "Test Project", slug: "t", createdAt: 0, updatedAt: 0 }),
    notes: [], specs: [], tasks: [], sprints: [], standards: [], systems: [],
    memories: [], devLogs: [], docs: [], commits: [],
    ...over,
  };
}

const task = taskSchema.parse({ id: "t1", projectId: "p1", title: "Fix login", createdAt: 0, updatedAt: 0 });
const note = noteSchema.parse({ id: "n1", projectId: "p1", title: "Auth design", body: "", createdAt: 0, updatedAt: 0 });

describe("formatWorkspaceContext — v2", () => {
  it("puts 'Currently open' before every data section", () => {
    const text = formatWorkspaceContext(snapshot({ tasks: [task] }), {
      activeText: "## Currently open\nFocused: Task Boards\n",
    });
    expect(text).toContain("Focused: Task Boards");
    expect(text.indexOf("## Currently open")).toBeLessThan(text.indexOf("## Tasks"));
  });

  it("keeps 'Currently open' when the budget is tight", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      taskSchema.parse({
        id: `t${i}`, projectId: "p1", title: `Task number ${i}`,
        description: "x".repeat(150), createdAt: 0, updatedAt: 0,
      }),
    );
    const text = formatWorkspaceContext(snapshot({ tasks: many }), {
      activeText: "## Currently open\nFocused: Task Boards\n",
      budget: 700,
    });
    expect(text).toContain("Focused: Task Boards");
  });

  it("still inlines note bodies (Fuse fallback) when RAG returns only other kinds", () => {
    const n = noteSchema.parse({
      id: "n1", projectId: "p1", title: "Auth design",
      body: "We use JWT tokens for authentication.", createdAt: 0, updatedAt: 1,
    });
    const text = formatWorkspaceContext(snapshot({ notes: [n] }), {
      query: "authentication",
      ragChunks: [{ entityId: "t1", kind: "task", title: "Fix login", text: "x", score: 0.5 }],
    });
    expect(text).toContain("JWT tokens");
  });

  it("lists knowledge-graph links with entity titles", () => {
    const link = linkSchema.parse({
      id: "l1", projectId: "p1", sourceType: "task", sourceId: "t1",
      targetType: "note", targetId: "n1", linkType: "implements", createdAt: 0,
    });
    const text = formatWorkspaceContext(snapshot({ tasks: [task], notes: [note], links: [link] }));
    expect(text).toContain("## Links");
    expect(text).toContain('task "Fix login" —implements→ note "Auth design"');
  });

  it("lists canvases and recent activity", () => {
    const canvas = canvasSchema.parse({ id: "c1", projectId: "p1", name: "Flow", createdAt: 0, updatedAt: 0 });
    const act = activitySchema.parse({
      id: "a1", projectId: "p1", entityKind: "task", entityId: "t1",
      op: "created", summary: 'Created task "Fix login"', createdAt: 5,
    });
    const text = formatWorkspaceContext(snapshot({ canvases: [canvas], activity: [act] }));
    expect(text).toContain("## Canvases");
    expect(text).toContain("- Flow");
    expect(text).toContain("## Recent activity");
    expect(text).toContain('Created task "Fix login"');
  });

  it("inlines RAG passages of kinds other than note/doc", () => {
    const text = formatWorkspaceContext(snapshot(), {
      ragChunks: [{ entityId: "t1", kind: "task", title: "Fix login", text: "Redirect loops when the token expires.", score: 0.9 }],
    });
    expect(text).toContain("## Relevant passages");
    expect(text).toContain('[task] "Fix login": Redirect loops when the token expires.');
  });
});
```

Run → **FAIL** (`activeText`/`links` not in types; typecheck of the test also fails; vitest reports missing sections).

**Edit `src/lib/ai/context.ts`.** Line numbers are from the file as of 2026-10-16 (v0.1.5.1); they shift as you edit, so work top to bottom and match on the quoted code.

1. **Imports.** In the `@/lib/db/repos` import block (lines 2–14) add `agentsRepo, canvasRepo, linkedProjectsRepo, linksRepo, activityRepo,`. In the `import type { … } from "@/lib/db/schema"` block (lines 15–27) add `Activity, Agent, Canvas, Link, LinkedProject,`. Directly under the `stripMarkdown` import (line 28) add:

```ts
import { useDockStore } from "@/lib/stores/dock";
import { deriveActiveContext, formatActiveContext, titleKey } from "@/lib/ai/active-context";
import { titleOfEntity } from "@/lib/entities/resolve";
```

2. **`WorkspaceSnapshot`** (line 41): after `commits: Commit[];` add

```ts
  /** v2 — optional so older callers and tests keep compiling. */
  links?: Link[];
  canvases?: Canvas[];
  agents?: Agent[];
  linkedProjects?: LinkedProject[];
  activity?: Activity[];
```

3. **`RagChunk.kind`** (line 58 **only**): change `kind: "note" | "doc";` to `kind: string;`. Do **not** touch the second `kind: "note" | "doc"` (≈line 153, the local `type Entry` inside `pickFullBodies`) — it is internal to note/doc body picking.

4. **`ContextOptions`** (line 64): add

```ts
  /** Pre-rendered "Currently open" markdown (see src/lib/ai/active-context.ts). */
  activeText?: string;
```

5. **`fetchWorkspaceSnapshot`** (lines 93–134) — replace the whole function:

```ts
export async function fetchWorkspaceSnapshot(
  projectId: string,
): Promise<WorkspaceSnapshot> {
  const [
    project,
    notes,
    specs,
    tasks,
    sprints,
    standards,
    systems,
    memories,
    devLogs,
    docs,
    commits,
    links,
    canvases,
    agents,
    linkedProjects,
    activity,
  ] = await Promise.all([
    projectsRepo.get(projectId),
    notesRepo.listByProject(projectId),
    specsRepo.listByProject(projectId),
    tasksRepo.listByProject(projectId),
    sprintsRepo.listByProject(projectId),
    standardsRepo.listByProject(projectId),
    systemsRepo.listByProject(projectId),
    memoriesRepo.listByProject(projectId),
    devLogsRepo.listByProject(projectId),
    docsRepo.listByProject(projectId),
    commitsRepo.listByProject(projectId),
    linksRepo.listByProject(projectId),
    canvasRepo.listByProject(projectId),
    agentsRepo.list(),
    linkedProjectsRepo.listByProject(projectId),
    activityRepo.listRecent(projectId, 20),
  ]);
  return {
    project: project ?? null,
    notes,
    specs,
    tasks,
    sprints,
    standards,
    systems,
    memories,
    devLogs,
    docs,
    commits,
    links,
    canvases,
    agents,
    linkedProjects,
    activity,
  };
}
```

6. **RAG grouping** (lines 221–245, from the comment `// RAG chunks (when available)…` through the closing `}` of the `else`) — replace with the version below. Only note/doc chunks drive body selection; if there are none (e.g. the index only returned tasks) the Fuse fallback still runs, so note bodies never silently disappear:

```ts
  // RAG chunks (when available) replace Fuse-based full-body selection with
  // real query-relevant passages, grouped back by source entity. Only note/doc
  // chunks drive body selection; every other kind is listed under
  // "Relevant passages" further down.
  const ragAll = opts.ragChunks ?? [];
  const bodyChunks = ragAll.filter((c) => c.kind === "note" || c.kind === "doc");
  const otherChunks = ragAll.filter((c) => c.kind !== "note" && c.kind !== "doc");
  let fullNoteIds: Set<string>;
  let fullDocIds: Set<string>;
  let noteChunks: Map<string, string[]> | null = null;
  let docChunks: Map<string, string[]> | null = null;
  if (bodyChunks.length) {
    noteChunks = new Map();
    docChunks = new Map();
    for (const c of bodyChunks) {
      const target = c.kind === "doc" ? docChunks : noteChunks;
      const list = target.get(c.entityId) ?? [];
      list.push(c.text);
      target.set(c.entityId, list);
    }
    fullNoteIds = new Set(noteChunks.keys());
    fullDocIds = new Set(docChunks.keys());
  } else {
    ({ noteIds: fullNoteIds, docIds: fullDocIds } = pickFullBodies(
      snapshot.notes,
      snapshot.docs,
      opts.query,
      opts.fullBodies ?? DEFAULT_FULL_BODIES,
    ));
  }
```

7. **"Currently open" goes first.** Directly after the closing `}` of the `if (p) { push(…# Workspace…) }` block (line ≈267) and before the `// Memories first` comment (line ≈269) add:

```ts
  if (opts.activeText) push(`\n${opts.activeText}`);
```

8. **New sections.** Immediately before the final `return sections.join("");` (line ≈405) add. Each goes through `push`, so the character budget still applies and these sections are the first to be dropped:

```ts
  const titleOf = (kind: string, id: string): string => {
    const hit =
      kind === "note" ? snapshot.notes.find((x) => x.id === id)?.title
      : kind === "spec" ? snapshot.specs.find((x) => x.id === id)?.title
      : kind === "task" ? snapshot.tasks.find((x) => x.id === id)?.title
      : kind === "doc" ? snapshot.docs.find((x) => x.id === id)?.title
      : kind === "standard" ? snapshot.standards.find((x) => x.id === id)?.title
      : kind === "system" ? snapshot.systems.find((x) => x.id === id)?.name
      : kind === "sprint" ? snapshot.sprints.find((x) => x.id === id)?.name
      : kind === "canvas" ? snapshot.canvases?.find((x) => x.id === id)?.name
      : undefined;
    return hit ? `${kind} "${hit}"` : `${kind} ${id}`;
  };

  if (snapshot.links?.length) {
    const lines = snapshot.links
      .slice(0, 60)
      .map((l) => `- ${titleOf(l.sourceType, l.sourceId)} —${l.linkType}→ ${titleOf(l.targetType, l.targetId)}`);
    push(`\n## Links (knowledge graph)\n${lines.join("\n")}\n`);
  }
  if (snapshot.canvases?.length) {
    push(`\n## Canvases\n${snapshot.canvases.map((c) => `- ${c.name} (id ${c.id})`).join("\n")}\n`);
  }
  const activeAgents = snapshot.agents?.filter((a) => a.enabled) ?? [];
  if (activeAgents.length) {
    push(`\n## Agents\n${activeAgents.map((a) => `- ${a.name} (${a.role})`).join("\n")}\n`);
  }
  if (snapshot.linkedProjects?.length) {
    push(`\n## Linked folders\n${snapshot.linkedProjects.map((l) => `- ${l.name}: ${l.rootPath}`).join("\n")}\n`);
  }
  if (snapshot.activity?.length) {
    const lines = snapshot.activity.map(
      (a) => `- ${new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " ")} ${a.summary}`,
    );
    push(`\n## Recent activity (newest first)\n${lines.join("\n")}\n`);
  }
  if (otherChunks.length) {
    const lines = otherChunks.map((c) => `- [${c.kind}] "${c.title}": ${clip(c.text, 400)}`);
    push(`\n## Relevant passages\n${lines.join("\n")}\n`);
  }
```

9. **`assembleWorkspaceContext`** (line ≈447) — add the helper above it and change its last line:

```ts
async function activeTextFromDock(): Promise<string> {
  const ctx = deriveActiveContext(useDockStore.getState().getProject());
  if (!ctx) return "";
  const titles = new Map<string, string>();
  await Promise.all(
    ctx.panels.flatMap((p) => (p.ref ? [p.ref] : [])).map(async (ref) => {
      const t = await titleOfEntity(ref);
      if (t) titles.set(titleKey(ref), t);
    }),
  );
  return formatActiveContext(ctx, titles);
}
```

   `return formatWorkspaceContext(snapshot, { ...opts, ragChunks });` →
   `return formatWorkspaceContext(snapshot, { ...opts, ragChunks, activeText: opts.activeText ?? (await activeTextFromDock()) });`

   (Importing the dock store here is safe: this file already imports Dexie repos, i.e. it is renderer-side code. In node tests `getProject()` is `null` → `""`.)

10. **If P3.T7 is already merged**, `fetchRagChunks` narrows results with `const usable = chunks.filter((c): c is RagChunk & { kind: "note" | "doc" } => …); return usable.length ? usable : undefined;`. Replace those two lines with `return chunks.length ? chunks : undefined;` — the narrowing is what P3 told you to remove here (`kind` is now `string`).

Run: `pnpm test -- tests/unit/lib/ai` → PASS (new 6 + all existing `context.test.ts`). `pnpm typecheck` clean.
Commit: `feat(ai): snapshot v2 (links, canvases, agents, folders, activity), currently-open section, all-kind RAG`

## P5.T11 — Four awareness tools (TDD, ≈12 min)

**Failing test — create `tests/unit/lib/ai/tools-awareness.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { linksRepo, notesRepo, tasksRepo, activityRepo } from "@/lib/db/repos";
import { executeWorkspaceTool, WORKSPACE_TOOL_NAMES } from "@/lib/ai/tools";
import { useDockStore } from "@/lib/stores/dock";
import { urlOfFocused } from "@/lib/dock/dock-core";

const P = "aware-project";
const run = async (name: string, args: Record<string, unknown> = {}) =>
  JSON.parse(await executeWorkspaceTool(P, { id: `c-${name}`, name, arguments: args }));

beforeEach(async () => {
  await db.delete();
  await db.open();
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
  useDockStore.getState().setProject(P);
});

describe("tool registration", () => {
  it("exposes the four awareness tools", () => {
    for (const n of ["get_active_context", "open_entity", "get_backlinks", "list_activity"]) {
      expect(WORKSPACE_TOOL_NAMES).toContain(n);
    }
  });
});

describe("get_active_context", () => {
  it("reports the focused entity with its title", async () => {
    const task = await tasksRepo.create({ projectId: P, title: "Fix login" });
    useDockStore.getState().open(`/tasks?task=${task.id}`);
    const res = await run("get_active_context");
    expect(res.ok).toBe(true);
    expect(res.focused).toMatchObject({ page: "/tasks", entity: { kind: "task", id: task.id, title: "Fix login" } });
    expect(res.panels.length).toBeGreaterThan(0);
  });
});

describe("open_entity", () => {
  it("opens an existing entity in the dock", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth", body: "" });
    const res = await run("open_entity", { kind: "note", id: note.id });
    expect(res.ok).toBe(true);
    expect(urlOfFocused(useDockStore.getState().getProject()!)).toBe(`/brain?note=${note.id}`);
  });
  it("refuses an unknown entity and an unknown kind", async () => {
    expect((await run("open_entity", { kind: "task", id: "nope" })).ok).toBe(false);
    expect((await run("open_entity", { kind: "bogus", id: "x" })).ok).toBe(false);
  });
});

describe("get_backlinks", () => {
  it("returns incoming and outgoing links with titles", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth", body: "" });
    const task = await tasksRepo.create({ projectId: P, title: "Fix login" });
    await linksRepo.create({
      projectId: P, sourceType: "task", sourceId: task.id,
      targetType: "note", targetId: note.id, linkType: "implements",
    });
    const res = await run("get_backlinks", { kind: "note", id: note.id });
    expect(res.incoming).toEqual([
      expect.objectContaining({ kind: "task", id: task.id, title: "Fix login", linkType: "implements" }),
    ]);
    expect(res.outgoing).toEqual([]);
  });
});

describe("list_activity", () => {
  it("returns newest first and respects limit", async () => {
    await activityRepo.addMany([1, 2, 3].map((n) => ({
      projectId: P, entityKind: "task" as const, entityId: `t${n}`, op: "created" as const, summary: `S${n}`,
    })));
    const res = await run("list_activity", { limit: 2 });
    expect(res.activity.map((a: { summary: string }) => a.summary)).toEqual(["S3", "S2"]);
  });
});
```

Run → **FAIL** (tools unknown). 

**Pure helper first — create `src/lib/entities/backlinks.ts`** (also used by the UI in T12):

```ts
import type { Link } from "@/lib/db/schema";
import { isEntityKind, type EntityRef } from "./registry";

export interface LinkEdge {
  linkId: string;
  other: EntityRef;
  linkType: Link["linkType"];
  label: string;
}

/** Split project links into those pointing AT `ref` and those leaving it. */
export function computeBacklinks(
  links: Link[],
  ref: EntityRef,
): { incoming: LinkEdge[]; outgoing: LinkEdge[] } {
  const incoming: LinkEdge[] = [];
  const outgoing: LinkEdge[] = [];
  for (const l of links) {
    if (l.targetType === ref.kind && l.targetId === ref.id && isEntityKind(l.sourceType)) {
      incoming.push({ linkId: l.id, other: { kind: l.sourceType, id: l.sourceId }, linkType: l.linkType, label: l.label });
    }
    if (l.sourceType === ref.kind && l.sourceId === ref.id && isEntityKind(l.targetType)) {
      outgoing.push({ linkId: l.id, other: { kind: l.targetType, id: l.targetId }, linkType: l.linkType, label: l.label });
    }
  }
  return { incoming, outgoing };
}
```

**Edit `src/lib/ai/workspace-tool-defs.ts`** — before the closing `];` of `WORKSPACE_TOOLS` (after `list_watch_events`) add:

```ts
  /* ── Awareness: what the user sees, what is connected, what changed ─── */
  {
    name: "get_active_context",
    description:
      "What the user currently has open in MasarFlow: the focused page and the entity selected on it (with title and id), plus every other open panel. Call this when the user says 'this', 'it' or 'the current …'.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_entity",
    description:
      "Show an entity to the user: focus its page in the workspace with the entity selected. Use after creating or finding something the user should look at.",
    parameters: {
      type: "object",
      properties: {
        kind: enumOf(ENTITY_KIND_VALUES, "Entity kind."),
        id: str("Entity id."),
      },
      required: ["kind", "id"],
    },
  },
  {
    name: "get_backlinks",
    description:
      "Everything linked to or from an entity in the knowledge graph (incoming = other things that reference it; outgoing = what it references), with titles.",
    parameters: {
      type: "object",
      properties: {
        kind: enumOf(ENTITY_KIND_VALUES, "Entity kind."),
        id: str("Entity id."),
      },
      required: ["kind", "id"],
    },
  },
  {
    name: "list_activity",
    description:
      "Recent changes in the project (created / updated / deleted entities), newest first. Use to answer 'what changed?' or 'what was I working on?'.",
    parameters: {
      type: "object",
      properties: { limit: num("Max results (default 20, max 100).") },
    },
  },
```

**Edit `src/lib/ai/tools.ts`:** add imports

```ts
import { activityRepo } from "@/lib/db/repos";
import { deriveActiveContext, titleKey } from "@/lib/ai/active-context";
import { computeBacklinks } from "@/lib/entities/backlinks";
import { isEntityKind, entityHref, type EntityRef } from "@/lib/entities/registry";
import { titleOfEntity } from "@/lib/entities/resolve";
import { openEntity } from "@/lib/entities/open";
import { useDockStore } from "@/lib/stores/dock";
```

and, immediately **before** `default: return fail(\`Unknown tool: …\`)` (line ~1266), add the four cases:

```ts
      /* ── Awareness ────────────────────────────────────────────────── */
      case "get_active_context": {
        const ctx = deriveActiveContext(useDockStore.getState().getProject());
        if (!ctx) return ok({ focused: null, panels: [] });
        const panels = await Promise.all(
          ctx.panels.map(async (p) => ({
            page: p.path,
            label: p.label,
            focused: p.focused,
            floating: p.floating,
            entity: p.ref
              ? { kind: p.ref.kind, id: p.ref.id, title: (await titleOfEntity(p.ref)) ?? null }
              : null,
          })),
        );
        return ok({ focused: panels.find((p) => p.focused) ?? null, panels });
      }

      case "open_entity": {
        const kind = s("kind");
        const id = s("id");
        if (!kind || !id) return fail("kind and id are required");
        if (!isEntityKind(kind)) return fail(`Unknown entity kind: ${kind}`);
        const ref: EntityRef = { kind, id };
        if ((await titleOfEntity(ref)) === null) return fail(`${kind} ${id} not found`);
        openEntity(ref);
        return ok({ opened: entityHref(ref) });
      }

      case "get_backlinks": {
        const kind = s("kind");
        const id = s("id");
        if (!kind || !id) return fail("kind and id are required");
        if (!isEntityKind(kind)) return fail(`Unknown entity kind: ${kind}`);
        const { incoming, outgoing } = computeBacklinks(await linksRepo.listByProject(projectId), { kind, id });
        const named = (edges: typeof incoming) =>
          Promise.all(
            edges.map(async (e) => ({
              linkId: e.linkId,
              kind: e.other.kind,
              id: e.other.id,
              title: (await titleOfEntity(e.other)) ?? null,
              linkType: e.linkType,
              label: e.label,
            })),
          );
        return ok({ incoming: await named(incoming), outgoing: await named(outgoing) });
      }

      case "list_activity": {
        const limit = Math.min(Math.max(n("limit") ?? 20, 1), 100);
        const rows = await activityRepo.listRecent(projectId, limit);
        return ok({
          activity: rows.map((r) => ({
            kind: r.entityKind,
            id: r.entityId,
            op: r.op,
            summary: r.summary,
            at: r.createdAt,
          })),
        });
      }
```

(`titleKey` import is unused in tools.ts — omit it from the import list; it is listed above only because `active-context.ts` exports it.)

**Edit `src/lib/ai/context.ts` → `buildAssistantSystemPrompt` → `workspaceToolGuidance`**: after the `- Capture:` bullet add

`- Awareness: get_active_context (what the user has open right now), open_entity (show them something), get_backlinks (what is connected to an item), list_activity (what changed recently). Prefer these over guessing when the user says "this" or "that".`

Run: `pnpm test -- tests/unit/lib/ai` → PASS, including `toolgen.test.ts` and `routes.test.ts` (they use `WORKSPACE_TOOLS.length`). Run `pnpm typecheck`.
Commit: `feat(ai): get_active_context, open_entity, get_backlinks, list_activity tools`

## P5.T12 — Backlinks on every editor (≈10 min)

**Create `src/components/entities/backlinks-section.tsx`:**

```tsx
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { linksRepo } from "@/lib/db/repos";
import { computeBacklinks } from "@/lib/entities/backlinks";
import type { EntityRef } from "@/lib/entities/registry";
import { EntityChip } from "./entity-chip";

/** "Linked from" / "Links to" for any entity, live. Renders nothing when there are no links. */
export function BacklinksSection({ projectId, entity }: { projectId: string; entity: EntityRef }) {
  const links = useLiveQuery(
    () => linksRepo.listByProject(projectId),
    [projectId],
  );
  if (!links) return null;
  const { incoming, outgoing } = computeBacklinks(links, entity);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  const group = (title: string, edges: typeof incoming) =>
    edges.length === 0 ? null : (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="flex flex-wrap gap-1.5">
          {edges.map((e) => (
            <EntityChip key={e.linkId} entity={e.other} />
          ))}
        </div>
      </div>
    );
  return (
    <section aria-label="Connections" className="mt-6 space-y-3 border-t border-border pt-4">
      {group(`Linked from (${incoming.length})`, incoming)}
      {group(`Links to (${outgoing.length})`, outgoing)}
    </section>
  );
}
```

**Insert** `<BacklinksSection projectId={projectId} entity={{ kind: "<kind>", id: <entity>.id }} />` at the bottom of the scrollable body of each editor (read each file; every one receives or can get `projectId` from `useActiveProjectId()` — pass it down as a prop if the editor lacks it):

| File | kind |
|---|---|
| `src/components/brain/note-editor.tsx` (rendered by `notes-view.tsx:231`) | `note` |
| `src/components/specs/spec-editor.tsx` (`specs-view.tsx:154`) | `spec` |
| `src/components/tasks/task-detail.tsx` (`tasks-view.tsx:180`) | `task` |
| `src/components/docs/doc-editor.tsx` (`docs-view.tsx:142`) | `doc` |

Verify: `pnpm typecheck` + `pnpm lint` clean. Manual (2 min): `pnpm dev` → seed demo data → open a spec that has a linked task → the "Links to" row shows the task chip; click it → Task Boards focuses with that task selected.
Commit: `feat(ui): connections (backlinks) on notes, specs, tasks, docs`

## P5.T13 — Send-to: chat message → task / note (pure builders TDD, ≈10 min)

**Failing test — create `tests/unit/lib/entities/send-to.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { noteFromText, taskFromText } from "@/lib/entities/send-to";

describe("taskFromText", () => {
  it("uses the first meaningful line as the title and keeps the rest as description", () => {
    const t = taskFromText("## Fix login redirect\nUsers loop back after token expiry.\nSee auth flow.");
    expect(t.title).toBe("Fix login redirect");
    expect(t.description).toBe("Users loop back after token expiry.\nSee auth flow.");
  });
  it("strips list / quote markers and clips long titles", () => {
    expect(taskFromText("- [ ] write the migration").title).toBe("write the migration");
    expect(taskFromText("x".repeat(200)).title).toHaveLength(80);
  });
  it("never returns an empty title", () => {
    expect(taskFromText("   \n  ").title).toBe("Untitled task");
  });
});

describe("noteFromText", () => {
  it("keeps the full text as the body", () => {
    const n = noteFromText("# Auth notes\nJWT everywhere.");
    expect(n.title).toBe("Auth notes");
    expect(n.body).toBe("# Auth notes\nJWT everywhere.");
  });
});
```

Run → **FAIL**. **Create `src/lib/entities/send-to.ts`:**

```ts
const MAX_TITLE = 80;

function split(text: string): { first: string; rest: string } {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx === -1) return { first: "", rest: "" };
  const first = lines[idx]
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
    .trim()
    .slice(0, MAX_TITLE);
  return { first, rest: lines.slice(idx + 1).join("\n").trim() };
}

export function taskFromText(text: string): { title: string; description: string } {
  const { first, rest } = split(text);
  return { title: first || "Untitled task", description: rest };
}

export function noteFromText(text: string): { title: string; body: string } {
  const { first } = split(text);
  return { title: first || "Untitled note", body: text.trim() };
}
```

Run → PASS (5 passed).

**Wire into chat** (`src/components/chat/chat-view.tsx`, 3,640 lines — add only, do not refactor). `MessageRow` (line 3026) is wrapped in `memo` with a comparator that ignores callback props, so — exactly like the existing `onSaveCodeAsNote` — the row receives **handlers from the parent**, never repo calls of its own.

1. **Imports.** Add `CheckSquare,` and `FilePlus,` to the `lucide-react` list (it ends with `MessageCircleQuestion,` at line 49); add `tasksRepo,` to the `@/lib/db/repos` import (lines 51–58); and add under the `Tooltip` import (line 142):

```ts
import { openEntity } from "@/lib/entities/open";
import { noteFromText, taskFromText } from "@/lib/entities/send-to";
```

2. **Parent handlers.** Directly after `saveCodeAsNote` (it ends at line 739) add:

```ts
  async function sendToTask(text: string) {
    if (!projectId) return;
    const task = await tasksRepo.create({ projectId, ...taskFromText(text) });
    openEntity({ kind: "task", id: task.id });
  }

  async function sendToNote(text: string) {
    if (!projectId) return;
    const note = await notesRepo.create({ projectId, ...noteFromText(text) });
    openEntity({ kind: "note", id: note.id });
  }
```

3. **Pass them down.** In the `<MessageRow …>` call (line 2037) add after `onSaveCodeAsNote={saveCodeAsNote}`:

```tsx
                    onCreateTask={() => void sendToTask(m.content)}
                    onCreateNote={() => void sendToNote(m.content)}
```

4. **Row props.** In `MessageRow`'s destructure (after `onSaveCodeAsNote,` at line 3035) add `onCreateTask,` and `onCreateNote,`; in its type literal (after line 3045) add `onCreateTask: () => void;` and `onCreateNote: () => void;`.

5. **Buttons.** In the hover action row, directly after the Copy block's closing `)}` (line 3264) and before `{m.role === "assistant" && (` add:

```tsx
              {m.content && (
                <>
                  <Tooltip label="Create task" side="bottom">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Create task from this message"
                      onClick={onCreateTask}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <CheckSquare className="h-3 w-3" />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Save as note" side="bottom">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Save this message as a note"
                      onClick={onCreateNote}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <FilePlus className="h-3 w-3" />
                    </Button>
                  </Tooltip>
                </>
              )}
```

Both creates fire the T8 hooks, so they appear in "Recent activity" automatically.

Verify: `pnpm typecheck`, `pnpm lint`, `pnpm test` green. Manual (1 min): `pnpm dev`, send any message, hover the reply, click the checkbox icon → Task Boards focuses with the new task selected.
Commit: `feat(chat): create a task or note from any message`

---

## P5.T14 — Cross-page integration test (≈8 min)

This is the phase's proof that pages and chat really share data. **Create `tests/unit/lib/cross-page.test.ts`:**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { linksRepo, notesRepo, tasksRepo, devLogsRepo } from "@/lib/db/repos";
import { installActivityTracking, flushActivity } from "@/lib/activity/track";
import { assembleWorkspaceContext } from "@/lib/ai/context";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { useDockStore } from "@/lib/stores/dock";
import { openEntity } from "@/lib/entities/open";

const P = "xp";
let off: () => void;

beforeEach(async () => {
  await db.delete();
  await db.open();
  off?.();
  off = installActivityTracking(db);
  useDockStore.setState({ projects: {}, activeProjectId: null, drag: null });
  useDockStore.getState().setProject(P);
});

describe("one change is visible everywhere", () => {
  it("note -> link -> task done -> chat briefing knows all of it", async () => {
    const note = await notesRepo.create({ projectId: P, title: "Auth design", body: "JWT" });
    const task = await tasksRepo.create({ projectId: P, title: "Implement auth" });
    await linksRepo.create({
      projectId: P, sourceType: "task", sourceId: task.id,
      targetType: "note", targetId: note.id, linkType: "implements",
    });
    await tasksRepo.update(task.id, { status: "done" });
    await flushActivity();
    openEntity({ kind: "task", id: task.id });

    const briefing = await assembleWorkspaceContext(P, { query: "auth" });

    expect(briefing).toContain("## Currently open");
    expect(briefing).toContain(`Task "Implement auth" (id ${task.id})`);
    expect(briefing).toContain('task "Implement auth" —implements→ note "Auth design"');
    expect(briefing).toContain('Updated task "Implement auth" → done');
    expect((await devLogsRepo.listByProject(P)).map((l) => l.title)).toContain('Completed task "Implement auth"');
  });

  it("the model can ask what the user is looking at", async () => {
    const task = await tasksRepo.create({ projectId: P, title: "Look here" });
    openEntity({ kind: "task", id: task.id });
    const res = JSON.parse(await executeWorkspaceTool(P, { id: "1", name: "get_active_context", arguments: {} }));
    expect(res.focused.entity.title).toBe("Look here");
  });
});
```

Run `pnpm test -- tests/unit/lib/cross-page.test.ts` → PASS. If the first test fails on the "Currently open" line, `assembleWorkspaceContext` is not calling `activeTextFromDock` (T10 step 8); if on "Recent activity", the snapshot fetch misses `activityRepo` (T10 step 5).
Commit: `test: cross-page awareness proof (note -> link -> done -> chat briefing)`

## P5.T15 — Gate (≈3 min)

The P9 feature titles that came out of this phase are already recorded in master §10 ("Handoffs"). **Do not edit `tests/e2e/feature-matrix.json` in P5**: the P0 guard fails any listed feature without a Playwright spec titled `"<route>: <feature>"`, and its allow-list of empty routes is derived from the JSON, so adding a feature early turns the suite red.

1. Confirm the handoff is in place: `grep -c "P5 → P9" .hermes/plans/2026-10-16_223644-masarflow-v0-2-0-0-master.md` → `1`.
2. **P5 gate** — all must pass:

```bash
pnpm test
pnpm typecheck
pnpm lint
```
Expected: all tests pass (count = P0 baseline + ≈45 new), typecheck clean, lint 0 errors / ≤4 pre-existing warnings (P9 removes those).

No commit (nothing changed). If any command fails, fix it in the task that owns the failure and amend nothing.

---

## Risks & open questions for P5

- **R-P5-1 Dexie hook typings.** `table.hook("updating", fn)` signature varies by Dexie 4 minor; T8 tells the implementer to follow the compiler. Logic is unchanged either way.
- **R-P5-2 Activity noise.** Only 11 tables are tracked; notes' plain updates are coalesced per 60 s; non-status task edits are also coalesced. If the log still feels noisy in daily use, raise `NOTE_COALESCE_MS` — do not add filtering UI.
- **R-P5-3 Prompt size.** "Currently open" is ~10 lines and pushed first; snapshot v2 adds ≤ ~4 KB (60 links, 20 activity). `DEFAULT_BUDGET` (28 000 chars) is unchanged; sections still drop from the bottom when over budget.
- **R-P5-4 `useUrlSelection` + keep-alive panels (A6).** If a hidden panel's remembered selection ever disagrees with the dock snapshot, the dock snapshot wins on next focus (URL is authoritative). Acceptable; covered by the pure `selectionFor` tests.
- **Q-P5-1** Resolved: OpenCode was removed; `open_entity` is a normal workspace tool in the Agent Loop (UI focus only, never data).
- **Q-P5-2** Selection-level awareness (text the user highlighted in an editor) is out of scope for 0.2 (YAGNI); the dock-derived "focused entity" covers the "this task / this note" cases.
