# MasarFlow 0.3 Overhaul — Implementation Plan (master)

**Goal:** rebuild MasarFlow from a 30-destination module catalogue into a coherent, safe, local-first project harness (typed entity graph + AI over it), shipped as a packaged desktop app whose release gate actually runs.

> **Product amendment (2026-10-27):** D7 is superseded. The shell is tabs-only: six surfaces, one linear per-project tab strip, one active workspace, and one inspector. Studio docking, presets, split/floating windows, and their settings/commands are removed. The AI runtime, project entities, workflows, navigation, and inspector remain one harness rather than separate destinations. Existing dock state is migrated to flat tabs without losing open pages or URL selection.

**Branch:** cut `overhaul/v0.3` from `release/v0.2.0` at `dfbcfda`. **Code today:** 0.2.0 (display `0.2.0.0`, `desktop/src/shared/version.ts:2`), release candidate, never closed out.

**Relationship to earlier plans.** Every file under `.hermes/plans/2026-10-16_223644-*`, `.hermes/plans/2026-08-28_*` and `.hermes/tasks/*` is preserved untouched as history. This plan does not resume P9/P10/W10/W12; it re-derives scope from the code as it stands on 2026-10-25. Where an old task is still valid it reappears here with fresh evidence, not by reference.

**Baseline (measured 2026-10-25, this session):** `pnpm test` exit 0, 176 unit files / 1,206 tests; `pnpm typecheck`, `pnpm desktop:typecheck` exit 0; `pnpm lint` → `ESLint: No issues found`. Not run: `pnpm build`, browser e2e, packaged e2e. Working tree: 8 modified evidence artifacts under `reports/p9/` (a11y summary, 4 journey PNGs, 3 perf JSONs) — uncommitted, unreviewed.

---

## 1. Verified context

"Read" = opened in this session by the planner. "Audit" = reported by a read-only audit subagent with `file:line`; implementers must re-read before editing.

| Area | Fact | Evidence |
|---|---|---|
| Stack | Next 16 App Router, React 19, Tailwind 4, pnpm workspace (`.` + `desktop`) | `package.json`, `pnpm-workspace.yaml` (read) |
| Data | Single Dexie DB `masarflow`, 42 tables, highest schema `version(12)` | `src/lib/db/index.ts:241` (read: versions 10, 11, 12 at :210, :237, :241) |
| Routes | 24 workspace route dirs: agents architecture brain chat control-center dashboard devlogs docs files git knowledge plugins search settings specs sprints standards sync tasks today tools watcher workflow (+brain children) | `ls src/app/(workspace)` (read) |
| Nav | 7 groups, 26 items + 4 Brain children | `src/lib/nav.ts` (audit) |
| Desktop | Electron main forks Next standalone via `utilityProcess` on random loopback port; per-launch 32-byte token via env; renderer loads `masarflow://app` | `desktop/src/main/backend/server.ts:39-50`, `backend/token.ts:4-14`, `backend/protocol.ts:40,80` (audit) |
| Guard | Host → token → Origin; Origin only required for non-GET | `src/lib/server/request-guard.ts:35-47` (read) |
| Electron hardening | contextIsolation/sandbox/webSecurity on, nodeIntegration off, nav + window-open policy, deny-by-default permissions | `desktop/src/main/windows/main-window.ts:25-41`, `security/permissions.ts` (audit) |
| Test guards | 4 feature-truth guards; feature matrix 28 routes / 55 features; 16 desktop e2e specs | `AGENTS.md`, `tests/e2e/feature-matrix.json` (audit) |
| Scripts | `build`, `build:app`, `security:check`, `desktop:dist:dir`, `smoke:desktop`, `e2e`, `e2e:desktop` exist | `package.json` (read via grep) |
| Size | `chat-view.tsx` 2,695 lines, `settings-view.tsx` 2,215; `src/lib/ai` 6,696 LOC; shipped app-server 133 MB | (audit) |

## 2. Verified fake / broken / unsafe inventory

| # | Finding | Evidence | Fixed in |
|---|---|---|---|
| S1 | No request guard at all without `MASARFLOW_TOKEN` — `next dev` exposes `/api/fs/shell` to any local process / CORS-simple POST | `src/proxy.ts:10-11`, `request-guard.ts:50-52` (read) | P1 |
| S2 | Root allow-list fails open when `MASARFLOW_DATA_DIR` unset | `src/lib/server/roots.ts:25-26` (read) | P1 |
| S3 | Canvas embed SSRF: private-range check on first URL only; redirects re-fetched unvalidated; `169.254.*`, `0.0.0.0`, IPv6 ULA not blocked; TLS verification off | `src/app/api/canvas/embed/route.ts:44,48-55,170-181` (read) | P1 |
| S4 | Video web-node `<iframe src={data.url}>` without `sandbox`; CSP `frame-src https:` | `src/components/canvas/nodes/web-node.tsx:189-194` (read), `desktop/src/main/security/csp.ts:15` (audit) | P1 |
| S5 | Obsidian API key in URL query string for media | `src/app/api/obsidian/media/route.ts`, `markdown-preview.tsx` `getMediaUrl` (audit) | P1 |
| S6 | `connect-src https:` / `img-src https:` marked `TODO(P9.T6)` | `desktop/src/main/security/csp.ts:3,10,13` (audit) | P1 |
| D1 | `syncRepo.replaceAll` deletes every index row and re-inserts with new uuids; 3 independent writers (vault engine, sync-view local, sync-view Obsidian REST) | `src/lib/db/repos/sync.ts:18-27` (read); `sync-view.tsx:155,168,254,329,615` (audit) | P3 |
| D2 | Deleting an entity resurrects it: leftover file → `external` → `adoptExternal` creates a new row ignoring `msf_id` | `src/lib/vault/plan.ts:157-160`, `engine.ts:104-135,183-196` (read) | P2+P3 |
| D3 | Adopted files never get an index row (`indexRowFor` → null for `external`) → perpetual conflict | `plan.ts:202-204`, `engine.ts:219-221` (read) | P3 |
| D4 | `autoImport` flag is dead: `auto` is set, never read | `plan.ts:151`, `engine.ts:175-176` (read) | P3 |
| D5 | Project delete misses ≥12 project-scoped tables (watchEvents, plugins, workflowRuns/Steps, codeFindings, linkSuggestions, parsedContents, aiUndo, chatThreads/Messages, linkedProjects, activity, embeddings, agentSteps) | `src/lib/db/repos/projects.ts:5-26` (read; missing list from audit) | P2 |
| D6 | No cascade on task/doc/spec delete (dangling links, stale `linkedTaskIds`, stale progress) | `repos/tasks.ts:51-53` (audit) | P2 |
| D7 | Wikilinks auto-create notes on every save | `repos/notes.ts:88,101,114-133` `syncWikilinks`/`ensureByTitle` (audit) | P2 |
| D8 | Two serializers with different `msf_project` (uuid vs slug) → hash churn | `src/lib/sync.ts:136` vs `vault/plan.ts:74` (audit; plan.ts:74 read) | P3 |
| D9 | `dirty.ts` `IGNORED` omits `syncFiles` → every sync makes the DB dirty → needless full backups | `src/lib/db/dirty.ts:4` (read) | P2 |
| D10 | `APP_VERSION = "0.2.0.0"` hard-coded in auto-backup | `src/lib/db/auto-backup.ts:7` (read) | P3 |
| D11 | Backup import is unvalidated `bulkAdd`; restore drops AI keys silently | `db/backup-import.ts`, `backup.ts` `redactRow` (audit) | P3 |
| D12 | Vault sync only runs while `/sync` is mounted | `vault-panel.tsx` mounts `useVaultSync` (audit) | P3 |
| A1 | Three hand-rolled send paths; agents/workflow get no undo and no approval | `chat-view.tsx:859`, `agents-view.tsx:225`, `workflow-view.tsx:310` (audit) | P4 |
| A2 | Context-window guard dead: no production caller passes `contextLimit` | `src/lib/ai/agent/history.ts:51` (audit) | P4 |
| A3 | 5 agent-settings sliders decorative: `agentConfigFromSettings` never called | `src/lib/stores/agent-settings.ts:101-112`, `agent/compat.ts:91-92` (audit) | P4 |
| A4 | Tool history dropped between turns; image-only turns dropped | `chat-backends.ts:55-63` `buildLegacyMessages` (audit) | P4 |
| A5 | Workflow prompt concatenates every prior step unbounded | `src/lib/ai/workflow.ts:59-76` `buildStepPrompt` (audit) | P4 |
| A6 | 66 tool schemas sent every request (61 workspace + 5 fs, fs even with no linked root) | `workspace-tool-defs.ts`, `fs-tools.ts:99`, `chat-view.tsx:866` (audit) | P4 |
| A7 | `python-service/` orphaned yet documented as required | `python-service/README.md`, no `/api/python` route (audit; dir exists, read) | P4 |
| A8 | No retention for `agentSteps` (full tool results), `chatMessages`, `aiUndo` | (audit) | P4 |
| A9 | Search "semantic" labelled available while embedder loading; results actually Fuse | `search-view.tsx` (audit) | P6 |
| U1 | Dock is the default shell; layout chrome (Brain tabs) lost inside panels; panels never unmount | `stores/ui.ts:34-40`, `brain/layout.tsx`, `panel-content.tsx` (audit) | P5 |
| U2 | Duplicate destinations: `/knowledge` ≡ `/brain/graph`; 3 search UIs; 4 log surfaces | `knowledge/page.tsx`, `brain/graph/page.tsx`, `use-hotkeys.ts:126-146` (audit) | P5 |
| U3 | Viewport breakpoints inside container panels (28 vs 2 container queries) → clipping | `today-view.tsx:83`, `chat-view.tsx:1419` (audit) | P5 |
| U4 | Task dialog: no due date, status vs progress conflict, internal agent roles as assignee, mirroring internals shown | `task-detail.tsx:133-269`, `workflow.ts:68-78` (audit) | P6 |
| U5 | a11y: dock `role="tablist"` without tab children on every route; 30 contrast nodes; nameless inputs (commits panel, notes search) | `reports/p9/a11y/summary.json` (read), `dock-group.tsx:101` | P7 |
| U6 | 150 instances of 9–11 px text | (audit) | P7 |
| R1 | CI never runs `desktop:dist:dir` + `e2e:desktop` — the gate `AGENTS.md` calls authoritative | `.github/workflows/ci.yml` (audit) | P0 |
| R2 | `release.yml` packages without lint/typecheck/unit/security:check; packaged smoke `continue-on-error: true` | `release.yml:41-50,90` (audit) | P0 |
| R3 | `security:check` in no workflow; referenced "release checklist" does not exist | `scripts/security-check.mjs`, `release.yml:84-86` (audit) | P0 |
| R4 | `release-notes.mjs:21` hard-codes "install v0.1.6.0 first" | (audit) | P0 |
| R5 | `desktop/**` excluded from ESLint | `eslint.config.mjs:22` (audit) | P0 |

**Recorded non-issues (do not "fix"):** roots logic is shared (`src/lib/server/roots.ts:3` imports `@desktop-shared/roots`, read); guard, CSP, url-policy, token, ports have unit tests (`tests/unit/lib/server/request-guard.test.ts`, `tests/unit/desktop/*`).

## 3. Release gate (0.3.0)

All must pass on the tag commit, in CI, not only locally:

1. `pnpm lint` → `ESLint: No issues found` (now including `desktop/**`).
2. `pnpm typecheck && pnpm desktop:typecheck` → exit 0.
3. `pnpm test` → exit 0; every shrinking allow-list in `tests/unit/repo-truth/*` and `tests/unit/_helpers/shrinking-allowlist.ts` users is empty.
4. `pnpm build:app && pnpm security:check` → all denial cases pass, including the new dev-mode cases from P1.
5. `pnpm desktop:dist:dir && pnpm smoke:desktop && pnpm e2e:desktop` → all specs pass; every `tests/e2e/feature-matrix.json` feature has a passing spec titled `<route>: <feature>`.
6. Axe (`reports/v0.3/a11y/summary.json`, produced by the P0 harness) → 0 violations, empty allow-list, on every primary surface.
7. Data doctor (P0) → 0 orphans/drift on the seeded demo project, after a project delete, and after backup → restore round trip.
8. Layout matrix (P0) → no clipped control at 1000/1280/1440/1920 px windows.
9. `docs/release.md` checklist completed and committed as `reports/v0.3/GATE.md` with links to artifacts 4–8.
10. Clean-machine install of the NSIS artifact + update from 0.2.0.0 recorded in `reports/v0.3/GATE.md`.

## 4. Architecture decisions

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | **Stay local-first on Dexie/IndexedDB in the renderer** for 0.3 | Substrate is sound; every proven defect is in the write/replica layer, not storage | Move to SQLite in Electron main (doubles the migration; reconsider for 0.4 with perf data); server DB (breaks browser mode) |
| D2 | **One write path: `src/lib/domain/commands/*`**, each command one Dexie transaction writing row + links + denormalised arrays + `events` row; repos become read-only queries | Kills D5–D7, gives one activity/dirty/undo feed | Keep repos + Dexie hooks (that is the defect source); event-sourcing everything (overkill) |
| D3 | **Tombstones** (`deletedAt`) on note/doc/spec/task; `purge` is the only hard delete | Makes deletes expressible to replicas; enables undo | Hard delete + vault `delete` action (no recovery, race-prone) |
| D4 | **Replicas keyed `(projectId, kind, entityId)`, upsert-only**, one codec, conflicts as rows, adoption only via explicit "Import folder" command; Obsidian REST becomes a second adapter of the same `ReplicaAdapter` interface | Kills D1–D4, D8 | Patch `replaceAll` callers individually (three writers would still race) |
| D5 | **AI loop stays in the browser** but through one `runAgentTurn` service + `useAgentTurn` hook; workflows persist step state and resume on reopen | Workspace tools need Dexie, which lives in the renderer (D1) | Server-side runner (needs a server DB → contradicts D1; revisit with D1 in 0.4) |
| D6 | **One embeddings stack: in-browser ONNX worker**; `python-service/` deleted in one commit (recoverable from git) | Only live path; Python is unshipped | Revive Python service (adds a runtime to the installer) |
| D7 | **Six primary surfaces** — Today, Capture, Work, Library, Ask, System — labeled sidebar + main + right inspector; **dock becomes opt-in "Studio layout"** capped at 4 mounted panels | Every capability survives; navigation shrinks from 30 to 6 | Delete the dock (good engine, real users); keep dock default (proven clipping/a11y/memory cost) |
| D8 | **One entity shell**: `EntityList`, `EntityDetail`, `Inspector` driven by `src/lib/entities/registry.ts` | 5 copies of list+detail today | Per-page bespoke views |
| D9 | **Keep Next standalone in `utilityProcess`** | Works, guarded, tested; cold-start change is a 0.4 decision against `reports/p9/perf-cold-start.json` | Vite/static renderer rewrite |
| D10 | **Dev mode is guarded too**: without a token, `proxy.ts` enforces Host + Origin + `Sec-Fetch-Site` on `/api/*`; fs/shell roots fail closed unless `MASARFLOW_DEV_ROOTS` is set | S1/S2 are real on any dev box | "Dev is trusted" (any web page can POST); dev token script (browser has no secure place to receive it) |
| D11 | Version **0.3.0** (display `0.3.0.0`), schema `dataVersion: 3` in backups and vault frontmatter `msf_version: 2` | Breaking data-layer change deserves a minor bump | Patch release |

## 5. Target system shape

```
┌──────────────────────── Renderer (masarflow://app) ─────────────────────────┐
│ Shell: Sidebar(6) │ Surface (Today/Capture/Work/Library/Ask/System) │ Inspector │
│        └─ optional Studio layout (dock engine, ≤4 panels)                       │
│                                                                              │
│ UI ──reads──> selectors (src/lib/domain/selectors) ──> Dexie (read-only repos)  │
│ UI/AI tools/importers/replicas ──> commands (src/lib/domain/commands) ──tx──>    │
│        rows + links + tombstones + events  ──> events feed → activity, dirty,  │
│                                                  undo, timeline, embeddings     │
│ Replica engine (app-level, single runner) ── ReplicaAdapter: vault | obsidian   │
│ AI: useAgentTurn → runAgentTurn → AgentController → ToolRegistry(≈10 tools)     │
│        → ProxyProvider → POST /api/chat                                         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ token + Origin + Host (dev and packaged)
┌───────────────────────────────▼──────── Next standalone (utilityProcess) ─────┐
│ /api/chat (protocol adapter) /api/fs/* (roots fail-closed) /api/canvas/embed   │
│ (SSRF-safe fetch) /api/obsidian/* (key in header) /api/github* /api/watch      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ IPC (preload contract)
                     Electron main: secrets, backups, git, pty, updater, roots
```

## 6. Conventions for every task

- **TDD per code task:** failing test → run it, confirm the stated failure → minimal change → `pnpm vitest run <file>` PASS → commit. Use `pnpm vitest run --config tests/vitest.config.ts <path>` if the root config does not pick the file up (verify once in P0.T1).
- **Commits:** conventional (`feat(domain): …`, `fix(vault): …`, `test(e2e): …`), one task per commit, never `--no-verify`.
- **Feature truth:** any route/feature change edits `tests/e2e/feature-matrix.json` and its spec in the same commit; allow-lists may only shrink.
- **Next 16:** read `node_modules/next/dist/docs/` before touching routing, `proxy.ts`, or layouts (AGENTS.md).
- **Windows/Git Bash:** pass `C:/…` paths to native tools; use `node.exe` not `node` in piped runs.
- **Dexie:** hooks must not return values; never await secret-store IPC inside a transaction (hydrate before / strip after — see `src/lib/db/repos/chat-secrets.ts`).
- **Copy:** formal, professional UI copy; no casual interjections; no copy that explains the app's own navigation.
- **Evidence:** generated reports go under `reports/v0.3/`; never overwrite `reports/p9|p10` (history).

## 7. Phase map

| Phase | File | Outcome | Depends on |
|---|---|---|---|
| P0 | `2026-10-25_235321-masarflow-overhaul-v0-3-p0-baseline-gates.md` | Gates real in CI; measurement harnesses (layout, axe, data doctor); p9 artifacts resolved | — |
| P1 | `2026-10-25_235321-masarflow-overhaul-v0-3-p1-security.md` | S1–S6 closed with tests and `security:check` cases | P0 CI jobs |
| P2 | `2026-10-25_235321-masarflow-overhaul-v0-3-p2-domain-core.md` | Commands + events + tombstones; cascades; project delete complete; Dexie v13 | P0 data doctor |
| P3 | `2026-10-25_235321-masarflow-overhaul-v0-3-p3-replicas-backup.md` | Replica engine v2, single codec, app-level runner, backup v2; Dexie v14 | P2 commands, tombstones |
| P4 | `2026-10-25_235321-masarflow-overhaul-v0-3-p4-ai-runtime.md` | One send path, ≈10 tools, context limits, undo everywhere, retention, python-service removed; Dexie v15 | P2 commands (tools call commands) |
| P5 | `2026-10-25_235321-masarflow-overhaul-v0-3-p5-shell-ia.md` | 6-surface shell, container queries, Studio opt-in, redirects, guards re-pointed | P0 layout harness |
| P6 | `2026-10-25_235321-masarflow-overhaul-v0-3-p6-entity-surfaces.md` | EntityList/Detail/Inspector; Library, Work, Today, Ask surfaces; task model fixes | P2 selectors, P4 `useAgentTurn`, P5 shell |
| P7 | `2026-10-25_235321-masarflow-overhaul-v0-3-p7-polish-release.md` | Tokens + a11y zero + consolidation + docs + 0.3.0 release | all |

## 8. Parallelism, ownership, cut lines

- **Waves:** W1 = P0. W2 = P1 ∥ P2 ∥ P5 (disjoint files). W3 = P3 ∥ P4 (P3 owns `src/lib/vault/**`, `src/lib/sync.ts`, `src/lib/db/backup*`; P4 owns `src/lib/ai/**`, chat/agents/workflow views). W4 = P6. W5 = P7.
- **Single-owner files:** `src/lib/db/index.ts` (version chain — one phase at a time, rebase before bump); `src/lib/db/schema.ts` (same rule); `tests/e2e/feature-matrix.json` (P5 → P6 → P7 sequentially); `src/lib/nav.ts` (P5 only); `src/app/(workspace)/layout.tsx` (P5 only); `.github/workflows/*` (P0, then P7).
- **Dexie version budget:** P2 → `version(13)`; P3 → `version(14)`; P4 → `version(15)` (only if the retention index is needed; otherwise unused). P6/P7 must not add versions; if one becomes necessary, take `version(16)` and edit this table first.
- **Cut lines if time runs short (in order):** P7 consolidation of Settings sub-pages → P6 Capture inbox → P4 workflow resume → P5 Studio 4-panel cap.
- **Never cut:** P0 gates, P1, P2 cascades/tombstones, P3 replica correctness + backup validation, P7 a11y zero and release gate.

## 9. Risks and open questions (with defaults)

| # | Risk / question | Default if unanswered |
|---|---|---|
| Q1 | Delete `python-service/`? | Yes, single commit in P4; git history keeps it |
| Q2 | Rename "Plugins" to "Features"? | Yes in P5 (UI copy only; ids unchanged so `plugins-consumers` guard stays valid) |
| Q3 | Code signing | Stay unsigned for 0.3; document SmartScreen in `docs/release.md`; owner decision for 0.4 |
| Q4 | Existing users' vault folders contain v1 frontmatter | P3 reads `msf_version` absent as v1 and upgrades on next write; no mass rewrite |
| Q5 | Users relying on dock default | Studio layout setting persists; first launch after upgrade shows one notice offering it |
| R1 | Route consolidation fights four truth guards | Re-point guards in the same commit as each merge (P5/P6 tasks say so explicitly) |
| R2 | Command migration is wide (29 repos) | P2 wraps mechanically first, then adds a lint rule banning `db.<table>.(add|put|update|delete|bulk*)` outside `src/lib/domain/**` and `src/lib/db/**` |
| R3 | CSP narrowing breaks a browser-side fetch | Providers/GitHub/Obsidian go through same-origin routes and the embedder is offline (`embeddings/worker.ts:9-14`); P1 T6 greps remaining fetches and e2e fails on any `securitypolicyviolation` |

## 10. Not verified by this plan

- Packaged e2e is green today; whether 0.2.0.0 was published (`gh release view v0.2.0.0`).
- Exact line numbers of audit-sourced rows in §2 — re-read before editing.
- Browser e2e and `pnpm build` on the baseline.
- Runtime behaviour of the agent loop and fallback ladder (source-read only).
- Content of the 8 dirty `reports/p9` artifacts versus the committed versions.

## 11. Handoffs

- P0 → all: `pnpm doctor:data`, `pnpm audit:layout`, `pnpm audit:a11y` scripts and their JSON schemas under `reports/v0.3/`.
- P2 → P3/P4/P6: `commands.<kind>.{create,update,remove,restore,purge}`, `events` table, `selectors.*`, `isLive(row)`.
- P3 → P6: `useReplicaStatus()`, `replicaConflicts` queue, "Import folder" command.
- P4 → P6: `useAgentTurn({surface, capabilities})`, `ModelPicker`, `TOOLSETS`.
- P5 → P6: `SurfaceLayout`, `InspectorSlot`, container primitives in `src/components/ui/container.tsx`, route redirect table `src/lib/navigation/redirects.ts`.
- P6 → P7: feature-matrix entries per surface; list of removed components for the dead-code sweep.
