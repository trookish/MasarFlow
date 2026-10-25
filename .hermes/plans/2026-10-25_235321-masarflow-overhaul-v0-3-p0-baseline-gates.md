# Phase 0 — Baseline, real gates, measurement harnesses

**Goal:** make the release gate that `AGENTS.md` describes actually run in CI, and add the three measurement harnesses (layout, a11y, data doctor) every later phase uses as its definition of done.
**Branch:** `overhaul/v0.3` (cut from `release/v0.2.0` @ `dfbcfda`). **Depends on:** nothing.
**Master:** `.hermes/plans/2026-10-25_235321-masarflow-overhaul-v0-3-master.md` (read §3, §6, §8 first).

## Verified context

| Fact | Evidence |
|---|---|
| Scripts `build:app`, `security:check`, `desktop:dist:dir`, `smoke:desktop`, `e2e:desktop` exist | `package.json` (read 2026-10-25) |
| 8 uncommitted modified artifacts under `reports/p9/` | `git status --short` (run 2026-10-25) |
| a11y summary is allow-list driven: violations present but `failing: []` | `reports/p9/a11y/summary.json:71-127` (read) |
| Baseline 176 files / 1,206 tests, typecheck ×2 and lint green | run 2026-10-25 |
| CI lacks packaged e2e; release lacks lint/type/unit/security; smoke `continue-on-error` | audit of `.github/workflows/ci.yml`, `release.yml:41-50,90` — **re-read before editing** |
| `desktop/**` ignored by ESLint | audit, `eslint.config.mjs:22` — re-read |
| `release-notes.mjs:21` hard-codes v0.1.6.0 | audit — re-read |

## File map

New: `scripts/doctor-data.mjs` (T5), `tests/e2e/desktop/audit-layout.spec.ts` (T6), `tests/e2e/desktop/audit-a11y.spec.ts` (T7), `tests/unit/lib/db/doctor.test.ts` (T5), `src/lib/db/doctor.ts` (T5), `docs/release.md` (T4), `tests/unit/scripts/release-notes.test.ts` (T4), `reports/v0.3/.gitkeep` (T1). Before T6/T7, check where the existing packaged specs live (`ls tests/e2e`) and place the harness specs beside them if the folder differs.
Modified: `.github/workflows/ci.yml` (T2), `.github/workflows/release.yml` (T3), `eslint.config.mjs` (T8), `scripts/release-notes.mjs` (T4), `package.json` scripts (T5–T7).

## Tasks

**T1 — Resolve the dirty p9 artifacts.** Run `git diff --stat reports/p9`. These are historical evidence of 0.2.0; commit them as-is with `chore(reports): record final p9 evidence run (history)`. Create `reports/v0.3/.gitkeep`. Gate: `git status --short reports` empty.

**T2 — CI runs the packaged gate.** Add a `desktop-e2e` job on `windows-latest` after the existing unit job: `pnpm install --frozen-lockfile` → `pnpm build:app` → `pnpm security:check` → `pnpm desktop:dist:dir` → `pnpm smoke:desktop` → `pnpm e2e:desktop`; upload `reports/v0.3/**` and Playwright traces as artifacts on failure. Verify locally first that each command exits 0 on the baseline and record durations in the commit body. Commit `ci: run security check and packaged e2e on every PR`.

**T3 — Release workflow cannot ship an ungated build.** In `release.yml`, make the package job `needs:` a gate job that runs lint, both typechecks, `pnpm test`, `pnpm security:check`; delete `continue-on-error: true` from the packaged smoke step. Commit `ci(release): require the full gate before packaging`.

**T4 — Release checklist exists.** Create `docs/release.md` (it does not exist — verified 2026-10-25) with a `## Release checklist` section mirroring master §3 items 1–10; fix `release.yml:84-86` link to it; replace the hard-coded `v0.1.6.0` sentence in `scripts/release-notes.mjs` with the previous tag read from `git describe --tags --abbrev=0 HEAD^`. Test: add `tests/unit/scripts/release-notes.test.ts` asserting the output contains no literal `v0.1.6.0` when given a fake previous tag `v0.2.0.0` (export the formatting function from the script). Commit `docs(release): real checklist; release notes derive the upgrade baseline`.

**T5 — Data doctor.** `src/lib/db/doctor.ts` exports `runDoctor(db): Promise<DoctorReport>` with checks, each returning `{check, count, sample: string[]}`:
1. `orphan-project-rows` — rows in any table with a `projectId` index whose project does not exist (iterate `db.tables`, use `table.schema.indexes` to detect `projectId`).
2. `dangling-links` — `links` whose `fromId`/`toId` entity is missing.
3. `stale-linked-task-ids` — specs/docs whose `linkedTaskIds` reference missing tasks.
4. `sync-rows-without-entity` — `syncFiles` with `entityId` not found.
5. `duplicate-sync-paths` — more than one `syncFiles` row per `(projectId, path)`.
Unit test seeds a fake-indexeddb DB (pattern: existing `tests/unit/lib/db/*.test.ts`), creates one of each defect, expects each count = 1, then a clean DB expects all 0 → `PASS (2 passed)`. `scripts/doctor-data.mjs` is a Playwright-driven runner against the packaged app that calls `window.__masarflowDoctor()` (exposed only when `MASARFLOW_E2E=1`) and writes `reports/v0.3/data-doctor.json`. Script `"doctor:data"`. **Expected today:** non-zero counts after deleting a project (D5) — record them; that file is P2's baseline.

**T6 — Layout harness.** Packaged spec that, for window widths 1000/1280/1440/1920, visits each workspace route (read the list from `src/lib/nav.ts`, do not hard-code) in both dock and non-dock mode and records any interactive element whose bounding box exceeds its scroll container or the viewport. Output `reports/v0.3/layout.json` `{width, mode, route, clipped: [{selector, overflowPx}]}`. Test title `harness: layout matrix`. It records; it does not fail yet (P5 flips it to failing).

**T7 — a11y harness without allow-list.** Copy the axe injection from the p9 harness, drop the allow-list, write `reports/v0.3/a11y/summary.json`. Records only; P7 flips it to failing. Title `harness: axe zero`.

**T8 — Lint desktop.** Add a flat-config block for `desktop/src/**/*.ts` with `typescript-eslint` `recommendedTypeChecked`, `parserOptions.project: "desktop/tsconfig.json"`; remove `desktop/**` from ignores (keep `desktop/out`, `desktop/dist`, `desktop/app-server`). Fix findings in this task only if they are mechanical; otherwise add per-line disables listed in the commit body (each must be removed in P1 or P7). Commit `chore(lint): lint the desktop main and preload`.

## Gate

1. `git status --short reports` → empty.
2. `pnpm lint && pnpm typecheck && pnpm desktop:typecheck && pnpm test` → exit 0.
3. A PR CI run shows the `desktop-e2e` job green.
4. `reports/v0.3/{data-doctor.json,layout.json,a11y/summary.json}` exist and are committed as the baseline.

## Risks

- Windows runner time for packaged e2e may exceed 30 min → run `desktop-e2e` on PRs to `overhaul/**` and `main` only; keep it required.
- Harness flakiness → harnesses record in P0; they become failing gates only in P5/P7.

## Handoffs

`doctor:data`, `audit:layout`, `audit:a11y` outputs and their JSON shapes → P2, P5, P7.
