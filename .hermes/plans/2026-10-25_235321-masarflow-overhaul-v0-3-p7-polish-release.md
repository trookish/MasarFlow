# Phase 7 — Polish, accessibility zero, docs, 0.3.0 release

**Goal:** typography and colour tokens meet WCAG AA with no allow-list, dead code from the overhaul is gone, docs describe the product that exists, and 0.3.0 ships through the gate in master §3.
**Branch:** `overhaul/v0.3` → release branch `release/v0.3.0`. **Depends on:** P0–P6 complete. Owns `.github/workflows/*` and `tests/e2e/feature-matrix.json` in this phase.
**Master:** §2 rows U5, U6, R1–R5 follow-through; §3 release gate.

## Verified context (read 2026-10-25)

| Fact | Evidence |
|---|---|
| 0.2 a11y result relied on an allow-list: dock tablist (`aria-required-children`), contrast on `bg-node-system/15`, `bg-node-research/15`, `text-muted-foreground/70`; nameless inputs in commits panel and notes search | `reports/p9/a11y/summary.json:10-127,155-250` |
| Display version `0.2.0.0` | `desktop/src/shared/version.ts:2` |

Audit-sourced: 150 occurrences of 9–11 px text in `src/components`.

## Tasks

**T1 — Type scale and tokens.** Minimum body text 13 px, minimum metadata 12 px; replace `text-[9px|10px|11px]` with scale tokens; status/badge colours get AA-contrast foreground tokens (`--node-*-fg`) for both themes. Repo-truth test fails on `text-\[(9|10|11)px\]` in `src/components`. Contrast unit test computes ratios for every badge token pair in light and dark → all ≥ 4.5.

**T2 — Accessible names.** Every input has a `<label>` or `aria-label`; the nameless-control custom rule from the harness runs in unit tests over rendered surfaces.

**T3 — Flip the a11y harness to failing.** `audit-a11y.spec.ts` fails on any violation on every surface in standard and studio layout. `reports/v0.3/a11y/summary.json` shows 0 and no allow-list key.

**T4 — Dead code sweep.** Remove components superseded in P5/P6 (from the P6 handoff list); `rg` each removed symbol → 0 importers; `dead-routes` and `plugins-consumers` guards green with empty allow-lists.

**T5 — Docs.** Rewrite `README.md` (what MasarFlow is in one paragraph, six surfaces, install, data and privacy), `docs/architecture.md` (master §5 diagram, commands/events, replicas, AI turn), `docs/development.md` (dev guard, `MASARFLOW_DEV_ROOTS`), `docs/release.md` checklist, `SECURITY.md` threat model, `CHANGELOG.md` 0.3.0 with upgrade notes (vault `msf_version: 2`, backup `dataVersion: 3`, redirects, Studio layout).

**T6 — Version and release.** `package.json`/`desktop/package.json` → `0.3.0`, `APP_DISPLAY_VERSION` → `0.3.0.0`. Run the full master §3 gate in CI on the tag commit; record results and artifact links in `reports/v0.3/GATE.md`; perform the clean-machine install + upgrade-from-0.2.0.0 check and record it there. Only then tag `v0.3.0.0`.

## Gate

Master §3 items 1–10, all recorded in `reports/v0.3/GATE.md`.

## Risks / open questions

- Unsigned build (master Q3) → SmartScreen documented in `docs/release.md` and release notes.

## Handoffs

0.4 backlog (record in `reports/v0.3/GATE.md`): SQLite-in-main evaluation (D1), server-side agent runner (D5), cold-start budget vs `utilityProcess` Next (D9), code signing.
